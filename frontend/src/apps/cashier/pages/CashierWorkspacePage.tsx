import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  IndianRupee,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Settings,
  ShieldCheck,
  Smartphone,
  UserX,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/data-display/StatusDot';
import { StatusPill } from '@/components/data-display/StatusPill';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatCurrency';
import type { InvoiceLine, LineDiscount, PaymentMethod } from '@/features/billing/billingTypes';
import { ShiftLockedBanner, useShiftLock } from '@/features/billing';
import type { Uuid } from '@/features/patient/patientTypes';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Local Types
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

type BillType = 'consult' | 'lab' | 'pharma' | 'due' | 'refund' | 'advance';
type QueueStatus = 'waiting' | 'in_prog' | 'on_hold';
type FilterTab = 'all' | BillType;
type PayMode = 'cash' | 'upi' | 'card' | 'insurance' | 'split';
type Density = 'compact' | 'comfortable';

interface QueuePatient {
  id: Uuid;
  token: string;
  opNumber: string;
  name: string;
  uhid: string;
  age: number;
  gender: 'm' | 'f';
  doctor: string;
  department: string;
  billType: BillType;
  amount: number;
  status: QueueStatus;
  waitMinutes: number | null;
  urgent: boolean;
}

interface WorkspaceInvoiceLine extends InvoiceLine {
  editQty: number;
  editDiscount: LineDiscount;
}

interface SplitRow {
  id: string;
  method: Exclude<PayMode, 'split'>;
  amount: string;
  reference: string;
}

interface RecentPayment {
  id: string;
  name: string;
  opNumber: string;
  amount: number;
  method: PaymentMethod;
  time: string;
}

interface TodayStats {
  cash: number;
  upi: number;
  card: number;
  insurance: number;
  invoiceCount: number;
  pendingCount: number;
  refundCount: number;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Static Mock Data
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const QUEUE_PATIENTS: QueuePatient[] = [
  {
    id: 'p1',
    token: 'T-041',
    opNumber: 'KH-2026-00041',
    name: 'Arun K.',
    uhid: 'KH-2026-00041',
    age: 34,
    gender: 'm',
    doctor: 'Dr. Priya',
    department: 'General Medicine',
    billType: 'consult',
    amount: 800,
    status: 'waiting',
    waitMinutes: 12,
    urgent: false,
  },
  {
    id: 'p2',
    token: 'T-042',
    opNumber: 'KH-2026-00042',
    name: 'Priya Venkat',
    uhid: 'KH-2026-00042',
    age: 28,
    gender: 'f',
    doctor: 'Dr. Ramesh B.',
    department: 'Pathology',
    billType: 'lab',
    amount: 1250,
    status: 'waiting',
    waitMinutes: 8,
    urgent: false,
  },
  {
    id: 'p3',
    token: 'T-043',
    opNumber: 'KH-2024-04405',
    name: 'Rajesh Kumar',
    uhid: 'KH-2024-04405',
    age: 52,
    gender: 'm',
    doctor: 'Dr. Meena',
    department: 'Pharmacy',
    billType: 'pharma',
    amount: 540,
    status: 'in_prog',
    waitMinutes: null,
    urgent: false,
  },
  {
    id: 'p4',
    token: 'T-044',
    opNumber: 'KH-2025-09012',
    name: 'Meena Devi',
    uhid: 'KH-2025-09012',
    age: 67,
    gender: 'f',
    doctor: 'Dr. Suresh',
    department: 'Cardiology',
    billType: 'due',
    amount: 3200,
    status: 'waiting',
    waitMinutes: 25,
    urgent: true,
  },
  {
    id: 'p5',
    token: 'T-045',
    opNumber: 'KH-2026-00043',
    name: 'Suresh B.',
    uhid: 'KH-2026-00043',
    age: 41,
    gender: 'm',
    doctor: 'Dr. Anjali',
    department: 'Orthopedics',
    billType: 'consult',
    amount: 600,
    status: 'waiting',
    waitMinutes: 5,
    urgent: false,
  },
  {
    id: 'p6',
    token: 'T-046',
    opNumber: 'KH-2024-04410',
    name: 'Kavitha A.',
    uhid: 'KH-2024-04410',
    age: 39,
    gender: 'f',
    doctor: 'Dr. Rajan',
    department: 'Billing',
    billType: 'refund',
    amount: 500,
    status: 'waiting',
    waitMinutes: 18,
    urgent: false,
  },
  {
    id: 'p7',
    token: 'T-047',
    opNumber: 'KH-2026-00044',
    name: 'Deepak Raj',
    uhid: 'KH-2026-00044',
    age: 23,
    gender: 'm',
    doctor: 'Dr. Kavya Sree',
    department: 'General Medicine',
    billType: 'advance',
    amount: 2000,
    status: 'on_hold',
    waitMinutes: 35,
    urgent: false,
  },
  {
    id: 'p8',
    token: 'T-048',
    opNumber: 'KH-2025-09020',
    name: 'Saranya K.',
    uhid: 'KH-2025-09020',
    age: 31,
    gender: 'f',
    doctor: 'Dr. Ramesh B.',
    department: 'Pathology',
    billType: 'lab',
    amount: 870,
    status: 'waiting',
    waitMinutes: 14,
    urgent: false,
  },
];

const INITIAL_LINES: WorkspaceInvoiceLine[] = [
  {
    id: 'l1',
    serviceId: 's1',
    serviceCode: 'CONS-OPD',
    serviceName: 'OPD Consultation',
    category: 'consultation',
    unitPrice: 800,
    quantity: 1,
    gstPct: 0,
    lineTotal: 800,
    editQty: 1,
    editDiscount: { kind: 'pct', value: 0 },
  },
  {
    id: 'l2',
    serviceId: 's2',
    serviceCode: 'RAD-XRAY-CH',
    serviceName: 'X-Ray Chest PA',
    category: 'radiology',
    unitPrice: 350,
    quantity: 1,
    gstPct: 5,
    lineTotal: 350,
    editQty: 1,
    editDiscount: { kind: 'pct', value: 0 },
  },
  {
    id: 'l3',
    serviceId: 's3',
    serviceCode: 'LAB-CBC',
    serviceName: 'Complete Blood Count',
    category: 'lab',
    unitPrice: 350,
    quantity: 1,
    gstPct: 5,
    lineTotal: 350,
    editQty: 1,
    editDiscount: { kind: 'pct', value: 0 },
  },
];

const TODAY_STATS: TodayStats = {
  cash: 24500,
  upi: 38200,
  card: 15800,
  insurance: 42000,
  invoiceCount: 47,
  pendingCount: 8,
  refundCount: 3,
};

const RECENT_PAYMENTS: RecentPayment[] = [
  { id: 'r1', name: 'Anitha Rajan', opNumber: 'KH-2026-00039', amount: 1200, method: 'upi', time: '11:42 AM' },
  { id: 'r2', name: 'Vijay Kumar', opNumber: 'KH-2026-00038', amount: 3500, method: 'insurance', time: '11:35 AM' },
  { id: 'r3', name: 'Lakshmi B.', opNumber: 'KH-2026-00037', amount: 650, method: 'cash', time: '11:20 AM' },
  { id: 'r4', name: 'Mohan Das', opNumber: 'KH-2024-04401', amount: 900, method: 'card', time: '11:08 AM' },
];

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Helpers / Constants
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const BILL_TYPE_COLORS: Record<BillType, string> = {
  consult:  'bg-blue-100   text-blue-700   dark:bg-blue-500/20   dark:text-blue-300',
  lab:      'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  pharma:   'bg-teal-100   text-teal-700   dark:bg-teal-500/20   dark:text-teal-300',
  advance:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  due:      'bg-red-100    text-red-700    dark:bg-red-500/20    dark:text-red-300',
  refund:   'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
} as const;

const BILL_TYPE_LABEL: Record<BillType, string> = {
  consult: 'Consult',
  lab:     'Lab',
  pharma:  'Pharma',
  advance: 'Advance',
  due:     'Due',
  refund:  'Refund',
} as const;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'consult', label: 'Consult' },
  { key: 'lab',     label: 'Lab' },
  { key: 'pharma',  label: 'Pharma' },
  { key: 'due',     label: 'Due' },
  { key: 'refund',  label: 'Refund' },
  { key: 'advance', label: 'Advance' },
];

