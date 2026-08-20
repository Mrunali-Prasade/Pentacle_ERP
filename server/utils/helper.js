import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool, config } from '../config/app.config.js';
import { HttpResponse } from './httpresponse.js';
import { ROLES } from '../const/appcounst.js';

// config.jwtSecret is always set by app.config.js — a real value in production (or the
// process has already exited), an ephemeral random one in development. No fallback here.
const RESOLVED_SECRET = config.jwtSecret;

// ---- Field-level encryption for sensitive data at rest (Aadhaar / PAN / bank) --------------
// AES-256-GCM (authenticated). ENCRYPTION_KEY is 64 hex chars (32 bytes). Encrypted values are
// stored as `enc:v1:<iv>:<tag>:<ciphertext>` so decryptField can tell them apart from legacy
// plaintext and from nulls — meaning existing plaintext rows keep reading fine, and encryption
// rolls in on the next write. Without a key configured (dev), these are no-ops (store as-is).
const ENC_KEY = process.env.ENCRYPTION_KEY && /^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : null;

if (config.env === 'production' && !ENC_KEY) {
  // Fail closed: refuse to boot in production without a valid key rather than silently writing
  // Aadhaar / PAN / bank numbers in plaintext. (Development stays a no-op — see encryptField.)
  console.error('FATAL: ENCRYPTION_KEY is missing or not 64 hex characters. Refusing to start so sensitive fields are never persisted unencrypted.');
  process.exit(1);
}

export const encryptField = (plaintext) => {
  if (plaintext === null || plaintext === undefined || plaintext === '' || !ENC_KEY) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
};

export const decryptField = (value) => {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value; // null / legacy plaintext
  if (!ENC_KEY) return value;
  try {
    const [, , ivHex, tagHex, ctHex] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[Crypto] decrypt failed:', e.message);
    return null;
  }
};

// Token generation. `tokenVersion` is embedded so a server-side bump (password change /
// logout-everywhere) invalidates every previously-issued token for that user.
export const generateToken = (userId, role, tokenVersion = 0) => {
  return jwt.sign({ id: userId, role, tv: tokenVersion }, RESOLVED_SECRET, { algorithm: 'HS256', expiresIn: '8h' });
};

