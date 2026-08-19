// Shared controller helpers — generic, dependency-free utilities used across several
// controllers (file upload validation, CSV/HTML escaping, uniform error responses).
// Moved here verbatim from the original monolithic controller so the individual controllers can share them
// without duplicating logic. No behaviour change.

// --- Upload validation -------------------------------------------------------------------
// Every file the app accepts arrives as a base64 data URL. We never trust the declared MIME
// or the filename extension: we sniff the real magic bytes so a renamed .html/.svg/.exe can
// never be stored (and later served) as if it were an image, and we cap the decoded size so
// a giant payload cannot exhaust memory. Returns { buffer, ext, contentType } or throws an
// Error whose message is safe to show the user.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;   // receipts / identity documents
export const MAX_SELFIE_BYTES = 1024 * 1024;       // punch selfies are ~50 KB in practice

export function sniffFileType(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { ext: '.png', contentType: 'image/png', kind: 'image' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: '.jpg', contentType: 'image/jpeg', kind: 'image' };
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return { ext: '.pdf', contentType: 'application/pdf', kind: 'pdf' };
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return { ext: '.gif', contentType: 'image/gif', kind: 'image' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: '.webp', contentType: 'image/webp', kind: 'image' };
  return null;
}

// Escapes a value for a CSV cell. Beyond quoting for commas/quotes/newlines, it defuses
// spreadsheet formula injection: a field a user can control (a name, an address) beginning
// with = + - @ (or tab/CR) is executed as a formula by Excel/Sheets on open, so we prefix it
// with a single quote to force it to be treated as text.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// Logs the real error server-side and returns a generic message to the client. pg error text
// echoes column names, constraint names, and sometimes the offending value (PII), so it must
// never reach the browser.
export function serverError(res, e, message = 'Something went wrong. Please try again.') {
  console.error('[Server error]', e && e.message ? e.message : e);
  return res.status(500).json({ error: message });
}

// Escapes a value before it is placed into notification-email HTML, so a reviewer comment or
// a name containing markup cannot inject links or content into the message the employee receives.
export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A stored proof file reference must only ever be a server-generated storage path (produced by
// an actual upload) or a plain label. A claim submitted with NO file bytes must not carry an
// internal path like '/api/uploads/...' or '/api/files/...': authorizeFileAccess trusts the
// claim owner for its own proof_file_name, so a planted path would let a crafted claim read
// someone else's file. Returns true if the value is an unacceptable planted reference.
export function isPlantedFileReference(name) {
  return typeof name === 'string' && /^\/?(api\/)?(uploads|files)\//i.test(name.trim());
}

export function decodeUpload(dataUrl, { allowPdf = true, maxBytes = MAX_UPLOAD_BYTES } = {}) {
  const matches = typeof dataUrl === 'string' && dataUrl.match(/^data:([A-Za-z0-9-+\/.]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid file data.');
  // Reject before allocating the full Buffer: base64 is ~4/3 the byte size.
  if (matches[2].length > maxBytes * 1.4) throw new Error('File is too large.');
  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.length > maxBytes) throw new Error('File is too large.');
  const sniffed = sniffFileType(buffer);
  if (!sniffed) throw new Error('Unsupported file type. Please upload a PNG, JPG or PDF.');
  if (sniffed.kind === 'pdf' && !allowPdf) throw new Error('Only image files are allowed here.');
  return { buffer, ext: sniffed.ext, contentType: sniffed.contentType };
}
