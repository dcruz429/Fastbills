import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { trackerPage } from "@shared/tracker-performance";

export function PaginatedTrackerTable<T extends { id: number | string }>({
  rows, label, children,
}: {
  rows: readonly T[];
  label: string;
  children: (visibleRows: T[]) => ReactNode;
}) {
  // Compare record identities/order, not array references: ordinary edits
  // recreate arrays and must not send a user back to the first page.
  const signature = rows.map(row => row.id).join(",");
  const [selection, setSelection] = useState({ signature, page: 1 });
  const result = trackerPage(rows, selection.signature === signature ? selection.page : 1);
  useEffect(() => {
    setSelection(previous => previous.signature === signature ? previous : { signature, page: 1 });
  }, [signature]);

  return (
    <>
      {result.pageCount > 1 && (
        <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Showing {result.start + 1}–{result.end} of {rows.length.toLocaleString()} records
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={result.page === 1}
              onClick={() => setSelection({ signature, page: result.page - 1 })}>Previous</Button>
            <span className="text-xs">Page {result.page} of {result.pageCount}</span>
            <Button size="sm" variant="outline" disabled={result.page === result.pageCount}
              onClick={() => setSelection({ signature, page: result.page + 1 })}>Next</Button>
          </div>
        </nav>
      )}
      {children(result.rows)}
    </>
  );
}
