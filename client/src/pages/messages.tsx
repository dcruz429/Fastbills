import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { User, DirectMessageWithUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, Search } from "lucide-react";

function formatTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const activeUsers = (allUsers || []).filter(u => u.active !== false && u.id !== user?.id).sort((a, b) => a.fullName.localeCompare(b.fullName));

  const { data: conversations, isLoading: convsLoading } = useQuery<any[]>({
    queryKey: ["/api/messages/conversations"],
    refetchInterval: 10000,
  });

  const { data: chatMessages, isLoading: messagesLoading } = useQuery<DirectMessageWithUser[]>({
    queryKey: [`/api/messages/${selectedUserId}`],
    enabled: selectedUserId !== null,
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/messages", {
        recipientId: selectedUserId,
        content: message,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${selectedUserId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      setMessage("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: async (otherId: number) => {
      return apiRequest("POST", `/api/messages/${otherId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
  });

  useEffect(() => {
    if (selectedUserId) {
      markReadMutation.mutate(selectedUserId);
    }
  }, [selectedUserId, chatMessages?.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = () => {
    if (!message.trim() || !selectedUserId) return;
    sendMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const convUserIds = new Set((conversations || []).map((c: any) => c.otherUser?.id));
  const q = searchQuery.toLowerCase();
  const filteredUsers = activeUsers.filter(u => u.fullName.toLowerCase().includes(q));

  const sortedContacts = [
    ...(conversations || []).map((c: any) => ({
      user: c.otherUser,
      lastMessage: c.lastMessage,
      unreadCount: c.unreadCount,
    })),
    ...filteredUsers
      .filter(u => !convUserIds.has(u.id))
      .map(u => ({ user: u, lastMessage: null, unreadCount: 0 })),
  ];

  const selectedUser = allUsers?.find(u => u.id === selectedUserId);

  return (
    <div className="p-6 animate-fade-in h-[calc(100vh-4rem)]">
      <h1 className="text-2xl font-bold mb-4" data-testid="text-messages-title">Messages</h1>
      <div className="flex gap-4 h-[calc(100%-3rem)]">
        <div className="w-72 shrink-0 flex flex-col border rounded-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-users"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {convsLoading ? (
              <div className="p-2 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="p-1">
                {sortedContacts.map(c => {
                  if (!c.user) return null;
                  return (
                    <button
                      key={c.user.id}
                      onClick={() => setSelectedUserId(c.user.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedUserId === c.user.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                      data-testid={`button-user-chat-${c.user.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate flex items-center gap-1.5">
                          {c.unreadCount > 0 && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                          {c.user.fullName}
                        </span>
                        {c.unreadCount > 0 && (
                          <Badge variant="destructive" className="text-xs h-5 min-w-5 flex items-center justify-center">
                            {c.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {c.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {c.lastMessage.senderId === user?.id ? "You: " : ""}
                          {c.lastMessage.content}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col border rounded-lg">
          {selectedUserId && selectedUser ? (
            <>
              <div className="px-4 py-3 border-b">
                <h3 className="font-semibold flex items-center gap-2" data-testid="text-chat-user">
                  {selectedUser.fullName}
                  {(sortedContacts.find(c => c.user?.id === selectedUserId)?.unreadCount || 0) > 0 && (
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                </h3>
                <span className="text-xs text-muted-foreground capitalize">{selectedUser.role}</span>
              </div>
              <ScrollArea className="flex-1 p-4">
                {messagesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-3/4" />
                    <Skeleton className="h-10 w-1/2 ml-auto" />
                  </div>
                ) : chatMessages && chatMessages.length > 0 ? (
                  <div className="space-y-3">
                    {chatMessages.map(m => {
                      const isMine = m.senderId === user?.id;
                      return (
                        <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`} data-testid={`message-${m.id}`}>
                          <div className={`max-w-[70%] rounded-lg px-3 py-2 ${
                            isMine ? "bg-primary text-primary-foreground" : "bg-muted"
                          }`}>
                            <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                            <p className={`text-xs mt-1 ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {formatTime(m.createdAt)}
                              {isMine && m.readAt && " · Read"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">No messages yet. Start the conversation!</p>
                  </div>
                )}
              </ScrollArea>
              <div className="p-3 border-t flex gap-2">
                <Input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1"
                  data-testid="input-message"
                />
                <Button onClick={handleSend} disabled={!message.trim() || sendMutation.isPending} size="icon" data-testid="button-send-message">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-3 opacity-20" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose someone from the list to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
