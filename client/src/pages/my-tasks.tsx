import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatEST } from "@/lib/date-utils";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  ShieldCheck,
  FileCheck,
  CheckCircle2,
  User as UserIcon,
  ClipboardList,
  FileText,
  Landmark,
  FileX,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { TaskWithRelations } from "@shared/schema";

type SortField = "name" | "clinic" | "status" | "priority" | "date";
type SortDir = "asc" | "desc";

const trackerConfig = {
  tasks: {
    label: "BILLING / VERIFICATION TASKS",
    icon: ClipboardList,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800/30",
  },
  postings: {
    label: "POSTINGS",
    icon: FileText,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/20",
    border: "border-violet-200 dark:border-violet-800/30",
  },
  collections: {
    label: "COLLECTIONS",
    icon: Landmark,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/20",
    border: "border-teal-200 dark:border-teal-800/30",
  },
  denials: {
    label: "DENIALS",
    icon: FileX,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-800/30",
  },
  arbitrations: {
    label: "ARBITRATIONS",
    icon: Scale,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800/30",
  },
  checks: {
    label: "CHECKS",
    icon: FileCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800/30",
  },
};

const bucketLabels: Record<string, string> = {
  for_verification: "For Verification",
  ready_for_billing: "Ready for Billing",
  done: "Done",
};

const bucketColors: Record<string, string> = {
  for_verification: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30",
  ready_for_billing: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
  done: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30",
};

const bucketIcons: Record<string, typeof ShieldCheck> = {
  for_verification: ShieldCheck,
  ready_for_billing: FileCheck,
  done: CheckCircle2,
};

interface MyAssignments {
  tasks: TaskWithRelations[];
  checks: any[];
  postings: any[];
  collections: any[];
  denials: any[];
  arbitrations: any[];
}

const trackerRoutes: Record<string, string> = {
  postings: "/posting",
  collections: "/collections",
  denials: "/denials",
  arbitrations: "/arbitration",
  checks: "/checks",
};

