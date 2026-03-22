import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { User, DirectMessageWithUser } from "@shared/schema";
import { ROLE_LABELS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, Search, Paperclip, X, FileText, Image as ImageIcon, FileSpreadsheet, Download } from "lucide-react";

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

function parseAttachment(raw: string) {
  const [url, ...rest] = raw.split("|");
  return { url, name: rest.join("|") || url.split("/").pop() || "file" };
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

function FileIcon({ name }: { name: string }) {
  if (isImage(name)) return <ImageIcon className="h-4 w-4 shrink-0" />;
  if (/\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet className="h-4 w-4 shrink-0" />;
  return <FileText className="h-4 w-4 shrink-0" />;
}

function AttachmentDisplay({ att, isMine }: { att: string; isMine: boolean }) {
  const { url, name } = parseAttachment(att);
  if (isImage(name)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img src={url} alt={name} className="max-w-[220px] max-h-[180px] rounded-md object-cover border" />
      </a>
    );
  }
  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 mt-1 px-2 py-1.5 rounded-md text-xs border ${
        isMine
          ? "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20"
          : "bg-background border-border text-foreground hover:bg-muted"
      }`}
    >
      <FileIcon name={name} />
      <span className="truncate max-w-[160px]">{name}</span>
      <Download className="h-3.5 w-3.5 shrink-0 ml-auto" />
    </a>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const fd = new FormData();
      fd.append("recipientId", String(selectedUserId));
      fd.append("content", message.trim());
      attachmentFiles.forEach(f => fd.append("attachments", f));
      const res = await fetch("/api/messages", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${selectedUserId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      setMessage("");
      setAttachmentFiles([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: async (otherId: number) => {
      const res = await fetch(`/api/messages/${otherId}/read`, { method: "POST", credentials: "include" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
  });

  useEffect(() => {
    if (selectedUserId) markReadMutation.mutate(selectedUserId);
  }, [selectedUserId, chatMessages?.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const canSend = (message.trim().length > 0 || attachmentFiles.length > 0) && !!selectedUserId;

  const handleSend = () => {
    if (!canSend || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachmentFiles(prev => [...prev, ...files]);
    e.target.value = "";
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
                          {c.lastMessage.content || (c.lastMessage.attachments?.length ? "📎 Attachment" : "")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col border rounded-lg min-w-0">
          {selectedUserId && selectedUser ? (
            <>
              <div className="px-4 py-3 border-b">
                <h3 className="font-semibold flex items-center gap-2" data-testid="text-chat-user">
                  {selectedUser.fullName}
                  {(sortedContacts.find(c => c.user?.id === selectedUserId)?.unreadCount || 0) > 0 && (
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                </h3>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[selectedUser.role] || selectedUser.role}</span>
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
                      const atts = (m as any).attachments as string[] | null;
                      return (
                        <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`} data-testid={`message-${m.id}`}>
                          <div className={`max-w-[70%] rounded-lg px-3 py-2 ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            {m.content && <p className="text-sm whitespace-pre-wrap">{m.content}</p>}
                            {atts && atts.length > 0 && (
                              <div className="space-y-1">
                                {atts.map((att, i) => <AttachmentDisplay key={i} att={att} isMine={isMine} />)}
                              </div>
                            )}
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

              {attachmentFiles.length > 0 && (
                <div className="px-3 pt-2 flex flex-wrap gap-2 border-t">
                  {attachmentFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs max-w-[200px]">
                      <FileIcon name={f.name} />
                      <span className="truncate">{f.name}</span>
                      <button
                        onClick={() => setAttachmentFiles(prev => prev.filter((_, j) => j !== i))}
                        className="ml-1 text-muted-foreground hover:text-destructive shrink-0"
                        data-testid={`button-remove-attachment-${i}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 border-t flex gap-2 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                  data-testid="input-file-attachment"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-attach-file"
                  type="button"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!canSend || sendMutation.isPending}
                  size="icon"
                  data-testid="button-send-message"
                >
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
