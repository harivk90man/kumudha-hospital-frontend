/**
 * Tiny client-side CSV exporter — owners frequently want today's
 * payments / invoices as a spreadsheet for their accountant. No
 * server round-trip and no new dependency: build a CSV string,
 * stuff it into a Blob, drop it via a hidden anchor.
 *
 * Quoting follows RFC 4180: any cell containing a comma, quote, or
 * newline is wrapped in double quotes, and embedded quotes are
 * doubled.
 */
export type CsvRow = Record<string, string | number | null | undefined>;

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, rows: CsvRow[]): void {
  if (rows.length === 0) {
    // Still emit an empty file so the user gets feedback that the
    // export ran — better than silent no-op.
    triggerDownload(filename, '');
    return;
  }
  const headers = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCell(r[h])).join(','));
  }
  triggerDownload(filename, lines.join('\r\n'));
}

function triggerDownload(filename: string, body: string): void {
  // BOM keeps Excel happy with non-ASCII (₹, é, etc.).
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
