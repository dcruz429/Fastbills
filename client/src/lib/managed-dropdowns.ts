export function dropdownValues(options: { value: string }[] | undefined): string[] {
  return Array.from(new Set((options || []).map(option => option.value).filter(value => value.trim())));
}

// Retired/renamed options remain readable and selectable for historical records,
// without adding them back to the managed list for new records.
export function withStoredDropdownValues(options: string[], savedValues: (string | null | undefined)[]): string[] {
  return Array.from(new Set([...options, ...savedValues.filter((value): value is string => !!value)]));
}

export function moduleTypeLabel(value: string): string {
  if (value === "guideline") return "Guideline";
  if (value === "training") return "Training";
  return value;
}
