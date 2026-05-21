import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check } from 'lucide-react';
import { Breadcrumb } from '@/components/data-display';
import {
  BloodGroupPills,
  ChipInput,
  DatePicker,
  FormErrorContainer,
  FormInput,
  FormSelect,
} from '@/components/form';
import { Button } from '@/components/ui/button';
import { homeForRole, useAuth } from '@/features/auth';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { fetchPatient, updatePatient } from './patientApi';
import type { Gender, PatientSummary } from './patientTypes';
import { cn } from '@/utils/cn';

const ALLERGY_SUGGESTIONS = [
  'Penicillin', 'Sulfa', 'Aspirin', 'Ibuprofen', 'Iodine', 'Latex', 'Peanuts', 'Shellfish',
];

const CHRONIC_SUGGESTIONS = [
  'Hypertension', 'Type 2 Diabetes', 'Type 1 Diabetes', 'Asthma',
  'COPD', 'Hypothyroidism', 'Coronary artery disease', 'CKD',
];

const schema = z.object({
  firstName:         z.string().min(1, 'First name required'),
  lastName:          z.string().min(1, 'Last name required'),
  gender:            z.enum(['m', 'f', 'o']),
  dateOfBirth:       z.string().optional(),
  mobile:            z.string().min(4, 'Mobile required'),
  email:             z.string().email().optional().or(z.literal('')),
  bloodGroup:        z.string().optional(),
  addressLine1:      z.string().optional(),
  addressLine2:      z.string().optional(),
  city:              z.string().optional(),
  pincode:           z.string().optional(),
  state:             z.string().optional(),
  aadhaar:           z.string().optional(),
  pan:               z.string().optional(),
  allergies:         z.array(z.string()).optional(),
  chronicConditions: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof schema>;

const toFormValues = (p: PatientSummary): FormValues => ({
  firstName:         p.firstName,
  lastName:          p.lastName,
  gender:            p.gender,
  dateOfBirth:       p.dateOfBirth ?? '',
  mobile:            p.mobile ?? '',
  email:             p.email ?? '',
  bloodGroup:        p.bloodGroup ?? '',
  addressLine1:      p.address?.line1 ?? '',
  addressLine2:      p.address?.line2 ?? '',
  city:              p.address?.city ?? '',
  pincode:           p.address?.pincode ?? '',
  state:             p.address?.state ?? '',
  aadhaar:           '',
  pan:               '',
  allergies:         p.allergies?.map((a) => a.allergen),
  chronicConditions: p.chronicConditions,
});

export function PatientEditPage(): JSX.Element {
  const { uhid = '' } = useParams<{ uhid: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const homePath = user ? homeForRole(user.role) : '/';

  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  const {
    register, handleSubmit, reset, control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '', lastName: '', gender: 'm', dateOfBirth: '', mobile: '', email: '',
      bloodGroup: '', addressLine1: '', addressLine2: '',
      city: '', pincode: '', state: '', aadhaar: '', pan: '',
      allergies: [], chronicConditions: [],
    },
  });

  useUnsavedChangesGuard(isDirty);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    fetchPatient(uhid)
      .then((p) => {
        if (!alive) return;
        if (!p) { setLoadError('Patient not found.'); return; }
        setPatient(p);
        reset(toFormValues(p));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load patient details.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uhid, reset, reloadTick]);

  const onSubmit = async (values: FormValues): Promise<void> => {
    setSubmitError(null);
    try {
      const hasAddress = [values.addressLine1, values.addressLine2, values.city, values.pincode, values.state].some((s) => s?.trim());
      await updatePatient(uhid, {
        firstName:  values.firstName,
        lastName:   values.lastName,
        gender:     values.gender as Gender,
        dateOfBirth: values.dateOfBirth || undefined,
        mobile:     values.mobile,
        email:      values.email || undefined,
        bloodGroup: values.bloodGroup || undefined,
        address: hasAddress ? {
          line1:   values.addressLine1 || undefined,
          line2:   values.addressLine2 || undefined,
          city:    values.city || undefined,
          pincode: values.pincode || undefined,
          state:   values.state || undefined,
        } : undefined,
        allergies:         (values.allergies?.length ?? 0) ? values.allergies : undefined,
        chronicConditions: (values.chronicConditions?.length ?? 0) ? values.chronicConditions : undefined,
      });
      reset(values);
      navigate(`/patient/${uhid}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save changes.');
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="px-4 pt-5 md:px-6 md:pt-6">
        <Breadcrumb
          items={[
            { label: patient?.fullName ?? uhid, to: `/patient/${uhid}` },
            { label: 'Edit' },
          ]}
          homeTo={homePath}
          homeLabel="Home"
        />
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-5 pt-4 md:px-6">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/patient/${uhid}`)}
            className="-ml-2 mb-1 h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Edit patient
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {patient ? `${patient.fullName} · ${uhid}` : uhid}
          </p>
        </div>

        {patient && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="w-44 justify-center"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting || !isDirty}
            >
              <Check className="h-4 w-4" />
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-44 justify-center"
              onClick={() => navigate(`/patient/${uhid}`)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto border-t border-hairline">
        <div className="px-4 py-5 md:px-6">
          {loading ? null : loadError || !patient ? (
            <FormErrorContainer
              title="Could not load patient."
              description={loadError ?? 'Patient not found.'}
              onRetry={() => setReloadTick((t) => t + 1)}
            />
          ) : (
            <form onSubmit={handleSubmit(onSubmit)}>
              {submitError && (
                <div className="mb-5">
                  <FormErrorContainer
                    title="Could not save changes."
                    description={submitError}
                    onRetry={handleSubmit(onSubmit)}
                  />
                </div>
              )}

              <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">

                {/* ===== LEFT COLUMN ===== */}
                <div className="flex flex-col gap-6">

                  <FormSection title="Identity">
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormInput
                        variant="flat" label="First name" placeholder="First name"
                        requiredMark error={errors.firstName?.message}
                        {...register('firstName')}
                      />
                      <FormInput
                        variant="flat" label="Last name" placeholder="Last name"
                        requiredMark error={errors.lastName?.message}
                        {...register('lastName')}
                      />
                      <FormSelect
                        variant="flat" label="Gender" requiredMark
                        error={errors.gender?.message}
                        {...register('gender')}
                      >
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
                            value={field.value ?? ''} onChange={field.onChange}
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

                {/* ===== RIGHT COLUMN ===== */}
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
                            label="Allergies" hideLabel flat
                            placeholder="Type allergy and press Enter"
                            values={field.value ?? []} onChange={field.onChange}
                            suggestions={ALLERGY_SUGGESTIONS}
                            error={fieldState.error?.message}
                          />
                        )}
                      />
                      <Controller
                        name="chronicConditions" control={control}
                        render={({ field, fieldState }) => (
                          <ChipInput
                            label="Chronic conditions" hideLabel flat
                            placeholder="Type condition and press Enter"
                            values={field.value ?? []} onChange={field.onChange}
                            suggestions={CHRONIC_SUGGESTIONS}
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
        </div>
      </div>
    </div>
  );
}

/* ---------- FormSection ---------- */

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <span className={cn('text-xs font-bold uppercase tracking-wide text-muted-foreground')}>
        {title}
      </span>
      {children}
    </div>
  );
}
