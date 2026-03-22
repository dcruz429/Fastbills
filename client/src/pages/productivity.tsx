import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect, useLocation } from "wouter";
import {
  ChevronDown, ChevronUp, CalendarDays, Trophy, Users, CheckCircle2, TrendingUp,
  FileText, ShieldAlert, Scale, CreditCard, Package, ClipboardList, RotateCcw, BadgeCheck,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { User } from "@shared/schema";

type ProductivityRecord = {
  id: number;
  recordId: number | null;
  userId: number | null;
  userName: string | null;
  patientName: string | null;
  action: string;
  timestamp: string;
  department: string;
};

type TimeRange = "day" | "week" | "month";
type PeriodPreset = "today" | "last_7_days" | "this_month" | "last_month" | "last_3_months" | "all_time" | "single_day";

const DEPARTMENTS = [
  { key: "Verification", label: "Verification", icon: BadgeCheck, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { key: "Billing", label: "Billing", icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950", badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  { key: "Posting", label: "Posting", icon: Package, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950", badge: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { key: "Collections", label: "Collections", icon: CreditCard, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  { key: "Denials", label: "Denials", icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950", badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { key: "Arbitration", label: "Arbitration", icon: Scale, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950", badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { key: "Checks", label: "Checks", icon: ClipboardList, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950", badge: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  { key: "RTP", label: "RTP", icon: RotateCcw, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950", badge: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
];

const DEPT_CHART_COLORS: Record<string, string> = {
  Verification: "hsl(215 80% 55%)",
  Billing: "hsl(240 60% 55%)",
  Posting: "hsl(270 60% 55%)",
  Collections: "hsl(40 80% 50%)",
  Denials: "hsl(0 70% 52%)",
  Arbitration: "hsl(140 60% 42%)",
  Checks: "hsl(175 60% 40%)",
  RTP: "hsl(25 85% 52%)",
};

function getDept(key: string) {
  return DEPARTMENTS.find(d => d.key === key) || DEPARTMENTS[DEPARTMENTS.length - 1];
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function startOfMonth(y: number, m: number) { return new Date(y, m, 1); }
function endOfMonth(y: number, m: number) { return new Date(y, m + 1, 0, 23, 59, 59, 999); }

function getDateKey(date: Date, range: TimeRange): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (range === "day") return `${y}-${m}-${d}`;
  if (range === "week") {
    const s = new Date(date);
    s.setDate(date.getDate() - date.getDay());
    return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
  }
  return `${y}-${m}`;
}

function formatDateLabel(key: string, range: TimeRange): string {
  if (range === "day") {
    const d = new Date(key + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (range === "week") {
    const d = new Date(key + "T12:00:00");
    const e = new Date(d); e.setDate(d.getDate() + 6);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const [y, mo] = key.split("-");
  return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatTs(ts: string) {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  };
}

const DEPT_ROUTES: Record<string, string> = {
  Verification: "/verification",
  Billing: "/",
  Posting: "/posting",
  Collections: "/collections",
  Denials: "/denials",
  Arbitration: "/arbitration",
  Checks: "/checks",
  RTP: "/closed",
  Closed: "/closed",
};

export default function ProductivityPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const now = new Date();

  const [timeRange, setTimeRange] = useState<TimeRange>("day");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [singleDay, setSingleDay] = useState("");
  const [sortField, setSortField] = useState<"total" | string>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const LOG_PAGE_SIZE = 50;

  if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
    return <Redirect to="/" />;
  }

  const { data: records = [], isLoading } = useQuery<ProductivityRecord[]>({
    queryKey: ["/api/productivity"],
  });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const { dateStart, dateEnd } = useMemo(() => {
    let dateStart: Date | null = null;
    let dateEnd: Date | null = null;
    if (periodPreset === "today") {
      dateStart = startOfDay(now);
      dateEnd = endOfDay(now);
    } else if (periodPreset === "last_7_days") {
      dateEnd = endOfDay(now);
      dateStart = new Date(dateEnd); dateStart.setDate(dateStart.getDate() - 6); dateStart.setHours(0, 0, 0, 0);
    } else if (periodPreset === "this_month") {
      dateStart = startOfMonth(now.getFullYear(), now.getMonth());
      dateEnd = endOfMonth(now.getFullYear(), now.getMonth());
    } else if (periodPreset === "last_month") {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1);
      dateStart = startOfMonth(lm.getFullYear(), lm.getMonth());
      dateEnd = endOfMonth(lm.getFullYear(), lm.getMonth());
    } else if (periodPreset === "last_3_months") {
      const s = new Date(now.getFullYear(), now.getMonth() - 2);
      dateStart = startOfMonth(s.getFullYear(), s.getMonth());
      dateEnd = endOfMonth(now.getFullYear(), now.getMonth());
    } else if (periodPreset === "single_day" && singleDay) {
      const d = new Date(singleDay + "T00:00:00");
      dateStart = startOfDay(d);
      dateEnd = endOfDay(d);
    }
    return { dateStart, dateEnd };
  }, [periodPreset, singleDay]);

  const filtered = useMemo(() => records.filter(r => {
    if (selectedUser !== "all" && String(r.userId) !== selectedUser) return false;
    if (selectedDept !== "all" && r.department !== selectedDept) return false;
    if (dateStart && dateEnd) {
      const ts = new Date(r.timestamp);
      if (ts < dateStart || ts > dateEnd) return false;
    }
    return true;
  }), [records, selectedUser, selectedDept, dateStart, dateEnd]);

  const today = useMemo(() => {
    const s = startOfDay(now);
    const e = endOfDay(now);
    return records.filter(r => { const ts = new Date(r.timestamp); return ts >= s && ts <= e; }).length;
  }, [records]);

  const deptCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) map[r.department] = (map[r.department] || 0) + 1;
    return map;
  }, [filtered]);

  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; totals: Record<string, number>; total: number }>();
    for (const r of filtered) {
      const key = String(r.userId ?? "__unknown__");
      if (!map.has(key)) map.set(key, { name: r.userName || "Unknown", totals: {}, total: 0 });
      const e = map.get(key)!;
      e.totals[r.department] = (e.totals[r.department] || 0) + 1;
      e.total++;
    }
    return map;
  }, [filtered]);

  const activeDepts = useMemo(() => Array.from(new Set(filtered.map(r => r.department))), [filtered]);

  const userSummary = useMemo(() => {
    const rows = Array.from(userMap.entries()).map(([id, d]) => ({ userId: id, ...d }));
    return rows.sort((a, b) => {
      if (sortField === "total") return sortAsc ? a.total - b.total : b.total - a.total;
      const va = a.totals[sortField] || 0;
      const vb = b.totals[sortField] || 0;
      return sortAsc ? va - vb : vb - va;
    });
  }, [userMap, sortField, sortAsc]);

  const maxTotal = userSummary[0]?.total || 1;

  const timeData = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of filtered) {
      const key = getDateKey(new Date(r.timestamp), timeRange);
      if (!map.has(key)) map.set(key, {});
      const e = map.get(key)!;
      e[r.department] = (e[r.department] || 0) + 1;
    }
    const keys = Array.from(new Set([...map.keys()])).sort();
    return keys.map(key => {
      const data = map.get(key) || {};
      const entry: any = { date: key, label: formatDateLabel(key, timeRange) };
      for (const d of activeDepts) entry[d] = data[d] || 0;
      return entry;
    });
  }, [filtered, timeRange, activeDepts]);

  const logRows = useMemo(() => [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [filtered]);
  const logPageCount = Math.max(1, Math.ceil(logRows.length / LOG_PAGE_SIZE));
  const pagedLog = logRows.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE);

  function toggleSort(field: string) {
    if (sortField === field) setSortAsc(v => !v);
    else { setSortField(field); setSortAsc(false); }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 opacity-30 inline ml-1" />;
    return sortAsc
      ? <ChevronUp className="h-3 w-3 inline ml-1 text-primary" />
      : <ChevronDown className="h-3 w-3 inline ml-1 text-primary" />;
  }

  const periodLabel = periodPreset === "today" ? "Today"
    : periodPreset === "last_7_days" ? "Last 7 Days"
    : periodPreset === "this_month" ? "This Month"
    : periodPreset === "last_month" ? "Last Month"
    : periodPreset === "last_3_months" ? "Last 3 Months"
    : periodPreset === "single_day" && singleDay ? new Date(singleDay + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "All Time";

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-productivity-title">
            <TrendingUp className="h-6 w-6 text-primary" />
            Productivity
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tracking cases marked <span className="font-medium text-emerald-600">Done</span> across all departments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedDept} onValueChange={v => { setSelectedDept(v); setLogPage(1); }}>
            <SelectTrigger className="w-[165px]" data-testid="select-productivity-dept">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedUser} onValueChange={v => { setSelectedUser(v); setLogPage(1); }}>
            <SelectTrigger className="w-[165px]" data-testid="select-productivity-user">
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {users.filter(u => u.active).sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[110px]" data-testid="select-productivity-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {(["today", "last_7_days", "this_month", "last_month", "last_3_months", "all_time"] as PeriodPreset[]).map(p => (
          <Button key={p} size="sm" variant={periodPreset === p ? "default" : "outline"}
            onClick={() => { setPeriodPreset(p); setSingleDay(""); setLogPage(1); if (p === "last_7_days" || p === "today") setTimeRange("day"); }}
            data-testid={`button-period-${p}`}>
            {p === "today" ? "Today" : p === "last_7_days" ? "Last 7 Days" : p === "this_month" ? "This Month" : p === "last_month" ? "Last Month" : p === "last_3_months" ? "Last 3 Months" : "All Time"}
          </Button>
        ))}
        <div className="flex items-center gap-1 ml-1 border rounded-md px-2 py-1">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input type="date" value={singleDay}
            onChange={e => { setSingleDay(e.target.value); if (e.target.value) { setPeriodPreset("single_day"); setTimeRange("day"); setLogPage(1); } }}
            className="h-7 w-[135px] border-0 p-0 text-sm shadow-none focus-visible:ring-0"
            data-testid="input-productivity-date" />
        </div>
        <span className="text-sm text-muted-foreground ml-1 italic">Showing: {periodLabel}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Completions</p>
              <p className="text-2xl font-bold" data-testid="text-total-completions">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Staff</p>
              <p className="text-2xl font-bold text-blue-600" data-testid="text-active-staff">{userMap.size}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
              <CalendarDays className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed Today</p>
              <p className="text-2xl font-bold text-amber-600" data-testid="text-today-completions">{today}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
              <Trophy className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Top Performer</p>
              <p className="text-sm font-bold text-purple-600 truncate max-w-[110px]" data-testid="text-top-performer">
                {userSummary[0]?.name || "—"}
              </p>
              {userSummary[0] && <p className="text-xs text-muted-foreground">{userSummary[0].total} done</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">By Department</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {DEPARTMENTS.map(d => {
            const count = deptCounts[d.key] || 0;
            const DIcon = d.icon;
            const active = selectedDept === d.key;
            return (
              <Card key={d.key}
                className={`cursor-pointer transition-all hover:shadow-md ${active ? "ring-2 ring-primary" : ""}`}
                onClick={() => { setSelectedDept(active ? "all" : d.key); setLogPage(1); }}
                data-testid={`card-dept-${d.key}`}>
                <CardContent className="p-2.5 text-center">
                  <DIcon className={`h-4 w-4 mx-auto mb-1 ${d.color}`} />
                  <p className="text-[10px] text-muted-foreground leading-tight truncate">{d.label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${count > 0 ? d.color : "text-muted-foreground"}`}>{count}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Tabs defaultValue="log" className="space-y-4">
        <TabsList>
          <TabsTrigger value="log" data-testid="tab-log">Activity Log</TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-employees">By Employee</TabsTrigger>
          <TabsTrigger value="chart" data-testid="tab-chart">Over Time</TabsTrigger>
        </TabsList>

        <TabsContent value="log">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <h2 className="text-base font-semibold">Completion Log</h2>
              <span className="text-sm text-muted-foreground">{filtered.length} records</span>
            </CardHeader>
            <CardContent className="p-0">
              {logRows.length === 0 ? (
                <p className="text-muted-foreground text-sm py-10 text-center">No completions found for the selected filters.</p>
              ) : (
                <>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[130px]">Date</TableHead>
                          <TableHead className="min-w-[90px]">Time</TableHead>
                          <TableHead className="min-w-[150px]">Employee</TableHead>
                          <TableHead className="min-w-[120px]">Department</TableHead>
                          <TableHead className="min-w-[200px]">Patient / Case</TableHead>
                          <TableHead className="min-w-[140px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedLog.map((r, i) => {
                          const { date, time } = formatTs(r.timestamp);
                          const dept = getDept(r.department);
                          const destRoute = DEPT_ROUTES[r.department];
                          const isClickable = !!(destRoute && r.recordId);
                          return (
                            <TableRow
                              key={`${r.department}-${r.id}-${i}`}
                              data-testid={`row-log-${i}`}
                              className={isClickable ? "cursor-pointer hover:bg-muted/60" : ""}
                              onClick={isClickable ? () => setLocation(`${destRoute}?edit=${r.recordId}`) : undefined}
                              title={isClickable ? `Open ${r.patientName || "record"} in ${r.department}` : undefined}
                            >
                              <TableCell className="text-sm">{date}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{time}</TableCell>
                              <TableCell className="font-medium text-sm">{r.userName || "—"}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${dept.badge}`}>
                                  {r.department}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm">{r.patientName || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">Status → Done</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {logPageCount > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <span className="text-sm text-muted-foreground">Page {logPage} of {logPageCount}</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)} data-testid="button-log-prev">Previous</Button>
                        <Button size="sm" variant="outline" disabled={logPage >= logPageCount} onClick={() => setLogPage(p => p + 1)} data-testid="button-log-next">Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees">
          <Card>
            <CardHeader className="pb-2">
              <h2 className="text-base font-semibold">Employee Leaderboard</h2>
              <p className="text-sm text-muted-foreground">Click column headers to sort. Counts reflect "Done" completions only.</p>
            </CardHeader>
            <CardContent className="p-0">
              {userSummary.length === 0 ? (
                <p className="text-muted-foreground text-sm py-10 text-center">No data for selected filters.</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center">#</TableHead>
                        <TableHead className="min-w-[150px] cursor-pointer select-none" onClick={() => toggleSort("total")}>
                          Employee <SortIcon field="total" />
                        </TableHead>
                        {DEPARTMENTS.filter(d => activeDepts.includes(d.key)).map(d => (
                          <TableHead key={d.key} className="text-center min-w-[80px] text-xs cursor-pointer select-none" onClick={() => toggleSort(d.key)}>
                            {d.label} <SortIcon field={d.key} />
                          </TableHead>
                        ))}
                        <TableHead className="text-center min-w-[70px] cursor-pointer select-none" onClick={() => toggleSort("total")}>
                          Total <SortIcon field="total" />
                        </TableHead>
                        <TableHead className="min-w-[120px]">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userSummary.map((u, idx) => (
                        <TableRow key={u.userId} data-testid={`row-employee-${u.userId}`}>
                          <TableCell className="text-center">
                            {idx === 0 ? <Trophy className="h-4 w-4 text-amber-500 mx-auto" /> : <span className="text-sm text-muted-foreground">{idx + 1}</span>}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{u.name}</TableCell>
                          {DEPARTMENTS.filter(d => activeDepts.includes(d.key)).map(d => (
                            <TableCell key={d.key} className="text-center text-sm">
                              {u.totals[d.key] ? (
                                <button
                                  className={`font-semibold ${d.color} hover:underline cursor-pointer`}
                                  onClick={() => {
                                    const path = DEPT_ROUTES[d.key];
                                    if (path) {
                                      const params = new URLSearchParams();
                                      params.set("assignedToId", String(u.userId));
                                      params.set("assignedToName", u.name || "");
                                      setLocation(`${path}?${params.toString()}`);
                                    }
                                  }}
                                  data-testid={`cell-dept-${d.key}-user-${u.userId}`}
                                >
                                  {u.totals[d.key]}
                                </button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="text-center font-bold text-sm">{u.total}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${Math.round((u.total / maxTotal) * 100)}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground">{Math.round((u.total / maxTotal) * 100)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chart">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <h2 className="text-base font-semibold">Completions Over Time</h2>
              <span className="text-sm text-muted-foreground capitalize">{timeRange === "day" ? "Daily" : timeRange === "week" ? "Weekly" : "Monthly"} view</span>
            </CardHeader>
            <CardContent>
              {timeData.length === 0 ? (
                <p className="text-muted-foreground text-sm py-10 text-center">No data for selected filters.</p>
              ) : (
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={timeData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {activeDepts.map(dept => (
                      <Bar key={dept} dataKey={dept} name={dept} fill={DEPT_CHART_COLORS[dept] || "hsl(0 0% 60%)"} stackId="stack" radius={activeDepts.indexOf(dept) === activeDepts.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
