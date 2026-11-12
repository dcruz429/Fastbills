import {
  LayoutDashboard,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Flame,
  KeyRound,
  TrendingUp,
  FileX,
  Lightbulb,
  Landmark,
  Megaphone,
  MessageCircle,
  Scale,
  FileText,
  FileCheck,
  ShieldCheck,
  User as UserIcon,
  CheckCircle2,
  Briefcase,
  CalendarClock,
  Search,
  BookOpen,
} from "lucide-react";
import logoImg from "@assets/FastBills_Logo_1771803683003.jpg";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { preloadPage } from "@/lib/page-routes";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "RCM Task Board", url: "/rcm-taskboard", icon: ClipboardList, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "RCM Approvals", url: "/rcm-approvals", icon: ShieldCheck, roles: ["admin", "manager", "account_manager", "case_manager"] },
  { title: "RCM Weighted Productivity", url: "/rcm-productivity", icon: TrendingUp, roles: ["admin", "manager", "account_manager", "case_manager"] },
  { title: "RCM SLA", url: "/rcm-sla", icon: CalendarClock, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "My Tasks", url: "/my-tasks", icon: UserIcon, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Call Calendar", url: "/call-calendar", icon: CalendarClock, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"], vcTeamOnly: true },
  { title: "Patient Overview", url: "/patient-overview", icon: Search, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Verification", url: "/verification", icon: ShieldCheck, roles: ["admin", "manager", "verifier", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Billing", url: "/", icon: ClipboardList, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Posting", url: "/posting", icon: FileText, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Collections", url: "/collections", icon: Landmark, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Denials", url: "/denials", icon: FileX, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Arbitration", url: "/arbitration", icon: Scale, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "RTP", url: "/closed", icon: CheckCircle2, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Checks", url: "/checks", icon: FileCheck, roles: ["admin", "payment_specialist", "account_manager"] },
  { title: "Medical Records Request", url: "/medical-records-request", icon: FileText, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Guidelines Board", url: "/guideline-board", icon: BookOpen, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Message Board", url: "/message-board", icon: Megaphone, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Messages", url: "/messages", icon: MessageCircle, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Suggestion Box", url: "/tickets", icon: Lightbulb, roles: ["admin"], allowedUserNames: [] as string[] },
  { title: "CEO Box", url: "/ceo-box", icon: Briefcase, roles: [] as string[], ceoBoxOnly: true },
  { title: "Workload", url: "/workload", icon: Users, roles: ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Billing Queue", url: "/billing-queue", icon: Flame, roles: ["admin", "manager", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] },
  { title: "Productivity", url: "/productivity", icon: TrendingUp, roles: ["admin", "manager", "account_manager", "case_manager"] },
  { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin", "manager", "account_manager", "case_manager"] },
];

const adminItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "RCM Access", url: "/rcm-access", icon: ShieldCheck },
  { title: "Role Matrix", url: "/rcm-role-matrix", icon: KeyRound },
];

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit = currentPassword && newPassword && newPassword === confirmPassword && newPassword.length >= 4;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Current Password</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              data-testid="input-confirm-password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-password">Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            data-testid="button-save-password"
          >
            {mutation.isPending ? "Saving..." : "Change Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const { data: notifications } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
  });

  const { data: unreadMsgData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    refetchInterval: 15000,
  });

  const { data: unreadAnnouncementData } = useQuery<{ count: number }>({
    queryKey: ["/api/announcements/unread-count"],
    refetchInterval: 30000,
  });

  const { data: teams } = useQuery<{ id: number; name: string; members: { id: number }[] }[]>({
    queryKey: ["/api/teams"],
    enabled: !!user,
  });

  const CALL_CALENDAR_TEAMS = ["vc team", "manager team"];
  const isVcTeamMember = teams?.some(
    (t) => CALL_CALENDAR_TEAMS.includes(t.name.toLowerCase()) && t.members.some((m) => m.id === user?.id)
  ) ?? false;

  const unreadCount = notifications?.filter((n: any) => !n.read).length || 0;
  const unreadMsgCount = unreadMsgData?.count || 0;
  const unreadAnnouncementCount = unreadAnnouncementData?.count || 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="FastBills" className="h-9 object-contain" data-testid="img-sidebar-logo" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter((item) => {
                if ((item as any).vcTeamOnly && !isVcTeamMember) return false;
                return item.roles.includes(user?.role || "") || ((item as any).allowedUserNames?.includes(user?.fullName)) || ((item as any).ceoBoxOnly && (user as any)?.ceoBoxAccess);
              }).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    data-active={location === item.url}
                    onPointerEnter={() => preloadPage(item.url)}
                    onFocus={() => preloadPage(item.url)}
                    onClick={() => setLocation(item.url)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    {item.title === "Messages" && unreadMsgCount > 0 && (
                      <span className="ml-auto bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1.5">{unreadMsgCount}</span>
                    )}
                    {item.title === "Message Board" && unreadAnnouncementCount > 0 && (
                      <span className="ml-auto bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1.5" data-testid="badge-unread-announcements">{unreadAnnouncementCount}</span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem>
                <SidebarMenuButton
                  data-testid="nav-notifications"
                  data-active={location === "/notifications"}
                  onPointerEnter={() => preloadPage("/notifications")}
                  onFocus={() => preloadPage("/notifications")}
                  onClick={() => setLocation("/notifications")}
                >
                  <Bell className="h-4 w-4" />
                  <span>Notifications</span>
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-auto no-default-active-elevate text-xs px-1.5 py-0">
                      {unreadCount}
                    </Badge>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(user?.role === "admin" || user?.role === "manager" || user?.role === "account_manager" || user?.role === "case_manager") && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.filter(item => (item.url !== "/rcm-access" && item.url !== "/rcm-role-matrix") || user?.role === "admin").map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      data-testid={`nav-${item.title.toLowerCase()}`}
                      data-active={location === item.url}
                      onPointerEnter={() => preloadPage(item.url)}
                      onFocus={() => preloadPage(item.url)}
                      onClick={() => setLocation(item.url)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm">
            {user?.fullName?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">{user?.fullName}</span>
            <span className="text-xs text-muted-foreground capitalize">{user?.role === "assigner" ? "Case Coordinator" : user?.role === "payment_specialist" ? "Payment Specialist" : user?.role === "account_manager" ? "Account Manager" : user?.role === "case_manager" ? "Case Manager" : user?.role}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setPasswordDialogOpen(true)}
            data-testid="button-change-password"
            title="Change password"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>

      <ChangePasswordDialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} />
    </Sidebar>
  );
}
