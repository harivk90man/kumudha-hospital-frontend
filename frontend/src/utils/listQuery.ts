/**
 * Shared list-query helpers — pagination + sorting.
 *
 * Wire convention (CLAUDE.md §3.4 + project §6 API conventions):
 *   ?page=1&limit=25&sort=field        — ascending
 *   ?page=1&limit=25&sort=-field       — descending  (leading `-`)
 *
 * Backend ALWAYS paginates + sorts server-side; the FE just round-trips
 * the params. The mock APIs apply the same shape so wiring stays
 * identical when the real backend lands.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface PageQuery {
  page?: number;
  limit?: number;
  sort?: string;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

/* ---------- Sort ---------- */

export type SortDirection = 'asc' | 'desc';

export interface ParsedSort {
  field: string;
  direction: SortDirection;
}

/** Parse `'-field'` → `{field, desc}` or `'field'` → `{field, asc}`. */
export const parseSort = (raw: string | undefined): ParsedSort | null => {
  if (!raw) return null;
  if (raw.startsWith('-')) {
    const field = raw.slice(1);
    return field ? { field, direction: 'desc' } : null;
  }
  return { field: raw, direction: 'asc' };
};

/** Serialise `{field, dir}` back to wire form (`field` or `-field`). */
export const formatSort = (parsed: ParsedSort | null): string | undefined => {
  if (!parsed) return undefined;
  return parsed.direction === 'desc' ? `-${parsed.field}` : parsed.field;
};

/**
 * Three-way toggle on a column header:
 *   off → asc → desc → off
 * Returns the next sort string (or undefined for off).
 */
export const toggleSort = (current: string | undefined, field: string): string | undefined => {
  const cur = parseSort(current);
  if (!cur || cur.field !== field) return field; // start asc
  if (cur.direction === 'asc') return `-${field}`; // asc → desc
  return undefined; // desc → off
};

/* ---------- Mock helpers (used by features/<x>/__mocks__) ---------- */

/** Pick a deeply-nested value by dot path (`'patient.fullName'`). */
const pluck = (obj: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
};

/** Compare two unknown values (string-aware, number-aware, date-string-safe). */
const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

/**
 * Sort a list by the wire `sort` string, given a whitelist of
 * supported sort fields. Unknown fields silently fall back to
 * insertion order (so the FE can’t crash the page by passing junk).
 *
 * Use dot-paths for nested fields:
 *   sortRows(rows, '-patient.fullName', ['patient.fullName', 'createdAt'])
 */
export const sortRows = <T>(
  rows: T[],
  sort: string | undefined,
  whitelist: readonly string[],
): T[] => {
  const parsed = parseSort(sort);
  if (!parsed) return rows;
  if (!whitelist.includes(parsed.field)) return rows;
  const factor = parsed.direction === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => compare(pluck(a, parsed.field), pluck(b, parsed.field)) * factor);
};

/**
 * Slice a (already-filtered, already-sorted) row array into a page.
 * Returns the standard `PageResult<T>` envelope.
 */
export const paginate = <T>(
  rows: T[],
  query: PageQuery,
): PageResult<T> => {
  const page = Math.max(1, query.page ?? DEFAULT_PAGE);
  const limit = Math.max(1, query.limit ?? DEFAULT_LIMIT);
  const start = (page - 1) * limit;
  const slice = rows.slice(start, start + limit);
  return { rows: slice, total: rows.length, page, limit };
};

/** Combo: filtered/raw rows + sort + paginate → PageResult<T>. */
export const sortAndPaginate = <T>(
  rows: T[],
  query: PageQuery,
  sortWhitelist: readonly string[],
): PageResult<T> => paginate(sortRows(rows, query.sort, sortWhitelist), query);
