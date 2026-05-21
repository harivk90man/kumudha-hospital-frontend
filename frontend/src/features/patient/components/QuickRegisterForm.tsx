import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { FormInput, FormSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { createPatient } from '../patientApi';
import type { CreatePatientInput, Gender, PatientSummary } from '../patientTypes';

/**
 * Minimal "just enough to register" form for front-desk rush flows.
 * Four required fields — name (split as first/last), gender, mobile,
 * date of birth. Everything else (blood group, address, allergies,
 * chronic conditions, ID proofs) is captured later from the patient
 * profile if needed.
 *
 * Used by:
 *   - WalkInPage — inline-expanded when "Register new patient" clicks
 *     and the user has searched-no-match. Avoids the forced
 *     visit-details handoff in the full RegistrationPage.
 *   - RegistrationPage — surfaced as the "Quick" mode toggle for
 *     rush registrations; the full form remains for full captures.
 */

const quickSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  gender: z.enum(['m', 'f', 'o'], {
    errorMap: () => ({ message: 'Gender is required' }),
  }),
  mobile: z
    .string()
    .min(7, 'Enter a valid mobile')
    .regex(/^[+\d\s-]+$/, 'Digits, spaces, +, and - only'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
});

type QuickFormValues = z.infer<typeof quickSchema>;

interface QuickRegisterFormProps {
  /** Pre-fills mobile (or UHID-as-mobile) from a parent search. */
  prefillMobile?: string;
  /** Called with the created patient on successful submit. */
  onCreated: (patient: PatientSummary) => void;
  /** Optional cancel — usually collapses the inline form. */
  onCancel?: () => void;
  /** Submit button label override. */
  submitLabel?: string;
}

export function QuickRegisterForm({
  prefillMobile = '',
  onCreated,
  onCancel,
  submitLabel = 'Register patient',
}: QuickRegisterFormProps): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    setError,
  } = useForm<QuickFormValues>({
    resolver: zodResolver(quickSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: 'm',
      mobile: prefillMobile,
      dateOfBirth: '',
    },
  });

  // Auto-focus the first-name field on mount so the receptionist can
  // start typing immediately. Mobile is usually already prefilled from
  // the parent search, so first name is the natural next field.
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    firstNameRef.current?.focus();
  }, []);

  const { ref: rhfFirstNameRef, ...firstNameRest } = register('firstName');

  const onSubmit = async (values: QuickFormValues): Promise<void> => {
    try {
      const input: CreatePatientInput = {
        firstName: values.firstName,
        lastName: values.lastName,
        gender: values.gender as Gender,
        dateOfBirth: values.dateOfBirth,
        mobile: values.mobile,
      };
      const created = await createPatient(input);
      onCreated(created);
    } catch (e) {
      setError('mobile', {
        type: 'manual',
        message:
          e instanceof Error
            ? e.message
            : 'Couldn’t register the patient. Try again.',
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 rounded-md border border-hairline bg-muted/20 p-3"
    >
      <p className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
        Quick register — just the essentials
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <FormInput
          label="First name"
          requiredMark
          error={errors.firstName?.message}
          {...firstNameRest}
          ref={(el) => {
            rhfFirstNameRef(el);
            firstNameRef.current = el;
          }}
        />
        <FormInput
          label="Last name"
          requiredMark
          error={errors.lastName?.message}
          {...register('lastName')}
        />
        <FormSelect
          label="Gender"
          requiredMark
          error={errors.gender?.message}
          {...register('gender')}
        >
          <option value="m">Male</option>
          <option value="f">Female</option>
          <option value="o">Other</option>
        </FormSelect>
        <FormInput
          label="Mobile"
          requiredMark
          placeholder="+91 98765 43210"
          error={errors.mobile?.message}
          {...register('mobile')}
        />
        <FormInput
          label="Date of birth"
          type="date"
          requiredMark
          error={errors.dateOfBirth?.message}
          {...register('dateOfBirth')}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? <Spinner size="sm" /> : <UserPlus />}
          {isSubmitting ? 'Registering…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
