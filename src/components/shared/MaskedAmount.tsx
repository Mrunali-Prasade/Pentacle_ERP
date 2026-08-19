// Money figures are hidden by default so a passerby glancing at the screen can't read them;
// each amount reveals only when clicked, and re-masks itself when clicked again. Shared across
// the app so every masked amount looks and behaves identically.
interface MaskedAmountProps {
  revealed: boolean;
  value: string;
  onToggle: () => void;
  className?: string;
  iconSize?: number;
}

export default function MaskedAmount({
  revealed,
  value,
  onToggle,
  className = 'text-2xl font-black text-[#021934]',
  iconSize = 16
}: MaskedAmountProps) {
  return (
    <button
      onClick={onToggle}
      className={`${className} inline-flex items-center gap-1.5 hover:text-orange-600 transition-colors`}
      title={revealed ? 'Click to hide' : 'Click to reveal'}
    >
      {revealed ? value : '₹••••••'}
      <span className="material-symbols-outlined text-slate-300" style={{ fontSize: iconSize }}>
        {revealed ? 'visibility_off' : 'visibility'}
      </span>
    </button>
  );
}
