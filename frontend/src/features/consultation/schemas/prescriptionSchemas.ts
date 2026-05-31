import { z } from 'zod';

/**
 * Frequency is free varchar per TSD-07 §4.5.
 * STANDARD_FREQUENCIES is an autocomplete list, not a validator constraint.
 */
export const prescriptionItemSchema = z.object({
  medicineId: z.string().min(1, 'Select a medicine'),
  medicineNameSnapshot: z.string().min(1),
  strength: z.string().min(1),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  route: z.string().min(1, 'Route is required').default('PO'),
  durationDays: z.coerce.number().int().min(1, 'Duration ≥ 1 day').max(180),
  foodTiming: z.enum(['After food', 'Before food', 'With food', 'Empty stomach']).default('After food'),
  quantityPrescribed: z.coerce.number().int().min(0).optional(),
  instructions: z.string().optional().default(''),
  /** Required only when prescribing a medicine with severity=expired|out_of_stock. */
  overrideReason: z.string().optional().default(''),
});

export type PrescriptionItemFormValues = z.infer<typeof prescriptionItemSchema>;

export const saveTemplateSchema = z.object({
  name: z.string().min(3, 'Template name must be at least 3 characters'),
});

export type SaveTemplateFormValues = z.infer<typeof saveTemplateSchema>;

export const stockOverrideSchema = z.object({
  reason: z
    .string()
    .min(8, 'Override reason must be at least 8 characters (will be audited).'),
});

export type StockOverrideFormValues = z.infer<typeof stockOverrideSchema>;
