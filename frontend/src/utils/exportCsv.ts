/**
 * Tiny CSV-export helper. Browsers handle `<a download>` natively;
 * we just compose the CSV text + trigger the download. No deps.
 *
 * RFC 4180 quoting: wrap any cell that contains comma / quote /
 * newline in double quotes, and double-up any embedded quotes.
 */

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

/**
 * Serialize an array of objects to a CSV string. Column order is taken
 * from `columns` (object keys → header label). Skipping a key omits
 * that column even if present in the rows.
 */
export const toCsv = <T>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string => {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(','))
    .join('\r\n');
  return `${header}\r\n${body}`;
};

/**
 * Trigger a CSV download in the user’s browser. `filename` should
 * include the `.csv` extension. Uses an in-memory blob URL — cleaned
 * up by the browser when the page unloads.
 */
export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  // BOM (﻿) makes Excel open as UTF-8 instead of mangling unicode.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};
