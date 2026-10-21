import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import type { MedicalRecordContact, MedicalRecordRequest, MedicalRecordTab } from "@shared/schema";
import { medicalRecordFields, type MedicalRecordInput } from "@shared/medical-records";
import { MedicalRequestEditor } from "@/components/medical-records/request-editor";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, Plus, RefreshCw, Search, Pencil, Trash2, ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";

const QUERY_KEY = ["/api/medical-records"];
const WORKBOOK_TABS = ["URGENT", "HW", "GC", "MV", "AN", "CA", "RH", "EL", "SB", "MA", "QB", "HA", "JA", "No Foud", "BX", "AA", "AKNY", "FM"];
const PAGE_SIZE = 50;

type MedicalRecordsResponse = {
  tabs: MedicalRecordTab[];
  requests: MedicalRecordRequest[];
  contacts: MedicalRecordContact[];
  importSummary: { requestCount: number; importedAt: string } | null;
};

function statusBadge(status: string) {
  const style = status === "completed"
    ? "border-[#b9ddd5] bg-[#e9f5f1] text-[#28695a]"
    : status === "sent" ? "border-[#c4d9ea] bg-[#edf4fa] text-[#315f7e]"
      : "border-[#e7d9ad] bg-[#faf5e6] text-[#806b30]";
  return <Badge variant="outline" className={`font-medium capitalize ${style}`}>{status || "pending"}</Badge>;
}

