import { z } from 'zod';

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

/**
 * Vitals capture form (BRD §1 step 6). Field names + units mirror schema
 * 050 `vitals` columns 1:1 (camelCase here, snake_case in DB). Server
 * generates `bmi` and stamps `recorded_by` / `recorded_at`.
 *
 * Ranges mirror the DB check constraints in V32__create_vitals.sql so
 * the user gets a form-level error instead of a 500.
 */
export const vitalsSchema = z
  .object({
    bpSystolic:        optionalNumber,
    bpDiastolic:       optionalNumber,
    pulseRate:         optionalNumber,
    temperatureF:      optionalNumber,
    spo2:              optionalNumber,
    respiratoryRate:   optionalNumber,
    weightKg:          optionalNumber,
    heightCm:          optionalNumber,
    bloodSugarRandom:  optionalNumber,
    bloodSugarFasting: optionalNumber,
    painScore:         optionalNumber,
    notes:             z.string().optional(),
    chiefComplaint:    z.string().min(2, 'Capture the patient\'s reason for visit'),
  })
  .superRefine((v, ctx) => {
    const check = (
      val: number | undefined,
      min: number,
      max: number,
      path: string,
      label: string,
    ): void => {
      if (val !== undefined && (val < min || val > max)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be ${min}–${max}`,
          path: [path],
        });
      }
    };
    check(v.bpSystolic,       60,   300,  'bpSystolic',       'BP systolic (mmHg)');
    check(v.bpDiastolic,      30,   200,  'bpDiastolic',      'BP diastolic (mmHg)');
    check(v.pulseRate,        20,   300,  'pulseRate',        'Pulse rate (bpm)');
    check(v.temperatureF,     90,   115,  'temperatureF',     'Temperature (°F)');
    check(v.spo2,              0,   100,  'spo2',             'SpO₂ (%)');
    check(v.respiratoryRate,   5,    60,  'respiratoryRate',  'Respiratory rate (/min)');
    check(v.weightKg,        0.5,   500,  'weightKg',         'Weight (kg)');
    check(v.heightCm,         10,   300,  'heightCm',         'Height (cm)');
    check(v.bloodSugarRandom, 10,  1500,  'bloodSugarRandom', 'Blood sugar random (mg/dL)');
    check(v.bloodSugarFasting,10,  1500,  'bloodSugarFasting','Blood sugar fasting (mg/dL)');
    check(v.painScore,         0,    10,  'painScore',        'Pain score');
  });

export type VitalsFormValues = z.infer<typeof vitalsSchema>;
