// Authentication controllers — login, change-password, logout, and the /me session endpoint,
// plus their private helpers (login rate-limiting, the dummy bcrypt hash used to equalise
// timing for unknown emails, and the login/change-password validation schemas). Moved here
// verbatim from the original monolithic controller; no logic change.
import { pool } from '../config/app.config.js';
import { generateToken, getEffectivePermissions, getOverridePermissions, decryptField } from '../utils/helper.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';

// A pre-computed bcrypt hash of a random string, only ever used to burn ~equal CPU time when a
// login is attempted for an email that does not exist (defeats account-enumeration by timing).
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('unused-timing-equalizer', 10);

// --- Login rate limiting (durable, shared via the DB so it works across serverless instances,
// unlike an in-memory Map). Keyed primarily on the email so rotating the client IP / spoofing
// X-Forwarded-For cannot reset the counter for a targeted account. ---
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

async function isRateLimited(key) {
  try {
    const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
    // Opportunistically prune expired rows for this key, then count what's left in the window.
    await pool.query('DELETE FROM login_attempts WHERE key = $1 AND attempted_at < $2', [key, cutoff]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM login_attempts WHERE key = $1 AND attempted_at >= $2', [key, cutoff]);
    return rows[0].n >= MAX_ATTEMPTS;
  } catch (e) {
    // Never let a limiter DB hiccup lock everyone out — fail open on the limiter only.
    console.error('[RateLimit] check failed:', e.message);
    return false;
  }
}

async function recordFailedAttempt(key) {
  try {
    await pool.query('INSERT INTO login_attempts (id, key) VALUES ($1, $2)', ['la-' + crypto.randomUUID(), key]);
  } catch (e) {
    console.error('[RateLimit] record failed:', e.message);
  }
}

async function clearAttempts(key) {
  try {
    await pool.query('DELETE FROM login_attempts WHERE key = $1', [key]);
  } catch (e) {
    console.error('[RateLimit] clear failed:', e.message);
  }
}

// --- Zod validation schemas ---
const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128, 'Password too long'),
});

const ChangePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
});

export const login = async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const { email, password } = parsed.data;
  // Throttle on the account (email), not the client IP — an attacker can rotate IPs / spoof
  // X-Forwarded-For but cannot change which account they are brute-forcing.
  const rlKey = 'login:' + email.toLowerCase();
  if (await isRateLimited(rlKey)) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  }

  const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];

  if (!user) {
      // Compare against a fixed dummy hash so an unknown email takes the same ~bcrypt time as a
      // known one — otherwise response timing reveals which emails are real accounts.
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      await recordFailedAttempt(rlKey);
      return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
      await recordFailedAttempt(rlKey);
      return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.status === 'resigned' || user.status === 'terminated') {
      return res.status(403).json({ error: 'Account access has been revoked.' });
  }

  await clearAttempts(rlKey);
  const token = generateToken(user.id, user.role, user.token_version || 0);
  // Set Secure based on the actual request protocol, not NODE_ENV: over HTTPS (incl. behind
  // Vercel's proxy) the cookie is Secure; on plain-HTTP localhost it isn't, so dev still works.
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatar_url,
      designation: user.designation,
      employeeId: user.employee_id,
      department: user.department,
      uanNumber: decryptField(user.uan_number),
      panNumber: decryptField(user.pan_number),
      bankName: user.bank_name,
      bankAccount: decryptField(user.bank_account),
      location: user.location,
      state: user.state,
      joinDate: user.join_date,
      forcePasswordChange: user.force_password_change,
      permissions: await getEffectivePermissions(user),
      extraPermissions: await getOverridePermissions(user)
  });
};

export const changePassword = async (req, res) => {
  const user = req.user;
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const dbUser = (await pool.query('SELECT password_hash, force_password_change FROM users WHERE id = $1', [user.id])).rows[0];
  if (!dbUser) return res.status(404).json({ error: 'User not found' });

  // A normal password change must re-verify the current password, so a hijacked or borrowed
  // session cannot silently take the account over. The very first forced change right after
  // login is exempt — the user has just authenticated with the temporary password.
  if (!dbUser.force_password_change) {
      const { currentPassword } = req.body;
      if (!currentPassword || !(await bcrypt.compare(currentPassword, dbUser.password_hash))) {
          return res.status(403).json({ error: 'Your current password is incorrect.' });
      }
  }

  const hashedPassword = await bcrypt.hash(parsed.data.newPassword, 10);
  // Bump token_version so every previously-issued session (including any hijacked one) is
  // invalidated, then hand THIS caller a fresh cookie carrying the new version so they stay
  // logged in on the device that just changed the password.
  const updated = (await pool.query(
    'UPDATE users SET password_hash = $1, force_password_change = false, token_version = token_version + 1 WHERE id = $2 RETURNING token_version, role',
    [hashedPassword, user.id]
  )).rows[0];

  const newToken = generateToken(user.id, updated.role, updated.token_version);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('token', newToken, { httpOnly: true, secure: isHttps, sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 * 1000 });
  res.json({ success: true });
};

export const logout = async (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
};

export const me = async (req, res) => {
  const user = req.user;
  const dbUser = (await pool.query('SELECT uan_number, pan_number, bank_name, bank_account, location, state, join_date FROM users WHERE id = $1', [user.id])).rows[0];
  res.json({
      ...user,
      uanNumber: decryptField(dbUser?.uan_number),
      panNumber: decryptField(dbUser?.pan_number),
      bankName: dbUser?.bank_name,
      bankAccount: decryptField(dbUser?.bank_account),
      location: dbUser?.location,
      state: dbUser?.state,
      joinDate: dbUser?.join_date,
      forcePasswordChange: user.force_password_change,
      permissions: await getEffectivePermissions(user),
      extraPermissions: await getOverridePermissions(user)
  });
};
