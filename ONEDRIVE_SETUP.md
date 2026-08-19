# OneDrive storage setup (one shared account)

Goal: every uploaded file (attendance selfies, reimbursement receipts, ID docs) is stored in
ONE company OneDrive account. No employee logs into Microsoft. Postgres only keeps a pointer
(`/api/files/<id>`); the actual bytes live in OneDrive.

The code is already built (server/services/storage.ts). You only need to (a) create an Azure
app registration, (b) put 4 values in .env, (c) restart. Nothing in the app's behaviour changes.

## Part 1 — App registration  (https://entra.microsoft.com, sign in as admin@pentacleconsultants.com)
1. Identity > Applications > App registrations > + New registration
2. Name: "Pentacle Payroll Storage"; Account type: Single tenant; Register
3. On Overview, copy:
   - Application (client) ID  -> AZURE_CLIENT_ID
   - Directory (tenant) ID    -> AZURE_TENANT_ID

## Part 2 — Client secret
4. Certificates & secrets > Client secrets > + New client secret
5. Description "payroll", Expires 24 months, Add
6. Copy the VALUE column immediately (shown once) -> AZURE_CLIENT_SECRET
   - Set a reminder ~23 months out to rotate it, or uploads will start failing.

## Part 3 — Permission
7. API permissions > + Add a permission > Microsoft Graph > APPLICATION permissions
8. Tick Files.ReadWrite.All > Add permissions
9. Click "Grant admin consent for Pentacle Consultants" > Yes (status must go green "Granted")

## Part 4 — The storage account
10. ONEDRIVE_DRIVE = email of the user whose OneDrive holds everything
    (e.g. admin@pentacleconsultants.com or a dedicated vault@pentacleconsultants.com)
11. That account must have OneDrive provisioned: log into https://onedrive.com once as that user.

## Part 5 — .env  (add these; never commit .env)
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
ONEDRIVE_DRIVE=admin@pentacleconsultants.com
ONEDRIVE_FOLDER=PentaclePayroll

## Part 6 — Verify
- node server/test-onedrive.mjs      (uploads a tiny test file, then deletes it)
- Restart the app; boot log should say: [Storage] OneDrive / SharePoint
- Take one attendance selfie; confirm it appears in OneDrive under PentaclePayroll/selfies/

## Notes
- Only NEW uploads go to OneDrive. Existing local files in server/uploads/ and old inline
  base64 selfies in the DB stay where they are unless separately migrated.
- 4 MB per-file limit (selfies ~50 KB, so fine).
- If boot log still says "No durable storage configured", one of the 4 vars is missing/misspelt.
