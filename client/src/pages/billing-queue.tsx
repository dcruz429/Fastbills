import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/status-badge";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { formatEST } from "@/lib/date-utils";
import { Flame, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@shared/schema";

export default function BillingQueuePage() {
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });

  const billingTasks = (tasks || [])
    .filter((t) => t.bucket === "ready_for_billing")
    .sort((a, b) => {
      const priorityOrder = { critical: 0, medium: 1, low: 2 };
      const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      if (pa !== pb) return pa - pb;

      const ieA = a.ieDate ? new Date(a.ieDate).getTime() : Infinity;
      const ieB = b.ieDate ? new Date(b.ieDate).getTime() : Infinity;
      if (ieA !== ieB) return ieA - ieB;

      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return dueA - dueB;
    });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2" data-testid="text-billing-queue-title">
          <Flame className="h-5 w-5 text-orange-500" />
          Billing Queue
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Work top-down. Critical first, then oldest IE Date, then earliest due date.
        </p>
      </div>

      <Card>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center gap-2">
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{billingTasks.length} tasks ready for billing</span>
        </CardHeader>
        <CardContent className="p-0">
          {billingTasks.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No tasks in billing queue. All caught up!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium w-8">#</th>
                    <th className="text-left py-2 px-3 font-medium">Patient Name</th>
                    <th className="text-left py-2 px-3 font-medium">Priority</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">IE Date</th>
                    <th className="text-left py-2 px-3 font-medium">Due Date</th>
                    <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Insurance</th>
                    <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {billingTasks.map((task, idx) => {
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <tr
                        key={task.id}
                        className={cn(
                          "border-b last:border-0 cursor-pointer transition-colors",
                          idx === 0 ? "bg-primary/5" : "",
                          isOverdue ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-muted/30"
                        )}
                        onClick={() => {
                          setSelectedTask(task);
                          setDrawerOpen(true);
                        }}
                        data-testid={`billing-row-${task.id}`}
                      >
                        <td className="py-2.5 px-3 text-xs font-bold text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-medium">{task.patientName}</td>
                        <td className="py-2.5 px-3"><PriorityBadge priority={task.priority} /></td>
                        <td className="py-2.5 px-3"><StatusBadge status={task.status} /></td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {task.ieDate ? formatEST(new Date(task.ieDate), "MM/dd/yy") : "-"}
                        </td>
                        <td className={cn("py-2.5 px-3", isOverdue ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground")}>
                          {task.dueDate ? formatEST(new Date(task.dueDate), "MM/dd/yy") : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                          {task.insurance?.name || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                          {task.assignedUser?.fullName || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedTask(null);
        }}
      />
    </div>
  );
}
