import { useEffect, useState, type FormEvent } from "react";
import type { MedicalRecordContact, MedicalRecordRequest, MedicalRecordTab } from "@shared/schema";
import { emptyMedicalRecord, medicalRecordDraft, medicalRecordFields, medicalRecordStatuses, type MedicalRecordInput } from "@shared/medical-records";
import { MedicalContactPicker } from "@/components/medical-records/contact-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Save } from "lucide-react";

const contactKeys = new Set(["contactPerson", "contactDetails", "contactNumber", "email", "faxNumber"]);
const multilineKeys = new Set(["notes"]);

function easternToday() {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date());
}

export function MedicalRequestEditor({
  open, onOpenChange, tabs, contacts, userName, request, onSave, saving,
  saveError, initialTabId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: MedicalRecordTab[];
  contacts: MedicalRecordContact[];
  userName: string;
  request: MedicalRecordRequest | null;
  onSave: (draft: MedicalRecordInput) => void;
  saving: boolean;
  saveError?: string;
  initialTabId: number;
}) {
  const [draft, setDraft] = useState<MedicalRecordInput>(() => emptyMedicalRecord(initialTabId, easternToday(), userName));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (request) {
      setDraft(medicalRecordDraft(request));
    } else {
      setDraft(emptyMedicalRecord(initialTabId, easternToday(), userName));
    }
    setError("");
  }, [open, request, initialTabId, userName]);

  function update<K extends keyof MedicalRecordInput>(key: K, value: MedicalRecordInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request && !draft.patientName.trim()) {
      setError("Patient name is required for a new request.");
      return;
    }
    if (!draft.tabId) {
      setError("Choose a workbook tab.");
      return;
    }
    setError("");
    onSave(draft);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-4xl" data-testid="dialog-medical-record-editor"
        onEscapeKeyDown={(event) => {
          // Radix handles Escape in the capture phase, before the picker's
          // own key handler. Let that handler close the dropdown, not the form.
          const target = event.target as HTMLElement | null;
          if (saving || target?.closest?.("[data-medical-contact-picker-open]")) event.preventDefault();
        }}
        onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{request ? "Edit medical records request" : "New medical records request"}</DialogTitle>
          <DialogDescription>Workbook values are kept as text. Dates may include ranges, annotations, or historical typos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {(error || saveError) && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive" data-testid="text-medical-form-error"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error || saveError}</div>}
          {request?.sourceSheet && <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground" data-testid="text-medical-provenance">Imported from {request.sourceSheet}{request.sourceRow ? ` · source row ${request.sourceRow}` : ""}. Editing will not change its source reference.</p>}
          <fieldset disabled={saving} className="space-y-5" aria-busy={saving}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mr-tab">Workbook tab</Label>
                <Select value={String(draft.tabId)} onValueChange={(value) => update("tabId", Number(value))}>
                  <SelectTrigger id="mr-tab" data-testid="select-medical-tab"><SelectValue placeholder="Select tab" /></SelectTrigger>
                  <SelectContent>{tabs.map((tab) => <SelectItem key={tab.id} value={String(tab.id)}>{tab.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mr-status">Request status</Label>
                <Select value={draft.status} onValueChange={(value) => update("status", value as MedicalRecordInput["status"])}>
                  <SelectTrigger id="mr-status" data-testid="select-medical-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{medicalRecordStatuses.map((status) => <SelectItem key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              {medicalRecordFields.map(({ key, label }) => {
                const isContactDetails = key === "contactDetails";
                return (
                  <div key={key} className={`space-y-1.5 ${key === "notes" ? "sm:col-span-2" : ""}`}>
                    <Label htmlFor={`mr-${key}`}>{label}{key === "patientName" && !request && <span className="ml-1 text-destructive">*</span>}</Label>
                    {isContactDetails && <MedicalContactPicker contacts={contacts} draft={draft} onChange={setDraft} />}
                    {multilineKeys.has(key) ? (
                      <Textarea id={`mr-${key}`} value={draft[key]} onChange={(event) => update(key, event.target.value)} maxLength={20_000} rows={3} className="resize-y" data-testid={`input-medical-${key}`} />
                    ) : (
                      <Input id={`mr-${key}`} value={draft[key]} onChange={(event) => update(key, event.target.value)} maxLength={20_000} placeholder={["todayDate", "requestReceived", "requestSent"].includes(key) ? "MM/DD/YYYY or original date note" : undefined} required={key === "patientName" && !request} autoComplete="off" data-testid={`input-medical-${key}`} />
                    )}
                    {isContactDetails && <p className="text-xs leading-5 text-muted-foreground">Choose a saved variant or enter new details. Newly entered contact details are saved for reuse when this request saves.</p>}
                    {contactKeys.has(key) && key !== "contactDetails" && <span className="sr-only">Editable text; selecting a saved contact can replace this value.</span>}
                  </div>
                );
              })}
            </div>
          </fieldset>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving} data-testid="button-cancel-medical">Cancel</Button>
            <Button type="submit" disabled={saving || !draft.tabId} className="bg-[#176b87] text-white hover:bg-[#12586f]" data-testid="button-save-medical">
              <Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : request ? "Save changes" : "Create request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
