import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/status-badge";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { formatEST } from "@/lib/date-utils";
import {
  Search,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ShieldCheck,
  Clock,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { TaskWithRelations, Clinic, Insurance, User } from "@shared/schema";

const bucketConfig = {
  for_verification: {
    label: "FOR VERIFICATION",
    icon: ShieldCheck,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800/30",
  },
  ready_for_billing: {
    label: "READY FOR BILLING",
    icon: FileCheck,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800/30",
  },
  done: {
    label: "DONE",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800/30",
  },
};

export default function BoardPage() {
  const { user } = useAuth();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterClinic, setFilterClinic] = useState("all");
  const [filterBucket, setFilterBucket] = useState("all");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterEscalated, setFilterEscalated] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({
    for_verification: true,
    ready_for_billing: true,
    done: false,
  });

  useEffect(() => {
    if (params.get("status")) setFilterStatus(params.get("status")!);
    if (params.get("priority")) setFilterPriority(params.get("priority")!);
    if (params.get("bucket")) {
      setFilterBucket(params.get("bucket")!);
      setOpenBuckets((prev) => ({ ...prev, [params.get("bucket")!]: true }));
    }
    if (params.get("overdue") === "true") setFilterOverdue(true);
    if (params.get("escalated") === "true") setFilterEscalated(true);
  }, [searchString]);

  const visibleBuckets = user?.role === "verifier"
    ? ["for_verification", "done"] as const
    : user?.role === "biller"
    ? ["ready_for_billing", "done"] as const
    : ["for_verification", "ready_for_billing", "done"] as const;

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: clinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });

  const now = new Date();
  const filteredTasks = (tasks || []).filter((t) => {
    if (search) {
      const s = search.toLowerCase();
      if (
        !t.patientName.toLowerCase().includes(s) &&
        !(t.chartNumber || "").toLowerCase().includes(s) &&
        !t.clinic?.name?.toLowerCase().includes(s) &&
        !t.insurance?.name?.toLowerCase().includes(s) &&
        !t.assignedUser?.fullName?.toLowerCase().includes(s)
      )
        return false;
    }
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterClinic !== "all" && t.clinicId?.toString() !== filterClinic) return false;
    if (filterBucket !== "all" && t.bucket !== filterBucket) return false;
    if (filterOverdue) {
      if (!t.dueDate || new Date(t.dueDate) >= now || t.bucket === "done") return false;
    }
    if (filterEscalated) {
      if (!t.dueDate || t.bucket === "done") return false;
      const diff = (now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 3) return false;
    }
    return true;
  });

  const tasksByBucket = {
    for_verification: filteredTasks.filter((t) => t.bucket === "for_verification"),
    ready_for_billing: filteredTasks.filter((t) => t.bucket === "ready_for_billing"),
    done: filteredTasks.filter((t) => t.bucket === "done"),
  };

  const toggleBucket = (bucket: string) => {
    setOpenBuckets((prev) => ({ ...prev, [bucket]: !prev[bucket] }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 p-4 pb-2 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-board-title">Task Board</h1>
        {(user?.role === "admin" || user?.role === "assigner") && <CreateTaskDialog />}
      </div>

      <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients, clinics, insurance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-board-search"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="working_on_it">Working on it</SelectItem>
            <SelectItem value="billed">Billed</SelectItem>
            <SelectItem value="done">Done</SelectItem>
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
        <Select value={filterClinic} onValueChange={setFilterClinic}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-clinic">
            <SelectValue placeholder="Clinic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clinics</SelectItem>
            {clinics?.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterBucket !== "all" || filterOverdue || filterEscalated) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterBucket("all");
              setFilterOverdue(false);
              setFilterEscalated(false);
              setFilterStatus("all");
              setFilterPriority("all");
              setFilterClinic("all");
              window.history.replaceState({}, "", "/board");
            }}
            className="text-xs"
            data-testid="button-clear-filters"
          >
            Clear filters
          </Button>
        )}
      </div>

      {(filterOverdue || filterEscalated) && (
        <div className="px-4 pb-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            {filterOverdue ? "Showing: Overdue tasks" : "Showing: Escalated tasks (3+ days overdue)"}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          Object.entries(bucketConfig).filter(([bucket]) => (visibleBuckets as readonly string[]).includes(bucket)).map(([bucket, config]) => {
            const bucketTasks = tasksByBucket[bucket as keyof typeof tasksByBucket];
            const isOpen = openBuckets[bucket];

            return (
              <Collapsible
                key={bucket}
                open={isOpen}
                onOpenChange={() => toggleBucket(bucket)}
              >
                <Card className={cn("border", config.border)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader
                      className={cn(
                        "flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none",
                        config.bg
                      )}
                      data-testid={`bucket-header-${bucket}`}
                    >
                      {isOpen ? (
                        <ChevronDown className={cn("h-4 w-4", config.color)} />
                      ) : (
                        <ChevronRight className={cn("h-4 w-4", config.color)} />
                      )}
                      <config.icon className={cn("h-4 w-4", config.color)} />
                      <span className={cn("text-sm font-bold tracking-wide", config.color)}>
                        {config.label}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto font-medium">
                        {bucketTasks.length} task{bucketTasks.length !== 1 ? "s" : ""}
                      </span>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-0">
                      {bucketTasks.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          No tasks in this section
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-xs text-muted-foreground">
                                <th className="text-left py-2 px-3 font-medium">Patient Name</th>
                                <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Clinic</th>
                                <th className="text-left py-2 px-3 font-medium hidden lg:table-cell">Insurance</th>
                                <th className="text-left py-2 px-3 font-medium hidden lg:table-cell">IE Date</th>
                                <th className="text-left py-2 px-3 font-medium">Due Date</th>
                                <th className="text-left py-2 px-3 font-medium">Priority</th>
                                <th className="text-left py-2 px-3 font-medium">Status</th>
                                <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Assigned</th>
                                <th className="text-left py-2 px-3 font-medium w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bucketTasks.map((task) => {
                                const isOverdue =
                                  task.dueDate &&
                                  new Date(task.dueDate) < new Date() &&
                                  task.bucket !== "done";
                                return (
                                  <tr
                                    key={task.id}
                                    className={cn(
                                      "border-b last:border-0 cursor-pointer transition-colors",
                                      isOverdue
                                        ? "bg-red-50 dark:bg-red-950/20"
                                        : "hover:bg-muted/30"
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
                                    <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                                      {task.clinic?.name || "-"}
                                    </td>
                                    <td className="py-2.5 px-3 text-muted-foreground hidden lg:table-cell">
                                      {task.insurance?.name || "-"}
                                    </td>
                                    <td className="py-2.5 px-3 text-muted-foreground hidden lg:table-cell">
                                      {task.ieDate ? formatEST(new Date(task.ieDate), "MM/dd") : "-"}
                                    </td>
                                    <td className="py-2.5 px-3">
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
                                    <td className="py-2.5 px-3">
                                      <PriorityBadge priority={task.priority} />
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <StatusBadge status={task.status} />
                                    </td>
                                    <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                                      <span className="truncate max-w-[100px] inline-block">
                                        {task.assignedUser?.fullName || "-"}
                                      </span>
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
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })
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
