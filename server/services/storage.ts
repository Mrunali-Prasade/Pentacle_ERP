import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// `require` is not defined in native ESM; create one so the optional @google-cloud/storage
// dependency can be loaded lazily without crashing at module-eval time.
const require = createRequire(import.meta.url);

export interface StorageService {
    uploadFile(sourceFilePath: string, destinationPath: string, contentType?: string): Promise<string>;
    uploadBuffer(buffer: Buffer, destinationPath: string, contentType?: string): Promise<string>;
    getFileUrl(destinationPath: string): string;
    deleteFile(destinationPath: string): Promise<void>;
    /**
     * Whether files written here survive. On Vercel the local backend writes to /tmp, which
     * is wiped between invocations, so callers must not send anything they need to keep.
     */
    readonly isDurable: boolean;
}

export class LocalStorageService implements StorageService {
    private basePath: string;
    /**
     * Never treated as durable, even when running on a real disk. Development runs against
     * the production database, so writing a local file path into a shared row would leave
     * production holding a reference to a file only one laptop can serve. Local storage is
     * for development convenience only; anything that must survive needs a cloud backend.
     */
    readonly isDurable = false;

    constructor() {
        this.basePath = process.env.VERCEL ? '/tmp/pentacle_uploads' : path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
    }

    private ensureDirectoryExists(filePath: string) {
        const dirname = path.dirname(filePath);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
    }

    async uploadFile(sourceFilePath: string, destinationPath: string, contentType?: string): Promise<string> {
        const fullDestPath = path.join(this.basePath, destinationPath);
        this.ensureDirectoryExists(fullDestPath);
        
        return new Promise((resolve, reject) => {
            fs.copyFile(sourceFilePath, fullDestPath, (err) => {
                if (err) reject(err);
                else resolve(this.getFileUrl(destinationPath));
            });
        });
    }

    async uploadBuffer(buffer: Buffer, destinationPath: string, contentType?: string): Promise<string> {
        const fullDestPath = path.join(this.basePath, destinationPath);
        this.ensureDirectoryExists(fullDestPath);
        
        return new Promise((resolve, reject) => {
            fs.writeFile(fullDestPath, buffer, (err) => {
                if (err) reject(err);
                else resolve(this.getFileUrl(destinationPath));
            });
        });
    }

    getFileUrl(destinationPath: string): string {
        const normalized = destinationPath.replace(/\\/g, '/');
        return `/api/uploads/${normalized}`;
    }

    async deleteFile(destinationPath: string): Promise<void> {
        const fullDestPath = path.join(this.basePath, destinationPath);
        return new Promise((resolve, reject) => {
            fs.unlink(fullDestPath, (err) => {
                if (err && err.code !== 'ENOENT') reject(err);
                else resolve();
            });
        });
    }
}

export class CloudStorageService implements StorageService {
    readonly isDurable = true;
    private bucketName: string;
    // We import dynamically or require it so that if it's missing it doesn't crash the whole app
    private storageClient: any;
    private bucket: any;

    constructor(bucketName: string) {
        this.bucketName = bucketName;
        const { Storage } = require('@google-cloud/storage');
        this.storageClient = new Storage();
        this.bucket = this.storageClient.bucket(this.bucketName);
    }

    async uploadFile(sourceFilePath: string, destinationPath: string, contentType?: string): Promise<string> {
        const normalized = destinationPath.replace(/\\/g, '/');
        await this.bucket.upload(sourceFilePath, {
            destination: normalized,
            metadata: contentType ? { contentType } : undefined
        });
        return this.getFileUrl(normalized);
    }

    async uploadBuffer(buffer: Buffer, destinationPath: string, contentType?: string): Promise<string> {
        const normalized = destinationPath.replace(/\\/g, '/');
        const file = this.bucket.file(normalized);
        await file.save(buffer, {
            metadata: contentType ? { contentType } : undefined,
            resumable: false
        });
        return this.getFileUrl(normalized);
    }

    getFileUrl(destinationPath: string): string {
        const normalized = destinationPath.replace(/\\/g, '/');
        // Return a public Google Cloud Storage URL
        return `https://storage.googleapis.com/${this.bucketName}/${normalized}`;
    }

    async deleteFile(destinationPath: string): Promise<void> {
        const normalized = destinationPath.replace(/\\/g, '/');
        try {
            await this.bucket.file(normalized).delete();
        } catch (e: any) {
            if (e.code !== 404) {
                throw e;
            }
        }
    }
}

