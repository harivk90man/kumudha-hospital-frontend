import { z } from 'zod';

/**
 * BRD §1 step 2 new-patient capture. Aligns with TSD-03 §4.1 `patients`
 * required columns: first_name, last_name, gender, dob, mobile.
 */
export const newPatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  gender: z.enum(['m', 'f', 'o'], {
    errorMap: () => ({ message: 'Gender is required' }),
  }),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  mobile: z
    .string()
    .min(7, 'Enter a valid mobile')
    .regex(/^[+\d\s-]+$/, 'Digits, spaces, +, and - only'),
  bloodGroup: z.string().optional(),
  /**
   * Indian government identity numbers — both optional. Loose
   * client-side checks; backend does the authoritative validation
   * (Aadhaar Verhoeff checksum + PAN regex).
   */
  aadhaar: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{4}\s?\d{4}\s?\d{4}$/.test(v.trim()),
      'Aadhaar must be 12 digits',
    ),
  pan: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[A-Z]{5}\d{4}[A-Z]$/i.test(v.trim()),
      'PAN format: ABCDE1234F',
    ),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
  /** Captured via <ChipInput> — Enter-to-add, click-x-to-remove. */
  allergies: z.array(z.string()).optional(),
  chronicConditions: z.array(z.string()).optional(),
});

export type NewPatientFormValues = z.infer<typeof newPatientSchema>;

/**
 * Doctor + chief-complaint capture + consult-fee item. The receptionist
 * creates the encounter and the (unpaid) invoice — the patient is then
 * directed to the billing counter where the cashier records the
 * payment. Per BRD §1 step 4 + role-permission split, reception does
 * NOT mark the invoice paid.
 */
export const visitDetailsSchema = z.object({
  doctorId: z.string().min(1, 'Pick a doctor'),
  chiefComplaint: z.string().min(2, "Capture the patient's reason for visit"),
  /** ID of the consultation service from `services_catalog`. */
  serviceId: z.string().min(1, 'Pick a fee item'),
});

export type VisitDetailsFormValues = z.infer<typeof visitDetailsSchema>;
