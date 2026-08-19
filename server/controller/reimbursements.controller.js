// Reimbursement controllers: claim listing/creation, the approval state-machine, owner
// edit/cancel, payment (with proof), plus secure file serving (local uploads and OneDrive)
// and claimant email notifications. Moved verbatim from the original monolithic controller; no logic change.
import { pool } from '../config/app.config.js';
import { hasPermission, hasPermissionOverride } from '../utils/helper.js';
import { storage } from '../services/storage.js';
import { serverError, escapeHtml, decodeUpload, isPlantedFileReference } from './_shared.js';
import { z } from 'zod';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CreateReimbursementSchema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expense date must be YYYY-MM-DD')
    // The regex alone accepts impossible dates like 2026-02-30, which then become NaN and slip
    // past the cut-off check. Confirm it is a real calendar date.
    .refine((s) => { const d = new Date(s + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }, 'Expense date is not a real calendar date'),
  category: z.string().min(1, 'Category is required').max(100),
  amount: z.coerce.number().positive('Amount must be greater than zero').max(10_000_000, 'Amount is too large'),
  description: z.string().max(1000).optional(),
  costCentre: z.string().max(100).optional().nullable(),
  proofFileName: z.string().min(1, 'A receipt is required'),
  proofFileSize: z.string().max(50).optional().nullable(),
  proofFileData: z.string().optional(),
});

// Claims an employee may still change: not yet accepted into the approval chain.
const CLAIM_EDITABLE_BY_OWNER = ['Submitted', 'Returned'];

// The approval chain. Each stage names the single role that may advance, reject, or send it
// back for correction; super_admin bypasses this. 'Paid' is deliberately absent — it is only
// reachable through POST /reimbursements/:id/pay, which requires a payment proof.
const CLAIM_TRANSITIONS = {
  'Submitted':            { 'Admin-Verified': ['admin_hr'],       'Rejected': ['admin_hr'],      'Returned': ['admin_hr'] },
  'Admin-Verified':       { 'Finance-Verified': ['finance_head'], 'Rejected': ['finance_head'],  'Returned': ['finance_head'] },
  // finance_head may also move this straight to Approved-for-Payroll: an explicit override for
  // when the CFO is unavailable. The comment passed in must record the override reason so it is
  // visible to the CFO in the audit trail; the actor name alone (Finance, not CFO) already makes
  // clear this bypassed normal sign-off.
  'Finance-Verified':     { 'Approved-for-Payroll': ['cfo', 'finance_head'], 'Rejected': ['cfo'], 'Returned': ['cfo'] },
  'Approved-for-Payroll': { 'Rejected': ['cfo'] },
};

export const getReimbursements = async (req, res) => {
  const user = req.user;
  let query = 'SELECT r.id, r.user_id as "userId", r.date, r.expense_date as "expenseDate", r.category, r.amount, r.currency, r.status, r.description, r.cost_centre as "costCentre", r.is_taxable as "isTaxable", r.proof_file_name as "proofFileName", r.proof_file_size as "proofFileSize", r.payment_proof_file_name as "paymentProofFileName", r.comments, u.name as "employeeName", u.designation as "employeeRole", u.avatar_url as "employeeAvatar" FROM reimbursements r JOIN users u ON r.user_id = u.id';
  let params = [];
  // A plain employee only sees their own claims — unless they've been granted
  // reimbursements.approve (see requirePermission on PUT .../:id/status), in which case
  // they need the full list to actually act on the permission they were given.
  if (user.role === 'employee' && !(await hasPermission(user, 'reimbursements.approve'))) {
      query += ' WHERE r.user_id = $1';
      params.push(user.id);
  }
  const reimbursements = (await pool.query(query, params)).rows;

  // Fetch every claim's timeline in ONE query instead of one-per-claim (that was an N+1 that
  // got slow with many claims). Grouped back per claim, ordered by the SERIAL id so the events
  // stay in the exact order they were recorded — same result the per-claim query produced.
  const claimIds = reimbursements.map((r) => r.id);
  const timelineByClaim = new Map();
  if (claimIds.length) {
      const rows = (await pool.query(
        'SELECT reimbursement_id, status, timestamp, actor, completed FROM reimbursement_timeline WHERE reimbursement_id = ANY($1) ORDER BY id',
        [claimIds]
      )).rows;
      for (const t of rows) {
          if (!timelineByClaim.has(t.reimbursement_id)) timelineByClaim.set(t.reimbursement_id, []);
          timelineByClaim.get(t.reimbursement_id).push({
              status: t.status,
              timestamp: t.timestamp,
              actor: t.actor,
              completed: t.completed === true || t.completed === 1,
          });
      }
  }
  for (const r of reimbursements) {
      r.timeline = timelineByClaim.get(r.id) || [];
      r.isTaxable = r.isTaxable === true || r.isTaxable === 1;
  }
  res.json(reimbursements);
};