/**
 * Stores files in OneDrive / SharePoint through the Microsoft Graph API, using app-only
 * (client credentials) auth so no user has to be signed in.
 *
 * OneDrive files have no permanent public URL, so uploadBuffer returns a reference to our
 * own /api/files/<itemId> route. That route asks Graph for a short-lived pre-authenticated
 * download URL and redirects the browser to it, which means the file is never made public
 * and the bytes never pass back through this server.
 */
export class OneDriveStorageService implements StorageService {
    readonly isDurable = true;

    private tenantId: string;
    private clientId: string;
    private clientSecret: string;
    private drive: string;          // a drive id, or a user's email for their OneDrive
    private rootFolder: string;

    private token: string | null = null;
    private tokenExpiresAt = 0;

    constructor(cfg: { tenantId: string; clientId: string; clientSecret: string; drive: string; rootFolder?: string }) {
        this.tenantId = cfg.tenantId;
        this.clientId = cfg.clientId;
        this.clientSecret = cfg.clientSecret;
        this.drive = cfg.drive;
        this.rootFolder = cfg.rootFolder || 'PentaclePayroll';
    }

    /** An email means "that user's OneDrive"; anything else is treated as a drive id. */
    private get driveRoot(): string {
        return this.drive.includes('@')
            ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.drive)}/drive`
            : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.drive)}`;
    }

    /** Tokens last about an hour; re-use one until it is nearly expired. */
    private async getToken(): Promise<string> {
        if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

        const res = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials',
            }),
        });
        if (!res.ok) throw new Error(`OneDrive auth failed (${res.status}): ${await res.text()}`);

        const data: any = await res.json();
        this.token = data.access_token;
        this.tokenExpiresAt = Date.now() + Math.max(0, (data.expires_in - 300)) * 1000;
        return this.token!;
    }

    async uploadBuffer(buffer: Buffer, destinationPath: string, contentType?: string): Promise<string> {
        const token = await this.getToken();
        const clean = `${this.rootFolder}/${destinationPath}`.replace(/\\/g, '/').replace(/^\/+/, '');
        const encoded = clean.split('/').map(encodeURIComponent).join('/');

        // Simple upload supports files up to 4MB, which covers every upload this app allows.
        const res = await fetch(`${this.driveRoot}/root:/${encoded}:/content`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': contentType || 'application/octet-stream',
            },
            body: new Uint8Array(buffer),
        });
        if (!res.ok) throw new Error(`OneDrive upload failed (${res.status}): ${await res.text()}`);

        const item: any = await res.json();
        return this.getFileUrl(item.id);
    }

    async uploadFile(sourceFilePath: string, destinationPath: string, contentType?: string): Promise<string> {
        return this.uploadBuffer(fs.readFileSync(sourceFilePath), destinationPath, contentType);
    }

    /** Our own route; the browser is redirected from there to Microsoft's temporary URL. */
    getFileUrl(itemId: string): string {
        return `/api/files/${encodeURIComponent(itemId)}`;
    }

    /** Short-lived, pre-authenticated URL. Valid roughly an hour, so it is not stored. */
    async getDownloadUrl(itemId: string): Promise<string | null> {
        const token = await this.getToken();
        const res = await fetch(
            `${this.driveRoot}/items/${encodeURIComponent(itemId)}?select=id,@microsoft.graph.downloadUrl`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return null;
        const item: any = await res.json();
        return item['@microsoft.graph.downloadUrl'] || null;
    }

    async deleteFile(itemId: string): Promise<void> {
        const token = await this.getToken();
        const res = await fetch(`${this.driveRoot}/items/${encodeURIComponent(itemId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok && res.status !== 404) {
            throw new Error(`OneDrive delete failed (${res.status})`);
        }
    }
}

function selectStorage(): StorageService {
    const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, ONEDRIVE_DRIVE } = process.env;
    if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && ONEDRIVE_DRIVE) {
        console.log('[Storage] OneDrive / SharePoint');
        return new OneDriveStorageService({
            tenantId: AZURE_TENANT_ID,
            clientId: AZURE_CLIENT_ID,
            clientSecret: AZURE_CLIENT_SECRET,
            drive: ONEDRIVE_DRIVE,
            rootFolder: process.env.ONEDRIVE_FOLDER,
        });
    }
    if (process.env.GCP_BUCKET_NAME) {
        console.log('[Storage] Google Cloud Storage');
        return new CloudStorageService(process.env.GCP_BUCKET_NAME);
    }
    console.warn(
        '[Storage] No durable storage configured — using local disk. Selfies stay inline in ' +
        'the database, and on Vercel any uploaded receipt or identity document goes to /tmp ' +
        'and is DELETED when the instance recycles. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, ' +
        'AZURE_CLIENT_SECRET and ONEDRIVE_DRIVE to store files in OneDrive.'
    );
    return new LocalStorageService();
}

export const storage = selectStorage();
