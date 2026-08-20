import { useState } from 'react';

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  /** Sizing / text-size classes for the circle, e.g. "w-10 h-10 text-sm". */
  className?: string;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

// A deterministic, pleasant colour derived from the name, so the same person always gets the same
// tile rather than a random colour on every render.
const PALETTE = ['#0F6B4F', '#1E5AA8', '#B7791F', '#8A3FA0', '#A8321F', '#02594C', '#3B4CA8', '#8A5B10'];
function colourFor(name?: string | null): string {
  let h = 0;
  for (const ch of (name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Shows the uploaded photo when there is one AND it loads; otherwise a coloured tile with the
// person's initials — never a broken image or an empty grey circle.
export default function Avatar({ name, src, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || ''}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center font-bold text-white leading-none select-none ${className}`}
      style={{ backgroundColor: colourFor(name) }}
      aria-label={name || 'User'}
    >
      {initials(name)}
    </div>
  );
}
