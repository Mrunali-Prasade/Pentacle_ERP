import pkg from 'pg';
const { Pool, types } = pkg;
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// Return Postgres NUMERIC/DECIMAL (type OID 1700) as a JS number, exactly like the driver
// already returns REAL/float. Money columns are being moved REAL -> NUMERIC for exact storage
// and exact SQL-side arithmetic; without this parser `pg` would hand NUMERIC back as a STRING,
// which would silently break every `.toLocaleString()`, sum, and comparison in the app. Parsing
// to a number keeps all existing behaviour identical while the database gains exactness.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const NODE_ENV = process.env.NODE_ENV || 'development';

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  const msg = 'FATAL: No Postgres connection string found. Set POSTGRES_URL in your environment variables.';
  console.error(msg);
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
}

// JWT secret resolution. There must never be a hardcoded fallback in source: a committed
// default silently signs real tokens whenever the env var is missing, so anyone with the
// repo could forge sessions. In production we fail closed; in development, if the var is
// absent we mint a random ephemeral secret (tokens simply don't survive a restart).
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET is missing or shorter than 32 characters. Refusing to start.');
    process.exit(1);
  }
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[Auth] JWT_SECRET not set — using a temporary development secret. Set JWT_SECRET in .env for stable sessions.');
}

// TLS to Postgres. If PG_CA_CERT is provided we verify the server certificate against it
// (verify-full — the correct, MITM-proof setting). Without it we fall back to the previous
// behaviour (encrypted but unverified) so existing deployments keep working unchanged; set
// PG_CA_CERT with your provider's CA to close the gap.
function resolveSsl(conn) {
  if (!conn) return false;
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(conn);
  if (isLocal) return false;
  if (process.env.PG_CA_CERT) {
    return { ca: process.env.PG_CA_CERT, rejectUnauthorized: true };
  }
  if (NODE_ENV === 'production') {
    console.warn('[DB] PG_CA_CERT not set — the database TLS certificate is NOT verified. Set it in production to prevent man-in-the-middle attacks.');
  }
  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString,
  ssl: resolveSsl(connectionString),
  // On serverless (Vercel) many function instances run at once, so a large per-instance pool
  // can exhaust the database's connection limit. Keep it small there; a persistent server (local
  // dev) can hold more. Override with PG_POOL_MAX if needed.
  max: Number(process.env.PG_POOL_MAX) || (process.env.VERCEL ? 3 : 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool client error:', err.message);
});

export const config = {
  port: process.env.PORT || 3001,
  env: NODE_ENV,
  jwtSecret,
  appUrl: process.env.APP_URL
};
