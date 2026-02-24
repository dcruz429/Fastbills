import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
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
  const [timeRange, setTimeRange] = useState<TimeRange>("day");
  const [selectedUser, setSelectedUser] = useState<string>("all");

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

  const filtered = (activities || []).filter(a => {
    if (selectedUser !== "all" && String(a.userId) !== selectedUser) return false;
    return true;
  });

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

  const timeData = Array.from(timeMap.entries())
    .map(([key, data]) => ({
      date: key,
      label: formatDateLabel(key, timeRange),
      verified: data.verified,
      billed: data.billed,
      dropped: data.dropped,
      total: data.verified + data.billed,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalVerified = filtered.filter(a => a.newValue === "verified").length;
  const totalBilled = filtered.filter(a => a.newValue === "billed").length;
  const totalDropped = filtered.filter(a => a.newValue === "dropped").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" data-testid="text-productivity-title">Productivity</h1>
        <div className="flex items-center gap-3">
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
