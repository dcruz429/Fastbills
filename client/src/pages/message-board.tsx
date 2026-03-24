import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { AnnouncementWithRelations, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, CheckCircle2, Eye, Users, User as UserIcon, Megaphone, Paperclip, FileText, Image, FileSpreadsheet, X, Download } from "lucide-react";

function formatDateTime(d: string | Date | null | undefined) {
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

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  verifier: "Verifier",
  biller: "Biller",
  assigner: "Case Coordinator",
};

function parseAttachment(att: string) {
  const parts = att.split("|");
  return { url: parts[0], name: parts[1] || parts[0].split("/").pop() || "file" };
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return <Image className="h-4 w-4 text-blue-500" />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  return <FileText className="h-4 w-4 text-gray-500" />;
}

function AttachmentPreview({ attachments }: { attachments: string[] | null | undefined }) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter(att => isImage(parseAttachment(att).name));
  const files = attachments.filter(att => !isImage(parseAttachment(att).name));

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {images.map((att, i) => {
            const { url, name } = parseAttachment(att);
            return (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block" data-testid={`link-announcement-image-${i}`}>
                <img
                  src={url}
                  alt={name}
                  className="rounded-lg object-cover w-full max-h-64 border border-border hover:opacity-90 transition-opacity"
                />
              </a>
            );
          })}
        </div>
      )}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((att, i) => {
            const { url, name } = parseAttachment(att);
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1.5 hover:bg-muted transition-colors"
                data-testid={`link-announcement-file-${i}`}
              >
                {getFileIcon(name)}
                <span className="truncate flex-1">{name}</span>
                <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MessageBoardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewAcksId, setViewAcksId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: announcements, isLoading } = useQuery<AnnouncementWithRelations[]>({
    queryKey: ["/api/announcements"],
  });

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const activeUsers = (allUsers || []).filter(u => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));

  const isAdmin = user?.role === "admin" || user?.role === "manager" || user?.role === "account_manager" || user?.role === "payment_specialist" || user?.role === "case_manager";
  const canDelete = user?.role === "admin";

  function resetForm() {
    setTitle("");
    setBody("");
    setTargetType("all");
    setSelectedRoles([]);
    setSelectedUserIds([]);
    setAttachedFiles([]);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("body", body);
      fd.append("targetType", targetType);
      if (targetType === "role") fd.append("targetRoles", JSON.stringify(selectedRoles));
      if (targetType === "users") fd.append("targetUserIds", JSON.stringify(selectedUserIds));
      attachedFiles.forEach(f => fd.append("attachments", f));
      const res = await fetch("/api/announcements", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(err.message || "Failed to post announcement");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/unread-count"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Announcement posted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ackMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/announcements/${id}/ack`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to acknowledge");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/unread-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/unread-count"] });
      toast({ title: "Announcement deleted" });
    },
  });

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const toggleUser = (uid: number) => {
    setSelectedUserIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  function removeFile(idx: number) {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  const targetLabel = (a: AnnouncementWithRelations) => {
    if (a.targetType === "all") return "All Staff";
    if (a.targetType === "role" && a.targetRoles) return a.targetRoles.map(r => ROLE_LABELS[r] || r).join(", ");
    if (a.targetType === "users" && a.targetUserIds) {
      const names = a.targetUserIds.map(id => activeUsers.find(u => u.id === id)?.fullName || `User #${id}`);
      return names.join(", ");
    }
    return "Unknown";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-message-board-title">Message Board</h1>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-announcement">
            <Plus className="h-4 w-4 mr-1" /> New Announcement
          </Button>
        )}
      </div>

      {(!announcements || announcements.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No announcements yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => {
            const hasAcked = a.acks?.some(ak => ak.userId === user?.id);
            return (
              <Card key={a.id} className={`${!hasAcked ? "border-primary/30 bg-primary/5" : ""}`} data-testid={`card-announcement-${a.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold" data-testid={`text-announcement-title-${a.id}`}>{a.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">by {a.author?.fullName || "Unknown"}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                        <Badge variant="outline" className="text-xs">
                          {a.targetType === "all" ? <><Users className="h-3 w-3 mr-1" />All Staff</> :
                           a.targetType === "role" ? <><Users className="h-3 w-3 mr-1" />{targetLabel(a)}</> :
                           <><UserIcon className="h-3 w-3 mr-1" />{targetLabel(a)}</>}
                        </Badge>
                        {(a as any).attachments && (a as any).attachments.length > 0 && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Paperclip className="h-3 w-3" />
                            {(a as any).attachments.length} attachment{(a as any).attachments.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setViewAcksId(a.id)}
                        data-testid={`button-view-acks-${a.id}`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        {a.readCount}/{a.totalRecipients} read
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteMutation.mutate(a.id)}
                          data-testid={`button-delete-announcement-${a.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm" data-testid={`text-announcement-body-${a.id}`}>{a.body}</p>
                  <AttachmentPreview attachments={(a as any).attachments} />
                  <div className="mt-3">
                    {!hasAcked ? (
                      <Button
                        size="sm"
                        onClick={() => ackMutation.mutate(a.id)}
                        disabled={ackMutation.isPending}
                        data-testid={`button-ack-${a.id}`}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Acknowledge
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>You acknowledged this</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" data-testid="input-announcement-title" />
            </div>
            <div className="space-y-1.5">
              <Label>Message *</Label>
              <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your announcement..." rows={5} data-testid="input-announcement-body" />
            </div>
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger data-testid="select-announcement-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  <SelectItem value="role">By Role</SelectItem>
                  <SelectItem value="users">Specific Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {targetType === "role" && (
              <div className="space-y-1.5">
                <Label>Select Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ROLE_LABELS).map(([key, label]) => (
                    <Badge
                      key={key}
                      variant={selectedRoles.includes(key) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleRole(key)}
                      data-testid={`badge-role-${key}`}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {targetType === "users" && (
              <div className="space-y-1.5">
                <Label>Select Users</Label>
                <div className="max-h-48 overflow-y-auto border rounded p-2">
                  <div className="space-y-1">
                    {activeUsers.map(u => (
                      <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => toggleUser(u.id)}
                          data-testid={`checkbox-user-${u.id}`}
                        />
                        <span>{u.fullName}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{ROLE_LABELS[u.role]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-attachment"
                >
                  <Paperclip className="h-4 w-4" />
                  Attachment
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) {
                      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                      e.target.value = "";
                    }
                  }}
                  data-testid="input-file-attachment"
                />
              </div>
              {attachedFiles.length > 0 && (
                <div className="space-y-1">
                  {attachedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1.5">
                      {isImage(f.name) ? <Image className="h-4 w-4 text-blue-500 shrink-0" /> : <FileText className="h-4 w-4 text-gray-500 shrink-0" />}
                      <span className="truncate flex-1 text-xs">{f.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeFile(i)} className="shrink-0 text-muted-foreground hover:text-destructive" data-testid={`button-remove-file-${i}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!title.trim() || !body.trim() || createMutation.isPending || (targetType === "role" && selectedRoles.length === 0) || (targetType === "users" && selectedUserIds.length === 0)}
              data-testid="button-submit-announcement"
            >
              {createMutation.isPending ? "Posting..." : "Post Announcement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewAcksId !== null} onOpenChange={() => setViewAcksId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Read Receipts</DialogTitle>
          </DialogHeader>
          <AcksList announcementId={viewAcksId} announcements={announcements || []} allUsers={activeUsers} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AcksList({ announcementId, announcements, allUsers }: { announcementId: number | null; announcements: AnnouncementWithRelations[]; allUsers: User[] }) {
  if (!announcementId) return null;
  const announcement = announcements.find(a => a.id === announcementId);
  if (!announcement) return <p className="text-sm text-muted-foreground">Not found</p>;

  let recipients: User[] = [];
  if (announcement.targetType === "all") {
    recipients = allUsers;
  } else if (announcement.targetType === "role" && announcement.targetRoles) {
    recipients = allUsers.filter(u => announcement.targetRoles!.includes(u.role));
  } else if (announcement.targetType === "users" && announcement.targetUserIds) {
    recipients = allUsers.filter(u => announcement.targetUserIds!.includes(u.id));
  }

  const ackedIds = new Set(announcement.acks?.map(a => a.userId) || []);
  const ackedAt = new Map(announcement.acks?.map(a => [a.userId, a.readAt]) || []);

  return (
    <ScrollArea className="max-h-60">
      <div className="space-y-1">
        {recipients.map(u => (
          <div key={u.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 text-sm">
            <span>{u.fullName}</span>
            {ackedIds.has(u.id) ? (
              <div className="flex items-center gap-1 text-emerald-600 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{formatDateTime(ackedAt.get(u.id))}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Not read</span>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
