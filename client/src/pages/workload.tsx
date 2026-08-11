import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  FileCheck,
  Package,
  CreditCard,
  ShieldAlert,
  Scale,
  ClipboardList,
  Archive,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { TaskWithRelations, User } from "@shared/schema";

type Row = { name: string; assigned: number; working: number; total: number };

type Section = {
  key: string;
  label: string;
  icon: typeof ShieldCheck;
  color: string;
  rows: Row[];
};

function normalizeName(s: string | null | undefined) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function statusBucket(status: string | null | undefined): "assigned" | "working" | "other" {
  const s = (status || "").toLowerCase().trim();
  if (s === "assigned") return "assigned";
  if (s === "working_on_it" || s === "working on it") return "working";
  return "other";
}

function buildRowsFromTracker<T extends { assignedTo?: string | null; status?: string | null }>(
  records: T[],
): Row[] {
  const map = new Map<string, Row>();
  for (const r of records) {
    const name = normalizeName(r.assignedTo);
    if (!name) continue;
    const sb = statusBucket(r.status);
    if (sb === "other") continue;
    const row = map.get(name) || { name, assigned: 0, working: 0, total: 0 };
    if (sb === "assigned") row.assigned += 1;
    else row.working += 1;
    row.total += 1;
    map.set(name, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function buildRowsFromTasks(
  tasks: TaskWithRelations[],
  users: User[],
  bucket: "for_verification" | "ready_for_billing",
): Row[] {
  const userMap = new Map(users.map((u) => [u.id, u.fullName]));
  const map = new Map<string, Row>();
  for (const t of tasks) {
    if (t.bucket !== bucket) continue;
    if (!t.assignedUserId) continue;
    const name = userMap.get(t.assignedUserId) || "";
    if (!name) continue;
    const sb = statusBucket(t.status as unknown as string);
    if (sb === "other") continue;
    const row = map.get(name) || { name, assigned: 0, working: 0, total: 0 };
    if (sb === "assigned") row.assigned += 1;
    else row.working += 1;
    row.total += 1;
    map.set(name, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export default function WorkloadPage() {
  const { user: currentUser } = useAuth();

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: tasks, isLoading: tasksLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks?workload=true"],
  });
  const { data: denials, isLoading: denialsLoading } = useQuery<any[]>({
    queryKey: ["/api/denials?workload=true"],
  });
  const { data: arbitrations, isLoading: arbsLoading } = useQuery<any[]>({
    queryKey: ["/api/arbitrations?workload=true"],
  });
  const { data: collections, isLoading: collectionsLoading } = useQuery<any[]>({
    queryKey: ["/api/collections?workload=true"],
  });
  const { data: postings, isLoading: postingsLoading } = useQuery<any[]>({
    queryKey: ["/api/postings?workload=true"],
  });
  const { data: checks, isLoading: checksLoading } = useQuery<any[]>({
    queryKey: ["/api/checks?workload=true"],
  });
  const { data: closed, isLoading: closedLoading } = useQuery<any[]>({
    queryKey: ["/api/closed"],
  });

  const isLoading =
    usersLoading ||
    tasksLoading ||
    denialsLoading ||
    arbsLoading ||
    collectionsLoading ||
    postingsLoading ||
    checksLoading ||
    closedLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isStaffView = currentUser?.role === "verifier" || currentUser?.role === "biller";
  const filterToCurrent = (rows: Row[]) =>
    isStaffView
      ? rows.filter(
          (r) => normalizeName(r.name).toLowerCase() === normalizeName(currentUser?.fullName).toLowerCase(),
        )
      : rows;

  const activeUsers = (users || []).filter((u) => u.active);

  const sections: Section[] = [
    {
      key: "verification",
      label: "Verification",
      icon: ShieldCheck,
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      rows: filterToCurrent(buildRowsFromTasks(tasks || [], activeUsers, "for_verification")),
    },
    {
      key: "billing",
      label: "Billing",
      icon: FileCheck,
      color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
      rows: filterToCurrent(buildRowsFromTasks(tasks || [], activeUsers, "ready_for_billing")),
    },
    {
      key: "posting",
      label: "Posting",
      icon: Package,
      color: "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800",
      rows: filterToCurrent(buildRowsFromTracker(postings || [])),
    },
    {
      key: "collections",
      label: "Collections",
      icon: CreditCard,
      color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      rows: filterToCurrent(buildRowsFromTracker(collections || [])),
    },
    {
      key: "denials",
      label: "Denials",
      icon: ShieldAlert,
      color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800",
      rows: filterToCurrent(buildRowsFromTracker(denials || [])),
    },
    {
      key: "arbitration",
      label: "Arbitration",
      icon: Scale,
      color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
      rows: filterToCurrent(buildRowsFromTracker(arbitrations || [])),
    },
    {
      key: "checks",
      label: "Checks",
      icon: ClipboardList,
      color: "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800",
      rows: filterToCurrent(buildRowsFromTracker(checks || [])),
    },
    {
      key: "rtp",
      label: "RTP",
      icon: Archive,
      color: "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800",
      rows: filterToCurrent(buildRowsFromTracker(closed || [])),
    },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-workload-title">
          {isStaffView ? "My Workload" : "Employee Workload"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isStaffView
            ? "Your active workload by tracker"
            : "Active workload broken down by tracker page"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          const totalRecords = section.rows.reduce((s, r) => s + r.total, 0);
          return (
            <Card key={section.key} data-testid={`workload-section-${section.key}`}>
              <CardHeader className={cn("py-3 border-b", section.color)}>
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <Icon className="h-4 w-4" />
                  <span>{section.label.toUpperCase()}</span>
                  <span className="ml-auto text-xs font-normal opacity-70">
                    {totalRecords} record{totalRecords !== 1 ? "s" : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {section.rows.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">No active assignments</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-semibold text-xs text-muted-foreground w-12">
                            Rank
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-xs text-muted-foreground">
                            Employee
                          </th>
                          <th className="text-center py-2 px-3 font-semibold text-xs text-muted-foreground">
                            Assigned
                          </th>
                          <th className="text-center py-2 px-3 font-semibold text-xs text-muted-foreground">
                            Working
                          </th>
                          <th className="text-center py-2 px-3 font-semibold text-xs text-muted-foreground">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, idx) => (
                          <tr
                            key={row.name}
                            className={cn(
                              "border-b last:border-0 transition-colors duration-150 hover:bg-primary/5 dark:hover:bg-primary/10",
                              idx % 2 === 1 && "bg-muted/20",
                            )}
                            data-testid={`workload-row-${section.key}-${row.name}`}
                          >
                            <td className="py-2 px-3">
                              <span className="text-xs font-bold text-muted-foreground">
                                #{idx + 1}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center shrink-0">
                                  {row.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-sm">{row.name}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <Badge variant="secondary" className="no-default-active-elevate tabular-nums">
                                {row.assigned}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {row.working > 0 ? (
                                <Badge className="no-default-active-elevate bg-amber-500 text-white tabular-nums">
                                  {row.working}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">0</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="font-bold text-sm">{row.total}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