// Authentication Middleware
export const requireAuth = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return HttpResponse.unauthorized(res);
  }

  try {
    // Pin the algorithm on verify so a future dependency change can't be tricked into accepting
    // an unexpected alg. HS256 only.
    const decoded = jwt.verify(token, RESOLVED_SECRET, { algorithms: ['HS256'] });
    const result = await pool.query(
      `SELECT id, email, name, role, avatar_url as "avatarUrl", designation,
              employee_id as "employeeId", department, force_password_change, status, token_version
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    const user = result.rows[0];

    if (!user) {
      return HttpResponse.unauthorized(res, 'User not found');
    }

    // Session revocation: a token whose version is behind the user's current token_version has
    // been invalidated (password change / forced logout), even though its 8h TTL hasn't expired.
    if ((decoded.tv ?? 0) !== user.token_version) {
      return HttpResponse.unauthorized(res, 'Session expired. Please sign in again.');
    }

    if (user.status === 'resigned' || user.status === 'terminated') {
      return HttpResponse.forbidden(res, 'Account access has been revoked.');
    }

    // Forced password change: until the user sets a new password, the only things they may
    // reach are the change-password call itself, logout, and their own identity (so the SPA
    // can render the change-password screen). Everything else is blocked. This is what makes
    // an initial/temporary password actually temporary.
    if (user.force_password_change) {
      const allowed = ['/auth/change-password', '/auth/logout', '/auth/me'];
      if (!allowed.some((p) => req.path.endsWith(p))) {
        return res.status(403).json({ error: 'You must set a new password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return HttpResponse.unauthorized(res, 'Invalid token');
  }
};

// Role authorization middleware
export const requireRole = (roles) => {
  return (req, res, next) => {
    const user = req.user;
    if (!user || (!roles.includes(user.role) && user.role !== ROLES.SUPER_ADMIN)) {
      return HttpResponse.forbidden(res);
    }
    next();
  };
};

// True if `user`'s role bundle includes `permissionKey` by default, OR a super_admin
// has granted it to this specific user as an extra (see user_permission_overrides).
// There is no "revoke a role default" state yet — see server/schema.sql for why.
export const hasPermission = async (user, permissionKey) => {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;

  const override = (await pool.query(
    'SELECT 1 FROM user_permission_overrides WHERE user_id = $1 AND permission_key = $2',
    [user.id, permissionKey]
  )).rows[0];
  if (override) return true;

  const roleDefault = (await pool.query(
    'SELECT 1 FROM role_permissions WHERE role = $1 AND permission_key = $2',
    [user.role, permissionKey]
  )).rows[0];
  return !!roleDefault;
};

// Permission-based authorization middleware. Unlike requireRole, access here can be
// extended to an individual user without changing their role.
export const requirePermission = (permissionKey) => {
  return async (req, res, next) => {
    const user = req.user;
    if (!user) return HttpResponse.unauthorized(res);
    if (await hasPermission(user, permissionKey)) return next();
    return HttpResponse.forbidden(res);
  };
};

// Every permission key this user effectively holds — their role's default bundle plus
// any personal overrides. super_admin gets the full catalog since it bypasses every check.
// Used to tell the frontend what to show (e.g. "can this employee see the Edit button"),
// never as the actual authorization check — routes must still call requirePermission.
export const getEffectivePermissions = async (user) => {
  if (!user) return [];
  if (user.role === 'super_admin') {
    return (await pool.query('SELECT key FROM permissions')).rows.map(r => r.key);
  }
  const [roleRows, overrideRows] = await Promise.all([
    pool.query('SELECT permission_key FROM role_permissions WHERE role = $1', [user.role]),
    pool.query('SELECT permission_key FROM user_permission_overrides WHERE user_id = $1', [user.id]),
  ]);
  return [...new Set([...roleRows.rows.map(r => r.permission_key), ...overrideRows.rows.map(r => r.permission_key)])];
};

// Only the permissions granted to this user as an INDIVIDUAL override — i.e. beyond what their
// role already gives them. This is what the "Extra Access" screen keys off, so a role (like HR)
// that already has a full dashboard doesn't get a redundant second copy of the same modules.
// super_admin has no overrides (it bypasses everything), so this is empty for them too.
export const getOverridePermissions = async (user) => {
  if (!user) return [];
  const rows = (await pool.query('SELECT permission_key FROM user_permission_overrides WHERE user_id = $1', [user.id])).rows;
  return rows.map(r => r.permission_key);
};

// Checks ONLY the per-user override table — never the role's default bundle. Use this
// (not hasPermission) whenever "does this user have an explicit extra grant" must stay
// distinct from "does this user's role already include it", e.g. so a role that already
// holds a permission by default cannot also be treated as individually overridden for it.
export const hasPermissionOverride = async (user, permissionKey) => {
  if (!user) return false;
  const override = (await pool.query(
    'SELECT 1 FROM user_permission_overrides WHERE user_id = $1 AND permission_key = $2',
    [user.id, permissionKey]
  )).rows[0];
  return !!override;
};

// For read/list routes that a role bundle already covers, but that a permission-only
// grantee also needs to see in order to act on the paired requirePermission() write
// route (e.g. viewing the penalties queue to approve one). Passes either check.
export const requireRoleOrPermission = (roles, permissionKey) => {
  return async (req, res, next) => {
    const user = req.user;
    if (!user) return HttpResponse.unauthorized(res);
    if (roles.includes(user.role) || user.role === ROLES.SUPER_ADMIN) return next();
    if (await hasPermission(user, permissionKey)) return next();
    return HttpResponse.forbidden(res);
  };
};

// Clean helper to parse IP
export const getClientIp = (req) => {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
};

