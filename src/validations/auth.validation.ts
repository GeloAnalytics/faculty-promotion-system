import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2),
    email: z.string().trim().email(),
    password: z.string().min(8),
    employeeId: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'Employee ID must contain exactly 10 digits')
      .optional(),
    role: z.nativeEnum(UserRole).refine((value) => value === UserRole.EMPLOYEE || value === UserRole.EVALUATOR, {
      message: 'Registration role must be Employee or Evaluator',
    }),
  })
  .superRefine((value, ctx) => {
    if (value.role === UserRole.EMPLOYEE && !value.employeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['employeeId'],
        message: 'Employee ID is required for employee accounts',
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});
