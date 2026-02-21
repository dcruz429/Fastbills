import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  working_on_it: "bg-lime-500 text-white dark:bg-lime-600",
  billed: "bg-green-800 text-white dark:bg-green-700",
  done: "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-emerald-950",
  dropped: "bg-gray-600 text-white dark:bg-gray-500",
  assigned: "bg-pink-400 text-white dark:bg-pink-500",
  unassigned: "bg-red-500 text-white dark:bg-red-600",
};

const priorityColors: Record<string, string> = {
  low: "bg-blue-500 text-white dark:bg-blue-600",
  medium: "bg-orange-500 text-white dark:bg-orange-600",
  critical: "bg-red-600 text-white dark:bg-red-700",
};

const statusLabels: Record<string, string> = {
  working_on_it: "Working on it",
  billed: "Billed",
  done: "Done",
  dropped: "Dropped",
  assigned: "Assigned",
  unassigned: "Unassigned",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  critical: "Critical",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "no-default-active-elevate text-xs font-medium",
        statusColors[status] || "bg-muted text-muted-foreground"
      )}
      data-testid={`badge-status-${status}`}
    >
      {statusLabels[status] || status}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const isCritical = priority === "critical";

  return (
    <Badge
      className={cn(
        "no-default-active-elevate text-xs font-medium",
        priorityColors[priority] || "bg-muted text-muted-foreground",
        isCritical && "animate-pulse"
      )}
      data-testid={`badge-priority-${priority}`}
    >
      {priorityLabels[priority] || priority}
    </Badge>
  );
}

export function BucketBadge({ bucket }: { bucket: string }) {
  const colors: Record<string, string> = {
    for_verification: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    ready_for_billing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  };

  const labels: Record<string, string> = {
    for_verification: "For Verification",
    ready_for_billing: "Ready for Billing",
    done: "Done",
  };

  return (
    <Badge
      className={cn(
        "no-default-active-elevate text-xs font-medium",
        colors[bucket] || "bg-muted text-muted-foreground"
      )}
    >
      {labels[bucket] || bucket}
    </Badge>
  );
}
