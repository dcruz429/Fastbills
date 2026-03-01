import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import BoardPage from "@/pages/board";
import DashboardPage from "@/pages/dashboard";
import WorkloadPage from "@/pages/workload";
import BillingQueuePage from "@/pages/billing-queue";
import NotificationsPage from "@/pages/notifications";
import SettingsPage from "@/pages/settings";
import ReportsPage from "@/pages/reports";
import ProductivityPage from "@/pages/productivity";
import DenialsPage from "@/pages/denials";
import TicketsPage from "@/pages/tickets";
import CollectionsPage from "@/pages/collections";
import ArbitrationPage from "@/pages/arbitration";
import MessageBoardPage from "@/pages/message-board";
import MessagesPage from "@/pages/messages";
import { Skeleton } from "@/components/ui/skeleton";

function Router() {
  return (
    <Switch>
      <Route path="/" component={BoardPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/workload" component={WorkloadPage} />
      <Route path="/billing-queue" component={BillingQueuePage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/productivity" component={ProductivityPage} />
      <Route path="/denials" component={DenialsPage} />
      <Route path="/arbitration" component={ArbitrationPage} />
      <Route path="/tickets" component={TicketsPage} />
      <Route path="/collections" component={CollectionsPage} />
      <Route path="/message-board" component={MessageBoardPage} />
      <Route path="/messages" component={MessagesPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-2 border-b shrink-0 bg-background/80 backdrop-blur-sm">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
