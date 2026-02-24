import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  unassigned: "bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-200",
  assigned: "bg-blue-500 text-white dark:bg-blue-600",
  working_on_it: "bg-amber-400 text-amber-900 dark:bg-amber-500 dark:text-amber-950",
  billed: "bg-green-800 text-white dark:bg-green-700",
  verified: "bg-emerald-500 text-white dark:bg-emerald-600",
  dropped: "bg-gray-700 text-white dark:bg-gray-800",
};

const priorityColors: Record<string, string> = {
  low: "bg-green-500 text-white dark:bg-green-600",
  medium: "bg-yellow-400 text-yellow-900 dark:bg-yellow-500 dark:text-yellow-950",
  high: "bg-orange-500 text-white dark:bg-orange-600",
  critical: "bg-red-600 text-white dark:bg-red-700",
};

const statusLabels: Record<string, string> = {
  working_on_it: "Working on it",
  billed: "Billed",
  verified: "Verified",
  dropped: "Dropped",
  assigned: "Assigned",
  unassigned: "Unassigned",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
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
