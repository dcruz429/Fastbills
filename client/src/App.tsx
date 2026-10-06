import { Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import { pageRoutes } from "@/lib/page-routes";
import { PageLoadBoundary, PageLoading } from "@/components/page-load-boundary";
import { Skeleton } from "@/components/ui/skeleton";

function Router() {
  return (
    <Switch>
      {pageRoutes.map(({ path, Component }) => <Route key={path} path={path} component={Component} />)}
      <Route component={NotFound} />
    </Switch>
  );
}

function ImpersonationBanner() {
  const { user, isImpersonating, stopImpersonating } = useAuth();
  if (!isImpersonating) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-amber-400 text-amber-950 text-sm font-medium shrink-0">
      <span className="flex items-center gap-2">
        <LogIn className="h-4 w-4" />
        Viewing as <strong>{user?.fullName}</strong> — you are currently impersonating this user
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-amber-700 bg-amber-300 text-amber-950 hover:bg-amber-200"
        onClick={() => stopImpersonating()}
      >
        Return to Admin
      </Button>
    </div>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

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
          <ImpersonationBanner />
          <header className="flex items-center gap-2 p-2 border-b shrink-0 bg-background/80 backdrop-blur-sm">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <PageLoadBoundary key={location}>
              <Suspense fallback={<PageLoading />}>
                <Router />
              </Suspense>
            </PageLoadBoundary>
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