export const createReimbursement = async (req, res) => {
  const user = req.user;

  // Everything below was previously enforced only in the browser, so a crafted request
  // could create a claim with a zero/negative amount, no category and no receipt.
  const parsed = CreateReimbursementSchema.safeParse(req.body);
  if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }
  const { expenseDate, category, amount, description, costCentre, proofFileName, proofFileSize, proofFileData } = parsed.data;
  const currency = 'INR';

  // Rejected and cancelled claims are excluded, otherwise an employee could never
  // resubmit a corrected version of a claim that was turned down. Category is included
  // so two genuinely different expenses of the same value on one day are not blocked.
  const duplicate = (await pool.query(
    `SELECT id FROM reimbursements
     WHERE user_id = $1 AND expense_date = $2 AND amount = $3 AND category = $4
       AND status NOT IN ('Rejected', 'Cancelled')`,
    [user.id, expenseDate, amount, category]
  )).rows[0];
  if (duplicate) {
      return res.status(400).json({ error: `You already have an open ${category} claim for ₹${amount} on this date (${duplicate.id}).` });
  }

  const policy = (await pool.query('SELECT reimbursement_cutoff_days FROM global_policy WHERE id = 1')).rows[0];
  const cutoff = policy?.reimbursement_cutoff_days ?? 30;
  const daysSinceExpense = Math.floor((new Date().getTime() - new Date(expenseDate).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceExpense > cutoff) {
      return res.status(400).json({ error: `Submission rejected: Expense is older than the policy cut-off of ${cutoff} days.` });
  }

  // Monthly category cap. Only applies where an active guardrail exists for the category;
  // categories with no guardrail row are uncapped.
  const guardrail = (await pool.query(
    'SELECT monthly_cap FROM guardrails WHERE category = $1 AND monthly_cap > 0', [category]
  )).rows[0];
  if (guardrail) {
      const expenseMonth = expenseDate.substring(0, 7);
      const spent = Number((await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM reimbursements
         WHERE user_id = $1 AND category = $2 AND status <> 'Rejected'
           AND expense_date LIKE $3`,
        [user.id, category, expenseMonth + '%']
      )).rows[0].total);

      if (spent + amount > Number(guardrail.monthly_cap)) {
          const remaining = Math.max(0, Number(guardrail.monthly_cap) - spent);
          return res.status(400).json({
            error: `Monthly limit for ${category} is ₹${Number(guardrail.monthly_cap).toLocaleString('en-IN')}. ` +
                   `You have already claimed ₹${spent.toLocaleString('en-IN')} this month, so only ` +
                   `₹${remaining.toLocaleString('en-IN')} remains.`
          });
      }
  }

  const id = 'CLM-' + Math.floor(10000 + Math.random() * 90000);
  // ISO so the column sorts and filters correctly; it was a localised display string.
  const submissionDate = new Date().toISOString().split('T')[0];

  let finalProofFileName = proofFileName;
  if (proofFileData) {
      let decoded;
      try { decoded = decodeUpload(proofFileData, { allowPdf: true }); }
      catch (e) { return res.status(400).json({ error: e.message }); }
      // Server-generated name + sniffed extension: the client filename never touches the path.
      finalProofFileName = await storage.uploadBuffer(decoded.buffer, `reimbursements/${id}-${crypto.randomUUID()}${decoded.ext}`, decoded.contentType);
  } else if (isPlantedFileReference(proofFileName)) {
      return res.status(400).json({ error: 'Attach the receipt file itself — a file path is not accepted.' });
  }

  // The claim and its first timeline entry must be written together — otherwise a failure between
  // them would leave a claim with no history (or throw a raw 500). One transaction, all-or-nothing.
  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO reimbursements (id, user_id, date, expense_date, category, amount, currency, status, description, cost_centre, is_taxable, proof_file_name, proof_file_size, pay_period) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Submitted', $8, $9, false, $10, $11, $12)`,
          [id, user.id, submissionDate, expenseDate, category, amount, currency, description || null, costCentre || null, finalProofFileName, proofFileSize || null, expenseDate.substring(0, 7)]);
      await client.query(`INSERT INTO reimbursement_timeline (reimbursement_id, status, timestamp, actor, completed) VALUES ($1, $2, $3, $4, $5)`,
          [id, 'Submitted', new Date().toISOString(), user.name, true]);
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
  } finally {
      client.release();
  }

  res.json({ success: true, id });
};

export const updateReimbursementStatus = async (req, res) => {
  const claimId = req.params.id;
  const { status, comments } = req.body;
  const user = req.user;

  const claim = (await pool.query('SELECT status, user_id FROM reimbursements WHERE id = $1', [claimId])).rows[0];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });

  // Segregation of duties: nobody moves their OWN claim through the approval chain — not even
  // a super_admin or an override holder. Another person must review it. (Employees correct
  // their own claims through updateOwnReimbursement / cancelOwnReimbursement, not this route.)
  if (claim.user_id === user.id) {
      return res.status(403).json({ error: 'You cannot review or approve your own reimbursement claim — another approver must action it.' });
  }

  // Without this the API accepted any status in any order, so a claim could jump straight
  // from Submitted to Paid, skipping Finance and the CFO entirely.
  if (user.role !== 'super_admin') {
      const allowedFromHere = CLAIM_TRANSITIONS[claim.status] || {};
      const rolesForTarget = allowedFromHere[status];
      if (!rolesForTarget) {
          return res.status(400).json({
            error: `A claim that is "${claim.status}" cannot be moved to "${status}".`
          });
      }
      // A super_admin-granted reimbursements.approve override (see user_permission_overrides)
      // stands in for whichever of admin_hr/finance_head/cfo this stage would normally require —
      // it is a flat "can approve claims" grant, not scoped to one specific stage.
      const roleAllowed = rolesForTarget.includes(user.role);
      const overrideAllowed = !roleAllowed && await hasPermissionOverride(user, 'reimbursements.approve');
      if (!roleAllowed && !overrideAllowed) {
          return res.status(403).json({
            error: `Only ${rolesForTarget.join(' or ')} can move a claim from "${claim.status}" to "${status}".`
          });
      }
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query('UPDATE reimbursements SET status = $1, comments = $2 WHERE id = $3', [status, comments || null, claimId]);
      await client.query(`INSERT INTO reimbursement_timeline (reimbursement_id, status, timestamp, actor, completed) VALUES ($1, $2, $3, $4, $5)`,
          [claimId, status, new Date().toISOString(), user.name, true]);
      await client.query('COMMIT');
  } catch(e) {
      await client.query('ROLLBACK').catch(() => {});
      return serverError(res, e);
  } finally {
      client.release();
  }

  // Notification must never fail the decision that has already been committed.
  try { await notifyClaimant(claimId, status, comments); }
  catch (e) { console.error('[Claim] notification failed:', e.message); }

  res.json({ success: true });
};

