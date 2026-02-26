import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { User } from "@shared/schema";

type ActivityRecord = {
  id: number;
  taskId: number;
  userId: number;
  action: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
  userName: string;
};

type TimeRange = "day" | "week" | "month";
type PeriodPreset = "last_7_days" | "this_month" | "last_month" | "last_3_months" | "custom" | "all_time";

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

export default function ProductivityPage() {
  const { user } = useAuth();
  const now = new Date();
  const [timeRange, setTimeRange] = useState<TimeRange>("day");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [customYear, setCustomYear] = useState(now.getFullYear());
  const [customMonth, setCustomMonth] = useState(now.getMonth());

  if (!user || !["admin", "manager", "assigner"].includes(user.role)) {
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
  }

  const periodLabel = periodPreset === "last_7_days" ? "Last 7 Days"
    : periodPreset === "this_month" ? "This Month"
    : periodPreset === "last_month" ? "Last Month"
    : periodPreset === "last_3_months" ? "Last 3 Months"
    : periodPreset === "custom" ? formatMonthYear(customYear, customMonth)
    : "All Time";

  const filtered = (activities || []).filter(a => {
    if (selectedUser !== "all" && String(a.userId) !== selectedUser) return false;
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

  const userMap = new Map<number, { name: string; verified: number; billed: number; dropped: number }>();
  for (const a of filtered) {
    if (!userMap.has(a.userId)) {
      userMap.set(a.userId, { name: a.userName || "Unknown", verified: 0, billed: 0, dropped: 0 });
    }
    const entry = userMap.get(a.userId)!;
    if (a.newValue === "verified") entry.verified++;
    if (a.newValue === "billed") entry.billed++;
    if (a.newValue === "dropped") entry.dropped++;
  }

  const userSummary = Array.from(userMap.entries())
    .map(([id, data]) => ({
      userId: id,
      name: data.name,
      verified: data.verified,
      billed: data.billed,
      dropped: data.dropped,
      total: data.verified + data.billed,
    }))
    .sort((a, b) => b.total - a.total);

  const timeMap = new Map<string, { verified: number; billed: number; dropped: number }>();
  for (const a of filtered) {
    const key = getDateKey(new Date(a.timestamp), timeRange);
    if (!timeMap.has(key)) timeMap.set(key, { verified: 0, billed: 0, dropped: 0 });
    const entry = timeMap.get(key)!;
    if (a.newValue === "verified") entry.verified++;
    if (a.newValue === "billed") entry.billed++;
    if (a.newValue === "dropped") entry.dropped++;
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
  const timeData = keysToUse
    .map(key => {
      const data = timeMap.get(key) || { verified: 0, billed: 0, dropped: 0 };
      return {
        date: key,
        label: formatDateLabel(key, timeRange),
        verified: data.verified,
        billed: data.billed,
        dropped: data.dropped,
        total: data.verified + data.billed,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalVerified = filtered.filter(a => a.newValue === "verified").length;
  const totalBilled = filtered.filter(a => a.newValue === "billed").length;
  const totalDropped = filtered.filter(a => a.newValue === "dropped").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" data-testid="text-productivity-title">Productivity</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-[180px]" data-testid="select-productivity-user">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users?.filter(u => u.active).map(u => (
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
        <span className="text-sm text-muted-foreground ml-2">Showing: {periodLabel}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Total Completed</p>
            <p className="text-3xl font-bold mt-1" data-testid="text-total-completed">{totalVerified + totalBilled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Verified</p>
            <p className="text-3xl font-bold mt-1 text-emerald-600" data-testid="text-total-verified">{totalVerified}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Billed</p>
            <p className="text-3xl font-bold mt-1 text-green-800" data-testid="text-total-billed">{totalBilled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Dropped</p>
            <p className="text-3xl font-bold mt-1 text-gray-600" data-testid="text-total-dropped">{totalDropped}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold">Completions Over Time</h2>
        </CardHeader>
        <CardContent>
          {timeData.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No completion data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={timeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="verified" name="Verified" fill="hsl(160 70% 40%)" stackId="stack" />
                <Bar dataKey="billed" name="Billed" fill="hsl(140 50% 25%)" stackId="stack" />
                <Bar dataKey="dropped" name="Dropped" fill="hsl(0 0% 40%)" stackId="stack" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold">By Employee</h2>
        </CardHeader>
        <CardContent>
          {userSummary.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No completion data yet</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <span>Employee</span>
                <span className="text-center">Verified</span>
                <span className="text-center">Billed</span>
                <span className="text-center">Dropped</span>
                <span className="text-center">Total</span>
              </div>
              {userSummary.map((u) => (
                <div key={u.userId} className="grid grid-cols-5 gap-2 items-center py-1.5" data-testid={`row-productivity-${u.userId}`}>
                  <span className="text-sm font-medium truncate">{u.name}</span>
                  <span className="text-sm text-center text-emerald-600 font-semibold">{u.verified}</span>
                  <span className="text-sm text-center text-green-800 font-semibold">{u.billed}</span>
                  <span className="text-sm text-center text-gray-600 font-semibold">{u.dropped}</span>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm font-bold">{u.total}</span>
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${userSummary[0]?.total ? (u.total / userSummary[0].total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
