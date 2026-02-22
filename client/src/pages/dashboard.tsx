import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  ShieldCheck,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  UserX,
  Zap,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import type { TaskWithRelations } from "@shared/schema";

const CHART_COLORS = ["hsl(210 85% 45%)", "hsl(25 90% 48%)", "hsl(340 75% 48%)", "hsl(160 70% 40%)", "hsl(280 65% 50%)"];

type StatCardProps = {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  testId: string;
  onClick?: () => void;
};

function StatCard({ label, value, icon: Icon, color, bgColor, testId, onClick }: StatCardProps) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow" : ""}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg shrink-0", bgColor)}>
          <Icon className={cn("h-5 w-5", color)} />
        </div>
        <div>
          <p className="text-2xl font-bold" data-testid={testId}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user: currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  const isStaffView = currentUser?.role === "verifier" || currentUser?.role === "biller";
  const allTasks = (tasks || []).filter((t) =>
    isStaffView ? t.assignedUserId === currentUser?.id : true
  );
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalTasks = allTasks.length;
  const verificationCount = allTasks.filter((t) => t.bucket === "for_verification").length;
  const billingCount = allTasks.filter((t) => t.bucket === "ready_for_billing").length;
  const doneToday = allTasks.filter(
    (t) => t.status === "done" && t.createdAt && new Date(t.createdAt) >= today
  ).length;
  const unassigned = allTasks.filter((t) => t.status === "unassigned").length;
  const critical = allTasks.filter((t) => t.priority === "critical" && t.bucket !== "done").length;
  const overdue = allTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.bucket !== "done"
  ).length;
  const escalated = allTasks.filter((t) => {
    if (!t.dueDate || t.bucket === "done") return false;
    const diff = (now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 3;
  }).length;

  const clinicGroups: Record<string, number> = {};
  allTasks.forEach((t) => {
    const name = t.clinic?.name || "Unknown";
    clinicGroups[name] = (clinicGroups[name] || 0) + 1;
  });
  const clinicData = Object.entries(clinicGroups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const insuranceGroups: Record<string, number> = {};
  allTasks.forEach((t) => {
    const name = t.insurance?.name || "Unknown";
    insuranceGroups[name] = (insuranceGroups[name] || 0) + 1;
  });
  const insuranceData = Object.entries(insuranceGroups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const employeeGroups: Record<string, number> = {};
  allTasks.forEach((t) => {
    const name = t.assignedUser?.fullName || "Unassigned";
    employeeGroups[name] = (employeeGroups[name] || 0) + 1;
  });
  const employeeData = Object.entries(employeeGroups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <h1 className="text-xl font-bold tracking-tight" data-testid="text-dashboard-title">
        {isStaffView ? "My Dashboard" : "Supervisor Dashboard"}
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Tasks" value={totalTasks} icon={ClipboardList} color="text-primary" bgColor="bg-primary/10" testId="stat-total" onClick={() => navigate("/")} />
        <StatCard label="For Verification" value={verificationCount} icon={ShieldCheck} color="text-amber-600 dark:text-amber-400" bgColor="bg-amber-100 dark:bg-amber-900/20" testId="stat-verification" onClick={() => navigate("/?bucket=for_verification")} />
        <StatCard label="Ready for Billing" value={billingCount} icon={FileCheck} color="text-blue-600 dark:text-blue-400" bgColor="bg-blue-100 dark:bg-blue-900/20" testId="stat-billing" onClick={() => navigate("/?bucket=ready_for_billing")} />
        <StatCard label="Done Today" value={doneToday} icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" bgColor="bg-emerald-100 dark:bg-emerald-900/20" testId="stat-done-today" onClick={() => navigate("/?bucket=done")} />
        <StatCard label="Unassigned" value={unassigned} icon={UserX} color="text-orange-600 dark:text-orange-400" bgColor="bg-orange-100 dark:bg-orange-900/20" testId="stat-unassigned" onClick={() => navigate("/?status=unassigned")} />
        <StatCard label="Critical Tasks" value={critical} icon={Zap} color="text-red-600 dark:text-red-400" bgColor="bg-red-100 dark:bg-red-900/20" testId="stat-critical" onClick={() => navigate("/?priority=critical")} />
        <StatCard label="Overdue" value={overdue} icon={AlertTriangle} color="text-red-600 dark:text-red-400" bgColor="bg-red-100 dark:bg-red-900/20" testId="stat-overdue" onClick={() => navigate("/?overdue=true")} />
        <StatCard label="Escalated (3+ days)" value={escalated} icon={Flame} color="text-orange-600 dark:text-orange-400" bgColor="bg-orange-100 dark:bg-orange-900/20" testId="stat-escalated" onClick={() => navigate("/?escalated=true")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <h3 className="text-sm font-semibold">Tasks by Clinic</h3>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {clinicData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={clinicData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="value" fill="hsl(210 85% 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <h3 className="text-sm font-semibold">Tasks by Insurance</h3>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {insuranceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={insuranceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {insuranceData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 px-4 pt-4">
            <h3 className="text-sm font-semibold">Tasks by Employee</h3>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {employeeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={employeeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="value" fill="hsl(160 70% 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
