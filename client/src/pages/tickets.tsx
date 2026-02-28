import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  MessageSquare,
  Paperclip,
  FileText,
  Image,
  FileSpreadsheet,
  Download,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEST } from "@/lib/date-utils";
import type {
  TicketWithRelations,
  TicketCommentWithUser,
} from "@shared/schema";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@shared/schema";

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return <Image className="h-4 w-4 text-blue-500" />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  return <FileText className="h-4 w-4 text-gray-500" />;
}

function parseAttachment(att: string) {
  const parts = att.split("|");
  return { url: parts[0], name: parts[1] || parts[0].split("/").pop() || "file" };
}

function StatusBadgeTicket({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    working_on_it: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    done: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", colors[status] || colors.open)} data-testid={`badge-ticket-status-${status}`}>
      {TICKET_STATUS_LABELS[status] || status}
    </span>
  );
}

function PriorityBadgeTicket({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", colors[priority] || colors.medium)} data-testid={`badge-ticket-priority-${priority}`}>
      {TICKET_PRIORITY_LABELS[priority] || priority}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    bug: "bg-red-50 text-red-700 border-red-200",
    feature_request: "bg-purple-50 text-purple-700 border-purple-200",
    ui_change: "bg-indigo-50 text-indigo-700 border-indigo-200",
    question: "bg-cyan-50 text-cyan-700 border-cyan-200",
    other: "bg-gray-50 text-gray-700 border-gray-200",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", colors[category] || colors.other)} data-testid={`badge-ticket-category-${category}`}>
      {TICKET_CATEGORY_LABELS[category] || category}
    </span>
  );
}

function CreateTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("medium");
  const [files, setFiles] = useState<File[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("category", category);
      formData.append("priority", priority);
      files.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/tickets", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket created" });
      setTitle("");
      setDescription("");
      setCategory("other");
      setPriority("medium");
      setFiles([]);
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary" data-testid="input-ticket-title" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed description..." rows={4} data-testid="input-ticket-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-ticket-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TICKET_CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-ticket-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Attachments</label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => document.getElementById("ticket-file-input")?.click()} data-testid="button-attach-files">
                <Paperclip className="h-4 w-4 mr-1" /> Attach Files
              </Button>
              <input
                id="ticket-file-input"
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                    {getFileIcon(f.name)}
                    <span className="truncate flex-1">{f.name}</span>
                    <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending} data-testid="button-submit-ticket">
            {mutation.isPending ? "Creating..." : "Create Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetail({ ticket, onClose }: { ticket: TicketWithRelations; onClose: () => void }) {
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);

  const { data: comments, isLoading: commentsLoading } = useQuery<TicketCommentWithUser[]>({
    queryKey: ["/api/tickets", ticket.id, "comments"],
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { status });
      return res.json();
    },
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      Object.assign(ticket, updated);
      toast({ title: "Status updated" });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("content", comment);
      commentFiles.forEach((f) => formData.append("files", f));
      const res = await fetch(`/api/tickets/${ticket.id}/comments`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Failed to add comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setComment("");
      setCommentFiles([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/tickets/${ticket.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket deleted" });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="ml-auto w-full max-w-xl bg-background border-l shadow-xl flex flex-col relative animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold truncate pr-4" data-testid="text-ticket-detail-title">{ticket.title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-ticket-detail">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="flex flex-wrap gap-2 items-center">
            <CategoryBadge category={ticket.category} />
            <PriorityBadgeTicket priority={ticket.priority} />
            <StatusBadgeTicket status={ticket.status} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={ticket.status} onValueChange={(v) => statusMutation.mutate(v)}>
              <SelectTrigger className="mt-1" data-testid="select-ticket-status-update">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <p className="mt-1 text-sm whitespace-pre-wrap" data-testid="text-ticket-description">{ticket.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Created by</span>
              <p className="font-medium">{ticket.createdBy?.fullName || "Unknown"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Created</span>
              <p className="font-medium">{formatEST(new Date(ticket.createdAt), "MM/dd/yyyy h:mm a")}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Updated</span>
              <p className="font-medium">{formatEST(new Date(ticket.updatedAt), "MM/dd/yyyy h:mm a")}</p>
            </div>
            {ticket.completedAt && (
              <div>
                <span className="text-xs text-muted-foreground">Completed</span>
                <p className="font-medium">{formatEST(new Date(ticket.completedAt), "MM/dd/yyyy h:mm a")}</p>
              </div>
            )}
          </div>

          {ticket.attachments && ticket.attachments.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Attachments</label>
              <div className="mt-1 space-y-1">
                {ticket.attachments.map((att, i) => {
                  const { url, name } = parseAttachment(att);
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1.5 hover:bg-muted transition-colors"
                      data-testid={`link-ticket-attachment-${i}`}
                    >
                      {getFileIcon(name)}
                      <span className="truncate flex-1">{name}</span>
                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
              <MessageSquare className="h-4 w-4" /> Comments ({comments?.length || 0})
            </h3>
            {commentsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : comments && comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="bg-muted/30 rounded-lg p-3" data-testid={`comment-${c.id}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{c.user?.fullName || "Unknown"}</span>
                      <span className="text-xs text-muted-foreground">{formatEST(new Date(c.createdAt), "MM/dd h:mm a")}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                    {c.attachments && c.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {c.attachments.map((att, i) => {
                          const { url, name } = parseAttachment(att);
                          return (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1 hover:bg-muted">
                              {getFileIcon(name)}
                              <span className="truncate">{name}</span>
                              <Download className="h-3 w-3 text-muted-foreground" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>
            )}
          </div>
        </div>

        <div className="border-t p-4 space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            data-testid="input-ticket-comment"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => document.getElementById("comment-file-input")?.click()} data-testid="button-attach-comment-file">
                <Paperclip className="h-3.5 w-3.5 mr-1" /> Attach
              </Button>
              <input
                id="comment-file-input"
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setCommentFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = "";
                }}
              />
              {commentFiles.length > 0 && (
                <span className="text-xs text-muted-foreground">{commentFiles.length} file(s)</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => { if (confirm("Delete this ticket?")) deleteMutation.mutate(); }}
                data-testid="button-delete-ticket"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => commentMutation.mutate()}
              disabled={!comment.trim() || commentMutation.isPending}
              data-testid="button-submit-comment"
            >
              {commentMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
          {commentFiles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {commentFiles.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-1.5 py-0.5">
                  {f.name}
                  <button onClick={() => setCommentFiles((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type SortField = "title" | "category" | "priority" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const priorityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const statusOrder: Record<string, number> = { open: 0, working_on_it: 1, done: 2, closed: 3 };

export default function TicketsPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: tickets, isLoading } = useQuery<TicketWithRelations[]>({
    queryKey: ["/api/tickets"],
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField("createdAt"); setSortDir("desc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filtered = (tickets || [])
    .filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!t.title.toLowerCase().includes(s) && !t.description.toLowerCase().includes(s)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "category": cmp = (a.category || "").localeCompare(b.category || ""); break;
        case "priority": cmp = (priorityOrder[a.priority] ?? 0) - (priorityOrder[b.priority] ?? 0); break;
        case "status": cmp = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0); break;
        case "createdAt": cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const counts = {
    open: (tickets || []).filter((t) => t.status === "open").length,
    working: (tickets || []).filter((t) => t.status === "working_on_it").length,
    done: (tickets || []).filter((t) => t.status === "done" || t.status === "closed").length,
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between gap-3 p-6 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-tickets-title">Suggestion Box</h1>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-ticket">
          <Plus className="h-4 w-4 mr-1" /> New Ticket
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 px-6 pb-3">
        <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Open</p>
            <p className="text-2xl font-bold text-blue-600" data-testid="text-tickets-open">{counts.open}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold text-amber-600" data-testid="text-tickets-working">{counts.working}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-200/50">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-600" data-testid="text-tickets-done">{counts.done}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 px-6 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-[130px]" data-testid="filter-ticket-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-9 w-[140px]" data-testid="filter-ticket-category"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(TICKET_CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-9 w-[130px]" data-testid="filter-ticket-priority"><SelectValue placeholder="All Priorities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No tickets found. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    {([
                      { field: "title" as SortField, label: "Title", cls: "pl-4 pr-2" },
                      { field: "category" as SortField, label: "Category", cls: "px-2" },
                      { field: "priority" as SortField, label: "Priority", cls: "px-2" },
                      { field: "status" as SortField, label: "Status", cls: "px-2" },
                      { field: "createdAt" as SortField, label: "Created", cls: "px-2" },
                    ]).map((col) => (
                      <th
                        key={col.field}
                        className={cn("text-left py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors", col.cls)}
                        onClick={() => handleSort(col.field)}
                        data-testid={`sort-ticket-${col.field}`}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {sortField === col.field ? (
                            sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="text-left py-2 px-2 font-medium">Comments</th>
                    <th className="text-left py-2 px-2 font-medium">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b last:border-0 cursor-pointer transition-colors even:bg-muted/20 hover:bg-primary/5"
                      onClick={() => setSelectedTicket(t)}
                      data-testid={`ticket-row-${t.id}`}
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <span className="font-medium">{t.title}</span>
                      </td>
                      <td className="py-2.5 px-2"><CategoryBadge category={t.category} /></td>
                      <td className="py-2.5 px-2"><PriorityBadgeTicket priority={t.priority} /></td>
                      <td className="py-2.5 px-2"><StatusBadgeTicket status={t.status} /></td>
                      <td className="py-2.5 px-2 text-muted-foreground">{formatEST(new Date(t.createdAt), "MM/dd/yyyy")}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {(t.commentCount || 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" /> {t.commentCount}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {t.attachments && t.attachments.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="h-3.5 w-3.5" /> {t.attachments.length}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <CreateTicketDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