export default function MyTasksPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterTracker, setFilterTracker] = useState("all");
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    tasks: true,
    postings: true,
    collections: true,
    denials: true,
    arbitrations: true,
    checks: true,
  });

  const { data, isLoading } = useQuery<MyAssignments>({
    queryKey: ["/api/my-assignments"],
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const matchesSearch = (item: any, ...fields: string[]) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return fields.some((f) => (item[f] || "").toString().toLowerCase().includes(s));
  };

  const filteredTasks = (data?.tasks || []).filter((t) =>
    matchesSearch(t, "patientName", "chartNumber") ||
    t.clinic?.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.insurance?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredChecks = (data?.checks || []).filter((c) =>
    matchesSearch(c, "checkNumber", "clinic", "insurance", "fileName")
  );

  const filteredPostings = (data?.postings || []).filter((p) =>
    matchesSearch(p, "fileNumber", "clinic", "documentType")
  );

  const filteredCollections = (data?.collections || []).filter((c) =>
    matchesSearch(c, "patientName", "clinic", "insurance")
  );

  const filteredDenials = (data?.denials || []).filter((d) =>
    matchesSearch(d, "patientName", "clinic", "insurance", "denialFileName")
  );

  const filteredArbitrations = (data?.arbitrations || []).filter((a) =>
    matchesSearch(a, "patientName", "clinic", "insurance", "denialFileName")
  );

  const totalItems =
    (data?.tasks?.length || 0) +
    (data?.checks?.length || 0) +
    (data?.postings?.length || 0) +
    (data?.collections?.length || 0) +
    (data?.denials?.length || 0) +
    (data?.arbitrations?.length || 0);

  const sections = [
    { key: "tasks", items: filteredTasks },
    { key: "postings", items: filteredPostings },
    { key: "collections", items: filteredCollections },
    { key: "denials", items: filteredDenials },
    { key: "arbitrations", items: filteredArbitrations },
    { key: "checks", items: filteredChecks },
  ].filter((s) => filterTracker === "all" || filterTracker === s.key);

  const now = new Date();
  const overdueTasks = (data?.tasks || []).filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.bucket !== "done"
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 p-6 pb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-my-tasks-title">My Tasks</h1>
          <span className="text-sm text-muted-foreground" data-testid="text-my-tasks-count">
            {totalItems} total
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
            placeholder="Search across all assignments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-my-tasks-search"
          />
        </div>
        <Select value={filterTracker} onValueChange={setFilterTracker}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-tracker">
            <SelectValue placeholder="Filter by page" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pages</SelectItem>
            <SelectItem value="tasks">Billing / Verification</SelectItem>
            <SelectItem value="postings">Postings</SelectItem>
            <SelectItem value="collections">Collections</SelectItem>
            <SelectItem value="denials">Denials</SelectItem>
            <SelectItem value="arbitrations">Arbitrations</SelectItem>
            <SelectItem value="checks">Checks</SelectItem>
          </SelectContent>
        </Select>
        {(filterTracker !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterTracker("all");
              setSearch("");
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
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <UserIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground" data-testid="text-my-tasks-empty">
              No items are currently assigned to you
            </p>
          </div>
        ) : (
          sections.map(({ key, items }) => {
            const config = trackerConfig[key as keyof typeof trackerConfig];
            const isOpen = openSections[key];

            if (key === "tasks") {
              return (
                <TasksSection
                  key={key}
                  tasks={items as TaskWithRelations[]}
                  config={config}
                  isOpen={isOpen}
                  onToggle={() => toggleSection(key)}
                  onSelectTask={(task) => {
                    setSelectedTask(task);
                    setDrawerOpen(true);
                  }}
                />
              );
            }

            return (
              <TrackerSection
                key={key}
                trackerKey={key}
                items={items}
                config={config}
                isOpen={isOpen}
                onToggle={() => toggleSection(key)}
                onRowClick={(item) => {
                  const route = trackerRoutes[key];
                  if (route) navigate(`${route}?edit=${item.id}`);
                }}
              />
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

function TasksSection({
  tasks,
  config,
  isOpen,
  onToggle,
  onSelectTask,
}: {
  tasks: TaskWithRelations[];
  config: typeof trackerConfig.tasks;
  isOpen: boolean;
  onToggle: () => void;
  onSelectTask: (task: TaskWithRelations) => void;
}) {
  const [sortField, setSortField] = useState<"patientName" | "clinic" | "dueDate" | "priority" | "status" | "bucket" | null>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const priorityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const statusOrder: Record<string, number> = { unassigned: 0, assigned: 1, working_on_it: 2, verified: 3, billed: 4, dropped: 5 };
  const bucketOrder: Record<string, number> = { for_verification: 0, ready_for_billing: 1, done: 2 };

  const sorted = [...tasks].sort((a, b) => {
    if (!sortField) return 0;
    let cmp = 0;
    switch (sortField) {
      case "patientName": cmp = (a.patientName || "").localeCompare(b.patientName || ""); break;
      case "clinic": cmp = (a.clinic?.name || "").localeCompare(b.clinic?.name || ""); break;
      case "dueDate": cmp = (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0); break;
      case "priority": cmp = (priorityOrder[a.priority] ?? 0) - (priorityOrder[b.priority] ?? 0); break;
      case "status": cmp = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0); break;
      case "bucket": cmp = (bucketOrder[a.bucket] ?? 0) - (bucketOrder[b.bucket] ?? 0); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const SortHeader = ({ field, label, cls, hide }: { field: typeof sortField; label: string; cls?: string; hide?: string }) => (
    <th
      className={cn("text-left py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors", cls, hide)}
      onClick={() => handleSort(field)}
      data-testid={`sort-task-${field}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field ? (
          sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </th>
  );

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card className={cn("border shadow-sm", config.border)}>
        <CollapsibleTrigger asChild>
          <CardHeader
            className={cn("flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none", config.bg)}
            data-testid="section-header-tasks"
          >
            {isOpen ? <ChevronDown className={cn("h-4 w-4", config.color)} /> : <ChevronRight className={cn("h-4 w-4", config.color)} />}
            <config.icon className={cn("h-4 w-4", config.color)} />
            <span className={cn("text-sm font-bold tracking-wide", config.color)}>{config.label}</span>
            <span className="text-xs text-muted-foreground ml-auto font-medium">
              {tasks.length} item{tasks.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No tasks assigned to you</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <SortHeader field="patientName" label="Patient Name" cls="px-3" />
                      <SortHeader field="bucket" label="Bucket" cls="px-2" />
                      <SortHeader field="clinic" label="Clinic" cls="px-3" hide="hidden md:table-cell" />
                      <SortHeader field="dueDate" label="Due Date" cls="px-2" />
                      <SortHeader field="priority" label="Priority" cls="px-2" />
                      <SortHeader field="status" label="Status" cls="px-2" />
                      <th className="py-2 px-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((task) => {
                      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.bucket !== "done";
                      const isTransferred = (task.notes || "").startsWith("[Transferred from");
                      const BucketIcon = bucketIcons[task.bucket] || FileCheck;
                      return (
                        <tr
                          key={task.id}
                          className={cn(
                            "border-b last:border-0 cursor-pointer transition-colors duration-150",
                            isOverdue
                              ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-950/30"
                              : "even:bg-muted/20 hover:bg-primary/5 dark:hover:bg-primary/10",
                            isTransferred && "text-blue-600 dark:text-blue-400"
                          )}
                          onClick={() => onSelectTask(task)}
                          data-testid={`task-row-${task.id}`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                              <span className="font-medium truncate max-w-[180px]">{task.patientName}</span>
                              {task.notes && <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded", bucketColors[task.bucket] || "")}>
                              <BucketIcon className="h-3 w-3" />
                              {bucketLabels[task.bucket] || task.bucket}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">{task.clinic?.name || "-"}</td>
                          <td className="py-2.5 px-2">
                            <span className={cn("text-xs", isOverdue ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground")}>
                              {task.dueDate ? formatEST(new Date(task.dueDate), "MM/dd") : "-"}
                            </span>
                          </td>
                          <td className="py-2.5 px-2"><PriorityBadge priority={task.priority} /></td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1">
                              <StatusBadge status={task.status} />
                              {task.status === "dropped" && task.rtp && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">RTP</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">{isOverdue && <Clock className="h-3.5 w-3.5 text-red-500" />}</td>
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
}

function TrackerSection({
  trackerKey,
  items,
  config,
  isOpen,
  onToggle,
  onRowClick,
}: {
  trackerKey: string;
  items: any[];
  config: typeof trackerConfig.checks;
  isOpen: boolean;
  onToggle: () => void;
  onRowClick?: (item: any) => void;
}) {
  const columns = getTrackerColumns(trackerKey);

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card className={cn("border shadow-sm", config.border)}>
        <CollapsibleTrigger asChild>
          <CardHeader
            className={cn("flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none", config.bg)}
            data-testid={`section-header-${trackerKey}`}
          >
            {isOpen ? <ChevronDown className={cn("h-4 w-4", config.color)} /> : <ChevronRight className={cn("h-4 w-4", config.color)} />}
            <config.icon className={cn("h-4 w-4", config.color)} />
            <span className={cn("text-sm font-bold tracking-wide", config.color)}>{config.label}</span>
            <span className="text-xs text-muted-foreground ml-auto font-medium">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No items assigned to you</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      {columns.map((col) => (
                        <th key={col.key} className={cn("text-left py-2 font-medium px-3", col.hide)}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        className={cn("border-b last:border-0 even:bg-muted/20 transition-colors duration-150", onRowClick && "cursor-pointer hover:bg-primary/5 dark:hover:bg-primary/10")}
                        onClick={() => onRowClick?.(item)}
                        data-testid={`${trackerKey}-row-${item.id}`}
                      >
                        {columns.map((col) => (
                          <td key={col.key} className={cn("py-2.5 px-3 text-muted-foreground", col.hide)}>
                            {col.render ? col.render(item) : (item[col.key] || "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function formatDate(val: string | null | undefined) {
  if (!val) return "-";
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "-";
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function formatAmount(val: string | null | undefined) {
  if (!val) return "-";
  const num = parseFloat((val || "0").replace(/[^0-9.\-]/g, ""));
  if (isNaN(num)) return "-";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Column = {
  key: string;
  label: string;
  hide?: string;
  render?: (item: any) => React.ReactNode;
};

function getTrackerColumns(trackerKey: string): Column[] {
  switch (trackerKey) {
    case "checks":
      return [
        { key: "checkNumber", label: "Check No." },
        { key: "clinic", label: "Clinic", hide: "hidden md:table-cell" },
        { key: "insurance", label: "Insurance", hide: "hidden lg:table-cell" },
        { key: "amount", label: "Amount", render: (item) => formatAmount(item.amount) },
        { key: "checkStatus", label: "Status" },
        { key: "checkDate", label: "Check Date", hide: "hidden lg:table-cell", render: (item) => formatDate(item.checkDate) },
      ];
    case "postings":
      return [
        { key: "fileNumber", label: "File #" },
        { key: "clinic", label: "Clinic", hide: "hidden md:table-cell" },
        { key: "documentType", label: "Doc Type" },
        { key: "postingStatus", label: "Status" },
        { key: "priority", label: "Priority", hide: "hidden lg:table-cell" },
        { key: "amount", label: "Amount", hide: "hidden lg:table-cell", render: (item) => formatAmount(item.amount) },
      ];
    case "collections":
      return [
        { key: "patientName", label: "Patient", render: (item) => <span className="font-medium">{item.patientName}</span> },
        { key: "clinic", label: "Clinic", hide: "hidden md:table-cell" },
        { key: "insurance", label: "Insurance", hide: "hidden lg:table-cell" },
        { key: "amount", label: "Amount", render: (item) => formatAmount(item.amount) },
        { key: "status", label: "Status" },
        { key: "priority", label: "Priority", hide: "hidden lg:table-cell" },
      ];
    case "denials":
      return [
        { key: "patientName", label: "Patient", render: (item) => <span className="font-medium">{item.patientName}</span> },
        { key: "clinic", label: "Clinic", hide: "hidden md:table-cell" },
        { key: "insurance", label: "Insurance", hide: "hidden lg:table-cell" },
        { key: "amount", label: "Amount", render: (item) => formatAmount(item.amount) },
        { key: "typeOfDenial", label: "Type", hide: "hidden lg:table-cell" },
        { key: "filedTo", label: "Filed To", hide: "hidden lg:table-cell" },
      ];
    case "arbitrations":
      return [
        { key: "patientName", label: "Patient", render: (item) => <span className="font-medium">{item.patientName}</span> },
        { key: "clinic", label: "Clinic", hide: "hidden md:table-cell" },
        { key: "insurance", label: "Insurance", hide: "hidden lg:table-cell" },
        { key: "amount", label: "Amount", render: (item) => formatAmount(item.amount) },
        { key: "arbStatus", label: "ARB Status", hide: "hidden lg:table-cell" },
        { key: "arbPaymentStatus", label: "Payment", hide: "hidden lg:table-cell" },
      ];
    default:
      return [];
  }
}
