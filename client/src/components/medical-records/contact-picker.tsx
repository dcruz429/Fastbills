import { useMemo, useState } from "react";
import type { MedicalRecordContact } from "@shared/schema";
import { contactFields, applyMedicalContact, type MedicalRecordInput } from "@shared/medical-records";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const normalized = search.trim().toLocaleLowerCase();
  const results = useMemo(() => contacts.filter((contact) => !normalized ||
    contactFields.some((field) => contact[field].toLocaleLowerCase().includes(normalized))), [contacts, normalized]);
  const activeKey = contactFields.map((field) => draft[field]).join("|");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label="Choose saved contact details"
          className="h-9 w-full justify-between font-normal" data-testid="picker-medical-contact">
          <span className="flex min-w-0 items-center gap-2 truncate text-left">
            <ContactRound className="h-4 w-4 shrink-0 text-teal-700" />
            <span className="truncate">{draft.contactDetails || draft.contactPerson || "Choose saved contact (optional)"}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(34rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search organization, name, phone, email…" aria-label="Search saved contacts" />
          <CommandList>
            <CommandEmpty>No saved contact variants match.</CommandEmpty>
            <CommandGroup heading={`${results.length} saved contact${results.length === 1 ? "" : "s"}`}>
              {results.map((contact) => (
                <CommandItem key={contact.id} value={String(contact.id)} onSelect={() => {
                  onChange(applyMedicalContact(draft, Object.fromEntries(contactFields.map((field) => [field, contact[field]])) as Pick<MedicalRecordInput, typeof contactFields[number]>));
                  setOpen(false);
                  setSearch("");
                }} className="items-start gap-2 py-2.5">
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${activeKey === contactFields.map((field) => contact[field]).join("|") ? "opacity-100" : "opacity-0"}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{contactLabel(contact)}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[contact.contactPerson && `Contact: ${contact.contactPerson}`, contact.email && `Email: ${contact.email}`, contact.faxNumber && `Fax: ${contact.faxNumber}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
