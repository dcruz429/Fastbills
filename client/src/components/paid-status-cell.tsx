import type { SyntheticEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

type PaidStatusCellProps = {
  paid: boolean;
  canEdit: boolean;
  pending?: boolean;
  busy?: boolean;
  onChange?: (paid: boolean) => void;
  label?: string;
};

export function PaidStatusBadge({ paid }: { paid: boolean }) {
  return paid ? <Badge variant="secondary" className="ml-2 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">PAID</Badge> : null;
}

export function PaidStatusCell({ paid, canEdit, pending = false, busy = false, onChange, label = "record" }: PaidStatusCellProps) {
  if (!canEdit) {
    return paid
      ? <Badge variant="secondary" className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">PAID</Badge>
      : <span className="text-muted-foreground">—</span>;
  }

  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <div className="flex min-w-[78px] items-center gap-2" onClick={stop} onKeyDown={stop} onKeyUp={stop} onPointerDown={stop}>
      <Checkbox
        checked={paid}
        disabled={pending || busy}
        aria-label="PAID"
        onClick={stop}
        onKeyDown={stop}
        onKeyUp={stop}
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") onChange?.(checked);
        }}
        data-testid={`checkbox-paid-${label}`}
      />
      {paid ? (
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">PAID</span>
      ) : pending ? (
        <span className="text-xs text-muted-foreground">Saving…</span>
      ) : null}
    </div>
  );
}
