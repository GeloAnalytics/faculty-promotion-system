import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AUTH_SECRET: z.string().min(32).default('development-auth-secret-change-me-123456'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),
  OCR_PROVIDER: z.enum(['windows', 'http', 'ocrspace', 'disabled']).default('windows'),
  OCR_API_URL: z.string().trim().optional(),
  OCR_API_KEY: z.string().trim().optional(),
  OCR_API_KEY_HEADER: z.string().trim().default('Authorization'),
  OCR_FILE_FIELD_NAME: z.string().trim().default('file'),
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  SUPABASE_URL: z.string().url().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
export const MAX_UPLOAD_SIZE_MB = 50;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