// Decides whether `user` may read the stored file we persisted as `fileUrl` (e.g.
// '/api/uploads/employees/usr-x-aadhar-scan.png' for local storage, or '/api/files/<itemId>'
// for OneDrive). The rule mirrors who already views these in the app today, so normal
// previews keep working — it only stops unauthenticated access and cross-employee snooping:
//   • reimbursement receipts/proofs → the claimant, or anyone who can approve claims
//   • identity documents (aadhaar/pan/education) → the owner, or a directory viewer
//   • punch selfies → the owner, or someone who can see detailed attendance
//   • avatars → any signed-in user (they are shown throughout the UI)
// Unknown / unreferenced files fail closed.
async function authorizeFileAccess(user, fileUrl) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;

  const claim = (await pool.query(
    'SELECT user_id FROM reimbursements WHERE proof_file_name = $1 OR payment_proof_file_name = $1 LIMIT 1',
    [fileUrl]
  )).rows[0];
  if (claim) {
    if (claim.user_id === user.id) return true;
    return await hasPermission(user, 'reimbursements.approve');
  }

  // Avatars are not sensitive and appear next to names all over the app.
  const avatar = (await pool.query('SELECT id FROM users WHERE avatar_url = $1 LIMIT 1', [fileUrl])).rows[0];
  if (avatar) return true;

  const doc = (await pool.query(
    'SELECT id FROM users WHERE aadhar_docs_url = $1 OR pan_docs_url = $1 OR education_docs_url = $1 LIMIT 1',
    [fileUrl]
  )).rows[0];
  if (doc) {
    if (doc.id === user.id) return true;
    return await hasPermission(user, 'employees.directory.view');
  }

  const punch = (await pool.query('SELECT user_id FROM attendance_punches WHERE selfie_url = $1 LIMIT 1', [fileUrl])).rows[0];
  if (punch) {
    if (punch.user_id === user.id) return true;
    return await hasPermission(user, 'attendance.detailed.view');
  }

  return false;
}

