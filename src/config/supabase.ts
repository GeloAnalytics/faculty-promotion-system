import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

export const DOCUMENTS_BUCKET = 'documents';

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use document storage',
      );
    }
    _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

export async function ensureDocumentsBucket(): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const supabase = getSupabase();
  const { data: existing } = await supabase.storage.getBucket(DOCUMENTS_BUCKET);
  if (existing) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(DOCUMENTS_BUCKET, {
    public: false,
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Failed to create Supabase storage bucket '${DOCUMENTS_BUCKET}': ${createError.message}`);
  }
}
