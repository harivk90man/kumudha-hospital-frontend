import { z } from 'zod';

export const consultationNotesSchema = z.object({
  chiefComplaint: z.string().min(3, 'Chief complaint is required'),
  historyOfPresentIllness: z.string().optional().default(''),
  examinationFindings: z.string().optional().default(''),
  clinicalImpression: z.string().optional().default(''),
  advice: z.string().optional().default(''),
});

export type ConsultationNotesFormValues = z.infer<typeof consultationNotesSchema>;

/**
 * Diagnosis form values per TSD-07 §4.2 — single `type` enum
 * (primary | secondary | provisional | rule_out).
 */
export const diagnosisSchema = z.object({
  icd10: z.string().optional().default(''),
  description: z.string().min(2, 'Diagnosis description is required'),
  type: z.enum(['primary', 'secondary', 'provisional', 'rule_out']),
});

export type DiagnosisFormValues = z.infer<typeof diagnosisSchema>;