function safeCsv(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function MedicalRecordsRequestPage() {
  const { user } = useAuth();
  const [tabFilter, setTabFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MedicalRecordRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MedicalRecordRequest | null>(null);
  const recordsQuery = useQuery<MedicalRecordsResponse>({
    queryKey: QUERY_KEY, staleTime: 30_000, refetchOnWindowFocus: true, refetchInterval: 60_000,
  });
  const records = recordsQuery.data?.requests || [];
  const tabs = useMemo(() => {
    const serverTabs = recordsQuery.data?.tabs || [];
    return [...serverTabs].sort((a, b) => {
      const aOrder = WORKBOOK_TABS.indexOf(a.name);
      const bOrder = WORKBOOK_TABS.indexOf(b.name);
      if (aOrder !== -1 && bOrder !== -1) return aOrder - bOrder;
      if (aOrder !== -1) return -1;
      if (bOrder !== -1) return 1;
      return a.sortOrder - b.sortOrder;
    });
  }, [recordsQuery.data?.tabs]);
  const contacts = recordsQuery.data?.contacts || [];
  const canDelete = user?.role === "admin";

  const createMutation = useMutation({
    mutationFn: async (data: MedicalRecordInput) => (await apiRequest("POST", "/api/medical-records", data)).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setEditorOpen(false);
      setEditing(null);
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: MedicalRecordInput }) => (await apiRequest("PATCH", `/api/medical-records/${id}`, data)).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setEditorOpen(false);
      setEditing(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/medical-records/${id}`)).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDeleteTarget(null);
    },
  });

  const statusCounts = useMemo(() => ({
    pending: records.filter((request) => request.status === "pending").length,
    sent: records.filter((request) => request.status === "sent").length,
    completed: records.filter((request) => request.status === "completed").length,
  }), [records]);
  const countsByTab = useMemo(() => {
    const counts = new Map<number, number>();
    records.forEach((request) => counts.set(request.tabId, (counts.get(request.tabId) || 0) + 1));
    return counts;
  }, [records]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return records.filter((request) => {
      if (tabFilter !== "all" && request.tabId !== Number(tabFilter)) return false;
      if (statusFilter !== "all" && request.status !== statusFilter) return false;
      return !normalized || Object.values(request).some((value) => value != null && String(value).toLocaleLowerCase().includes(normalized));
    });
  }, [records, tabFilter, statusFilter, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const startIndex = filtered.length ? currentPage * PAGE_SIZE + 1 : 0;
  const endIndex = Math.min((currentPage + 1) * PAGE_SIZE, filtered.length);

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(0);
  }
  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(request: MedicalRecordRequest) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(request);
    setEditorOpen(true);
  }
  function saveRequest(data: MedicalRecordInput) {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  }
  function exportCsv() {
    const headers = [...medicalRecordFields.map((field) => field.label), "Status", "Workbook tab", "Source sheet", "Source row"];
    const lines = [headers.map(safeCsv).join(",")];
    for (const request of filtered) {
      const tabName = tabs.find((tab) => tab.id === request.tabId)?.name || "";
      lines.push([
        ...medicalRecordFields.map(({ key }) => request[key]),
        request.status, tabName, request.sourceSheet || "", request.sourceRow || "",
      ].map(safeCsv).join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "medical-record-requests.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!user) return <Redirect to="/" />;

  return (
    <main className="min-h-[100dvh] bg-[#f3f7f8] p-3 text-[#213947] sm:p-5 lg:p-6" data-testid="page-medical-records">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <header className="flex flex-col gap-4 rounded-lg border border-[#cfdee3] bg-[#e8f1f3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#d3e8eb] text-[#176b87]"><ClipboardList className="h-5 w-5" /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#49717e]">Operations · Workbook tracker</p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[#203e4b] sm:text-2xl" data-testid="text-medical-records-title">Medical Records Request</h1>
              <p className="mt-1 text-sm text-[#59727b]">One working view of requests across every clinic sheet.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0} data-testid="button-export-medical-csv">
              <Download className="mr-2 h-4 w-4" /> Export CSV <span className="ml-1 text-xs text-muted-foreground">({filtered.length})</span>
            </Button>
            <Button onClick={openCreate} disabled={recordsQuery.isLoading || recordsQuery.isError || tabs.length === 0} className="bg-[#176b87] text-white hover:bg-[#12586f]" data-testid="button-create-medical-request"><Plus className="mr-2 h-4 w-4" /> New request</Button>
          </div>
        </header>

        {!recordsQuery.isLoading && !recordsQuery.isError && (
          <section aria-label="Request summary" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-[#cfdee3] bg-white px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-[#71868d]">All requests</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{records.length}</p></div>
            <div className="rounded-md border border-[#e7d9ad] bg-[#fffdf7] px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-[#897746]">Pending</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-[#806b30]">{statusCounts.pending}</p></div>
            <div className="rounded-md border border-[#c4d9ea] bg-[#f8fbfe] px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-[#68849a]">Sent</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-[#315f7e]">{statusCounts.sent}</p></div>
            <div className="rounded-md border border-[#b9ddd5] bg-[#f8fcfa] px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-[#5e897d]">Completed</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-[#28695a]">{statusCounts.completed}</p></div>
          </section>
        )}
        {!recordsQuery.isLoading && !recordsQuery.isError && recordsQuery.data?.importSummary && (
          <p className="text-xs text-[#71868d]" data-testid="text-medical-import-summary">
            Workbook import: {recordsQuery.data.importSummary.requestCount} source rows
            {recordsQuery.data.importSummary.importedAt ? ` · last loaded ${new Date(recordsQuery.data.importSummary.importedAt).toLocaleDateString()}` : ""}
          </p>
        )}

        <section className="overflow-hidden rounded-lg border border-[#d3e0e4] bg-white shadow-[0_1px_2px_rgba(27,66,82,0.04)]" aria-label="Medical records request table">
          <div className="border-b border-[#dce6e9] bg-[#f8fbfc] px-3 pt-2 sm:px-4">
            <div className="flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Workbook tabs" data-testid="tabs-medical-records">
              <button type="button" role="tab" aria-selected={tabFilter === "all"} onClick={() => changeFilter(setTabFilter, "all")}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tabFilter === "all" ? "bg-[#176b87] text-white" : "text-[#56717b] hover:bg-[#e8f1f3]"}`} data-testid="tab-medical-all">
                All tabs <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${tabFilter === "all" ? "bg-white/15" : "bg-[#e8eff1]"}`}>{records.length}</span>
              </button>
              {tabs.map((tab) => (
                <button type="button" key={tab.id} role="tab" aria-selected={tabFilter === String(tab.id)} onClick={() => changeFilter(setTabFilter, String(tab.id))}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tabFilter === String(tab.id) ? "bg-[#176b87] text-white" : "text-[#56717b] hover:bg-[#e8f1f3]"}`} data-testid={`tab-medical-${tab.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}>
                  {tab.name}<span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${tabFilter === String(tab.id) ? "bg-white/15" : "bg-[#e8eff1]"}`}>{countsByTab.get(tab.id) || 0}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 border-b border-[#e3eaec] p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#80949a]" />
              <Input value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} placeholder="Search all request fields…" className="h-9 border-[#d5e1e4] pl-9" aria-label="Search all medical request fields" data-testid="input-medical-search" />
            </div>
            <Select value={statusFilter} onValueChange={(value) => changeFilter(setStatusFilter, value)}>
              <SelectTrigger className="h-9 w-full border-[#d5e1e4] sm:w-40" aria-label="Filter by request status" data-testid="select-medical-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
            </Select>
            <p className="shrink-0 text-xs text-[#71868d]" data-testid="text-medical-filter-count">{filtered.length} matching {filtered.length === 1 ? "request" : "requests"}</p>
          </div>

          {recordsQuery.isLoading ? (
            <div className="space-y-2 p-4" data-testid="state-medical-loading" aria-label="Loading medical requests">
              {[0, 1, 2, 3].map((line) => <Skeleton key={line} className="h-10 w-full" />)}
            </div>
          ) : recordsQuery.isError ? (
            <Card className="m-4 border-[#e2c8c1] bg-[#fff9f7]" data-testid="state-medical-error"><CardContent className="flex flex-col items-start justify-between gap-4 py-6 sm:flex-row sm:items-center">
              <div><p className="font-medium text-[#75483e]">Medical requests could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p></div>
              <Button variant="outline" onClick={() => void recordsQuery.refetch()} data-testid="button-retry-medical"><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button>
            </CardContent></Card>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-14 text-center" data-testid="state-medical-empty">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#e8f1f3] text-[#176b87]"><FileSpreadsheet className="h-6 w-6" /></div>
              <h2 className="font-semibold text-[#294956]">The workbook is ready</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">No requests are available yet. Add a request to start tracking records across clinic tabs.</p>
              <Button onClick={openCreate} className="mt-4 bg-[#176b87] text-white hover:bg-[#12586f]" data-testid="button-create-first-medical"><Plus className="mr-2 h-4 w-4" /> New request</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center" data-testid="state-medical-no-results"><Search className="mx-auto mb-3 h-7 w-7 text-[#8da0a6]" /><p className="font-medium">No matching requests</p><p className="mt-1 text-sm text-muted-foreground">Change the search or filters to see more records.</p></div>
          ) : (
            <>
              <div className="max-h-[min(62dvh,760px)] overflow-auto" data-testid="table-medical-scroll">
                <table className="w-max min-w-full border-separate border-spacing-0 text-left text-xs" data-testid="table-medical-records">
                  <thead className="sticky top-0 z-20">
                    <tr>{medicalRecordFields.map(({ key, label }, index) => <th key={key} scope="col" className={`whitespace-nowrap border-b border-r border-[#d5e1e4] bg-[#edf4f6] px-3 py-2.5 font-semibold text-[#49616a] ${index === 2 ? "sticky left-0 z-30 min-w-[190px] bg-[#e5eff2]" : "min-w-[130px]"}`}>{label}</th>)}
                      <th scope="col" className="min-w-[105px] whitespace-nowrap border-b border-r border-[#d5e1e4] bg-[#edf4f6] px-3 py-2.5 font-semibold text-[#49616a]">Status</th>
                      <th scope="col" className="sticky right-0 z-30 min-w-[98px] border-b border-[#d5e1e4] bg-[#edf4f6] px-2 py-2.5 text-right font-semibold text-[#49616a]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((request) => <tr key={request.id} className="group hover:bg-[#f5fafb]" data-testid={`row-medical-${request.id}`}>
                      {medicalRecordFields.map(({ key }, index) => <td key={key} title={request[key]} className={`max-w-[260px] whitespace-nowrap border-b border-r border-[#edf1f2] px-3 py-2.5 text-[#435a63] ${index === 2 ? "sticky left-0 z-10 min-w-[190px] bg-white font-medium text-[#243f49] group-hover:bg-[#f5fafb]" : ""}`}>
                        <span className="block max-w-[240px] truncate">{request[key] || <span className="text-[#b5c0c4]">—</span>}</span>
                      </td>)}
                      <td className="border-b border-r border-[#edf1f2] px-3 py-2.5">{statusBadge(request.status)}</td>
                      <td className="sticky right-0 border-b border-[#edf1f2] bg-white px-2 py-1.5 text-right group-hover:bg-[#f5fafb]">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-[#51727e] hover:text-[#176b87]" aria-label={`Edit ${request.patientName || "request"}`} onClick={() => openEdit(request)} data-testid={`button-edit-medical-${request.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                          {canDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-[#98716c] hover:text-destructive" aria-label={`Delete ${request.patientName || "request"}`} onClick={() => setDeleteTarget(request)} data-testid={`button-delete-medical-${request.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <footer className="flex flex-col gap-2 border-t border-[#e3eaec] bg-[#fbfcfc] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <p className="text-xs text-[#71868d]" data-testid="text-medical-pagination">{startIndex}–{endIndex} of {filtered.length} matching requests · 50 rows per page</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0} data-testid="button-medical-previous"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
                  <span className="min-w-16 text-center text-xs tabular-nums text-[#71868d]">Page {currentPage + 1} of {pageCount}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))} disabled={currentPage + 1 >= pageCount} data-testid="button-medical-next">Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <MedicalRequestEditor open={editorOpen} onOpenChange={setEditorOpen} tabs={tabs} contacts={contacts} userName={user.fullName}
        initialTabId={tabFilter === "all" ? tabs[0]?.id || 0 : Number(tabFilter)}
        request={editing} onSave={saveRequest} saving={createMutation.isPending || updateMutation.isPending}
        saveError={createMutation.error?.message || updateMutation.error?.message || ""} />
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent data-testid="dialog-delete-medical-confirm">
          <AlertDialogHeader><AlertDialogTitle>Delete this medical records request?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the request for <strong>{deleteTarget?.patientName || "this patient"}</strong>. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && <p role="alert" className="text-sm text-destructive" data-testid="text-medical-delete-error">{deleteMutation.error.message || "The request could not be deleted. Try again."}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete-medical">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-medical">{deleteMutation.isPending ? "Deleting…" : "Delete request"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
