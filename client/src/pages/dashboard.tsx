import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  ShieldCheck,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  UserX,
  Zap,
  ShieldAlert,
  Scale,
  CreditCard,
  Package,
  Archive,
  TrendingUp,
  Clock,
  Users,
  Activity,
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
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import type { TaskWithRelations } from "@shared/schema";

const CHART_COLORS = [
  "hsl(210 85% 45%)", "hsl(25 90% 48%)", "hsl(340 75% 48%)",
  "hsl(160 70% 40%)", "hsl(280 65% 50%)", "hsl(40 80% 50%)",
  "hsl(175 60% 40%)", "hsl(0 0% 50%)",
];

type StatCardProps = {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  testId: string;
  onClick?: () => void;
  subtitle?: string;
};

function StatCard({ label, value, icon: Icon, color, bgColor, testId, onClick, subtitle }: StatCardProps) {
  return (
    <Card
      className={cn(
        "transition-all duration-200 shadow-sm hover:shadow-md",
        onClick && "cursor-pointer hover:-translate-y-0.5"
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", bgColor)}>
          <Icon className={cn("h-5 w-5", color)} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight" data-testid={testId}>{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground/70 truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

type TrackerCardProps = {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  total: number;
  statusCounts: { unassigned: number; assigned: number; working: number; done: number };
  onClick?: () => void;
  testId: string;
};

function TrackerCard({ title, icon: Icon, iconColor, total, statusCounts, onClick, testId }: TrackerCardProps) {
  const statusBarWidth = total > 0 ? 100 : 0;
  const pctDone = total > 0 ? (statusCounts.done / total) * 100 : 0;
  const pctWorking = total > 0 ? (statusCounts.working / total) * 100 : 0;
  const pctAssigned = total > 0 ? (statusCounts.assigned / total) * 100 : 0;
  const pctUnassigned = total > 0 ? (statusCounts.unassigned / total) * 100 : 0;

  return (
    <Card
      className={cn("transition-all duration-200 shadow-sm hover:shadow-md", onClick && "cursor-pointer hover:-translate-y-0.5")}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", iconColor)} />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <span className="text-xl font-bold">{total}</span>
        </div>
        {total > 0 && (
          <>
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
              {pctDone > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${pctDone}%` }} />}
              {pctWorking > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${pctWorking}%` }} />}
              {pctAssigned > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${pctAssigned}%` }} />}
              {pctUnassigned > 0 && <div className="bg-gray-400 transition-all" style={{ width: `${pctUnassigned}%` }} />}
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
              <div className="text-center">
                <div className="font-semibold text-gray-500">{statusCounts.unassigned}</div>
                <div>Unassigned</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-amber-600">{statusCounts.assigned}</div>
                <div>Assigned</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-blue-600">{statusCounts.working}</div>
                <div>Working</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-emerald-600">{statusCounts.done}</div>
                <div>Done</div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function normalizeStatus(status: string | null | undefined): string | null {
  if (status === null || status === undefined || String(status).trim() === "") return null;
  const s = String(status).toLowerCase().replace(/\s+/g, "_");
  if (s === "done" || s === "verified" || s === "billed") return "done";
  if (s === "working_on_it") return "working";
  if (s === "assigned") return "assigned";
  if (s === "unassigned") return "unassigned";
  return null;
}

function getStatusCounts(items: any[], statusField: string) {
  const counts = { unassigned: 0, assigned: 0, working: 0, done: 0 };
  items.forEach(item => {
    const key = normalizeStatus(item[statusField]);
    if (key === null) return;
    counts[key as keyof typeof counts]++;
  });
  return counts;
}

export default function DashboardPage() {
  const { user: currentUser } = useAuth();
  const [, navigate] = useLocation();

  const { data: tasks, isLoading: tasksLoading } = useQuery<TaskWithRelations[]>({ queryKey: ["/api/tasks"] });
  const { data: denials, isLoading: denialsLoading } = useQuery<any[]>({ queryKey: ["/api/denials"] });
  const { data: collections, isLoading: collectionsLoading } = useQuery<any[]>({ queryKey: ["/api/collections"] });
  const { data: arbitrations, isLoading: arbLoading } = useQuery<any[]>({ queryKey: ["/api/arbitrations"] });
  const { data: postings, isLoading: postingsLoading } = useQuery<any[]>({ queryKey: ["/api/postings"] });
  const { data: closed, isLoading: closedLoading } = useQuery<any[]>({ queryKey: ["/api/closed"] });
  const { data: productivity } = useQuery<any[]>({ queryKey: ["/api/productivity"] });

  const canSeeChecks = currentUser && ["admin", "payment_specialist", "account_manager"].includes(currentUser.role);
  const { data: checks, isLoading: checksLoading } = useQuery<any[]>({
    queryKey: ["/api/checks"],
    enabled: !!canSeeChecks,
  });

  const isLoading = tasksLoading || denialsLoading || collectionsLoading || arbLoading || postingsLoading || closedLoading || (canSeeChecks && checksLoading);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36" />)}
        </div>
      </div>
    );
  }

  const isStaffView = currentUser?.role === "verifier" || currentUser?.role === "biller";
  const allTasks = (tasks || []).filter(t => isStaffView ? t.assignedUserId === currentUser?.id : true);
  const allDenials = denials || [];
  const allCollections = collections || [];
  const allArbitrations = arbitrations || [];
  const allPostings = postings || [];
  const allChecks = checks || [];
  const allClosed = closed || [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const verificationTasks = allTasks.filter(t => t.bucket === "for_verification" && normalizeStatus(t.status) !== null);
  const billingTasks = allTasks.filter(t => (t.bucket === "ready_for_billing" || t.bucket === "done") && normalizeStatus(t.status) !== null);

  const totalActiveRecords =
    verificationTasks.filter(t => t.bucket !== "done").length +
    billingTasks.filter(t => t.bucket !== "done").length +
    allDenials.filter((d: any) => normalizeStatus(d.denialStatus || d.denial_status || d.status) !== "done").length +
    allCollections.filter((c: any) => normalizeStatus(c.status) !== "done").length +
    allArbitrations.filter((a: any) => normalizeStatus(a.arbitrationStatus || a.arbitration_status || a.status) !== "done").length +
    allPostings.filter((p: any) => normalizeStatus(p.postingStatus || p.posting_status || p.status) !== "done").length +
    allChecks.filter((c: any) => normalizeStatus(c.checkStatus || c.check_status || c.status) !== "done").length;

  const totalUnassigned =
    allTasks.filter(t => t.status === "unassigned").length +
    allDenials.filter((d: any) => normalizeStatus(d.denialStatus || d.denial_status || d.status) === "unassigned").length +
    allCollections.filter((c: any) => normalizeStatus(c.status) === "unassigned").length +
    allArbitrations.filter((a: any) => normalizeStatus(a.arbitrationStatus || a.arbitration_status || a.status) === "unassigned").length +
    allPostings.filter((p: any) => normalizeStatus(p.postingStatus || p.posting_status || p.status) === "unassigned").length +
    allChecks.filter((c: any) => normalizeStatus(c.checkStatus || c.check_status || c.status) === "unassigned").length;

  const overdueTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.bucket !== "done").length;
  const criticalTasks = allTasks.filter(t => t.priority === "critical" && t.bucket !== "done").length;
  const escalatedTasks = allTasks.filter(t => {
    if (!t.dueDate || t.bucket === "done") return false;
    return (now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24) >= 3;
  }).length;

  const todayActivities = (productivity || []).filter(a => new Date(a.timestamp) >= today).length;

  const taskStatusCounts = getStatusCounts(allTasks.filter(t => t.bucket === "for_verification"), "status");
  const billingStatusCounts = getStatusCounts(billingTasks, "status");

  function getDenialStatus(d: any) { return d.denialStatus || d.denial_status || d.status || "unassigned"; }
  function getArbStatus(a: any) { return a.arbitrationStatus || a.arbitration_status || a.status || "unassigned"; }
  function getPostingStatus(p: any) { return p.postingStatus || p.posting_status || p.status || "unassigned"; }
  function getCheckStatus(c: any) { return c.checkStatus || c.check_status || c.status || "unassigned"; }

  const denialStatusCounts = getStatusCounts(allDenials.map(d => ({ s: getDenialStatus(d) })), "s");
  const collectionStatusCounts = getStatusCounts(allCollections, "status");
  const arbStatusCounts = getStatusCounts(allArbitrations.map(a => ({ s: getArbStatus(a) })), "s");
  const postingStatusCounts = getStatusCounts(allPostings.map(p => ({ s: getPostingStatus(p) })), "s");
  const checkStatusCounts = getStatusCounts(allChecks.map(c => ({ s: getCheckStatus(c) })), "s");
  const rtpRecords = allClosed.filter((c: any) => c.source === "Verification/Billing");

  const trackerSummary = [
    { name: "Verification", count: verificationTasks.length, color: "hsl(25 90% 48%)" },
    { name: "Billing", count: billingTasks.length, color: "hsl(210 85% 45%)" },
    { name: "Denials", count: allDenials.length, color: "hsl(0 70% 50%)" },
    { name: "Collections", count: allCollections.length, color: "hsl(40 80% 50%)" },
    { name: "Arbitration", count: allArbitrations.length, color: "hsl(140 60% 40%)" },
    { name: "Posting", count: allPostings.length, color: "hsl(270 60% 55%)" },
    ...(canSeeChecks ? [{ name: "Checks", count: allChecks.length, color: "hsl(175 60% 40%)" }] : []),
    { name: "RTP", count: rtpRecords.length, color: "hsl(0 0% 50%)" },
  ].filter(t => t.count > 0);

  const clinicGroups: Record<string, number> = {};
  allTasks.forEach(t => {
    const name = t.clinic?.name || "Unknown";
    clinicGroups[name] = (clinicGroups[name] || 0) + 1;
  });
  [allDenials, allCollections, allArbitrations, allPostings, allClosed].forEach(list => {
    list.forEach((item: any) => {
      const name = item.clinic || "Unknown";
      if (name !== "Unknown") clinicGroups[name] = (clinicGroups[name] || 0) + 1;
    });
  });
  const clinicData = Object.entries(clinicGroups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const statusOverview = [
    { name: "Done", value: 0, color: "hsl(160 70% 40%)" },
    { name: "Working", value: 0, color: "hsl(210 85% 45%)" },
    { name: "Assigned", value: 0, color: "hsl(40 80% 50%)" },
    { name: "Unassigned", value: 0, color: "hsl(0 0% 65%)" },
  ];
  const closedStatusCounts = getStatusCounts(allClosed, "status");
  [taskStatusCounts, billingStatusCounts, denialStatusCounts, collectionStatusCounts, arbStatusCounts, postingStatusCounts, checkStatusCounts, closedStatusCounts].forEach(sc => {
    statusOverview[0].value += sc.done;
    statusOverview[1].value += sc.working;
    statusOverview[2].value += sc.assigned;
    statusOverview[3].value += sc.unassigned;
  });

  const totalAllRecords = statusOverview.reduce((s, v) => s + v.value, 0);

  const amountByTracker: { name: string; amount: number; color: string }[] = [];
  const parseAmount = (v: string | null | undefined) => {
    if (!v) return 0;
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  };
  const EXCLUDED_OUTCOMES = ["Paid", "Loss", "RTP", "Send to RTP"];
  const denialsAmount = allDenials.filter((d: any) => !EXCLUDED_OUTCOMES.includes(d.outcome || "")).reduce((s: number, d: any) => s + parseAmount(d.amount), 0);
  const collectionsAmount = allCollections.filter((c: any) => !EXCLUDED_OUTCOMES.includes(c.outcome || "")).reduce((s: number, c: any) => s + parseAmount(c.amount), 0);
  const arbAmount = allArbitrations.filter((a: any) => !EXCLUDED_OUTCOMES.includes(a.outcome || "")).reduce((s: number, a: any) => s + parseAmount(a.amount), 0);
  const checksAmount = allChecks.filter((c: any) => !EXCLUDED_OUTCOMES.includes(c.outcome || "")).reduce((s: number, c: any) => s + parseAmount(c.amount), 0);
  if (denialsAmount > 0) amountByTracker.push({ name: "Denials", amount: denialsAmount, color: "hsl(0 70% 50%)" });
  if (collectionsAmount > 0) amountByTracker.push({ name: "Collections", amount: collectionsAmount, color: "hsl(40 80% 50%)" });
  if (arbAmount > 0) amountByTracker.push({ name: "Arbitration", amount: arbAmount, color: "hsl(140 60% 40%)" });
  if (checksAmount > 0 && canSeeChecks) amountByTracker.push({ name: "Checks", amount: checksAmount, color: "hsl(175 60% 40%)" });

  const totalAmount = amountByTracker.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
            {isStaffView ? "My Dashboard" : "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back, {currentUser?.fullName?.split(" ")[0] || "User"}
          </p>
        </div>
        {totalAmount > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Amount Tracked</p>
            <p className="text-xl font-bold text-emerald-600" data-testid="text-total-amount">
              ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active Records" value={totalActiveRecords} icon={ClipboardList} color="text-primary" bgColor="bg-primary/10" testId="stat-active-records" onClick={() => navigate("/")} />
        <StatCard label="Unassigned" value={totalUnassigned} icon={UserX} color="text-orange-600 dark:text-orange-400" bgColor="bg-orange-100 dark:bg-orange-900/20" testId="stat-unassigned" onClick={() => navigate("/workload")} />
        <StatCard label="Today's Actions" value={todayActivities} icon={Activity} color="text-emerald-600 dark:text-emerald-400" bgColor="bg-emerald-100 dark:bg-emerald-900/20" testId="stat-today-actions" onClick={() => navigate("/productivity")} />
        <StatCard label="RTP" value={rtpRecords.length} icon={Archive} color="text-gray-600 dark:text-gray-400" bgColor="bg-gray-100 dark:bg-gray-900/20" testId="stat-closed" onClick={() => navigate("/closed")} />
        <StatCard label="Overdue Tasks" value={overdueTasks} icon={AlertTriangle} color="text-red-600 dark:text-red-400" bgColor="bg-red-100 dark:bg-red-900/20" testId="stat-overdue" subtitle="Verification & Billing" onClick={() => navigate("/verification")} />
        <StatCard label="Critical Priority" value={criticalTasks} icon={Zap} color="text-red-600 dark:text-red-400" bgColor="bg-red-100 dark:bg-red-900/20" testId="stat-critical" onClick={() => navigate("/billing-queue")} />
        <StatCard label="Escalated (3+ days)" value={escalatedTasks} icon={Flame} color="text-orange-600 dark:text-orange-400" bgColor="bg-orange-100 dark:bg-orange-900/20" testId="stat-escalated" onClick={() => navigate("/billing-queue")} />
        <StatCard label="Total Records" value={totalAllRecords + allClosed.length} icon={TrendingUp} color="text-purple-600 dark:text-purple-400" bgColor="bg-purple-100 dark:bg-purple-900/20" testId="stat-total-all" onClick={() => navigate("/reports")} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Tracker Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <TrackerCard title="Verification" icon={ShieldCheck} iconColor="text-amber-600" total={verificationTasks.length} statusCounts={taskStatusCounts} onClick={() => navigate("/verification")} testId="tracker-verification" />
          <TrackerCard title="Billing" icon={FileCheck} iconColor="text-blue-600" total={billingTasks.length} statusCounts={billingStatusCounts} onClick={() => navigate("/")} testId="tracker-billing" />
          <TrackerCard title="Denials" icon={ShieldAlert} iconColor="text-red-600" total={allDenials.length} statusCounts={denialStatusCounts} onClick={() => navigate("/denials")} testId="tracker-denials" />
          <TrackerCard title="Collections" icon={CreditCard} iconColor="text-amber-600" total={allCollections.length} statusCounts={collectionStatusCounts} onClick={() => navigate("/collections")} testId="tracker-collections" />
          <TrackerCard title="Arbitration" icon={Scale} iconColor="text-green-600" total={allArbitrations.length} statusCounts={arbStatusCounts} onClick={() => navigate("/arbitration")} testId="tracker-arbitration" />
          <TrackerCard title="Posting" icon={Package} iconColor="text-purple-600" total={allPostings.length} statusCounts={postingStatusCounts} onClick={() => navigate("/posting")} testId="tracker-posting" />
          {canSeeChecks && (
            <TrackerCard title="Checks" icon={CheckCircle2} iconColor="text-teal-600" total={allChecks.length} statusCounts={checkStatusCounts} onClick={() => navigate("/checks")} testId="tracker-checks" />
          )}
          <TrackerCard title="RTP" icon={Archive} iconColor="text-gray-500" total={rtpRecords.length} statusCounts={getStatusCounts(rtpRecords, "status")} onClick={() => navigate("/closed")} testId="tracker-closed" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2 px-5 pt-5">
            <h3 className="text-sm font-semibold">Records by Clinic</h3>
            <p className="text-xs text-muted-foreground">Tasks, Denials & Collections combined</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {clinicData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={clinicData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="value" name="Records" fill="hsl(210 85% 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 px-5 pt-5">
            <h3 className="text-sm font-semibold">Status Distribution</h3>
            <p className="text-xs text-muted-foreground">All active trackers combined</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {totalAllRecords > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusOverview.filter(s => s.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {statusOverview.filter(s => s.value > 0).map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 px-5 pt-5">
            <h3 className="text-sm font-semibold">Records by Tracker</h3>
            <p className="text-xs text-muted-foreground">Distribution across all areas</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {trackerSummary.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trackerSummary}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="count" name="Records" radius={[4, 4, 0, 0]}>
                    {trackerSummary.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        {amountByTracker.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <h3 className="text-sm font-semibold">Dollars Tracked</h3>
              <p className="text-xs text-muted-foreground">Total amounts by tracker</p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={amountByTracker}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={(value: number) => [`$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Amount"]} />
                  <Bar dataKey="amount" name="Amount" radius={[4, 4, 0, 0]}>
                    {amountByTracker.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
