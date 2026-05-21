import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SEED_OTC_SALES } from './__mocks__/otcSalesSeed';

/**
 * OTC counter-sale receipt — kept feature-local because OTC has no
 * patient record / no op_visit, so it can’t ride the shared
 * `billing.invoices` index without a wider schema change. This store
 * gives the pharmacist a "what did I sell at the counter today / this
 * week" surface without involving cashier’s prescription-tied invoice
 * list.
 *
 * Persisted to localStorage so a counter shift survives a page reload
 * and the pharmacist can still re-print a receipt for a customer who
 * came back. When the real backend lands, swap the persist driver for
 * an `otcSalesApi.list({ since, q })` query — the read shape on the
 * UI side stays the same.
 */
export interface OtcSaleLineRecord {
  medicineId: string;
  medicineName: string;
  strength: string;
  quantity: number;
  unitPrice: number;
  gstPct: number;
  /** quantity × unitPrice (pre-tax, snapshot at sale time). */
  lineTotal: number;
}

export interface OtcSaleRecord {
  saleNumber: string;
  /** ISO-8601 — recorded at the moment dispenseOtcSale resolves. */
  soldAt: string;
  invoiceId: string;
  invoiceTotal: number;
  lines: OtcSaleLineRecord[];
  customerName?: string;
  customerPhone?: string;
  /** Payment captured at the counter with the sale. Single OTC sale =
   *  one payment, always at point-of-sale. */
  paymentMethod?: 'cash' | 'upi' | 'card' | 'netbanking';
  paymentRef?: string;
  /** Lines that couldn’t be fully stocked. Surfaces on the receipt
   *  so a customer who got short-counted has a record to come back
   *  with. */
  shortfalls?: { medicineId: string; medicineName: string; requested: number; fulfilled: number }[];
}

interface OtcSalesState {
  sales: OtcSaleRecord[];
  recordSale: (sale: OtcSaleRecord) => void;
  /** Lookup by sale number for the OTC invoice detail screen. */
  getSale: (saleNumber: string) => OtcSaleRecord | undefined;
  /** Full-text filter across sale number, customer name, customer phone,
   *  and medicine name. Empty `q` returns everything (newest first). */
  listSales: (q?: string) => OtcSaleRecord[];
  /** Used by the back-office "clear today" admin action when present. */
  clearAll: () => void;
}

export const useOtcSalesStore = create<OtcSalesState>()(
  persist(
    (set, get) => ({
      // Seeded with ~80 realistic OTC sales spread across the last 14
      // days so the OTC invoices page lands on real data + paginates
      // out of the box. Cleared by `clearAll` (back-office admin).
      sales: SEED_OTC_SALES,
      recordSale: (sale) =>
        set((s) => ({
          sales: [sale, ...s.sales],
        })),
      getSale: (saleNumber) =>
        get().sales.find((s) => s.saleNumber === saleNumber),
      listSales: (q) => {
        const all = get().sales;
        if (!q) return all;
        const needle = q.toLowerCase();
        return all.filter((s) => {
          if (s.saleNumber.toLowerCase().includes(needle)) return true;
          if (s.customerName?.toLowerCase().includes(needle)) return true;
          if (s.customerPhone?.toLowerCase().includes(needle)) return true;
          return s.lines.some((l) =>
            l.medicineName.toLowerCase().includes(needle),
          );
        });
      },
      clearAll: () => set({ sales: [] }),
    }),
    {
      // Key bumped from v1 → v2 so existing localStorage (which had
      // the empty `sales: []` baked in) gets discarded and the new
      // seed kicks in on first hydration.
      name: 'pharmacy-otc-sales-v2',
    },
  ),
);
