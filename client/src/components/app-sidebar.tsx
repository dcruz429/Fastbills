import {
  LayoutDashboard,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Flame,
} from "lucide-react";
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
  { title: "Board", url: "/", icon: ClipboardList, roles: ["admin", "verifier", "biller", "assigner"] },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "verifier", "biller", "assigner"] },
  { title: "Workload", url: "/workload", icon: Users, roles: ["admin", "verifier", "biller", "assigner"] },
  { title: "Billing Queue", url: "/billing-queue", icon: Flame, roles: ["admin", "biller", "assigner"] },
  { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin", "assigner"] },
];

const adminItems = [
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: notifications } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
  });

  const unreadCount = notifications?.filter((n: any) => !n.read).length || 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            WF
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">WorkFlow Pro</span>
            <span className="text-xs text-muted-foreground">Patient Billing</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter((item) => item.roles.includes(user?.role || "")).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    data-active={location === item.url}
                    onClick={() => setLocation(item.url)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem>
                <SidebarMenuButton
                  data-testid="nav-notifications"
                  data-active={location === "/notifications"}
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

        {(user?.role === "admin" || user?.role === "assigner") && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      data-testid={`nav-${item.title.toLowerCase()}`}
                      data-active={location === item.url}
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

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
            {user?.fullName?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">{user?.fullName}</span>
            <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
          </div>
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
    </Sidebar>
  );
}
