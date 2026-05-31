import { z } from 'zod';

/**
 * Vitals edit form schema — ranges mirror schema-11 §1 CHECK constraints.
 * BMI is intentionally omitted: it's a generated column on the DB.
 *
 * Every field is optional: the doctor may correct only one value (e.g. BP)
 * without filling in others. Empty strings become `undefined` via the
 * `.transform`, so `react-hook-form` can keep the inputs controlled.
 */
const optionalIntInRange = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number(), z.literal('')])
    .transform((v) => (v === '' || v === undefined || v === null ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= min && v <= max), {
      message: `${label} must be between ${min} and ${max}`,
    });

const optionalDecimalInRange = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number(), z.literal('')])
    .transform((v) => (v === '' || v === undefined || v === null ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= min && v <= max), {
      message: `${label} must be between ${min} and ${max}`,
    });

export const vitalsEditSchema = z
  .object({
    bpSystolic:       optionalIntInRange(60, 300,   'Systolic BP'),
    bpDiastolic:      optionalIntInRange(30, 200,   'Diastolic BP'),
    pulseRate:        optionalIntInRange(20, 300,   'Pulse'),
    spo2:             optionalIntInRange(0,  100,   'SpO₂'),
    temperatureF:     optionalDecimalInRange(90, 115,  'Temperature'),
    respiratoryRate:  optionalIntInRange(5,  60,    'Respiratory rate'),
    weightKg:         optionalDecimalInRange(0.5, 500, 'Weight'),
    heightCm:         optionalDecimalInRange(10, 300,  'Height'),
    bloodSugarMgDl:   optionalIntInRange(10, 1500, 'Blood sugar'),
    painScore:        optionalIntInRange(0,  10,   'Pain score'),
    notes:            z.string().optional(),
  })
  // BP pairs: if one is set, the other must be too.
  .refine(
    (v) => (v.bpSystolic == null) === (v.bpDiastolic == null),
    { message: 'Enter both systolic and diastolic BP, or leave both blank', path: ['bpSystolic'] },
  );

export type VitalsEditFormValues = z.infer<typeof vitalsEditSchema>;
