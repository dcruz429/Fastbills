import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import { formatEST } from "@/lib/date-utils";
import type { TaskWithRelations, Clinic } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";

export default function ReportsPage() {
  const { user } = useAuth();
  if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
    return <Redirect to="/" />;
  }
  const [filterClinic, setFilterClinic] = useState("all");
  const [filterBucket, setFilterBucket] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });
  const { data: clinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });

  const filtered = (tasks || []).filter((t) => {
    if (filterClinic !== "all" && t.clinicId?.toString() !== filterClinic) return false;
    if (filterBucket !== "all" && t.bucket !== filterBucket) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    return true;
  });

  const exportCSV = () => {
    const headers = ["ID", "Patient Name", "Bucket", "Status", "Priority", "Clinic", "Insurance", "Assigned To", "Due Date", "IE Date", "Created"];
    const rows = filtered.map((t) => [
      t.id,
      t.patientName,
      t.bucket,
      t.status,
      t.priority,
      t.clinic?.name || "",
      t.insurance?.name || "",
      t.assignedUser?.fullName || "",
      t.dueDate ? formatEST(new Date(t.dueDate), "yyyy-MM-dd") : "",
      t.ieDate ? formatEST(new Date(t.ieDate), "yyyy-MM-dd") : "",
      formatEST(new Date(t.createdAt), "yyyy-MM-dd"),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-export-${formatEST(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-reports-title">
            <BarChart3 className="h-5 w-5" />
            Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Export filtered task data as CSV
          </p>
        </div>
        <Button onClick={exportCSV} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV ({filtered.length} tasks)
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterClinic} onValueChange={setFilterClinic}>
          <SelectTrigger className="w-[140px]" data-testid="select-report-clinic">
            <SelectValue placeholder="Clinic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clinics</SelectItem>
            {clinics?.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterBucket} onValueChange={setFilterBucket}>
          <SelectTrigger className="w-[160px]" data-testid="select-report-bucket">
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
          <SelectTrigger className="w-[150px]" data-testid="select-report-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="working_on_it">Working on it</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="billed">Billed</SelectItem>
            <SelectItem value="dropped">Dropped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px]" data-testid="select-report-priority">
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
      </div>

      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold">Preview ({filtered.length} tasks)</h3>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Patient</th>
                  <th className="text-left py-2 px-3 font-medium">Bucket</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Priority</th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Clinic</th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 20).map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2 px-3 font-medium">{t.patientName}</td>
                    <td className="py-2 px-3 text-muted-foreground capitalize">{t.bucket.replace(/_/g, " ")}</td>
                    <td className="py-2 px-3 text-muted-foreground capitalize">{t.status.replace(/_/g, " ")}</td>
                    <td className="py-2 px-3 text-muted-foreground capitalize">{t.priority}</td>
                    <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{t.clinic?.name || "-"}</td>
                    <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">
                      {t.dueDate ? formatEST(new Date(t.dueDate), "MM/dd/yy") : "-"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No tasks match the filters
                    </td>
                  </tr>
                )}
                {filtered.length > 20 && (
                  <tr>
                    <td colSpan={6} className="py-2 text-center text-xs text-muted-foreground">
                      Showing first 20 of {filtered.length} tasks. Export CSV for full data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
