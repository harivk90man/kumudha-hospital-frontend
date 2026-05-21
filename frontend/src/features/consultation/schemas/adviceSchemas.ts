import { z } from 'zod';

export const followUpSchema = z.object({
  afterDays: z.coerce
    .number({ invalid_type_error: 'Pick a number of days' })
    .int()
    .min(1, 'At least 1 day')
    .max(365, 'Max 365 days'),
  modality: z.enum(['in_person', 'tele']),
  notes: z.string().optional().default(''),
});

export type FollowUpFormValues = z.infer<typeof followUpSchema>;

export const admissionAdviceSchema = z.object({
  reason: z.string().min(3, 'Reason is required'),
  wardType: z.enum(['general', 'semi_private', 'private', 'icu']),
  urgency: z.enum(['routine', 'urgent', 'emergency']),
  notes: z.string().optional().default(''),
});

export type AdmissionAdviceFormValues = z.infer<typeof admissionAdviceSchema>;
