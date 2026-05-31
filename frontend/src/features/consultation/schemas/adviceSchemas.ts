import { z } from 'zod';

export const followUpSchema = z.object({
  /** ISO yyyy-mm-dd. Empty string allowed (means no follow-up scheduled). */
  followUpDate: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a valid date')
    .default(''),
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
