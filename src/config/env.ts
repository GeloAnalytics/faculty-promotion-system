import 'dotenv/config';
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
      .enum(['windows', 'google-vision', 'http', 'ocrspace', 'tesseract', 'disabled'])
      .default('tesseract'),
    OCR_API_URL: z.string().trim().optional(),
    OCR_API_KEY: z.string().trim().optional(),
    GOOGLE_VISION_API_KEY: z.string().trim().optional(),
    OCR_API_KEY_HEADER: z.string().trim().default('Authorization'),
    OCR_FILE_FIELD_NAME: z.string().trim().default('file'),
    OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    // Per-file upload cap of the cloud OCR provider (OCR.space free plan: 1 MB).
    // Larger pages are re-compressed to fit before upload.
    OCR_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional(),
    // Most pages OCR'd per scanned document (default 100).
    OCR_MAX_PAGES: z.coerce.number().int().positive().optional(),
    SUPABASE_URL: z.string().default(''),
    SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
    // Public anon key — safe to expose to the browser (used for direct storage uploads via signed URLs)
    SUPABASE_ANON_KEY: z.string().default(''),
    // Cloudflare R2 Object Storage
    R2_ACCOUNT_ID: z.string().trim().default(''),
    R2_ACCESS_KEY_ID: z.string().trim().default(''),
    R2_SECRET_ACCESS_KEY: z.string().trim().default(''),
    R2_BUCKET_NAME: z.string().trim().default('documents'),
    R2_PUBLIC_URL: z.string().trim().default(''),
    // Generic S3 overrides (AWS S3, Wasabi, MinIO, Backblaze B2)
    S3_ENDPOINT: z.string().trim().default(''),
    S3_REGION: z.string().trim().default('auto'),
    S3_ACCESS_KEY_ID: z.string().trim().default(''),
    S3_SECRET_ACCESS_KEY: z.string().trim().default(''),
    S3_BUCKET_NAME: z.string().trim().default(''),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  });

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
export const MAX_UPLOAD_SIZE_MB = 200;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
