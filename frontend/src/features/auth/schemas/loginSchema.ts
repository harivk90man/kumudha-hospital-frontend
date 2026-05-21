import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ required_error: 'Username is required' })
    .min(3, 'Username must be at least 3 characters'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(4, 'Password must be at least 4 characters'),
  remember: z.boolean().optional().default(false),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
