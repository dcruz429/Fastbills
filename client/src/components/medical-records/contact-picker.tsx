import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MedicalRecordContact } from "@shared/schema";
import { contactFields, applyMedicalContact, type MedicalRecordInput } from "@shared/medical-records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, ContactRound } from "lucide-react";

function contactLabel(contact: MedicalRecordContact) {
  return [contact.contactDetails, contact.contactPerson, contact.contactNumber, contact.email, contact.faxNumber]
    .filter(Boolean).join(" · ") || "Contact details";
}

export function MedicalContactPicker({
  contacts,
  draft,
  onChange,
}: {
  contacts: MedicalRecordContact[];
  draft: MedicalRecordInput;
  onChange: (next: MedicalRecordInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const normalized = search.trim().toLocaleLowerCase();
  const results = useMemo(() => contacts.filter((contact) => !normalized ||
    contactFields.some((field) => contact[field].toLocaleLowerCase().includes(normalized))), [contacts, normalized]);
  const highlighted = Math.min(activeIndex, Math.max(0, results.length - 1));

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-option-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, normalized]);

  function close() {
    setOpen(false);
    setSearch("");
    setActiveIndex(0);
    triggerRef.current?.focus();
  }

  function select(contact: MedicalRecordContact) {
    onChange(applyMedicalContact(draft, contact));
    close();
  }

  return (
    <div className="space-y-2" data-medical-contact-picker-open={open ? "" : undefined}
      onKeyDown={event => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}>
        <Button ref={triggerRef} type="button" variant="outline" aria-haspopup="listbox" aria-controls={open ? listId : undefined}
          aria-expanded={open} aria-label="Choose saved contact details"
          onClick={() => { if (open) close(); else setOpen(true); }}
          className="h-9 w-full justify-between font-normal" data-testid="picker-medical-contact">
          <span className="flex min-w-0 items-center gap-2 truncate text-left">
            <ContactRound className="h-4 w-4 shrink-0 text-teal-700" />
            <span className="truncate">{draft.contactDetails || draft.contactPerson || "Choose saved contact (optional)"}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      {open && (
        <div className="rounded-md border bg-popover p-2 text-popover-foreground shadow-sm" data-testid="dropdown-medical-contact">
          <Input ref={searchRef} value={search} role="combobox" aria-expanded={open} aria-autocomplete="list"
            aria-controls={listId} aria-activedescendant={results.length ? `${listId}-${results[highlighted].id}` : undefined}
            onChange={event => { setSearch(event.target.value); setActiveIndex(0); }}
            onKeyDown={event => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(Math.max(0, Math.min(results.length - 1, highlighted + (event.key === "ArrowDown" ? 1 : -1))));
              } else if (event.key === "Enter") {
                // Searching/selecting must never submit the surrounding request form.
                event.preventDefault();
                if (results[highlighted]) select(results[highlighted]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
            placeholder="Search organization, person, phone, email or fax…" aria-label="Search saved contacts"
            autoComplete="off" data-testid="input-medical-contact-search" />
          <p className="px-1 py-2 text-xs text-muted-foreground" role="status">
            {results.length} saved contact{results.length === 1 ? "" : "s"}
          </p>
          <div ref={listRef} id={listId} role="listbox" aria-label="Saved contact details"
            className="max-h-64 overflow-y-auto overscroll-contain" data-testid="list-medical-contact-options">
            {!results.length && <p className="px-2 py-3 text-sm text-muted-foreground">
              No saved contacts match. Enter new details in the fields below.
            </p>}
              {results.map((contact, index) => (
                <Button type="button" variant="ghost" role="option" tabIndex={-1} key={contact.id}
                  id={`${listId}-${contact.id}`} data-option-index={index} data-testid={`option-medical-contact-${contact.id}`}
                  aria-selected={contactFields.every(field => draft[field] === contact[field])}
                  onClick={() => select(contact)}
                  className={`h-auto w-full items-start justify-start gap-2 whitespace-normal px-2 py-2.5 text-left font-normal ${index === highlighted ? "bg-accent text-accent-foreground" : ""}`}>
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${contactFields.every(field => draft[field] === contact[field]) ? "opacity-100" : "opacity-0"}`} />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium">{contactLabel(contact)}</span>
                    <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                      {[contact.contactPerson && `Contact: ${contact.contactPerson}`, contact.email && `Email: ${contact.email}`, contact.faxNumber && `Fax: ${contact.faxNumber}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