// Extensions we are willing to render inline. Anything else is forced to download so a
// stored .html/.svg can never execute script on our own origin (defence in depth alongside
// the upload-time type check).
const INLINE_SAFE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);
const CONTENT_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
};

// Authenticated replacement for the old public express.static('/api/uploads') mount.
export const serveUpload = async (req, res) => {
  const sub = (req.params[0] || '').replace(/\\/g, '/');
  const fileUrl = `/api/uploads/${sub}`;

  if (!(await authorizeFileAccess(req.user, fileUrl))) {
    return res.status(403).json({ error: 'You are not authorized to view this file.' });
  }

  const baseDir = process.env.VERCEL ? '/tmp/pentacle_uploads' : path.join(__dirname, '..', 'uploads');
  const resolved = path.resolve(baseDir, sub);
  // Containment: the resolved path must stay inside the uploads root.
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(resolved).toLowerCase();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // no-store: these are per-user sensitive files; never let a shared browser hand a cached
  // copy to a different user who later signs in on the same machine.
  res.setHeader('Cache-Control', 'no-store');
  if (INLINE_SAFE_EXT.has(ext)) {
    res.setHeader('Content-Type', CONTENT_TYPES[ext]);
    res.setHeader('Content-Disposition', 'inline');
    // Let the app preview this file in its own same-origin <iframe> (e.g. a PDF receipt),
    // overriding the global X-Frame-Options: DENY. SAMEORIGIN still blocks other sites.
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
  }
  return res.sendFile(resolved);
};

// Serves a file held in OneDrive. Graph gives us a short-lived pre-authenticated URL, so
// the browser is redirected straight to Microsoft: the file is never public, and its bytes
// never travel back through this server. Authorized per-file (not merely session-gated), so
// one employee cannot read another's receipts or identity documents by replaying an id.
export const getStoredFile = async (req, res) => {
  const { itemId } = req.params;
  if (typeof storage.getDownloadUrl !== 'function') {
    return res.status(404).json({ error: 'File storage is not configured.' });
  }
  // The stored reference for a OneDrive file is '/api/files/<encoded itemId>'.
  const fileUrl = `/api/files/${encodeURIComponent(itemId)}`;
  if (!(await authorizeFileAccess(req.user, fileUrl))) {
    return res.status(403).json({ error: 'You are not authorized to view this file.' });
  }
  try {
    const url = await storage.getDownloadUrl(itemId);
    if (!url) return res.status(404).json({ error: 'File not found' });
    // Stream the file back through our own origin, INLINE, with its real content-type. We
    // deliberately do NOT redirect the browser straight to OneDrive: that pre-authenticated URL
    // responds with Content-Disposition: attachment, so browsers download the file instead of
    // previewing it (a PDF receipt then never renders in the in-app viewer). Proxying also keeps
    // the request same-origin for CSP and hides the OneDrive URL from the client. Receipts are
    // small (<= a few MB) and viewed rarely, so the extra server hop is negligible.
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ error: 'Could not retrieve the file.' });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Allow the app to preview this file in its own <iframe>. The global helmet policy sets
    // X-Frame-Options: DENY (anti-clickjacking), which would otherwise stop the receipt PDF from
    // rendering in the same-origin viewer. SAMEORIGIN still blocks embedding by other sites.
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // no-store (not max-age): these are per-user sensitive receipts, and caching an earlier
    // response also made stale/broken versions stick in the browser across fixes.
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (e) {
    console.error('[Files] could not resolve', itemId, e.message);
    return res.status(502).json({ error: 'Could not retrieve the file.' });
  }
};

