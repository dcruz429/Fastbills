import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, FileSearch, Search, X } from "lucide-react";
import {
  PATIENT_OVERVIEW_SECTIONS,
  type PatientOverviewRecord,
  type PatientOverviewResponse,
  type PatientOverviewSection,
  patientSearchTokens,
} from "@shared/patient-overview";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PatientOverviewTotals } from "@/components/patient-overview-totals";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type SelectedRecord = { record: PatientOverviewRecord; section: PatientOverviewSection } | null;

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function PatientRecordDetails({ selected, onClose }: { selected: SelectedRecord; onClose: () => void }) {
  const record = selected?.record;
  const section = selected?.section;

  return (
    <Dialog open={!!selected} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        {record && section && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-start justify-between gap-3 pr-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{section.label} · Record {record.id}</p>
                  <DialogTitle className="mt-1 text-2xl">{record.patientName}</DialogTitle>
                   <DialogDescription>Read-only details from {section.label}. Editing permissions are unchanged.</DialogDescription>
                  <p className="mt-1 text-sm text-muted-foreground">{record.clinic || "Clinic not recorded"}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={record.state === "open" ? "default" : "secondary"}>{record.state === "open" ? "Open" : "Done"}</Badge>
                  <Badge variant="outline">{record.status}</Badge>
                </div>
              </div>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Source tracker", section.label],
                ["Record ID", String(record.id)],
                ["Patient", record.patientName],
                ["Clinic", record.clinic],
                ["Insurance", record.insurance],
                ["Assigned to", record.assignedTo],
                ["Status", record.status],
                ["Bucket", record.state === "open" ? "Open" : "Done"],
                ["Outcome", record.outcome],
                ["Date", record.date ? formatDate(record.date) : null],
                [section.hasAmounts ? "Amount" : "Amount field", section.hasAmounts ? (record.amount || "—") : "No amount field"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-muted/30 px-3.5 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 break-words text-sm font-medium">{value || "—"}</p>
                </div>
              ))}
            </div>
            {record.details.length > 0 && (
              <section className="mt-1">
                <h3 className="mb-2 text-sm font-semibold">Original tracker details</h3>
                <div className="divide-y rounded-lg border">
                  {record.details.map((detail, index) => (
                    <div key={`${detail.label}-${index}`} className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[minmax(120px,0.8fr)_2fr]">
                      <span className="text-xs font-medium text-muted-foreground">{detail.label}</span>
                      <span className="whitespace-pre-wrap break-words text-sm">{detail.value || "—"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              {record.sourceUrl && (
                <Button asChild variant="outline">
                  <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Open in {section.label}
                  </a>
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionSummary({ section }: { section: PatientOverviewSection }) {
  const openCount = section.records.filter((record) => record.state === "open").length;
  const doneCount = section.records.filter((record) => record.state === "done").length;
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span><strong className="text-foreground">{openCount}</strong> Open</span>
      <span><strong className="text-foreground">{doneCount}</strong> Done</span>
      {!section.hasAmounts && <span>No amount field</span>}
    </span>
  );
}

function TrackerSection({ section, open, onToggle, onSelect, userRole }: {
  section: PatientOverviewSection;
  open: boolean;
  onToggle: () => void;
  onSelect: (record: PatientOverviewRecord, section: PatientOverviewSection) => void;
  userRole: string | undefined;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm" data-testid={`patient-section-${section.id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileSearch className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{section.label}</span>
          <span className="mt-1 block"><SectionSummary section={section} /></span>
        </span>
        <Badge variant="outline" className="hidden sm:inline-flex">{section.records.length} records</Badge>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t">
           <div className="px-4 py-3 sm:px-5">
             <PatientOverviewTotals totals={section.totals} userRole={userRole} hasAmounts={section.hasAmounts} testId={`patient-section-total-${section.id}`} />
           </div>
          {section.records.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium">No matching records in {section.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">This tracker was checked for the submitted name.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="bg-muted/45 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Patient / clinic</th>
                    <th className="px-4 py-3 font-semibold">Insurance</th>
                    <th className="px-4 py-3 font-semibold">State / status</th>
                    <th className="px-4 py-3 font-semibold">Assigned to</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 text-right font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {section.records.map((record) => (
                    <tr key={record.id} className="transition-colors hover:bg-muted/25" data-testid={`patient-record-${section.id}-${record.id}`}>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onSelect(record, section)} className="text-left font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">{record.patientName}</button>
                        <p className="mt-0.5 text-xs text-muted-foreground">{record.clinic || "Clinic not recorded"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{record.insurance || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={record.state === "open" ? "default" : "secondary"} className="text-[10px]">{record.state === "open" ? "Open" : "Done"}</Badge>
                          <Badge variant="outline" className="max-w-[170px] truncate text-[10px]">{record.status}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{record.assignedTo || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(record.date)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {section.hasAmounts ? (record.amount || "—") : <span className="text-muted-foreground">No amount field</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => onSelect(record, section)} className="h-8">View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function PatientOverviewPage() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<SelectedRecord>(null);
  const tokens = patientSearchTokens(input.trim());
  const meaningfulLength = tokens.join("").length;
  const validSearch = meaningfulLength >= 2 && input.trim().length <= 100;

  const query = useQuery<PatientOverviewResponse, Error>({
    queryKey: ["patient-overview", user?.id, user?.role, submittedSearch],
    enabled: !!user && submittedSearch.length > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/patient-overview?search=${encodeURIComponent(submittedSearch)}`, {
        signal,
        credentials: "include",
      });
      if (!response.ok) {
        const message = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${message}`);
      }
      return response.json() as Promise<PatientOverviewResponse>;
    },
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validSearch) return;
    const next = input.trim();
    setSelected(null);
    setSubmittedSearch(next);
    if (next === submittedSearch) void query.refetch();
    setExpandedSections(Object.fromEntries(PATIENT_OVERVIEW_SECTIONS.map((section) => [section.id, true])));
  }

  function clearSearch() {
    setInput("");
    setSubmittedSearch("");
    setSelected(null);
    setExpandedSections({});
  }

  const response = submittedSearch && !query.isError && query.data?.query === submittedSearch ? query.data : undefined;

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-muted/20 p-4 sm:p-6 lg:p-8" data-testid="page-patient-overview">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end lg:px-9 lg:py-8">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <span className="h-px w-6 bg-primary" /> Patient workflow
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-patient-overview-title">Patient Overview</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Look across all seven trackers for records associated with a patient name. Results can include multiple people; confirm the patient and clinic on each record.</p>
            </div>
            <div className="hidden h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary lg:flex">
              <FileSearch className="h-9 w-9" strokeWidth={1.5} />
            </div>
            <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row lg:col-span-2" role="search">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value.slice(0, 100))}
                  maxLength={100}
                  placeholder="Search by patient name…"
                  aria-label="Search patient name"
                  className="h-12 pl-10"
                  data-testid="input-patient-search"
                />
              </div>
              {submittedSearch && (
                <Button type="button" variant="outline" className="h-12" onClick={clearSearch} data-testid="button-clear-patient-search">
                  <X className="mr-2 h-4 w-4" /> Clear
                </Button>
              )}
              <Button type="submit" className="h-12 px-6" disabled={!validSearch || query.isFetching} data-testid="button-submit-patient-search">
                {query.isFetching ? "Searching…" : "Search trackers"}
              </Button>
            </form>
            <div className="flex justify-between text-xs text-muted-foreground sm:col-span-2">
              <span>Enter at least 2 letters or numbers · up to 100 characters</span>
              <span>{input.length}/100</span>
            </div>
          </div>
        </div>

        {!submittedSearch && (
          <div className="rounded-xl border border-dashed bg-card px-5 py-12 text-center sm:py-16" data-testid="patient-overview-initial">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Search className="h-5 w-5" /></span>
            <h2 className="mt-4 text-lg font-semibold">Start with a patient name</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">A submitted search checks Verification, Billing, Posting, Collections, Denials, Arbitration, and Checks. No patient records are shown until you search.</p>
          </div>
        )}

        {submittedSearch && query.isLoading && (
          <div className="space-y-3" aria-label="Loading patient overview">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-[74px] w-full rounded-xl" />)}
          </div>
        )}

        {submittedSearch && query.isError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
            <h2 className="font-semibold">Couldn’t load patient records</h2>
            <p className="mt-1 text-sm text-muted-foreground">{query.error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching} data-testid="button-retry-patient-search">
              {query.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </div>
        )}

        {response && (
          <>
            <div className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="text-sm font-semibold">Results for “{response.query}”</p>
                <p className="mt-1 text-xs text-muted-foreground">Patient names and clinics are shown per record. Open and Done buckets are both included.</p>
              </div>
              <PatientOverviewTotals totals={response.totals} userRole={user?.role} />
            </div>
            <p className="mb-4 rounded-lg border-l-2 border-primary/50 bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
              Amounts total only records with an amount field. Verification and Billing contribute record counts but have no amounts. Tracker amounts may repeat the same balance across workflows; these totals are not patient debt or cash totals.
            </p>
            <div className="space-y-3">
              {response.sections.map((section) => {
                return (
                  <TrackerSection
                    key={section.id}
                    section={section}
                      userRole={user?.role}
                    open={expandedSections[section.id] ?? true}
                    onToggle={() => setExpandedSections((current) => ({ ...current, [section.id]: !(current[section.id] ?? true) }))}
                    onSelect={(record, selectedSection) => setSelected({ record, section: selectedSection })}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
      <PatientRecordDetails selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
