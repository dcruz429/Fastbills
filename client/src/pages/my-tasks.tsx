import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/status-badge";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { formatEST } from "@/lib/date-utils";
import {
  Search,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  ShieldCheck,
  FileCheck,
  CheckCircle2,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { TaskWithRelations, Clinic } from "@shared/schema";

type SortField = "patientName" | "clinic" | "insurance" | "ieDate" | "dueDate" | "priority" | "status" | "bucket";
type SortDir = "asc" | "desc";

const priorityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const statusOrder: Record<string, number> = { unassigned: 0, assigned: 1, working_on_it: 2, verified: 3, billed: 4, dropped: 5 };
const bucketOrder: Record<string, number> = { for_verification: 0, ready_for_billing: 1, done: 2 };

const bucketLabels: Record<string, string> = {
  for_verification: "For Verification",
  ready_for_billing: "Ready for Billing",
  done: "Done",
};

const bucketIcons: Record<string, typeof ShieldCheck> = {
  for_verification: ShieldCheck,
  ready_for_billing: FileCheck,
  done: CheckCircle2,
};

const bucketColors: Record<string, string> = {
  for_verification: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30",
  ready_for_billing: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
  done: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30",
};

function sortTasks(tasks: TaskWithRelations[], field: SortField, dir: SortDir): TaskWithRelations[] {
  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "patientName":
        cmp = (a.patientName || "").localeCompare(b.patientName || "");
        break;
      case "clinic":
        cmp = (a.clinic?.name || "").localeCompare(b.clinic?.name || "");
        break;
      case "insurance":
        cmp = (a.insurance?.name || "").localeCompare(b.insurance?.name || "");
        break;
      case "ieDate":
        cmp = (a.ieDate ? new Date(a.ieDate).getTime() : 0) - (b.ieDate ? new Date(b.ieDate).getTime() : 0);
        break;
      case "dueDate":
        cmp = (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0);
        break;
      case "priority":
        cmp = (priorityOrder[a.priority] ?? 0) - (priorityOrder[b.priority] ?? 0);
        break;
      case "status":
        cmp = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
        break;
      case "bucket":
        cmp = (bucketOrder[a.bucket] ?? 0) - (bucketOrder[b.bucket] ?? 0);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export default function MyTasksPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterBucket, setFilterBucket] = useState("all");
  const [sortField, setSortField] = useState<SortField | null>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: clinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });

  const now = new Date();
  const myTasks = (tasks || []).filter((t) => t.assignedUserId === user?.id);

  const filteredTasks = myTasks.filter((t) => {
    if (search) {
      const s = search.toLowerCase();
      if (
        !t.patientName.toLowerCase().includes(s) &&
        !(t.chartNumber || "").toLowerCase().includes(s) &&
        !t.clinic?.name?.toLowerCase().includes(s) &&
        !t.insurance?.name?.toLowerCase().includes(s)
      )
        return false;
    }
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterBucket !== "all" && t.bucket !== filterBucket) return false;
    return true;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedTasks = sortField ? sortTasks(filteredTasks, sortField, sortDir) : filteredTasks;

  const overdueTasks = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.bucket !== "done");
  const activeTasks = myTasks.filter((t) => t.bucket !== "done");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 p-6 pb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-my-tasks-title">My Tasks</h1>
          <span className="text-sm text-muted-foreground" data-testid="text-my-tasks-count">
            {activeTasks.length} active
          </span>
          {overdueTasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" data-testid="text-my-tasks-overdue">
              <AlertTriangle className="h-3 w-3" />
              {overdueTasks.length} overdue
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients, clinics, insurance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-my-tasks-search"
          />
        </div>
        <Select value={filterBucket} onValueChange={setFilterBucket}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-bucket">
            <SelectValue placeholder="Bucket" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buckets</SelectItem>
            <SelectItem value="for_verification">For Verification</SelectItem>
            <SelectItem value="ready_for_billing">Ready for Billing</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="working_on_it">Working on it</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="billed">Billed</SelectItem>
            <SelectItem value="dropped">Dropped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        {(filterStatus !== "all" || filterPriority !== "all" || filterBucket !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterStatus("all");
              setFilterPriority("all");
              setFilterBucket("all");
            }}
            className="text-xs"
            data-testid="button-clear-filters"
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 animate-fade-in">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <UserIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground" data-testid="text-my-tasks-empty">
              {myTasks.length === 0 ? "No tasks are currently assigned to you" : "No tasks match your filters"}
            </p>
          </div>
        ) : (
          <Card className="border shadow-sm">
            <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 bg-muted/30" data-testid="my-tasks-header">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold tracking-wide text-muted-foreground">
                MY ASSIGNED TASKS
              </span>
              <span className="text-xs text-muted-foreground ml-auto font-medium" data-testid="text-my-tasks-filtered-count">
                {sortedTasks.length} task{sortedTasks.length !== 1 ? "s" : ""}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      {([
                        { field: "patientName" as SortField, label: "Patient Name", cls: "px-3", hide: "" },
                        { field: "bucket" as SortField, label: "Bucket", cls: "px-2", hide: "" },
                        { field: "clinic" as SortField, label: "Clinic", cls: "px-3", hide: "hidden md:table-cell" },
                        { field: "insurance" as SortField, label: "Insurance", cls: "px-2", hide: "hidden lg:table-cell" },
                        { field: "ieDate" as SortField, label: "IE Date", cls: "px-2", hide: "hidden lg:table-cell" },
                        { field: "dueDate" as SortField, label: "Due Date", cls: "px-2", hide: "" },
                        { field: "priority" as SortField, label: "Priority", cls: "px-2", hide: "" },
                        { field: "status" as SortField, label: "Status", cls: "px-2", hide: "" },
                      ]).map(col => (
                        <th
                          key={col.field}
                          className={cn("text-left py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors", col.cls, col.hide)}
                          onClick={() => handleSort(col.field)}
                          data-testid={`sort-${col.field}`}
                        >
                          <div className="flex items-center gap-1">
                            {col.label}
                            {sortField === col.field ? (
                              sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-30" />
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="text-left py-2 px-3 font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTasks.map((task) => {
                      const isOverdue =
                        task.dueDate &&
                        new Date(task.dueDate) < new Date() &&
                        task.bucket !== "done";
                      const BucketIcon = bucketIcons[task.bucket] || FileCheck;
                      return (
                        <tr
                          key={task.id}
                          className={cn(
                            "border-b last:border-0 cursor-pointer transition-colors duration-150",
                            isOverdue
                              ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-950/30"
                              : "even:bg-muted/20 hover:bg-primary/5 dark:hover:bg-primary/10"
                          )}
                          onClick={() => {
                            setSelectedTask(task);
                            setDrawerOpen(true);
                          }}
                          data-testid={`task-row-${task.id}`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {isOverdue && (
                                <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              )}
                              <span className="font-medium truncate max-w-[180px]">
                                {task.patientName}
                              </span>
                              {task.notes && (
                                <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded", bucketColors[task.bucket] || "")}>
                              <BucketIcon className="h-3 w-3" />
                              {bucketLabels[task.bucket] || task.bucket}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                            {task.clinic?.name || "-"}
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell">
                            {task.insurance?.name || "-"}
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell">
                            {task.ieDate ? formatEST(new Date(task.ieDate), "MM/dd") : "-"}
                          </td>
                          <td className="py-2.5 px-2">
                            <span
                              className={cn(
                                "text-xs",
                                isOverdue
                                  ? "text-red-600 dark:text-red-400 font-semibold"
                                  : "text-muted-foreground"
                              )}
                            >
                              {task.dueDate
                                ? formatEST(new Date(task.dueDate), "MM/dd")
                                : "-"}
                            </span>
                          </td>
                          <td className="py-2.5 px-2">
                            <PriorityBadge priority={task.priority} />
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1">
                              <StatusBadge status={task.status} />
                              {task.status === "dropped" && task.rtp && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400" data-testid={`badge-rtp-${task.id}`}>
                                  RTP
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {isOverdue && (
                              <Clock className="h-3.5 w-3.5 text-red-500" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