// Generic mail send. Returns quietly when mail is not configured so that no business
// action ever fails because of a notification.
async function sendMail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!apiKey || !from || !to) return { sent: false, reason: 'email not configured' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    return r.ok ? { sent: true } : { sent: false, reason: `resend ${r.status}` };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

// What the claimant is told at each stage. Silence was the previous behaviour: an employee
// had to keep reopening the app to discover whether their claim had moved.
const CLAIM_NOTIFICATIONS = {
  'Admin-Verified':       { subject: 'Your expense claim has been verified by HR', line: 'HR has verified your claim. It has gone to Finance for review.' },
  'Finance-Verified':     { subject: 'Your expense claim has been verified by Finance', line: 'Finance has verified your claim. It is now awaiting CFO authorisation.' },
  'Approved-for-Payroll': { subject: 'Your expense claim has been authorised', line: 'The CFO has authorised your claim. Payment will follow.' },
  'Returned':             { subject: 'Your expense claim needs correction', line: 'Your claim has been sent back to you. Please correct it and resubmit.' },
  'Rejected':             { subject: 'Your expense claim was rejected', line: 'Your claim has been rejected.' },
  'Paid':                 { subject: 'Your expense claim has been paid', line: 'Your claim has been paid.' },
};

async function notifyClaimant(claimId, status, comments) {
  const note = CLAIM_NOTIFICATIONS[status];
  if (!note) return;
  const row = (await pool.query(
    `SELECT u.email, u.name, r.amount, r.category FROM reimbursements r
     JOIN users u ON u.id = r.user_id WHERE r.id = $1`, [claimId]
  )).rows[0];
  if (!row?.email) return;

  await sendMail(row.email, `${note.subject} (${claimId})`,
    `<p>Hi ${escapeHtml(row.name)},</p>` +
    `<p>${note.line}</p>` +
    `<p><strong>${escapeHtml(claimId)}</strong> — ${escapeHtml(row.category)}, ₹${Number(row.amount).toLocaleString('en-IN')}</p>` +
    (comments ? `<p><em>Note from the reviewer:</em> ${escapeHtml(comments)}</p>` : '') +
    `<p>— Pentacle Payroll</p>`
  );
}

// Lets the owner correct a claim that has not yet been accepted into the approval chain,
// and resubmit one that a reviewer sent back. Without this an employee who mistyped an
// amount had no way to fix it.
export const updateOwnReimbursement = async (req, res) => {
  const claimId = req.params.id;
  const user = req.user;

  const claim = (await pool.query('SELECT user_id, status FROM reimbursements WHERE id = $1', [claimId])).rows[0];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.user_id !== user.id && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You can only edit your own claims.' });
  }
  if (!CLAIM_EDITABLE_BY_OWNER.includes(claim.status)) {
      return res.status(400).json({
        error: `This claim is "${claim.status}" and is already being reviewed, so it can no longer be edited.`
      });
  }

  const parsed = CreateReimbursementSchema.safeParse(req.body);
  if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }
  const { expenseDate, category, amount, description, costCentre, proofFileName, proofFileSize, proofFileData } = parsed.data;

  // Only replace the stored receipt if a new file was actually attached.
  let storedProof = null;
  if (proofFileData) {
      let decoded;
      try { decoded = decodeUpload(proofFileData, { allowPdf: true }); }
      catch (e) { return res.status(400).json({ error: e.message }); }
      storedProof = await storage.uploadBuffer(decoded.buffer, `reimbursements/${claimId}-${crypto.randomUUID()}${decoded.ext}`, decoded.contentType);
  } else if (isPlantedFileReference(proofFileName)) {
      return res.status(400).json({ error: 'Attach the receipt file itself — a file path is not accepted.' });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE reimbursements SET expense_date = $1, category = $2, amount = $3, description = $4,
                cost_centre = $5, pay_period = $6, status = 'Submitted',
                proof_file_name = COALESCE($7, proof_file_name),
                proof_file_size = COALESCE($8, proof_file_size)
         WHERE id = $9`,
        [expenseDate, category, amount, description || null, costCentre || null,
         expenseDate.substring(0, 7), storedProof, proofFileSize || null, claimId]
      );
      await client.query(
        `INSERT INTO reimbursement_timeline (reimbursement_id, status, timestamp, actor, completed) VALUES ($1,$2,$3,$4,$5)`,
        [claimId, claim.status === 'Returned' ? 'Resubmitted' : 'Edited', new Date().toISOString(), user.name, true]
      );
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return serverError(res, e);
  } finally {
      client.release();
  }
  res.json({ success: true });
};

// Lets the owner withdraw a claim they no longer want reviewed.
export const cancelOwnReimbursement = async (req, res) => {
  const claimId = req.params.id;
  const user = req.user;

  const claim = (await pool.query('SELECT user_id, status FROM reimbursements WHERE id = $1', [claimId])).rows[0];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.user_id !== user.id && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You can only cancel your own claims.' });
  }
  if (!CLAIM_EDITABLE_BY_OWNER.includes(claim.status)) {
      return res.status(400).json({
        error: `This claim is "${claim.status}" and can no longer be cancelled. Ask HR or Finance to reject it.`
      });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query("UPDATE reimbursements SET status = 'Cancelled' WHERE id = $1", [claimId]);
      await client.query(
        `INSERT INTO reimbursement_timeline (reimbursement_id, status, timestamp, actor, completed) VALUES ($1,$2,$3,$4,$5)`,
        [claimId, 'Cancelled', new Date().toISOString(), user.name, true]
      );
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return serverError(res, e);
  } finally {
      client.release();
  }
  res.json({ success: true });
};

// Marks a claim as Paid and stores the payment proof uploaded by Finance.
// Uses a dedicated client so BEGIN/COMMIT are guaranteed to run on one connection.
export const payReimbursement = async (req, res) => {
  const claimId = req.params.id;
  const { proofFileName, proofFileData } = req.body;
  const user = req.user;

  const claim = (await pool.query('SELECT id, status, user_id FROM reimbursements WHERE id = $1', [claimId])).rows[0];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  if (claim.status === 'Paid') return res.status(400).json({ error: 'This claim has already been paid.' });
  // Segregation of duties: you cannot pay out your own claim, even if you hold reimbursements.pay.
  if (claim.user_id === user.id) {
      return res.status(403).json({ error: 'You cannot pay out your own reimbursement claim — another authoriser must action it.' });
  }
  // A claim may only be paid once the CFO has authorised it.
  if (claim.status !== 'Approved-for-Payroll' && user.role !== 'super_admin') {
      return res.status(400).json({
        error: `This claim is "${claim.status}". Only a claim authorised by the CFO can be paid.`
      });
  }
  if (!proofFileName) return res.status(400).json({ error: 'A payment proof is required.' });

  let storedProofName = proofFileName || null;
  if (proofFileData && proofFileName) {
      let decoded;
      try { decoded = decodeUpload(proofFileData, { allowPdf: true }); }
      catch (e) { return res.status(400).json({ error: e.message }); }
      storedProofName = await storage.uploadBuffer(decoded.buffer, `reimbursements/payment-${claimId}-${crypto.randomUUID()}${decoded.ext}`, decoded.contentType);
  } else if (isPlantedFileReference(proofFileName)) {
      return res.status(400).json({ error: 'Attach the payment proof file itself — a file path is not accepted.' });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');
      await client.query(
        "UPDATE reimbursements SET status = 'Paid', payment_proof_file_name = $1 WHERE id = $2",
        [storedProofName, claimId]
      );
      await client.query(
        `INSERT INTO reimbursement_timeline (reimbursement_id, status, timestamp, actor, completed) VALUES ($1, $2, $3, $4, $5)`,
        [claimId, 'Paid', new Date().toLocaleString(), user.name, true]
      );
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK');
      return serverError(res, e);
  } finally {
      client.release();
  }

  try { await notifyClaimant(claimId, 'Paid'); }
  catch (e) { console.error('[Claim] notification failed:', e.message); }

  res.json({ success: true, paymentProofFileName: storedProofName });
};
