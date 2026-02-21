import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Check, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Notification } from "@shared/schema";

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const items = notifications || [];
  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2" data-testid="text-notifications-title">
            <Bell className="h-5 w-5" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No notifications yet
            </CardContent>
          </Card>
        ) : (
          items.map((n) => (
            <Card
              key={n.id}
              className={cn(!n.read && "border-primary/30 bg-primary/5")}
            >
              <CardContent className="flex items-start gap-3 p-3">
                <div className={cn(
                  "mt-0.5 h-2 w-2 rounded-full shrink-0",
                  n.read ? "bg-muted" : "bg-primary"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" data-testid={`notification-message-${n.id}`}>{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(n.createdAt), "MMM d, h:mm a")}
                  </p>
                </div>
                {!n.read && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => markReadMutation.mutate(n.id)}
                    data-testid={`button-mark-read-${n.id}`}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