const STATUS_DOT_TONE = {
  waiting:  'warning',
  in_prog:  'success',
  on_hold:  'neutral',
} as const satisfies Record<QueueStatus, 'warning' | 'success' | 'neutral'>;

const STATUS_LABEL: Record<QueueStatus, string> = {
  waiting:  'Waiting',
  in_prog:  'In progress',
  on_hold:  'On hold',
};

const PAY_MODE_STYLES: Record<Exclude<PayMode, 'split'>, string> = {
  cash:      'ring-green-500  bg-green-50  text-green-700  dark:bg-green-500/15  dark:text-green-300',
  upi:       'ring-blue-500   bg-blue-50   text-blue-700   dark:bg-blue-500/15   dark:text-blue-300',
  card:      'ring-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  insurance: 'ring-amber-500  bg-amber-50  text-amber-700  dark:bg-amber-500/15  dark:text-amber-300',
} as const;

function computeLineNet(line: WorkspaceInvoiceLine): number {
  const gross = line.unitPrice * line.editQty;
  if (line.editDiscount.kind === 'pct') {
    return gross * (1 - line.editDiscount.value / 100);
  }
  return Math.max(0, gross - line.editDiscount.value);
}

function computeLineTax(line: WorkspaceInvoiceLine): number {
  return computeLineNet(line) * (line.gstPct / 100);
}

function computeLineTotal(line: WorkspaceInvoiceLine): number {
  return computeLineNet(line) + computeLineTax(line);
}

