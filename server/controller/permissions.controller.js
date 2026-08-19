// Granular permissions & audit-log controllers (super_admin only): the permission catalog,
// per-user permission overrides, and manual audit-log creation. Moved verbatim from
// the original monolithic controller; no logic change. Depends only on the DB pool and crypto.
import { pool } from '../config/app.config.js';
import crypto from 'crypto';

export const getPermissionCatalog = async (req, res) => {
  const permissions = (await pool.query('SELECT key, label, category FROM permissions ORDER BY category, label')).rows;
  const roleRows = (await pool.query('SELECT role, permission_key as "permissionKey" FROM role_permissions')).rows;
  const roleDefaults = {};
  for (const row of roleRows) {
    if (!roleDefaults[row.role]) roleDefaults[row.role] = [];
    roleDefaults[row.role].push(row.permissionKey);
  }
  res.json({ permissions, roleDefaults });
};

export const getUserPermissionOverrides = async (req, res) => {
  const { id } = req.params;
  const user = (await pool.query('SELECT id, name, role FROM users WHERE id = $1', [id])).rows[0];
  if (!user) return res.status(404).json({ error: 'Employee not found' });

  const overrides = (await pool.query(
    'SELECT permission_key as "permissionKey" FROM user_permission_overrides WHERE user_id = $1',
    [id]
  )).rows.map(r => r.permissionKey);

  res.json({ userId: user.id, name: user.name, role: user.role, overrides });
};

export const updateUserPermissionOverride = async (req, res) => {
  const { id } = req.params;
  const { permissionKey, granted } = req.body;

  if (typeof permissionKey !== 'string' || typeof granted !== 'boolean') {
    return res.status(400).json({ error: 'permissionKey (string) and granted (boolean) are required.' });
  }

  const [targetUser, permission] = await Promise.all([
    pool.query('SELECT id, name, role FROM users WHERE id = $1', [id]),
    pool.query('SELECT key, label FROM permissions WHERE key = $1', [permissionKey]),
  ]);
  if (!targetUser.rows[0]) return res.status(404).json({ error: 'Employee not found' });
  if (!permission.rows[0]) return res.status(400).json({ error: 'Unknown permission key' });

  const target = targetUser.rows[0];
  const permLabel = permission.rows[0].label;

  if (granted) {
    await pool.query(
      `INSERT INTO user_permission_overrides (user_id, permission_key, granted_by)
       VALUES ($1, $2, $3) ON CONFLICT (user_id, permission_key) DO NOTHING`,
      [id, permissionKey, req.user.id]
    );
  } else {
    await pool.query(
      'DELETE FROM user_permission_overrides WHERE user_id = $1 AND permission_key = $2',
      [id, permissionKey]
    );
  }

  await pool.query(
    `INSERT INTO audit_logs (id, timestamp, actor, role, module, change_description, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      'AL-' + Math.floor(1000 + Math.random() * 9000),
      new Date().toISOString().replace('T', ' ').substring(0, 19),
      req.user.name,
      req.user.role,
      'Access Control',
      `${granted ? 'Granted' : 'Revoked'} "${permLabel}" ${granted ? 'to' : 'from'} ${target.name} (${target.role})`,
      granted ? null : permLabel,
      granted ? permLabel : null,
    ]
  );

  res.json({ success: true });
};

export const createAuditLog = async (req, res) => {
  const user = req.user;
  const { module, changeDescription, beforeValue, afterValue } = req.body;
  if (!module || !changeDescription) {
    return res.status(400).json({ error: 'module and changeDescription are required.' });
  }

  // UUID, not a 4-digit random: the old id collided (birthday bound) after ~110 entries,
  // and a duplicate primary key threw a 500 out of an unguarded async handler.
  const id = 'AL-' + crypto.randomUUID();
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  await pool.query(
    `INSERT INTO audit_logs (id, timestamp, actor, role, module, change_description, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, timestamp, user.name, user.role, module, changeDescription, beforeValue || null, afterValue || null]
  );

  res.json({ success: true, id });
};
