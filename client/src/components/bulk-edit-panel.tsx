import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, X } from "lucide-react";

export type BulkField = {
  value: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: string[];
};

type Props = {
  selectedCount: number;
  fields: BulkField[];
  isPending: boolean;
  onApply: (field: string, value: any) => void;
  onClear: () => void;
  testIdPrefix?: string;
};

export function BulkEditPanel({ selectedCount, fields, isPending, onApply, onClear, testIdPrefix = "bulk" }: Props) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");

  const current = fields.find(f => f.value === field);

  const handleOpen = () => {
    setField("");
    setValue("");
    setOpen(true);
  };

  const handleApply = () => {
    if (!field) return;
    const sent = value === "__clear__" ? null : (value === "" ? null : value);
    onApply(field, sent);
    setOpen(false);
    setField("");
    setValue("");
  };

  return (
    <>
      {selectedCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/20" data-testid={`${testIdPrefix}-toolbar`}>
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {selectedCount} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="default" onClick={handleOpen} data-testid={`button-${testIdPrefix}-edit`}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Bulk Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear} data-testid={`button-${testIdPrefix}-clear`}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid={`dialog-${testIdPrefix}-edit`}>
          <DialogHeader>
            <DialogTitle>Bulk Edit {selectedCount} record{selectedCount !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Column to update</Label>
              <Select value={field} onValueChange={(v) => { setField(v); setValue(""); }}>
                <SelectTrigger data-testid={`select-${testIdPrefix}-field`}>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {current && (
              <div>
                <Label className="text-xs">New value</Label>
                {current.type === "select" ? (
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger data-testid={`select-${testIdPrefix}-value`}>
                      <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">(Clear)</SelectItem>
                      {(current.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : current.type === "date" ? (
                  <Input type="date" value={value} onChange={e => setValue(e.target.value)} data-testid={`input-${testIdPrefix}-value`} />
                ) : current.type === "number" ? (
                  <Input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="(blank to clear)" data-testid={`input-${testIdPrefix}-value`} />
                ) : (
                  <Input value={value} onChange={e => setValue(e.target.value)} placeholder="(blank to clear)" data-testid={`input-${testIdPrefix}-value`} />
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  This value will overwrite the existing {current.label} on all {selectedCount} selected record{selectedCount !== 1 ? "s" : ""}.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid={`button-${testIdPrefix}-cancel`}>Cancel</Button>
            <Button onClick={handleApply} disabled={!field || isPending} data-testid={`button-${testIdPrefix}-apply`}>
              {isPending ? "Applying..." : `Apply to ${selectedCount} record${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
