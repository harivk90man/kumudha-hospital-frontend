import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FlaskConical,
  IndianRupee,
  Printer,
  Scan,
  Search,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import {
  Breadcrumb,
  SortableTH,
  StatusPill,
  TablePagination,
} from '@/components/data-display';
import { Card, WorkspacePageLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import { FormErrorContainer } from '@/components/form';
import { RichSelect, type RichSelectOption } from '@/components/overlay';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  fetchPatient,
  searchPatientsByMobile,
  type PatientSummary,
} from '@/features/patient';
import {
  fetchLabCatalog,
  placeLabOrder,
  type LabTestCatalogItem,
} from '@/features/lab';
import {
  fetchRadiologyCatalog,
  placeRadiologyOrder,
  type RadiologyTestCatalogItem,
} from '@/features/radiology';
import {
  createInvoice,
  ShiftLockedBanner,
  useShiftLock,
  type Invoice,
} from '@/features/billing';

type ServiceKind = 'lab' | 'radiology';

const SERVICE_OPTIONS: RichSelectOption[] = [
  { value: 'lab',       name: 'Lab' },
  { value: 'radiology', name: 'Radiology' },
];

export function WalkInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shiftLock = useShiftLock();

  /* ---------- Auto-select patient from ?uhid= (post-registration redirect) ---------- */
  const uhidParam = searchParams.get('uhid');

  /* ---------- UHID lookup ---------- */
  const [lookupValue, setLookupValue] = useState<string>('');
  const [lookupSearching, setLookupSearching] = useState<boolean>(false);
  const [lookupResults, setLookupResults] = useState<PatientSummary[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupTouched, setLookupTouched] = useState<boolean>(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);

  useEffect(() => {
    if (!uhidParam) return;
    fetchPatient(uhidParam.toUpperCase())
      .then((p) => { if (p) setSelectedPatient(p); })
      .catch(() => {});
  }, [uhidParam]);

  const onLookup = async (raw: string): Promise<void> => {
    const value = raw.trim();
    setLookupError(null);
    setLookupTouched(true);
    if (!value) { setLookupResults([]); return; }
    setLookupSearching(true);
    try {
      setLookupResults(await searchPatientsByMobile(value));
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupSearching(false);
    }
  };

  /* ---------- Service + catalogs ---------- */
  const [service, setService] = useState<ServiceKind>('lab');
  const [labCatalog, setLabCatalog] = useState<LabTestCatalogItem[]>([]);
  const [radCatalog, setRadCatalog] = useState<RadiologyTestCatalogItem[]>([]);
  const [catalogQuery, setCatalogQuery] = useState<string>('');
  const [sort, setSort] = useState<string>('name');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);

  useEffect(() => {
    void fetchLabCatalog().then(setLabCatalog);
    void fetchRadiologyCatalog().then(setRadCatalog);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setCatalogQuery('');
    setPage(1);
  }, [service]);

  useEffect(() => { setPage(1); }, [catalogQuery]);

  const filteredRows = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    const raw = service === 'lab'
      ? labCatalog.filter((t) =>
          !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || (t.fullName ?? '').toLowerCase().includes(q),
        )
      : radCatalog.filter((t) =>
          !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.bodyPart.toLowerCase().includes(q),
        );

    const field = sort.startsWith('-') ? sort.slice(1) : sort;
    const dir = sort.startsWith('-') ? -1 : 1;
    return [...raw].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[field];
      const bv = (b as unknown as Record<string, unknown>)[field];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return 0;
    });
  }, [service, labCatalog, radCatalog, catalogQuery, sort]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredRows.slice(start, start + limit);
  }, [filteredRows, page, limit]);

  /* ---------- Selection ---------- */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedItems = useMemo(() => {
    if (service === 'lab') return labCatalog.filter((t) => selectedIds.has(t.id));
    return radCatalog.filter((t) => selectedIds.has(t.id));
  }, [service, labCatalog, radCatalog, selectedIds]);

  const totalPrice = useMemo(() => {
    if (service !== 'lab') return 0;
    return (selectedItems as LabTestCatalogItem[]).reduce((s, t) => s + t.defaultPrice, 0);
  }, [service, selectedItems]);

  /* ---------- Submit ---------- */
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const canSubmit = Boolean(selectedPatient) && selectedIds.size > 0;

  interface PlacedOrder {
    walkInOpNumber: string;
    invoice: Invoice;
    items: Array<{ code: string; name: string; price: number | null }>;
  }
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  const onSubmit = async (): Promise<void> => {
    if (!selectedPatient || selectedIds.size === 0) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const ids = Array.from(selectedIds);
      const walkInOpNumber = `WALK-${Date.now().toString(36).toUpperCase()}`;
      let lineSpecs: Array<{ code: string; name: string; unitPrice: number; gstPct: number }> = [];
      if (service === 'lab') {
        await placeLabOrder(walkInOpNumber, ids, 'routine', selectedPatient);
        lineSpecs = (selectedItems as LabTestCatalogItem[]).map((t) => ({ code: t.code, name: t.name, unitPrice: t.defaultPrice, gstPct: 12 }));
      } else {
        await placeRadiologyOrder(walkInOpNumber, ids, 'routine', selectedPatient);
        lineSpecs = (selectedItems as RadiologyTestCatalogItem[]).map((t) => ({ code: t.code, name: t.name, unitPrice: 1000, gstPct: 12 }));
      }
      const invoice = await createInvoice({
        patientId: selectedPatient.id, patientSnapshot: selectedPatient,
        opNumber: walkInOpNumber, station: service === 'lab' ? 'lab' : 'radiology',
        lines: lineSpecs.map((s) => ({ quantity: 1, adhoc: { code: s.code, name: s.name, unitPrice: s.unitPrice, gstPct: s.gstPct, category: service === 'lab' ? 'lab' : 'radiology' } })),
      });
      setPlaced({ walkInOpNumber, invoice, items: lineSpecs.map((s) => ({ code: s.code, name: s.name, price: s.unitPrice })) });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to place order');
    } finally { setSubmitting(false); }
  };

  const startOver = (): void => {
    setPlaced(null); setSelectedPatient(null); setSelectedIds(new Set());
    setLookupValue(''); setLookupResults([]); setLookupTouched(false);
  };

  if (placed && selectedPatient) {
    return (
      <PlacedConfirmation
        placed={placed} patient={selectedPatient} service={service}
        onAnother={startOver} onBackToStation={() => navigate('/frontdesk/station')}
      />
    );
  }

  return (
    <WorkspacePageLayout
      breadcrumbItems={[{ label: 'OP Management', to: '/frontdesk/station' }, { label: 'Walk-in service' }]}
      homeTo="/frontdesk/station"
      homeLabel="OP Management"
      backTo="/frontdesk/station"
      title="Walk-in service"
      subtitle={`Direct ${service === 'lab' ? 'lab' : 'radiology'} order — no consultation needed.`}
      uhidSearch={{ value: lookupValue, onChange: setLookupValue, onSubmit: () => void onLookup(lookupValue) }}
      primaryAction={{
        label: shiftLock.locked ? 'Shift not open' : 'Place order',
        loadingLabel: 'Placing...',
        loading: submitting,
        disabled: !canSubmit || submitting || shiftLock.locked,
        onClick: () => void onSubmit(),
      }}
      secondaryAction={{
        label: 'Cancel',
        disabled: submitting,
        onClick: () => navigate('/frontdesk/station'),
      }}
    >
      <ShiftLockedBanner lock={shiftLock} />
      {/* UHID lookup results */}
      {lookupTouched && !lookupSearching && (
        <>
          {lookupError && (
            <FormErrorContainer title="Lookup failed." description={lookupError} onRetry={() => void onLookup(lookupValue)} />
          )}
          {!lookupError && lookupResults.length === 0 && lookupValue.trim() && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                No patient matches <span className="font-mono">{lookupValue.trim()}</span>.
              </p>
              <Button asChild size="sm">
                <Link to={`/frontdesk/register?returnTo=/frontdesk/walkin&prefill=${encodeURIComponent(lookupValue.trim())}`}>
                  <UserPlus /> Register new patient
                </Link>
              </Button>
            </div>
          )}
          {lookupResults.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between rounded-t-lg border-b border-hairline bg-muted/50 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {lookupResults.length} {lookupResults.length === 1 ? 'result' : 'results'}
                </span>
                <CloseButton onClick={() => { setLookupResults([]); setLookupTouched(false); setLookupValue(''); }} aria-label="Close results" />
              </div>
              <ul className="flex flex-col divide-y">
                {lookupResults.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{p.fullName}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.uhid}</span>
                        {(p.allergies?.length ?? 0) > 0 && (
                          <StatusPill tone="danger" size="sm"><ShieldAlert className="h-3 w-3" /> Allergy</StatusPill>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={() => { setSelectedPatient(p); setLookupResults([]); setLookupTouched(false); }}>
                      Select
                    </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Selected patient banner */}
      {selectedPatient && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span>
              <span className="font-medium">{selectedPatient.fullName}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{selectedPatient.uhid}</span>
            </span>
          </div>
          <Button type="button" size="sm" variant="outline"
            onClick={() => { setSelectedPatient(null); setLookupTouched(false); setLookupResults([]); }}
          >
            Change
          </Button>
        </div>
      )}

      {/* ---- Catalog table section ---- */}
      <section className="flex flex-col gap-3">
        {/* Filter row: label+count left, service dropdown + search right */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">Walk-in tests</span>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected${service === 'lab' && totalPrice > 0 ? ` · ${formatCurrency(totalPrice)}` : ''}`
                : ' '}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <RichSelect
              value={service}
              onChange={(v) => setService(v as ServiceKind)}
              options={SERVICE_OPTIONS}
              menuLabel="Select service type"
              className="w-48"
              triggerClassName="rounded-none border-x-0 border-t-0 border-b border-hairline shadow-none bg-transparent px-0 focus:ring-0 focus:border-primary"
            />
            <div className="relative flex items-end">
              <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Search"
                className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {submitError && (
          <FormErrorContainer title="Couldn't place the order." description={submitError} onRetry={() => void onSubmit()} />
        )}

        {/* Table */}
        <div className="flex flex-col overflow-hidden border-b border-border">
          <div className="overflow-auto">
            <table className="min-w-full table-fixed text-sm">
              <colgroup>
                <col className="w-10" />
                <col className="w-24" />
                <col />
                <col className="w-32" />
                {service === 'lab' && <col className="w-24" />}
              </colgroup>
              <thead>
                <tr className="border-b text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">#</th>
                  <SortableTH field="code" sort={sort} onSort={(s) => setSort(s ?? 'name')}>Code</SortableTH>
                  <SortableTH field="name" sort={sort} onSort={(s) => setSort(s ?? 'name')}>
                    {service === 'lab' ? 'Test' : 'Study'}
                  </SortableTH>
                  <th className="px-3 py-2.5">
                    {service === 'lab' ? 'Specimen' : 'Body part'}
                  </th>
                  {service === 'lab' && (
                    <SortableTH field="defaultPrice" sort={sort} onSort={(s) => setSort(s ?? 'name')} align="right">
                      Price
                    </SortableTH>
                  )}
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={service === 'lab' ? 5 : 4} className="px-3 py-8 text-center text-xs text-muted-foreground">
                      No {service === 'lab' ? 'tests' : 'studies'} match your search.
                    </td>
                  </tr>
                ) : pagedRows.map((t, idx) => {
                  const checked = selectedIds.has(t.id);
                  const start = (page - 1) * limit;
                  if (service === 'lab') {
                    const lab = t as LabTestCatalogItem;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => toggleSelect(t.id)}
                        className={cn(
                          'cursor-pointer border-b align-middle last:border-b-0 transition-colors',
                          checked ? 'bg-primary/[0.06] hover:bg-primary/[0.08]' : 'hover:bg-muted/30',
                          idx % 2 === 1 && !checked && 'bg-muted/10',
                        )}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                          {checked
                            ? <Check className="h-3.5 w-3.5 text-primary" />
                            : start + idx + 1}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{lab.code}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-foreground">{lab.name}</span>
                          {lab.requiresFasting && (
                            <StatusPill tone="warning" size="sm" className="ml-2">Fasting</StatusPill>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{lab.specimen}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(lab.defaultPrice)}</td>
                      </tr>
                    );
                  }
                  const rad = t as RadiologyTestCatalogItem;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => toggleSelect(t.id)}
                      className={cn(
                        'cursor-pointer border-b align-middle last:border-b-0 transition-colors',
                        checked ? 'bg-primary/[0.06] hover:bg-primary/[0.08]' : 'hover:bg-muted/30',
                        idx % 2 === 1 && !checked && 'bg-muted/10',
                      )}
                    >
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                        {checked
                          ? <Check className="h-3.5 w-3.5 text-primary" />
                          : start + idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{rad.code}</td>
                      <td className="px-3 py-2.5 text-foreground">{rad.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{rad.bodyPart}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            total={filteredRows.length}
            page={page}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
          />
        </div>
      </section>
    </WorkspacePageLayout>
  );
}

/* ---------- PlacedConfirmation ---------- */

interface PlacedConfirmationProps {
  placed: { walkInOpNumber: string; invoice: Invoice; items: Array<{ code: string; name: string; price: number | null }> };
  patient: PatientSummary;
  service: 'lab' | 'radiology';
  onAnother: () => void;
  onBackToStation: () => void;
}

function PlacedConfirmation({ placed, patient, service, onAnother, onBackToStation }: PlacedConfirmationProps): JSX.Element {
  const Icon = service === 'lab' ? FlaskConical : Scan;
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'OP Management', to: '/frontdesk/station' }, { label: 'Walk-in service', to: '/frontdesk/walkin' }, { label: 'Placed' }]}
        homeTo="/frontdesk/station"
        homeLabel="OP Management"
      />
      <Card elevation="elevated">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Order placed — send patient to billing</h2>
            <p className="text-[13px] text-muted-foreground">
              {patient.fullName} ({patient.uhid}) is awaiting payment at the billing counter.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-md border border-hairline bg-muted/30 px-4 py-3 font-mono text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            {placed.walkInOpNumber}
          </span>
          <span className="text-muted-foreground">·</span>
          <span>{placed.invoice.invoiceNumber}</span>
          <span className="text-muted-foreground">·</span>
          <StatusPill tone="warning" size="sm">Due {formatCurrency(placed.invoice.total)}</StatusPill>
        </div>
        <div className="overflow-hidden rounded-md border border-hairline">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">{service === 'lab' ? 'Test' : 'Study'}</th>
                <th className="px-3 py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {placed.items.map((it) => (
                <tr key={it.code}>
                  <td className="px-3 py-2 font-mono text-xxs text-muted-foreground">{it.code}</td>
                  <td className="px-3 py-2 text-foreground">{it.name}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{it.price !== null ? formatCurrency(it.price) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold">
                <td className="px-3 py-2" colSpan={2}>Total (incl. GST)</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(placed.invoice.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onBackToStation}>Back to OP</Button>
          <Button type="button" variant="outline" size="sm" onClick={onAnother}>Place another</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print slip
          </Button>
          <Button asChild size="sm">
            <Link to={`/payment/${encodeURIComponent(placed.walkInOpNumber)}`}>
              <IndianRupee /> Send to billing <ArrowRight />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
