export function cleanAmount(val: string): string {
  if (!val) return "";
  const negative = val.includes("(") && val.includes(")");
  const cleaned = val.replace(/[$,\s()]/g, "");
  return negative ? `-${cleaned}` : cleaned;
}

export function parseDateValue(val: string): string {
  if (!val) return "";
  const parts = val.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return val;
}

export function parseCsvText(
  text: string,
  columnMap: Record<string, string>,
  options?: { requirePatientName?: boolean }
): Record<string, string>[] {
  const requirePatientName = options?.requirePatientName !== false;
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const mappedHeaders = headers.map((h) => {
    const lower = h.toLowerCase().replace(/[_\-:]/g, " ").replace(/\s+/g, " ").trim();
    return columnMap[lower] || lower.replace(/\s+(.)/g, (_, c) => c.toUpperCase());
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.every((v) => !v)) continue;
    const row: Record<string, string> = {};
    mappedHeaders.forEach((key, idx) => {
      if (values[idx]) row[key] = values[idx];
    });
    if (row.lastName) {
      row.patientName = row.firstName
        ? `${row.lastName.trim()}, ${row.firstName.trim()}`
        : row.lastName.trim();
      delete row.lastName;
      delete row.firstName;
    }
    if (row.amount) row.amount = cleanAmount(row.amount);
    if (!requirePatientName || row.patientName) rows.push(row);
  }
  return rows;
}
