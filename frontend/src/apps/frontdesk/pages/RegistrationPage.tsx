import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, Check, UserPlus } from 'lucide-react';
import { StatusPill } from '@/components/data-display';
import { Card, WorkspacePageLayout } from '@/components/layout';
import {
  ChipInput,
  DatePicker,
  FormErrorContainer,
  FormInput,
  FormSelect,
} from '@/components/form';
import { CloseButton } from '@/components/ui/close-button';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import {
  createPatient,
  searchPatientsByMobile,
  type CreatePatientInput,
  type Gender,
  type PatientSummary,
} from '@/features/patient';
import { fetchAllergySuggestions, fetchConditionSuggestions } from '@/features/patient/lookupsApi';
import { HttpError } from '@/lib/http/httpError';
import type { BackendError } from '@/lib/http/httpError';
import { useNotificationsStore } from '@/store/notificationsStore';
import { type Appointment } from '@/features/appointments';
import { NewBookingForm } from '../components/NewBookingForm';
import {
  newPatientSchema,
  type NewPatientFormValues,
} from '../schemas/registrationSchema';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export function RegistrationPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get('prefill') ?? '';
  const returnTo = searchParams.get('returnTo') ?? '';

  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [bookedAppointment, setBookedAppointment] = useState<Appointment | null>(null);
  const [allergySuggestions, setAllergySuggestions] = useState<string[]>([]);
  const [conditionSuggestions, setConditionSuggestions] = useState<string[]>([]);

  /* ---------- UHID lookup ---------- */
  const [lookupValue, setLookupValue] = useState<string>('');
  const [lookupSearching, setLookupSearching] = useState<boolean>(false);
  const [lookupResults, setLookupResults] = useState<PatientSummary[]>([]);
  const [lookupTouched, setLookupTouched] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const onLookup = async (raw: string): Promise<void> => {
    const value = raw.trim();
    setLookupTouched(true);
    setLookupError(null);
    if (!value) { setLookupResults([]); return; }
    setLookupSearching(true);
    try {
      setLookupResults(await searchPatientsByMobile(value));
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
      setLookupResults([]);
    } finally { setLookupSearching(false); }
  };

  useEffect(() => {
    void fetchAllergySuggestions().then(setAllergySuggestions).catch(() => {});
    void fetchConditionSuggestions().then(setConditionSuggestions).catch(() => {});
  }, []);

  /* ---------- Register form ---------- */
  const {
    register, control, handleSubmit, reset: resetRegister, watch,
    formState: { errors, isSubmitting, isDirty: registerIsDirty },
  } = useForm<NewPatientFormValues>({
    resolver: zodResolver(newPatientSchema),
    defaultValues: {
      firstName: '', lastName: '', gender: '' as 'm' | 'f' | 'o', dateOfBirth: '',
      mobile: prefill, email: '', bloodGroup: '', aadhaar: '', pan: '',
      addressLine1: '', addressLine2: '', city: '', pincode: '',
      allergies: [], chronicConditions: [],
    },
  });

  const onRegisterSubmit = async (values: NewPatientFormValues): Promise<void> => {
    const input: CreatePatientInput = {
      firstName: values.firstName,
      lastName: values.lastName,
      gender: values.gender as Gender,
      dateOfBirth: values.dateOfBirth,
      mobile: values.mobile,
      email: values.email || undefined,
      bloodGroup: values.bloodGroup || undefined,
      aadhaar: values.aadhaar?.trim() || undefined,
      pan: values.pan?.trim().toUpperCase() || undefined,
      address: values.addressLine1 || values.addressLine2 || values.city || values.pincode
        ? {
            line1: values.addressLine1 || undefined,
            line2: values.addressLine2 || undefined,
            city: values.city || undefined,
            pincode: values.pincode || undefined,
          }
        : undefined,
      allergies: (values.allergies?.length ?? 0) ? values.allergies : undefined,
      chronicConditions: (values.chronicConditions?.length ?? 0) ? values.chronicConditions : undefined,
    };
    try {
      const created = await createPatient(input);
      useNotificationsStore.getState().push({
        type: 'success',
        title: 'Patient registered',
        message: `${created.fullName} · ${created.uhid}`,
      });
      // flushSync forces a synchronous re-render so useBlocker sees isDirty=false
      // before navigate() is called, preventing the unsaved-changes guard from firing.
      flushSync(() => { resetRegister(); });
      if (returnTo === '/frontdesk/walkin') {
        navigate(`/frontdesk/walkin?uhid=${created.uhid}`);
        return;
      }
      // For all other flows (including returnTo=appointments), show booking step inline.
      setSelectedPatient(created);
    } catch (e) {
      if (e instanceof HttpError && e.status < 500) {
        useNotificationsStore.getState().push({
          type: 'error',
          title: 'Registration failed',
          message: (e.data as BackendError)?.message ?? e.statusText,
        });
      }
    }
  };

  const onBooked = (apt: Appointment): void => {
    setBookedAppointment(apt);
  };

  useUnsavedChangesGuard(registerIsDirty);

  const startOver = (): void => {
    setSelectedPatient(null);
    setBookedAppointment(null);
    resetRegister();
  };

  const mobileValue = watch('mobile');
  const mobileIsPrefilled = Boolean(prefill) && mobileValue === prefill;

  /* ---------- Per-step header props ---------- */
  const subtitle = !selectedPatient
    ? 'Capture identity + contact details below.'
    : !bookedAppointment
    ? 'Patient registered — book an appointment below.'
    : 'Appointment confirmed.';

  const uhidSearch = !selectedPatient
    ? { value: lookupValue, onChange: setLookupValue, onSubmit: () => void onLookup(lookupValue) }
    : undefined;

  const primaryAction = !selectedPatient
    ? {
        label: 'Register',
        loadingLabel: 'Registering...',
        loading: isSubmitting,
        disabled: isSubmitting || !registerIsDirty,
        icon: <UserPlus className="h-4 w-4" />,
        onClick: handleSubmit(onRegisterSubmit),
      }
    : bookedAppointment
    ? { label: 'Register another', onClick: startOver }
    : undefined;

  const secondaryAction = !selectedPatient
    ? {
        label: 'Cancel',
        disabled: isSubmitting,
        onClick: () => { resetRegister(); navigate('/frontdesk/station'); },
      }
    : !bookedAppointment
    ? { label: 'Skip for now', onClick: startOver }
    : { label: 'View appointments', onClick: () => navigate('/frontdesk/appointments') };

  /* ---------- Render ---------- */
  return (
    <WorkspacePageLayout
      breadcrumbItems={[{ label: 'Register patient' }]}
      homeTo="/frontdesk/station"
      homeLabel="OP Management"
      backTo="/frontdesk/station"
      title="Register new patient"
      subtitle={subtitle}
      uhidSearch={uhidSearch}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    >
      {/* UHID lookup results — step 1 only */}
      {!selectedPatient && (lookupError || (lookupTouched && !lookupSearching)) && (
        <div className="flex flex-col gap-2 mb-4">
          {lookupError && (
            <FormErrorContainer
              title="Couldn't look up patient."
              description={lookupError}
              onRetry={() => void onLookup(lookupValue)}
            />
          )}
          {!lookupError && lookupResults.length === 0 && lookupValue.trim() && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                No patient matches <span className="font-mono">{lookupValue.trim()}</span>.
              </p>
            </div>
          )}
          {lookupResults.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between rounded-t-lg border-b border-hairline bg-muted/50 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {lookupResults.length} {lookupResults.length === 1 ? 'result' : 'results'}
                </span>
                <CloseButton
                  onClick={() => { setLookupResults([]); setLookupTouched(false); setLookupValue(''); }}
                  aria-label="Close results"
                />
              </div>
              <ul className="flex flex-col divide-y">
                {lookupResults.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{p.fullName}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.uhid}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <a href={`/patient/${p.uhid}`}>View patient</a>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---- Step 1: registration form ---- */}
      {!selectedPatient && (
        <form onSubmit={handleSubmit(onRegisterSubmit)}>
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">

            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-6">

              <FormSection title="Identity">
                <div className="grid gap-3 md:grid-cols-2">
                  <FormInput
                    variant="flat" label="First name" placeholder="First name"
                    autoFocus requiredMark error={errors.firstName?.message}
                    {...register('firstName')}
                  />
                  <FormInput
                    variant="flat" label="Last name" placeholder="Last name"
                    requiredMark error={errors.lastName?.message}
                    {...register('lastName')}
                  />
                  <FormSelect
                    variant="flat" label="Gender"
                    requiredMark defaultValue="" error={errors.gender?.message}
                    {...register('gender')}
                  >
                    <option value="" disabled>Gender</option>
                    <option value="m">Male</option>
                    <option value="f">Female</option>
                    <option value="o">Other</option>
                  </FormSelect>
                  <Controller
                    name="dateOfBirth" control={control}
                    render={({ field }) => (
                      <DatePicker
                        label="Date of birth" hideLabel flat
                        placeholder="Date of birth"
                        value={field.value} onChange={field.onChange}
                        error={errors.dateOfBirth?.message}
                      />
                    )}
                  />
                </div>
              </FormSection>

              <FormSection title="Contact">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <FormInput
                      variant="flat" label="Mobile" placeholder="Mobile number"
                      requiredMark error={errors.mobile?.message}
                      hint={mobileIsPrefilled ? 'Prefilled from your search.' : undefined}
                      {...register('mobile')}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <FormInput
                      variant="flat" label="Email" placeholder="Email address"
                      error={errors.email?.message}
                      {...register('email')}
                    />
                  </div>
                  <FormInput
                    variant="flat" label="Address line 1" placeholder="Address line 1"
                    error={errors.addressLine1?.message}
                    {...register('addressLine1')}
                  />
                  <FormInput
                    variant="flat" label="Address line 2" placeholder="Address line 2"
                    {...register('addressLine2')}
                  />
                  <FormInput
                    variant="flat" label="City" placeholder="City"
                    error={errors.city?.message}
                    {...register('city')}
                  />
                  <FormInput
                    variant="flat" label="Pincode" placeholder="Pincode"
                    error={errors.pincode?.message}
                    {...register('pincode')}
                  />
                </div>
              </FormSection>

              <FormSection title="Blood group">
                <Controller
                  name="bloodGroup" control={control}
                  render={({ field }) => (
                    <BloodGroupPills value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />
              </FormSection>
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-6">

              <FormSection title="Identity proof">
                <div className="grid gap-3 md:grid-cols-2">
                  <FormInput
                    variant="flat" label="Aadhaar" placeholder="Aadhaar (12 digits)"
                    error={errors.aadhaar?.message}
                    {...register('aadhaar')}
                  />
                  <FormInput
                    variant="flat" label="PAN" placeholder="PAN (ABCDE1234F)"
                    error={errors.pan?.message}
                    {...register('pan')}
                  />
                </div>
              </FormSection>

              <FormSection title="Medical condition">
                <div className="flex flex-col gap-3">
                  <Controller
                    name="allergies" control={control}
                    render={({ field, fieldState }) => (
                      <ChipInput
                        label="Allergies" hideLabel flat placeholder="Type allergy and press Enter"
                        values={field.value ?? []} onChange={field.onChange}
                        suggestions={allergySuggestions}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                  <Controller
                    name="chronicConditions" control={control}
                    render={({ field, fieldState }) => (
                      <ChipInput
                        label="Chronic conditions" hideLabel flat placeholder="Type condition and press Enter"
                        values={field.value ?? []} onChange={field.onChange}
                        suggestions={conditionSuggestions}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                </div>
              </FormSection>
            </div>
          </div>
        </form>
      )}

      {/* ---- Step 2: appointment booking ---- */}
      {selectedPatient && !bookedAppointment && (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm">
            <Check className="h-4 w-4 shrink-0 text-success" />
            <span>
              <span className="font-medium">{selectedPatient.fullName}</span>
              {' registered · '}
              <span className="font-mono tabular-nums text-muted-foreground">
                {selectedPatient.uhid}
              </span>
            </span>
          </div>
          <NewBookingForm
            initialPatient={selectedPatient}
            onBooked={onBooked}
            onClose={startOver}
          />
        </>
      )}

      {/* ---- Step 3: done ---- */}
      {bookedAppointment && selectedPatient && (
        <Card elevation="elevated">
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">Appointment booked</h2>
              <p className="text-sm text-muted-foreground">
                {selectedPatient.fullName} ({selectedPatient.uhid}) is now in the live queue.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{bookedAppointment.doctorName}</span>
              <span className="text-muted-foreground">&middot;</span>
              <span className="font-mono tabular-nums">
                {bookedAppointment.slotDate} &middot; {bookedAppointment.slotTime}
              </span>
              <span className="text-muted-foreground">&middot;</span>
              <StatusPill tone="info" size="sm">Booked</StatusPill>
            </div>
          </div>
        </Card>
      )}
    </WorkspacePageLayout>
  );
}

/* ---------- FormSection ---------- */

interface FormSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function FormSection({ title, subtitle, children }: FormSectionProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="text-xxs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ---------- BloodGroupPills ---------- */

interface BloodGroupPillsProps {
  value: string;
  onChange: (next: string) => void;
}

function BloodGroupPills({ value, onChange }: BloodGroupPillsProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BLOOD_GROUPS.map((bg) => {
        const active = value === bg;
        return (
          <button
            key={bg} type="button"
            onClick={() => onChange(active ? '' : bg)}
            aria-pressed={active}
            className={cn(
              'min-w-[2.5rem] rounded-full border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-hairline bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            {bg}
          </button>
        );
      })}
      {value && (
        <button
          type="button" onClick={() => onChange('')}
          className="text-xxs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
