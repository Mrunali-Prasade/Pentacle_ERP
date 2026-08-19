// One-off migration: encrypt any legacy PLAINTEXT values in the sensitive columns.
// Idempotent — values already stored as `enc:v1:...` are skipped. Requires ENCRYPTION_KEY set.
//   node server/migrate-encrypt-pii.mjs
import { pool } from './config/app.config.js';
import { encryptField, decryptField } from './utils/helper.js';

const COLUMNS = ['aadhar_number', 'pan_number', 'uan_number', 'bank_account', 'mediclaim_number'];

const run = async () => {
  const rows = (await pool.query(`SELECT id, ${COLUMNS.join(', ')} FROM users`)).rows;
  let changed = 0;
  for (const r of rows) {
    for (const col of COLUMNS) {
      const val = r[col];
      // Encrypt only real plaintext values that aren't already encrypted.
      if (typeof val === 'string' && val !== '' && !val.startsWith('enc:v1:')) {
        const enc = encryptField(val);
        if (enc !== val) {
          await pool.query(`UPDATE users SET ${col} = $1 WHERE id = $2`, [enc, r.id]);
          changed++;
        }
      }
    }
  }
  // Sanity: confirm a round-trip decrypts back to something non-empty.
  const check = (await pool.query('SELECT pan_number FROM users WHERE pan_number IS NOT NULL LIMIT 1')).rows[0];
  console.log(`Encrypted ${changed} legacy plaintext field(s).`);
  if (check) console.log('Round-trip check — a stored PAN decrypts to:', decryptField(check.pan_number) ? 'OK (non-empty)' : 'FAILED');
  await pool.end();
};

run().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
