import { z } from 'zod';

const INSECURE_AUTH_SECRETS = new Set([
  'development-auth-secret-change-me-123456',
  'change-this-to-a-long-random-production-secret',
]);

const envSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .default('postgresql://user:pass@localhost:5432/faculty_promotion?schema=public'),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    AUTH_SECRET: z
      .string()
      .default('a-fallback-production-auth-secret-for-deployment-testing-123456789'),
    CORS_ORIGIN: z.string().default('*'),
    TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),
    OCR_PROVIDER: z
      .enum(['windows', 'http', 'ocrspace', 'tesseract', 'disabled'])
      .default('ocrspace'),
    OCR_API_URL: z.string().trim().optional(),
    OCR_API_KEY: z.string().trim().optional(),
    OCR_API_KEY_HEADER: z.string().trim().default('Authorization'),
    OCR_FILE_FIELD_NAME: z.string().trim().default('file'),
    OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    SUPABASE_URL: z.string().default(''),
    SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  });

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
export const MAX_UPLOAD_SIZE_MB = 50;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
