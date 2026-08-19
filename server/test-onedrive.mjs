// Standalone OneDrive connection tester. Run:  node server/test-onedrive.mjs
// It uploads a tiny text file to your configured OneDrive folder, reads it back, then deletes
// it. If every step prints OK, your app is ready to store files in OneDrive. Changes nothing
// in the app itself.
import dotenv from 'dotenv';
dotenv.config();

const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, ONEDRIVE_DRIVE } = process.env;
const ROOT_FOLDER = process.env.ONEDRIVE_FOLDER || 'PentaclePayroll';

function fail(msg) { console.error('\n❌ ' + msg + '\n'); process.exit(1); }

for (const [k, v] of Object.entries({ AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, ONEDRIVE_DRIVE })) {
  if (!v) fail(`Missing ${k} in .env — fill in all four Azure values first.`);
}

const driveRoot = ONEDRIVE_DRIVE.includes('@')
  ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_DRIVE)}/drive`
  : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(ONEDRIVE_DRIVE)}`;

console.log('1) Requesting app-only token from Microsoft...');
const tokenRes = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  }),
});
if (!tokenRes.ok) fail(`Token request failed (${tokenRes.status}): ${await tokenRes.text()}\n   -> Check tenant/client id and secret value.`);
const { access_token } = await tokenRes.json();
console.log('   ✅ token OK');

const name = `connection-test-${Date.now()}.txt`;
const clean = `${ROOT_FOLDER}/${name}`.replace(/^\/+/, '');
const encoded = clean.split('/').map(encodeURIComponent).join('/');

console.log(`2) Uploading test file to ${ONEDRIVE_DRIVE} -> ${clean} ...`);
const up = await fetch(`${driveRoot}/root:/${encoded}:/content`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'text/plain' },
  body: 'Pentacle Payroll OneDrive test. Safe to delete.',
});
if (!up.ok) fail(`Upload failed (${up.status}): ${await up.text()}\n   -> Common causes: Files.ReadWrite.All not granted admin consent, or ONEDRIVE_DRIVE user has no OneDrive.`);
const item = await up.json();
console.log(`   ✅ uploaded, itemId = ${item.id}`);

console.log('3) Fetching a download link (this is what the app redirects users to)...');
const dl = await fetch(`${driveRoot}/items/${item.id}?select=id,@microsoft.graph.downloadUrl`, {
  headers: { Authorization: `Bearer ${access_token}` },
});
const meta = await dl.json();
console.log(meta['@microsoft.graph.downloadUrl'] ? '   ✅ download link OK' : '   ⚠️ no download link returned');

console.log('4) Cleaning up (deleting the test file)...');
const del = await fetch(`${driveRoot}/items/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } });
console.log(del.ok || del.status === 404 ? '   ✅ deleted' : `   ⚠️ delete returned ${del.status}`);

console.log('\n🎉 All good — OneDrive storage is correctly configured. Restart the app to use it.\n');