function computeGlobalDiscount(subtotal: number, discount: { kind: 'pct' | 'amt'; value: number }): number {
  if (discount.kind === 'pct') return subtotal * (discount.value / 100);
  return Math.min(subtotal, discount.value);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Main Page Component
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * CashierWorkspacePage â€” full-screen 3-panel billing workspace.
 * Left: patient queue. Center: active bill + payment. Right: shift stats.
 */
export function CashierWorkspacePage(): JSX.Element {
  const shiftLock = useShiftLock();
  /* â”€â”€â”€ queue state â”€â”€â”€ */
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedPatientId, setSelectedPatientId] = useState<Uuid>('p1');

  /* â”€â”€â”€ bill line state â”€â”€â”€ */
  const [lines, setLines] = useState<WorkspaceInvoiceLine[]>(INITIAL_LINES);
  const [globalDiscount, setGlobalDiscount] = useState<{ kind: 'pct' | 'amt'; value: number }>({
    kind: 'pct',
    value: 0,
  });
  const [globalDiscountInput, setGlobalDiscountInput] = useState('0');

  /* â”€â”€â”€ payment state â”€â”€â”€ */
  const [payMode, setPayMode] = useState<PayMode>('cash');
  const [cashInput, setCashInput] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { id: 's1', method: 'cash', amount: '', reference: '' },
    { id: 's2', method: 'upi', amount: '', reference: '' },
  ]);

  /* â”€â”€â”€ drawer/modal state â”€â”€â”€ */
  const [showShiftClose, setShowShiftClose] = useState(false);
  const [showCounterClose, setShowCounterClose] = useState(false);
  const [showAccountClose, setShowAccountClose] = useState(false);
  const [showPaySuccess, setShowPaySuccess] = useState(false);
  const [showTweaks, setShowTweaks] = useState(false);
  const [density, setDensity] = useState<Density>('comfortable');
  const [showQueue, setShowQueue] = useState(true);

  /* â”€â”€â”€ shift close form state â”€â”€â”€ */
  const [openingBalance, setOpeningBalance] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [varianceRemarks, setVarianceRemarks] = useState('');

  /* â”€â”€â”€ account close form state â”€â”€â”€ */
  const [accountCloseConfirmed, setAccountCloseConfirmed] = useState(false);

  /* â”€â”€â”€ last payment result â”€â”€â”€ */
  const [lastPaymentResult, setLastPaymentResult] = useState<{
    amount: number;
    change: number;
    opId: string;
    token: string;
  } | null>(null);

  /* â”€â”€â”€ computed values â”€â”€â”€ */
  const filteredQueue = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return QUEUE_PATIENTS.filter((p) => {
      const matchTab = filterTab === 'all' || p.billType === filterTab;
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.uhid.toLowerCase().includes(q) ||
        p.opNumber.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [searchQuery, filterTab]);

  const selectedPatient = useMemo(
    () => QUEUE_PATIENTS.find((p) => p.id === selectedPatientId) ?? QUEUE_PATIENTS[0],
    [selectedPatientId],
  );

  const billTotals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + computeLineNet(l), 0);
    const tax = lines.reduce((s, l) => s + computeLineTax(l), 0);
    const discountAmt = computeGlobalDiscount(subtotal, globalDiscount);
    const total = Math.max(0, subtotal + tax - discountAmt);
    return { subtotal, tax, discountAmt, total };
  }, [lines, globalDiscount]);

  const cashEntered = parseFloat(cashInput) || 0;
  const changeDue = useMemo(
    () => (payMode === 'cash' && cashEntered > billTotals.total ? cashEntered - billTotals.total : 0),
    [payMode, cashEntered, billTotals.total],
  );

  const shiftExpectedCash = TODAY_STATS.cash;
  const shiftActualCash = parseFloat(actualCash) || 0;
  const shiftVariance = shiftActualCash - shiftExpectedCash;

  /* â”€â”€â”€ handlers â”€â”€â”€ */
  function handleSelectPatient(id: Uuid): void {
    setSelectedPatientId(id);
    setLines(INITIAL_LINES);
    setPayMode('cash');
    setCashInput('');
    setUpiRef('');
    setGlobalDiscount({ kind: 'pct', value: 0 });
    setGlobalDiscountInput('0');
  }

  function handleQtyChange(lineId: string, delta: number): void {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, editQty: Math.max(1, l.editQty + delta) }
          : l,
      ),
    );
  }

  function handleQtyInput(lineId: string, val: string): void {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) {
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, editQty: n } : l)),
      );
    }
  }

  function handleDiscountKindToggle(lineId: string): void {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, editDiscount: { kind: l.editDiscount.kind === 'pct' ? 'amt' : 'pct', value: 0 } }
          : l,
      ),
    );
  }

  function handleDiscountValueChange(lineId: string, val: string): void {
    const n = parseFloat(val) || 0;
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, editDiscount: { ...l.editDiscount, value: n } } : l,
      ),
    );
  }

  function handleRemoveLine(lineId: string): void {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  function handleAddService(): void {
    const newLine: WorkspaceInvoiceLine = {
      id: `new-${Date.now()}`,
      serviceId: '',
      serviceCode: 'SVC-NEW',
      serviceName: 'New Service',
      category: 'other',
      unitPrice: 0,
      quantity: 1,
      gstPct: 0,
      lineTotal: 0,
      editQty: 1,
      editDiscount: { kind: 'pct', value: 0 },
    };
    setLines((prev) => [...prev, newLine]);
  }

  function handleGlobalDiscountKindToggle(): void {
    setGlobalDiscount((prev) => ({ kind: prev.kind === 'pct' ? 'amt' : 'pct', value: 0 }));
    setGlobalDiscountInput('0');
  }

  function handleGlobalDiscountInput(val: string): void {
    setGlobalDiscountInput(val);
    const n = parseFloat(val) || 0;
    setGlobalDiscount((prev) => ({ ...prev, value: n }));
  }

  function handlePayInFull(): void {
    setCashInput(billTotals.total.toFixed(2));
  }

  function handleAddSplitRow(): void {
    setSplitRows((prev) => [
      ...prev,
      { id: `s${Date.now()}`, method: 'cash', amount: '', reference: '' },
    ]);
  }

  function handleRemoveSplitRow(id: string): void {
    setSplitRows((prev) => prev.filter((r) => r.id !== id));
  }

  function handleSplitMethodChange(id: string, method: Exclude<PayMode, 'split'>): void {
    setSplitRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, method } : r)),
    );
  }

  function handleSplitAmountChange(id: string, amount: string): void {
    setSplitRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, amount } : r)),
    );
  }

  function handleSplitRefChange(id: string, reference: string): void {
    setSplitRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, reference } : r)),
    );
  }

  function handlePayNow(): void {
    const opId = `OP-${Math.floor(Math.random() * 90000) + 10000}`;
    const token = `T-${String(Math.floor(Math.random() * 900) + 100)}`;
    setLastPaymentResult({
      amount: billTotals.total,
      change: changeDue,
      opId,
      token,
    });
    setShowPaySuccess(true);
  }

  function handleNextPatient(): void {
    setShowPaySuccess(false);
    setLastPaymentResult(null);
    const remaining = filteredQueue.filter((p) => p.id !== selectedPatientId);
    if (remaining.length > 0) {
      handleSelectPatient(remaining[0].id);
    }
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <div className="h-screen overflow-hidden flex flex-col bg-page relative">
      <div className="px-4 pt-3">
        <ShiftLockedBanner lock={shiftLock} />
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          LEFT PANEL â€” Patient Queue
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {showQueue && (
        <aside className="w-72 flex-shrink-0 border-r border-hairline flex flex-col bg-card overflow-hidden">
          {/* Search */}
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name, UHID, mobile, OPâ€¦"
              className="w-full rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent px-0 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Filter pills */}
          <div className="px-3 py-2 flex gap-1 flex-wrap flex-shrink-0">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  filterTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Queue list */}
          <div className="flex-1 overflow-y-auto">
            {filteredQueue.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No patients match.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline">
                {filteredQueue.map((patient) => (
                  <QueueCard
                    key={patient.id}
                    patient={patient}
                    isSelected={patient.id === selectedPatientId}
                    onSelect={handleSelectPatient}
                    density={density}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          CENTER PANEL â€” Active Bill
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Patient header bar â€” non-scrolling */}
        <header className="flex-shrink-0 border-b border-hairline px-5 py-3 bg-card flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-base font-semibold text-foreground truncate">
                  {selectedPatient.name}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {selectedPatient.uhid}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedPatient.age}y / {selectedPatient.gender === 'm' ? 'M' : 'F'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{selectedPatient.doctor}</span>
                <span className="text-hairline">Â·</span>
                <span>{selectedPatient.department}</span>
                <span className="text-hairline">Â·</span>
                <span className="font-mono">{selectedPatient.opNumber}</span>
              </div>
            </div>
          </div>
          <StatusPill
            tone={
              selectedPatient.status === 'in_prog'
                ? 'success'
                : selectedPatient.status === 'on_hold'
                  ? 'neutral'
                  : 'warning'
            }
            size="sm"
          >
            {STATUS_LABEL[selectedPatient.status]}
          </StatusPill>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Bill items table */}
          <div>
            <table className="table-fixed w-full text-sm">
              <thead>
                <tr className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="w-6 text-left pb-2">#</th>
                  <th className="text-left pb-2">Service / Code</th>
                  <th className="w-20 text-center pb-2">Qty</th>
                  <th className="w-20 text-right pb-2">Rate</th>
                  <th className="w-32 text-center pb-2">Discount</th>
                  <th className="w-16 text-right pb-2">GST%</th>
                  <th className="w-24 text-right pb-2">Amount</th>
                  <th className="w-8 pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {lines.map((line, idx) => (
                  <BillLineRow
                    key={line.id}
                    line={line}
                    index={idx + 1}
                    onQtyChange={handleQtyChange}
                    onQtyInput={handleQtyInput}
                    onDiscountKindToggle={handleDiscountKindToggle}
                    onDiscountValueChange={handleDiscountValueChange}
                    onRemove={handleRemoveLine}
                  />
                ))}
              </tbody>
            </table>

            <button
              onClick={handleAddService}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Service
            </button>
          </div>

          {/* Totals + global discount */}
          <div className="flex flex-col items-end gap-1 pt-2 border-t border-hairline">
            <div className="flex items-center gap-8 text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums w-24 text-right">
                {formatCurrency(billTotals.subtotal)}
              </span>
            </div>
            <div className="flex items-center gap-8 text-sm text-muted-foreground">
              <span>GST</span>
              <span className="font-mono tabular-nums w-24 text-right">
                {formatCurrency(billTotals.tax)}
              </span>
            </div>

            {/* Global discount row */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Global discount</span>
              <button
                onClick={handleGlobalDiscountKindToggle}
                className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
              >
                {globalDiscount.kind === 'pct' ? '%' : 'â‚¹'}
              </button>
              <input
                type="number"
                min={0}
                value={globalDiscountInput}
                onChange={(e) => handleGlobalDiscountInput(e.target.value)}
                className="w-20 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent text-right text-sm tabular-nums py-0.5 focus:outline-none focus:border-primary"
              />
              {billTotals.discountAmt > 0 && (
                <span className="text-muted-foreground font-mono tabular-nums text-xs w-24 text-right">
                  âˆ’ {formatCurrency(billTotals.discountAmt)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-8 text-base font-semibold text-foreground mt-1 pt-2 border-t border-hairline">
              <span>Total</span>
              <span className="font-mono tabular-nums w-24 text-right">
                {formatCurrency(billTotals.total)}
              </span>
            </div>
          </div>

          {/* â”€â”€ Payment section â”€â”€ */}
          <div className="pt-2 border-t border-hairline space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payment
            </p>

            {/* Payment mode selector */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'cash',      label: 'Cash',      icon: <IndianRupee className="h-3.5 w-3.5" /> },
                  { key: 'upi',       label: 'UPI',       icon: <Smartphone className="h-3.5 w-3.5" /> },
                  { key: 'card',      label: 'Card',      icon: <CreditCard className="h-3.5 w-3.5" /> },
                  { key: 'insurance', label: 'Insurance', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
                  { key: 'split',     label: 'Split',     icon: <Wallet className="h-3.5 w-3.5" /> },
                ] as const
              ).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setPayMode(key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
                    payMode === key && key !== 'split'
                      ? PAY_MODE_STYLES[key as Exclude<PayMode, 'split'>]
                      : payMode === key && key === 'split'
                        ? 'ring-primary bg-primary/10 text-primary'
                        : 'ring-hairline text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            {/* Cash / UPI / Card / Insurance mode */}
            {payMode !== 'split' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">
                      Amount received
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={cashInput}
                        onChange={(e) => setCashInput(e.target.value)}
                        placeholder={billTotals.total.toFixed(2)}
                        className="flex-1 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={handlePayInFull}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Pay in full
                      </button>
                    </div>
                  </div>
                  {payMode === 'cash' && changeDue > 0 && (
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Change to return</p>
                      <p className="text-base font-semibold text-success tabular-nums">
                        â‚¹ {changeDue.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>

                {payMode === 'upi' && (
                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">
                      UPI reference / UTR
                    </label>
                    <input
                      type="text"
                      value={upiRef}
                      onChange={(e) => setUpiRef(e.target.value)}
                      placeholder="e.g. 315826479302"
                      className="w-full rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-1.5 text-sm font-mono focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Split mode */}
            {payMode === 'split' && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  {splitRows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <select
                        value={row.method}
                        onChange={(e) => handleSplitMethodChange(row.id, e.target.value as Exclude<PayMode, 'split'>)}
                        className="w-28 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent text-xs py-1.5 focus:outline-none focus:border-primary"
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="insurance">Insurance</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={row.amount}
                        onChange={(e) => handleSplitAmountChange(row.id, e.target.value)}
                        placeholder="Amount"
                        className="w-28 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent text-sm tabular-nums py-1.5 focus:outline-none focus:border-primary"
                      />
                      <input
                        type="text"
                        value={row.reference}
                        onChange={(e) => handleSplitRefChange(row.id, e.target.value)}
                        placeholder="Ref (optional)"
                        className="flex-1 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent text-xs py-1.5 focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => handleRemoveSplitRow(row.id)}
                        className="text-muted-foreground hover:text-danger"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleAddSplitRow}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add payment row
                </button>
              </div>
            )}
          </div>
        </div>

        {/* â”€â”€ Sticky bottom action bar â”€â”€ */}
        <footer className="flex-shrink-0 border-t border-hairline bg-card px-5 py-3 flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => {}}>
              <RotateCcw className="h-3.5 w-3.5" />
              Hold
            </Button>
            <Button variant="ghost" size="sm" onClick={() => {}}>
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button variant="ghost" size="sm" onClick={() => {}}>
              <Printer className="h-3.5 w-3.5" />
              Reprint
            </Button>
            <Button variant="ghost" size="sm" onClick={handleAddService}>
              <Plus className="h-3.5 w-3.5" />
              Add Service
            </Button>
          </div>
          <Button size="lg" onClick={handlePayNow} disabled={lines.length === 0}>
            <IndianRupee className="h-4 w-4" />
            Pay Now â€” {formatCurrency(billTotals.total)}
          </Button>
        </footer>
      </main>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          RIGHT PANEL â€” Shift Stats
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <aside className="w-64 flex-shrink-0 border-l border-hairline flex flex-col overflow-y-auto bg-card">
        {/* Header */}
        <div className="px-4 py-3 border-b border-hairline flex items-start justify-between flex-shrink-0">
          <div>
            <p className="text-sm font-semibold">Priya Ramesh</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <Clock className="inline h-3 w-3 mr-0.5" />
              Shift since 08:00 AM
            </p>
          </div>
          <button
            onClick={() => setShowTweaks(true)}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label="Counter settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {/* Today's collection stats */}
        <div className="px-3 py-3 grid grid-cols-2 gap-2 border-b border-hairline flex-shrink-0">
          {(
            [
              { label: 'Cash',      value: TODAY_STATS.cash,      color: 'text-green-600' },
              { label: 'UPI',       value: TODAY_STATS.upi,       color: 'text-blue-600' },
              { label: 'Card',      value: TODAY_STATS.card,      color: 'text-violet-600' },
              { label: 'Insurance', value: TODAY_STATS.insurance,  color: 'text-amber-600' },
            ] as const
          ).map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-muted/50 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className={cn('text-sm font-semibold tabular-nums truncate', color)}>
                {formatCurrency(value)}
              </p>
            </div>
          ))}
        </div>

        {/* Counts */}
        <div className="px-4 py-3 border-b border-hairline flex-shrink-0">
          <div className="grid grid-cols-3 gap-0 text-center divide-x divide-hairline">
            <div className="pr-2">
              <p className="text-base font-bold tabular-nums">{TODAY_STATS.invoiceCount}</p>
              <p className="text-[10px] text-muted-foreground">Invoices</p>
            </div>
            <div className="px-2">
              <p className="text-base font-bold tabular-nums text-warning">
                {TODAY_STATS.pendingCount}
              </p>
              <p className="text-[10px] text-muted-foreground">Pending</p>
            </div>
            <div className="pl-2">
              <p className="text-base font-bold tabular-nums text-danger">
                {TODAY_STATS.refundCount}
              </p>
              <p className="text-[10px] text-muted-foreground">Refunds</p>
            </div>
          </div>
        </div>

        {/* Recent payments */}
        <div className="px-4 py-3 flex-1">
          <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
            Recent payments
          </p>
          <ul className="space-y-2">
            {RECENT_PAYMENTS.map((rp) => (
              <li key={rp.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{rp.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{rp.opNumber}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold tabular-nums">{formatCurrency(rp.amount)}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{rp.method} Â· {rp.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom actions */}
        <div className="px-3 py-3 border-t border-hairline space-y-1.5 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setShowShiftClose(true)}
          >
            Shift Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setShowCounterClose(true)}
          >
            Counter Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setShowAccountClose(true)}
          >
            Account Close
          </Button>
        </div>
      </aside>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          DRAWERS / MODALS
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}

      {/* Shift Close Drawer */}
      {showShiftClose && (
        <Backdrop onClose={() => setShowShiftClose(false)}>
          <DrawerPanel
            side="right"
            width="w-[600px]"
            title="Shift Close"
            onClose={() => setShowShiftClose(false)}
          >
            <ShiftCloseContent
              openingBalance={openingBalance}
              setOpeningBalance={setOpeningBalance}
              actualCash={actualCash}
              setActualCash={setActualCash}
              expectedCash={shiftExpectedCash}
              variance={shiftVariance}
              varianceRemarks={varianceRemarks}
              setVarianceRemarks={setVarianceRemarks}
              onClose={() => setShowShiftClose(false)}
              todayStats={TODAY_STATS}
            />
          </DrawerPanel>
        </Backdrop>
      )}

      {/* Counter Close Drawer */}
      {showCounterClose && (
        <Backdrop onClose={() => setShowCounterClose(false)}>
          <DrawerPanel
            side="right"
            width="w-[480px]"
            title="Counter Close"
            onClose={() => setShowCounterClose(false)}
          >
            <CounterCloseContent
              onClose={() => setShowCounterClose(false)}
              todayStats={TODAY_STATS}
            />
          </DrawerPanel>
        </Backdrop>
      )}

      {/* Account Close Modal */}
      {showAccountClose && (
        <Backdrop onClose={() => setShowAccountClose(false)}>
          <CenteredModal width="w-[500px]" onClose={() => setShowAccountClose(false)}>
            <AccountCloseContent
              patient={selectedPatient}
              confirmed={accountCloseConfirmed}
              onConfirmChange={setAccountCloseConfirmed}
              onClose={() => setShowAccountClose(false)}
            />
          </CenteredModal>
        </Backdrop>
      )}

      {/* Payment Success Modal */}
      {showPaySuccess && lastPaymentResult && (
        <Backdrop onClose={() => {}}>
          <CenteredModal width="w-[440px]" onClose={() => {}}>
            <PaymentSuccessContent
              result={lastPaymentResult}
              payMode={payMode}
              onPrintReceipt={() => window.print()}
              onSms={() => {}}
              onNextPatient={handleNextPatient}
            />
          </CenteredModal>
        </Backdrop>
      )}

      {/* Tweaks Panel */}
      {showTweaks && (
        <Backdrop onClose={() => setShowTweaks(false)}>
          <DrawerPanel
            side="right"
            width="w-[280px]"
            title="Counter Settings"
            onClose={() => setShowTweaks(false)}
          >
            <TweaksPanelContent
              density={density}
              setDensity={setDensity}
              showQueue={showQueue}
              setShowQueue={setShowQueue}
              onClose={() => setShowTweaks(false)}
            />
          </DrawerPanel>
        </Backdrop>
      )}
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Queue Card Component
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface QueueCardProps {
  patient: QueuePatient;
  isSelected: boolean;
  onSelect: (id: Uuid) => void;
  density: Density;
}

function QueueCard({ patient, isSelected, onSelect, density }: QueueCardProps): JSX.Element {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onSelect(patient.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(patient.id)}
      className={cn(
        'relative pl-3 pr-3 cursor-pointer transition-colors select-none',
        density === 'comfortable' ? 'py-3' : 'py-2',
        isSelected
          ? 'bg-primary/10 border-l-2 border-primary'
          : patient.urgent
            ? 'border-l-4 border-red-500 hover:bg-muted/40'
            : 'border-l-2 border-transparent hover:bg-muted/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {/* Token */}
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0 mt-0.5">
            {patient.token}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className={cn('text-sm font-semibold truncate', patient.urgent && 'text-red-600')}>
                {patient.name}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground">{patient.uhid}</span>
              <span className="text-[10px] text-muted-foreground">
                Â· {patient.age}y/{patient.gender === 'm' ? 'M' : 'F'}
              </span>
            </div>
          </div>
        </div>
        {/* Bill type + amount */}
        <div className="text-right flex-shrink-0">
          <span
            className={cn(
              'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              BILL_TYPE_COLORS[patient.billType],
            )}
          >
            {BILL_TYPE_LABEL[patient.billType]}
          </span>
          <p className="text-xs font-semibold tabular-nums mt-0.5">{formatCurrency(patient.amount)}</p>
        </div>
      </div>
      {/* Wait time + status */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <StatusDot tone={STATUS_DOT_TONE[patient.status]} size="sm" />
        <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[patient.status]}</span>
        {patient.waitMinutes !== null && (
          <>
            <span className="text-[10px] text-hairline">Â·</span>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[10px]',
                patient.waitMinutes >= 20 ? 'text-warning' : 'text-muted-foreground',
              )}
            >
              <Clock className="h-2.5 w-2.5" />
              {patient.waitMinutes}m
            </span>
          </>
        )}
        {patient.urgent && (
          <span className="ml-auto inline-flex items-center rounded-full bg-danger/15 text-danger px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
            Urgent
          </span>
        )}
      </div>
    </li>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Bill Line Row Component
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface BillLineRowProps {
  line: WorkspaceInvoiceLine;
  index: number;
  onQtyChange: (id: string, delta: number) => void;
  onQtyInput: (id: string, val: string) => void;
  onDiscountKindToggle: (id: string) => void;
  onDiscountValueChange: (id: string, val: string) => void;
  onRemove: (id: string) => void;
}

function BillLineRow({
  line,
  index,
  onQtyChange,
  onQtyInput,
  onDiscountKindToggle,
  onDiscountValueChange,
  onRemove,
}: BillLineRowProps): JSX.Element {
  const lineTotal = computeLineTotal(line);
  return (
    <tr className="group">
      <td className="py-2 pr-1 text-xs text-muted-foreground">{index}</td>
      <td className="py-2 pr-2">
        <p className="text-sm font-medium truncate">{line.serviceName}</p>
        <p className="text-[10px] font-mono text-muted-foreground">{line.serviceCode}</p>
      </td>
      <td className="py-2 px-1">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onQtyChange(line.id, -1)}
            className="h-5 w-5 rounded-sm bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/70"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="number"
            min={1}
            value={line.editQty}
            onChange={(e) => onQtyInput(line.id, e.target.value)}
            className="w-8 text-center text-sm tabular-nums rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-0 focus:outline-none focus:border-primary"
          />
          <button
            onClick={() => onQtyChange(line.id, 1)}
            className="h-5 w-5 rounded-sm bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/70"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </td>
      <td className="py-2 pl-1 text-right text-sm font-mono tabular-nums">
        {formatCurrency(line.unitPrice)}
      </td>
      <td className="py-2 px-1">
        <div className="flex items-center gap-1 justify-center">
          <button
            onClick={() => onDiscountKindToggle(line.id)}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/70 flex-shrink-0"
          >
            {line.editDiscount.kind === 'pct' ? '%' : 'â‚¹'}
          </button>
          <input
            type="number"
            min={0}
            value={line.editDiscount.value || ''}
            onChange={(e) => onDiscountValueChange(line.id, e.target.value)}
            placeholder="0"
            className="w-14 text-right text-xs tabular-nums rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-0.5 focus:outline-none focus:border-primary"
          />
        </div>
      </td>
      <td className="py-2 pl-1 text-right text-xs text-muted-foreground">
        {line.gstPct > 0 ? `${line.gstPct}%` : 'â€”'}
      </td>
      <td className="py-2 pl-1 text-right text-sm font-mono tabular-nums font-medium">
        {formatCurrency(lineTotal)}
      </td>
      <td className="py-2 pl-1">
        <button
          onClick={() => onRemove(line.id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger transition-opacity"
          aria-label="Remove line"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Drawer / Modal Shell Components
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex w-full h-full pointer-events-none">
        <div className="pointer-events-auto flex w-full h-full">{children}</div>
      </div>
    </div>
  );
}

interface DrawerPanelProps {
  side: 'right' | 'left';
  width: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function DrawerPanel({ side, width, title, onClose, children }: DrawerPanelProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col h-full bg-card shadow-elevated overflow-hidden',
        width,
        side === 'right' ? 'ml-auto border-l border-hairline' : 'mr-auto border-r border-hairline',
      )}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-hairline flex-shrink-0">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function CenteredModal({
  width,
  children,
}: {
  width: string;
  onClose: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div
        className={cn(
          'bg-card rounded-xl shadow-elevated border border-hairline overflow-hidden flex flex-col max-h-[90vh]',
          width,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Shift Close Content
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface ShiftCloseContentProps {
  openingBalance: string;
  setOpeningBalance: (v: string) => void;
  actualCash: string;
  setActualCash: (v: string) => void;
  expectedCash: number;
  variance: number;
  varianceRemarks: string;
  setVarianceRemarks: (v: string) => void;
  onClose: () => void;
  todayStats: TodayStats;
}

function ShiftCloseContent({
  openingBalance,
  setOpeningBalance,
  actualCash,
  setActualCash,
  expectedCash,
  variance,
  varianceRemarks,
  setVarianceRemarks,
  onClose,
  todayStats,
}: ShiftCloseContentProps): JSX.Element {
  return (
    <div className="px-5 py-4 space-y-5">
      {/* Opening balance */}
      <div>
        <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground block mb-1">
          Opening cash balance (â‚¹)
        </label>
        <input
          type="number"
          min={0}
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 text-sm tabular-nums focus:outline-none focus:border-primary"
        />
      </div>

      {/* Transaction table */}
      <div>
        <p className="text-xs font-semibold mb-2">Transaction summary</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-hairline">
              <th className="text-left pb-1.5">Mode</th>
              <th className="text-right pb-1.5">Txns</th>
              <th className="text-right pb-1.5">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {(
              [
                { mode: 'Cash',      count: 18, amount: todayStats.cash },
                { mode: 'UPI',       count: 21, amount: todayStats.upi },
                { mode: 'Card',      count: 5,  amount: todayStats.card },
                { mode: 'Insurance', count: 3,  amount: todayStats.insurance },
              ] as const
            ).map(({ mode, count, amount }) => (
              <tr key={mode}>
                <td className="py-1.5">{mode}</td>
                <td className="py-1.5 text-right tabular-nums">{count}</td>
                <td className="py-1.5 text-right tabular-nums font-mono">{formatCurrency(amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t border-hairline">
              <td className="pt-2">Total</td>
              <td className="pt-2 text-right tabular-nums">47</td>
              <td className="pt-2 text-right tabular-nums font-mono">
                {formatCurrency(todayStats.cash + todayStats.upi + todayStats.card + todayStats.insurance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Cash reconciliation */}
      <div className="space-y-2">
        <p className="text-xs font-semibold">Cash reconciliation</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Expected cash</span>
          <span className="font-mono tabular-nums">{formatCurrency(expectedCash)}</span>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground block mb-1">
            Actual cash in drawer (â‚¹)
          </label>
          <input
            type="number"
            min={0}
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            placeholder={expectedCash.toFixed(2)}
            className="w-full rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 text-sm tabular-nums focus:outline-none focus:border-primary"
          />
        </div>
        {actualCash && (
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Variance</span>
            <span className={cn('font-mono tabular-nums', variance === 0 ? 'text-success' : 'text-danger')}>
              {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
            </span>
          </div>
        )}
      </div>

      {/* Variance remarks */}
      {variance !== 0 && actualCash && (
        <div>
          <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground block mb-1">
            Variance remarks <span className="text-danger">*</span>
          </label>
          <textarea
            value={varianceRemarks}
            onChange={(e) => setVarianceRemarks(e.target.value)}
            placeholder="Explain the varianceâ€¦"
            rows={3}
            className="w-full rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 text-sm resize-none focus:outline-none focus:border-primary"
          />
        </div>
      )}

      {/* Refund + cancelled summary */}
      <div className="flex gap-4 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Refunds</p>
          <p className="font-semibold tabular-nums">{todayStats.refundCount} Â· {formatCurrency(1200)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Cancelled</p>
          <p className="font-semibold tabular-nums">2 invoices</p>
        </div>
      </div>

      {/* OP range */}
      <div className="flex gap-4 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">First OP</p>
          <p className="font-mono font-semibold">KH-2026-00001</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Last OP</p>
          <p className="font-mono font-semibold">KH-2026-00048</p>
        </div>
      </div>

      {/* Shift datetime */}
      <div className="flex gap-4 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Shift started</p>
          <p className="font-semibold">08:00 AM</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Shift end</p>
          <p className="font-semibold">02:30 PM</p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
        Reopening requires supervisor approval.
      </p>

      {/* Actions */}
      <div className="flex gap-2 pb-2">
        <Button variant="outline" size="sm" onClick={() => window.print()} className="flex-1">
          <Printer className="h-3.5 w-3.5" />
          Print Shift Report
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={variance !== 0 && !varianceRemarks.trim()}
          onClick={onClose}
        >
          Close Shift
        </Button>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Counter Close Content
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface CounterCloseContentProps {
  onClose: () => void;
  todayStats: TodayStats;
}

function CounterCloseContent({ onClose, todayStats }: CounterCloseContentProps): JSX.Element {
  const [handedOver, setHandedOver] = useState(false);

  return (
    <div className="px-5 py-4 space-y-5">
      <div>
        <p className="text-xs font-semibold mb-2">Counter-wise collection</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-hairline">
              <th className="text-left pb-1.5">Mode</th>
              <th className="text-right pb-1.5">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {(
              [
                { mode: 'Cash',      amount: todayStats.cash },
                { mode: 'UPI',       amount: todayStats.upi },
                { mode: 'Card',      amount: todayStats.card },
                { mode: 'Insurance', amount: todayStats.insurance },
              ] as const
            ).map(({ mode, amount }) => (
              <tr key={mode}>
                <td className="py-1.5">{mode}</td>
                <td className="py-1.5 text-right tabular-nums font-mono">{formatCurrency(amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Total invoices generated</span>
        <span className="tabular-nums">{todayStats.invoiceCount}</span>
      </div>

      {/* Cash handover toggle */}
      <div>
        <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
          Cash handover status
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setHandedOver(true)}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors',
              handedOver
                ? 'bg-success/10 text-success ring-success/30'
                : 'ring-hairline text-muted-foreground hover:bg-muted/50',
            )}
          >
            Handed over
          </button>
          <button
            onClick={() => setHandedOver(false)}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors',
              !handedOver
                ? 'bg-warning/10 text-warning ring-warning/30'
                : 'ring-hairline text-muted-foreground hover:bg-muted/50',
            )}
          >
            Pending
          </button>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Pending dues</p>
          <p className="font-semibold tabular-nums text-warning">{todayStats.pendingCount}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Refunds / Cancellations</p>
          <p className="font-semibold tabular-nums text-danger">{todayStats.refundCount}</p>
        </div>
      </div>

      <div className="text-sm space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Counter operator</span>
          <span className="font-medium">Priya Ramesh</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Device / Printer</span>
          <span className="font-mono text-xs">Counter 1 â€” HP LaserJet</span>
        </div>
      </div>

      <div className="flex gap-2 pb-2">
        <Button variant="outline" size="sm" onClick={() => window.print()} className="flex-1">
          <Printer className="h-3.5 w-3.5" />
          Print Counter Report
        </Button>
        <Button size="sm" className="flex-1" onClick={onClose}>
          Close Counter
        </Button>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Account Close Content
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface AccountCloseContentProps {
  patient: QueuePatient;
  confirmed: boolean;
  onConfirmChange: (v: boolean) => void;
  onClose: () => void;
}

const ACCOUNT_CHECKLIST = [
  { id: 'c1', label: 'Bill fully settled' },
  { id: 'c2', label: 'Lab / pharmacy dues clear' },
  { id: 'c3', label: 'Insurance approval received' },
  { id: 'c4', label: 'Advance adjusted' },
] as const;

function AccountCloseContent({
  patient,
  confirmed,
  onConfirmChange,
  onClose,
}: AccountCloseContentProps): JSX.Element {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  function toggleItem(id: string): void {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const allChecked = ACCOUNT_CHECKLIST.every((item) => checkedItems[item.id]);

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-hairline pb-3">
        <div>
          <h3 className="text-base font-semibold">{patient.name}</h3>
          <p className="text-xs font-mono text-muted-foreground">{patient.uhid}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {ACCOUNT_CHECKLIST.map((item) => {
          const checked = checkedItems[item.id] ?? false;
          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className="w-full flex items-center gap-3 text-left py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors"
            >
              {checked ? (
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className={cn('text-sm', checked && 'line-through text-muted-foreground')}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Refund if excess */}
      <div>
        <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
          Refund if excess
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            placeholder="Amount"
            className="flex-1 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary"
          />
          <select className="w-28 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent text-sm py-1.5 focus:outline-none focus:border-primary">
            <option>Cash</option>
            <option>UPI</option>
          </select>
        </div>
      </div>

      {/* Final invoice number */}
      <div>
        <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
          Final invoice number
        </p>
        <p className="font-mono text-sm font-semibold">INV-2026-000{Math.floor(Math.random() * 900) + 100}</p>
      </div>

      {/* Confirm checkbox */}
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmChange(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        Confirm account closure for {patient.name}
      </label>

      <Button
        className="w-full"
        variant="destructive"
        disabled={!confirmed || !allChecked}
        onClick={onClose}
      >
        <UserX className="h-4 w-4" />
        Lock Account
      </Button>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Payment Success Modal Content
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface PaymentSuccessContentProps {
  result: { amount: number; change: number; opId: string; token: string };
  payMode: PayMode;
  onPrintReceipt: () => void;
  onSms: () => void;
  onNextPatient: () => void;
}

function PaymentSuccessContent({
  result,
  payMode,
  onPrintReceipt,
  onSms,
  onNextPatient,
}: PaymentSuccessContentProps): JSX.Element {
  return (
    <div className="p-6 space-y-4 text-center">
      <div className="flex justify-center">
        <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-success" />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Payment Successful</h2>
        <p className="text-3xl font-bold tabular-nums mt-1">{formatCurrency(result.amount)}</p>
      </div>

      {payMode === 'cash' && result.change > 0 && (
        <div className="bg-success/10 rounded-lg py-2 px-4">
          <p className="text-[11px] uppercase tracking-wider text-success/70">Change to return</p>
          <p className="text-xl font-bold text-success tabular-nums">â‚¹ {result.change.toFixed(2)}</p>
        </div>
      )}

      <div className="flex gap-3 justify-center">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">OPID</span>
          <span className="font-mono text-sm font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 px-3 py-1 rounded-lg">
            {result.opId}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Token</span>
          <span className="font-mono text-sm font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 px-3 py-1 rounded-lg">
            {result.token}
          </span>
        </div>
      </div>

      <hr className="border-hairline" />

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPrintReceipt} className="flex-1">
          <Printer className="h-3.5 w-3.5" />
          Print Receipt
        </Button>
        <Button variant="outline" size="sm" onClick={onSms} className="flex-1">
          <Phone className="h-3.5 w-3.5" />
          SMS / WhatsApp
        </Button>
        <Button size="sm" onClick={onNextPatient} className="flex-1">
          <MessageCircle className="h-3.5 w-3.5" />
          Next Patient
        </Button>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Tweaks Panel Content
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface TweaksPanelContentProps {
  density: Density;
  setDensity: (v: Density) => void;
  showQueue: boolean;
  setShowQueue: (v: boolean) => void;
  onClose: () => void;
}

function TweaksPanelContent({
  density,
  setDensity,
  showQueue,
  setShowQueue,
  onClose,
}: TweaksPanelContentProps): JSX.Element {
  return (
    <div className="px-4 py-4 space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
          Queue density
        </p>
        <div className="flex gap-2">
          {(['compact', 'comfortable'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors capitalize',
                density === d
                  ? 'bg-primary/10 text-primary ring-primary/30'
                  : 'ring-hairline text-muted-foreground hover:bg-muted/50',
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
          Queue panel
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowQueue(true)}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors',
              showQueue
                ? 'bg-primary/10 text-primary ring-primary/30'
                : 'ring-hairline text-muted-foreground hover:bg-muted/50',
            )}
          >
            Show
          </button>
          <button
            onClick={() => setShowQueue(false)}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors',
              !showQueue
                ? 'bg-primary/10 text-primary ring-primary/30'
                : 'ring-hairline text-muted-foreground hover:bg-muted/50',
            )}
          >
            Hide
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Light / Dark mode</span>
          {' '}â€” uses system preference.
        </p>
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Icon re-exports used inline (no barrel)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

// Icons used in JSX: CheckCircle2, ChevronDown, ChevronUp, Clock,
// CreditCard, IndianRupee, MessageCircle, Minus, Phone, Plus,
// Printer, RotateCcw, Settings, ShieldCheck, Smartphone, UserX,
// Wallet, X, XCircle
// All imported from lucide-react at the top.
void ChevronDown;
void ChevronUp;
