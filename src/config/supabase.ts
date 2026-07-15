import { createClient, SupabaseClient, RealtimeClientOptions } from '@supabase/supabase-js';
import WebSocket from 'ws';
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
    _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      // This app only ever uses supabase.storage (a plain REST API), never
      // Realtime - but the SupabaseClient constructor unconditionally spins
      // up a RealtimeClient, which throws on Node < 22 without a WebSocket
      // constructor supplied explicitly.
      realtime: {
        transport: WebSocket as unknown as RealtimeClientOptions['transport'],
      },
    });
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
