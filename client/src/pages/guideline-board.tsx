import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import type { GuidelineModuleWithRelations } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, ClipboardList, Download, FileSpreadsheet, FileText, Image as ImageIcon,
  Paperclip, Pencil, Plus, Search, X, RefreshCw, Clock3, LibraryBig,
} from "lucide-react";

const MODULES_KEY = ["/api/guideline-modules"];
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt"]);
const ACCEPTED_FILE_TYPES = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

type ModuleKind = "guideline" | "training";
type EditorDraft = { id: number | null; title: string; body: string; moduleType: ModuleKind; retainedAttachments: string[]; files: File[] };

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function attachmentDetails(value: string) {
  const [url, ...nameParts] = value.split("|");
  return { url, name: nameParts.join("|") || url.split("/").pop() || "Attachment" };
}

function fileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext || "")) return <ImageIcon className="h-4 w-4 shrink-0 text-sky-700" />;
  if (["xls", "xlsx", "csv"].includes(ext || "")) return <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />;
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function ModuleAttachments({ attachments }: { attachments: string[] | null }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Module attachments">
      {attachments.map((attachment, index) => {
        const { url, name } = attachmentDetails(attachment);
        const image = /\.(png|jpe?g|gif|webp)$/i.test(name);
        return (
          <a
            key={`${attachment}-${index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-w-0 items-center gap-2.5 rounded-md border border-border/80 bg-background/70 px-3 py-2.5 text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`link-guideline-attachment-${index}`}
          >
            {fileIcon(name)}
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
            {image && <span className="sr-only">Image attachment</span>}
          </a>
        );
      })}
    </div>
  );
}

function emptyDraft(): EditorDraft {
  return { id: null, title: "", body: "", moduleType: "guideline", retainedAttachments: [], files: [] };
}

export default function GuidelineBoardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<EditorDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ModuleKind>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modulesQuery = useQuery<GuidelineModuleWithRelations[]>({
    queryKey: MODULES_KEY,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const modules = modulesQuery.data || [];
  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return modules
      .filter((module) => kindFilter === "all" || module.moduleType === kindFilter)
      .filter((module) => !normalized || `${module.title} ${module.body} ${module.authorName || ""}`.toLowerCase().includes(normalized))
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [modules, query, kindFilter]);

  const saveMutation = useMutation({
    mutationFn: async (current: EditorDraft) => {
      const formData = new FormData();
      formData.append("title", current.title.trim());
      formData.append("body", current.body.trim());
      formData.append("moduleType", current.moduleType);
      current.files.forEach((file) => formData.append("attachments", file));
      const editing = current.id !== null;
      if (editing) formData.append("retainedAttachments", JSON.stringify(current.retainedAttachments));

      const response = await fetch(editing ? `/api/guideline-modules/${current.id}` : "/api/guideline-modules", {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.json().then((data) => data?.message || data?.error).catch(() => "");
        throw new Error(message || `Unable to ${editing ? "update" : "create"} module (${response.status}).`);
      }
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MODULES_KEY });
      setEditorOpen(false);
      setDraft(emptyDraft());
      setFormError("");
    },
    onError: (error: Error) => setFormError(error.message || "The module could not be saved. Your draft is still here."),
  });

  function openNewModule() {
    setDraft(emptyDraft());
    setFormError("");
    setEditorOpen(true);
  }

  function openEditModule(module: GuidelineModuleWithRelations) {
    setDraft({
      id: module.id,
      title: module.title,
      body: module.body,
      moduleType: module.moduleType === "training" ? "training" : "guideline",
      retainedAttachments: [...(module.attachments || [])],
      files: [],
    });
    setFormError("");
    setEditorOpen(true);
  }

  function closeEditor(open: boolean) {
    if (!open && saveMutation.isPending) return;
    setEditorOpen(open);
    if (!open && !saveMutation.isPending) {
      setDraft(emptyDraft());
      setFormError("");
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const total = draft.retainedAttachments.length + draft.files.length + incoming.length;
    if (total > MAX_FILES) {
      setFormError(`A module can have up to ${MAX_FILES} attachments. Remove a file before adding more.`);
      return;
    }
    const invalid = incoming.find((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      return !ACCEPTED_EXTENSIONS.has(extension) || file.size > MAX_FILE_SIZE;
    });
    if (invalid) {
      const extension = invalid.name.split(".").pop()?.toLowerCase() || "";
      setFormError(!ACCEPTED_EXTENSIONS.has(extension)
        ? `${invalid.name} is not an allowed file type.`
        : `${invalid.name} exceeds the 10 MB per-file limit.`);
      return;
    }
    setFormError("");
    setDraft((current) => ({ ...current, files: [...current.files, ...incoming] }));
  }

  const remainingAttachments = draft.retainedAttachments.length + draft.files.length;
  const canSave = !!draft.title.trim() && !!draft.body.trim() && draft.title.trim().length <= 200 &&
    draft.body.trim().length <= 100_000 && remainingAttachments <= MAX_FILES && !saveMutation.isPending;

  return (
    <main className="min-h-[100dvh] p-4 sm:p-6 lg:p-8" data-testid="page-guideline-board">
      <div className="mx-auto max-w-6xl">
        <header className="relative mb-7 overflow-hidden rounded-xl border border-[#cbd8d1] bg-[#eaf1eb] px-5 py-6 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-8 -top-16 h-64 w-64 rounded-full border-[1px] border-[#b9c9bd]/70" />
          <div className="pointer-events-none absolute -right-1 -top-9 h-52 w-52 rounded-full border-[1px] border-[#b9c9bd]/60" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#b9c9bd] bg-[#f5f8f4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#456653]">
                <LibraryBig className="h-3.5 w-3.5" />
                Staff reference
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[#253b30] sm:text-4xl" data-testid="text-guideline-board-title">
                Guideline Board
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#53685b] sm:text-base">
                Clear, current instructions for the work we do every day.
              </p>
            </div>
            {isAdmin && (
              <Button onClick={openNewModule} className="shrink-0 bg-[#315844] text-white hover:bg-[#274735]" data-testid="button-create-guideline">
                <Plus className="mr-2 h-4 w-4" /> Create module
              </Button>
            )}
          </div>
        </header>

        <section aria-label="Guideline modules">
          <div className="mb-5 flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Reference modules</h2>
              {!modulesQuery.isLoading && !modulesQuery.isError && (
                <Badge variant="secondary" className="rounded-full px-2.5" data-testid="text-guideline-count">
                  {modules.length}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search modules"
                  className="pl-9"
                  aria-label="Search guideline modules"
                  data-testid="input-guideline-search"
                />
              </div>
              <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as "all" | ModuleKind)}>
                <SelectTrigger className="sm:w-40" aria-label="Filter by module type" data-testid="select-guideline-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  <SelectItem value="guideline">Guidelines</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {modulesQuery.isLoading ? (
            <div className="space-y-4" aria-label="Loading guideline modules" data-testid="state-guidelines-loading">
              {[0, 1, 2].map((item) => (
                <Card key={item} className="border-border/70">
                  <CardHeader className="space-y-3">
                    <Skeleton className="h-5 w-2/5" />
                    <Skeleton className="h-3 w-1/3" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-3 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : modulesQuery.isError ? (
            <Card className="border-[#d9c5b8] bg-[#fbf6f1]" data-testid="state-guidelines-error">
              <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-[#624838]">Reference modules are unavailable</p>
                  <p className="mt-1 text-sm text-muted-foreground">We couldn’t load the board. Try again in a moment.</p>
                </div>
                <Button variant="outline" onClick={() => void modulesQuery.refetch()} data-testid="button-retry-guidelines">
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
              </CardContent>
            </Card>
          ) : modules.length === 0 ? (
            <Card className="border-dashed border-[#cbd8d1] bg-[#f5f8f4]" data-testid="state-guidelines-empty">
              <CardContent className="flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e3ece5] text-[#456653]">
                  <BookOpen className="h-7 w-7" />
                </div>
                <h3 className="font-semibold text-[#314a39]">Your shared reference starts here</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  {isAdmin ? "Create the first guideline or training module for your team." : "There are no guideline or training modules yet."}
                </p>
                {isAdmin && <Button className="mt-5 bg-[#315844] text-white hover:bg-[#274735]" onClick={openNewModule} data-testid="button-create-first-guideline">Create a module</Button>}
              </CardContent>
            </Card>
          ) : filteredModules.length === 0 ? (
            <Card className="border-dashed" data-testid="state-guidelines-no-results">
              <CardContent className="py-12 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                <p className="font-medium">No modules match that search</p>
                <p className="mt-1 text-sm text-muted-foreground">Try another phrase or switch the module type.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4" data-testid="list-guideline-modules">
              {filteredModules.map((module) => {
                const training = module.moduleType === "training";
                return (
                  <Card key={module.id} className="overflow-hidden border-border/80 shadow-[0_1px_2px_rgba(32,53,40,0.04)]" data-testid={`card-guideline-${module.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge className={training
                              ? "border border-[#d9c9a5] bg-[#f5f0e4] text-[#765e2d] hover:bg-[#f5f0e4]"
                              : "border border-[#c3d5c9] bg-[#eaf2ec] text-[#3e684e] hover:bg-[#eaf2ec]"}>
                              {training ? <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> : <BookOpen className="mr-1.5 h-3.5 w-3.5" />}
                              {training ? "Training" : "Guideline"}
                            </Badge>
                            {!!module.attachments?.length && (
                              <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                                <Paperclip className="h-3 w-3" /> {module.attachments.length}
                              </Badge>
                            )}
                          </div>
                          <h3 className="break-words text-lg font-semibold tracking-tight text-foreground sm:text-xl" data-testid={`text-guideline-title-${module.id}`}>
                            {module.title}
                          </h3>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            aria-label={`Edit ${module.title}`}
                            onClick={() => openEditModule(module)}
                            data-testid={`button-edit-guideline-${module.id}`}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Created by {module.authorName || "Unknown"}</span>
                        <span className="hidden text-border sm:inline" aria-hidden="true">/</span>
                        <span>{formatDate(module.createdAt)}</span>
                        {module.updatedAt && new Date(module.updatedAt).getTime() !== new Date(module.createdAt).getTime() && (
                          <span className="inline-flex items-center gap-1 text-[#52705d]" data-testid={`text-guideline-updated-${module.id}`}>
                            <Clock3 className="h-3 w-3" />
                            Updated {formatDate(module.updatedAt)}{module.updatedByName ? ` by ${module.updatedByName}` : ""}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85" data-testid={`text-guideline-body-${module.id}`}>{module.body}</p>
                      <ModuleAttachments attachments={module.attachments} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog open={editorOpen} onOpenChange={closeEditor}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" data-testid="dialog-guideline-editor"
          onEscapeKeyDown={event => { if (saveMutation.isPending) event.preventDefault(); }}
          onInteractOutside={event => { if (saveMutation.isPending) event.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>{draft.id === null ? "Create reference module" : "Edit reference module"}</DialogTitle>
            <DialogDescription>Create or update the instructions and supporting files staff can read on this board.</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-5" disabled={saveMutation.isPending} aria-busy={saveMutation.isPending}>
            {formError && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive" data-testid="text-guideline-form-error">
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="guideline-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="guideline-title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="A clear name people can find"
                maxLength={200}
                data-testid="input-guideline-title"
              />
              <p className="text-right text-xs text-muted-foreground">{draft.title.length}/200</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guideline-type">Module type</Label>
              <Select value={draft.moduleType} onValueChange={(value) => setDraft((current) => ({ ...current, moduleType: value as ModuleKind }))}>
                <SelectTrigger id="guideline-type" data-testid="select-guideline-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="guideline">Guideline</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guideline-body">Instructions <span className="text-destructive">*</span></Label>
              <Textarea
                id="guideline-body"
                value={draft.body}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Write the steps, details, and context the team needs..."
                rows={10}
                maxLength={100_000}
                className="resize-y leading-6"
                data-testid="input-guideline-body"
              />
              <p className="text-right text-xs text-muted-foreground">{draft.body.length.toLocaleString()}/100,000</p>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Attachments</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Up to 10 files, 10 MB each. Images, PDF, Office, CSV, or text.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={remainingAttachments >= MAX_FILES}
                  data-testid="button-guideline-attachment"
                >
                  <Paperclip className="mr-2 h-4 w-4" /> Add files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILE_TYPES}
                  className="sr-only"
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = "";
                  }}
                  data-testid="input-guideline-attachment"
                />
              </div>
              {(draft.retainedAttachments.length > 0 || draft.files.length > 0) && (
                <div className="space-y-1.5">
                  {draft.retainedAttachments.map((attachment, index) => {
                    const { name } = attachmentDetails(attachment);
                    return (
                      <div key={`retained-${attachment}-${index}`} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-sm" data-testid={`row-guideline-retained-file-${index}`}>
                        {fileIcon(name)}
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        <span className="text-xs text-muted-foreground">Saved</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${name}`}
                          onClick={() => setDraft((current) => ({ ...current, retainedAttachments: current.retainedAttachments.filter((_, fileIndex) => fileIndex !== index) }))}
                          data-testid={`button-remove-retained-file-${index}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                  {draft.files.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-sm" data-testid={`row-guideline-new-file-${index}`}>
                      {fileIcon(file.name)}
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setDraft((current) => ({ ...current, files: current.files.filter((_, fileIndex) => fileIndex !== index) }))}
                        data-testid={`button-remove-new-file-${index}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{remainingAttachments} of {MAX_FILES} attachments</p>
            </div>
          </fieldset>
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => closeEditor(false)} disabled={saveMutation.isPending} data-testid="button-cancel-guideline">Cancel</Button>
            <Button
              onClick={() => {
                if (draft.title.trim().length > 200) {
                  setFormError("The title must be 200 characters or fewer.");
                  return;
                }
                if (draft.body.trim().length > 100_000) {
                  setFormError("The instructions must be 100,000 characters or fewer.");
                  return;
                }
                setFormError("");
                saveMutation.mutate(draft);
              }}
              disabled={!canSave}
              className="bg-[#315844] text-white hover:bg-[#274735]"
              data-testid="button-submit-guideline"
            >
              {saveMutation.isPending ? "Saving…" : draft.id === null ? "Create module" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
