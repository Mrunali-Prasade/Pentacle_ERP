import { useEffect, useMemo, useState } from 'react';

// Reusable client-side pagination. Feed it the full array; it hands back the current page's
// slice plus the controls. Lists in this app are fetched whole, so this keeps big tables
// readable (and the DOM light) without any backend/API changes.
export function usePagination<T>(items: T[], pageSize = 15) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // If the list shrinks (filter/refetch) below the current page, snap back into range.
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return { page, setPage, totalPages, total, pageItems, pageSize };
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, pageSize, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs">
      <span className="text-slate-500 font-medium">Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
        >
          Prev
        </button>
        <span className="px-2 text-slate-600 font-bold">Page {page} / {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
