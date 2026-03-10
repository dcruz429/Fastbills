import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ChevronLeft, ChevronRight, CalendarDays, FileText, ShieldAlert, Scale, CreditCard, Package, ClipboardList, Archive, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { User } from "@shared/schema";

type ActivityRecord = {
  id: number;
  userId: number;
  action: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
  userName: string;
  source: string;
};

type TimeRange = "day" | "week" | "month";
type PeriodPreset = "last_7_days" | "this_month" | "last_month" | "last_3_months" | "custom" | "all_time" | "single_day";

const TRACKER_SOURCES = [
  { key: "Verification/Billing", label: "Verification / Billing", icon: FileText, color: "text-blue-600" },
  { key: "Denials", label: "Denials", icon: ShieldAlert, color: "text-red-600" },
  { key: "Arbitration", label: "Arbitration", icon: Scale, color: "text-green-600" },
  { key: "Collections", label: "Collections", icon: CreditCard, color: "text-amber-600" },
  { key: "Posting", label: "Posting", icon: Package, color: "text-purple-600" },
  { key: "Checks", label: "Checks", icon: ClipboardList, color: "text-teal-600" },
  { key: "Closed", label: "Closed", icon: Archive, color: "text-gray-600" },
];

const TRACKER_COLORS: Record<string, string> = {
  "Verification/Billing": "hsl(210 70% 50%)",
  "Denials": "hsl(0 70% 50%)",
  "Arbitration": "hsl(140 60% 40%)",
  "Collections": "hsl(40 80% 50%)",
  "Posting": "hsl(270 60% 55%)",
  "Checks": "hsl(175 60% 40%)",
  "Closed": "hsl(0 0% 50%)",
};

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function getMonthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

