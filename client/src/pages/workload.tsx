import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, Zap, ShieldCheck, FileCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { TaskWithRelations, User } from "@shared/schema";

type EmployeeStats = {
  user: User;
  verificationTasks: number;
  billingTasks: number;
  overdue: number;
  critical: number;
  total: number;
};

export default function WorkloadPage() {
  const { user: currentUser } = useAuth();
  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isStaffView = currentUser?.role === "verifier" || currentUser?.role === "biller";
  const allTasks = tasks || [];
  const now = new Date();

  const employeeStats: EmployeeStats[] = (users || [])
    .filter((u) => u.active && (isStaffView ? u.id === currentUser?.id : true))
    .map((user) => {
      const userTasks = allTasks.filter((t) => t.assignedUserId === user.id && t.bucket !== "done");
      return {
        user,
        verificationTasks: userTasks.filter((t) => t.bucket === "for_verification").length,
        billingTasks: userTasks.filter((t) => t.bucket === "ready_for_billing").length,
        overdue: userTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now).length,
        critical: userTasks.filter((t) => t.priority === "critical").length,
        total: userTasks.length,
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <div>
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-workload-title">
          {isStaffView ? "My Workload" : "Employee Workload"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isStaffView ? "Your active task distribution" : "Active task distribution across team members"}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold text-xs text-muted-foreground">Rank</th>
                  <th className="text-left py-3 px-4 font-semibold text-xs text-muted-foreground">Employee</th>
                  <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Verification
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <FileCheck className="h-3.5 w-3.5" />
                      Billing
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Overdue
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Zap className="h-3.5 w-3.5" />
                      Critical
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {employeeStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No employees found
                    </td>
                  </tr>
                ) : (
                  employeeStats.map((stat, idx) => (
                    <tr
                      key={stat.user.id}
                      className={cn(
                        "border-b last:border-0 transition-colors",
                        stat.overdue > 0 ? "bg-red-50/50 dark:bg-red-950/10" : ""
                      )}
                      data-testid={`workload-row-${stat.user.id}`}
                    >
                      <td className="py-3 px-4">
                        <span className="text-xs font-bold text-muted-foreground">
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center shrink-0">
                            {stat.user.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{stat.user.fullName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{stat.user.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary" className="no-default-active-elevate tabular-nums">
                          {stat.verificationTasks}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary" className="no-default-active-elevate tabular-nums">
                          {stat.billingTasks}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {stat.overdue > 0 ? (
                          <Badge className="no-default-active-elevate bg-red-500 text-white tabular-nums">
                            {stat.overdue}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {stat.critical > 0 ? (
                          <Badge className="no-default-active-elevate bg-red-600 text-white animate-pulse tabular-nums">
                            {stat.critical}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-sm">{stat.total}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
