import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole).refine((value) => value === UserRole.EMPLOYEE || value === UserRole.EVALUATOR, {
    message: 'Registration role must be Employee or Evaluator',
  }),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});