function formatMonthYear(year: number, month: number): string {
  const d = new Date(year, month);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getDateKey(date: Date, range: TimeRange): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (range === "day") return `${y}-${m}-${d}`;
  if (range === "week") {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    const wy = startOfWeek.getFullYear();
    const wm = String(startOfWeek.getMonth() + 1).padStart(2, "0");
    const wd = String(startOfWeek.getDate()).padStart(2, "0");
    return `${wy}-${wm}-${wd}`;
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
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const [y, m] = key.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function isCompletedAction(a: ActivityRecord): boolean {
  if (a.action === "Record created" || a.action === "Created") return true;
  if (a.field === "status" && (a.newValue === "Done" || a.newValue === "done" || a.newValue === "verified" || a.newValue === "billed")) return true;
  if (a.field === "outcome" && a.newValue) return true;
  if (a.field === "activity" && a.newValue) return true;
  return false;
}

function countActions(acts: ActivityRecord[]): number {
  return acts.length;
}

export default function ProductivityPage() {
  const { user } = useAuth();
  const now = new Date();
  const [timeRange, setTimeRange] = useState<TimeRange>("day");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [customYear, setCustomYear] = useState(now.getFullYear());
  const [customMonth, setCustomMonth] = useState(now.getMonth());
  const [singleDay, setSingleDay] = useState("");

  if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
    return <Redirect to="/" />;
  }

  const { data: activities, isLoading: activitiesLoading } = useQuery<ActivityRecord[]>({
    queryKey: ["/api/productivity"],
  });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  if (activitiesLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  let dateStart: Date | null = null;
  let dateEnd: Date | null = null;

  if (periodPreset === "last_7_days") {
    dateEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    dateStart = new Date(dateEnd);
    dateStart.setDate(dateStart.getDate() - 6);
    dateStart.setHours(0, 0, 0, 0);
  } else if (periodPreset === "this_month") {
    dateStart = getMonthStart(now.getFullYear(), now.getMonth());
    dateEnd = getMonthEnd(now.getFullYear(), now.getMonth());
  } else if (periodPreset === "last_month") {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1);
    dateStart = getMonthStart(lm.getFullYear(), lm.getMonth());
    dateEnd = getMonthEnd(lm.getFullYear(), lm.getMonth());
  } else if (periodPreset === "last_3_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 2);
    dateStart = getMonthStart(start.getFullYear(), start.getMonth());
    dateEnd = getMonthEnd(now.getFullYear(), now.getMonth());
  } else if (periodPreset === "custom") {
    dateStart = getMonthStart(customYear, customMonth);
    dateEnd = getMonthEnd(customYear, customMonth);
  } else if (periodPreset === "single_day" && singleDay) {
    const d = new Date(singleDay + "T00:00:00");
    dateStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    dateEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  const periodLabel = periodPreset === "last_7_days" ? "Last 7 Days"
    : periodPreset === "this_month" ? "This Month"
    : periodPreset === "last_month" ? "Last Month"
    : periodPreset === "last_3_months" ? "Last 3 Months"
    : periodPreset === "single_day" && singleDay ? new Date(singleDay + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : periodPreset === "custom" ? formatMonthYear(customYear, customMonth)
    : "All Time";

  const filtered = (activities || []).filter(a => {
    if (selectedUser !== "all" && String(a.userId) !== selectedUser) return false;
    if (selectedSource !== "all" && a.source !== selectedSource) return false;
    if (dateStart && dateEnd) {
      const ts = new Date(a.timestamp);
      if (ts < dateStart || ts > dateEnd) return false;
    }
    return true;
  });

  function navigateMonth(direction: number) {
    const d = new Date(customYear, customMonth + direction);
    setCustomYear(d.getFullYear());
    setCustomMonth(d.getMonth());
    setPeriodPreset("custom");
  }

  const totalActions = filtered.length;
  const totalCompleted = filtered.filter(isCompletedAction).length;

  const sourceBreakdown = TRACKER_SOURCES.map(s => {
    const sourceActs = filtered.filter(a => a.source === s.key);
    return {
      ...s,
      total: sourceActs.length,
      completed: sourceActs.filter(isCompletedAction).length,
    };
  }).filter(s => s.total > 0);

  const userMap = new Map<number, { name: string; totals: Record<string, number>; total: number }>();
  for (const a of filtered) {
    if (!a.userId) continue;
    if (!userMap.has(a.userId)) {
      userMap.set(a.userId, {
        name: a.userName || "Unknown",
        totals: {},
        total: 0,
      });
    }
    const entry = userMap.get(a.userId)!;
    entry.totals[a.source] = (entry.totals[a.source] || 0) + 1;
    entry.total++;
  }

  const userSummary = Array.from(userMap.entries())
    .map(([id, data]) => ({ userId: id, ...data }))
    .sort((a, b) => b.total - a.total);

  const timeMap = new Map<string, Record<string, number>>();
  for (const a of filtered) {
    const key = getDateKey(new Date(a.timestamp), timeRange);
    if (!timeMap.has(key)) timeMap.set(key, {});
    const entry = timeMap.get(key)!;
    entry[a.source] = (entry[a.source] || 0) + 1;
    entry["_total"] = (entry["_total"] || 0) + 1;
  }

  const allTimeKeys: string[] = [];
  if (dateStart && dateEnd) {
    if (timeRange === "day") {
      const cursor = new Date(dateStart);
      while (cursor <= dateEnd) {
        allTimeKeys.push(getDateKey(cursor, "day"));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (timeRange === "week") {
      const cursor = new Date(dateStart);
      cursor.setDate(cursor.getDate() - cursor.getDay());
      while (cursor <= dateEnd) {
        allTimeKeys.push(getDateKey(cursor, "week"));
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      const cursor = new Date(dateStart);
      while (cursor <= dateEnd) {
        allTimeKeys.push(getDateKey(cursor, "month"));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  const keysToUse = allTimeKeys.length > 0 ? allTimeKeys : Array.from(timeMap.keys());
  const activeSources = Array.from(new Set(filtered.map(a => a.source)));
  const timeData = keysToUse
    .map(key => {
      const data = timeMap.get(key) || {};
      const entry: any = { date: key, label: formatDateLabel(key, timeRange) };
      for (const src of activeSources) {
        entry[src] = data[src] || 0;
      }
      entry.total = data["_total"] || 0;
      return entry;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-productivity-title">Productivity</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="w-[180px]" data-testid="select-productivity-source">
              <SelectValue placeholder="All Trackers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trackers</SelectItem>
              {TRACKER_SOURCES.map(s => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-[180px]" data-testid="select-productivity-user">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users?.filter(u => u.active).slice().sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[130px]" data-testid="select-productivity-range">
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

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {(["last_7_days", "this_month", "last_month", "last_3_months", "all_time"] as PeriodPreset[]).map(p => (
            <Button
              key={p}
              size="sm"
              variant={periodPreset === p ? "default" : "outline"}
              onClick={() => {
                setPeriodPreset(p);
                setSingleDay("");
                if (p === "last_7_days") setTimeRange("day");
              }}
              data-testid={`button-period-${p}`}
            >
              {p === "last_7_days" ? "Last 7 Days" : p === "this_month" ? "This Month" : p === "last_month" ? "Last Month" : p === "last_3_months" ? "Last 3 Months" : "All Time"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-2 border rounded-md px-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigateMonth(-1)} data-testid="button-prev-month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center" data-testid="text-current-period">
            {formatMonthYear(customYear, customMonth)}
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigateMonth(1)} data-testid="button-next-month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1 ml-2 border rounded-md px-2 py-1">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={singleDay}
            onChange={(e) => {
              setSingleDay(e.target.value);
              if (e.target.value) {
                setPeriodPreset("single_day");
                setTimeRange("day");
              }
            }}
            className="h-7 w-[140px] border-0 p-0 text-sm shadow-none focus-visible:ring-0"
            data-testid="input-productivity-date"
          />
        </div>
        <span className="text-sm text-muted-foreground ml-2">Showing: {periodLabel}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Total Actions</p>
            <p className="text-3xl font-bold mt-1" data-testid="text-total-actions">{totalActions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Key Completions</p>
            <p className="text-3xl font-bold mt-1 text-emerald-600" data-testid="text-total-completed">{totalCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Active Employees</p>
            <p className="text-3xl font-bold mt-1 text-blue-600" data-testid="text-active-employees">{userMap.size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Trackers Active</p>
            <p className="text-3xl font-bold mt-1 text-purple-600" data-testid="text-active-trackers">{sourceBreakdown.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {TRACKER_SOURCES.map(s => {
          const data = sourceBreakdown.find(sb => sb.key === s.key);
          const SIcon = s.icon;
          return (
            <Card key={s.key} className={`cursor-pointer transition-all ${selectedSource === s.key ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
              onClick={() => setSelectedSource(selectedSource === s.key ? "all" : s.key)}
              data-testid={`card-source-${s.key}`}
            >
              <CardContent className="p-3 text-center">
                <SIcon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                <p className="text-xl font-bold mt-0.5">{data?.total || 0}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="chart" className="space-y-4">
        <TabsList>
          <TabsTrigger value="chart" data-testid="tab-chart">Activity Over Time</TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-employees">By Employee</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <Card>
            <CardHeader className="pb-2">
              <h2 className="text-lg font-semibold">Actions Over Time</h2>
            </CardHeader>
            <CardContent>
              {timeData.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No activity data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={timeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {activeSources.map(src => (
                      <Bar
                        key={src}
                        dataKey={src}
                        name={TRACKER_SOURCES.find(s => s.key === src)?.label || src}
                        fill={TRACKER_COLORS[src] || "hsl(0 0% 60%)"}
                        stackId="stack"
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees">
          <Card>
            <CardHeader className="pb-2">
              <h2 className="text-lg font-semibold">Employee Productivity</h2>
            </CardHeader>
            <CardContent>
              {userSummary.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No activity data yet</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Employee</TableHead>
                        {TRACKER_SOURCES.filter(s => activeSources.includes(s.key)).map(s => (
                          <TableHead key={s.key} className="text-center min-w-[80px] text-xs">{s.label}</TableHead>
                        ))}
                        <TableHead className="text-center min-w-[80px]">Total</TableHead>
                        <TableHead className="min-w-[120px]">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userSummary.map((u) => (
                        <TableRow key={u.userId} data-testid={`row-productivity-${u.userId}`}>
                          <TableCell className="font-medium text-sm">{u.name}</TableCell>
                          {TRACKER_SOURCES.filter(s => activeSources.includes(s.key)).map(s => (
                            <TableCell key={s.key} className="text-center text-sm">
                              <span className={u.totals[s.key] ? "font-semibold" : "text-muted-foreground"}>
                                {u.totals[s.key] || "-"}
                              </span>
                            </TableCell>
                          ))}
                          <TableCell className="text-center font-bold text-sm">{u.total}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${userSummary[0]?.total ? (u.total / userSummary[0].total) * 100 : 0}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {userSummary[0]?.total ? Math.round((u.total / userSummary[0].total) * 100) : 0}%
                              </span>
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
      </Tabs>
    </div>
  );
}
