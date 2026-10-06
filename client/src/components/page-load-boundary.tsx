import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading() {
  return (
    <div className="space-y-4 p-6" role="status" aria-label="Loading page" data-testid="page-loading">
      <span className="sr-only">Loading page…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export class PageLoadBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("Unable to render page", { name: error.name });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="space-y-3 p-6" role="alert">
          <h2 className="text-lg font-semibold">This page couldn’t be loaded</h2>
          <p className="text-sm text-muted-foreground">Check your connection and refresh to get the latest version of the site.</p>
          <Button onClick={() => window.location.reload()}>Refresh page</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
