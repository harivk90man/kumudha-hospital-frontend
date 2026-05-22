import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useNetworkActivity } from '@/store/networkActivityStore';

/**
 * DEMO-ONLY direct Supabase client.
 *
 * Long-term, this project is meant to connect to a Spring Boot backend
 * via the axios-shaped `httpClient` in `lib/http/httpClient.ts`
 * (see CLAUDE.md §3.5). For the demo we wire selected feature APIs
 * directly to Supabase so the existing UI can persist real data without
 * a backend.
 *
 * To migrate post-demo:
 *   1. Stand up the Spring backend.
 *   2. Replace each `supabase.from(...)` call inside the `<feature>Api.ts`
 *      file with the matching `httpClient.get/post/...` call.
 *   3. Delete this file + uninstall `@supabase/supabase-js`.
 *
 * Notes:
 *   - Uses the anon key — no real auth. The grants migration
 *     (950_demo_grants.sql) opens the schema to the anon role and
 *     disables RLS so the demo can read/write freely.
 *   - The seeded bootstrap admin (`users` row with employee_id = 'EMP001')
 *     is used as the current actor for `created_by` / `updated_by` audit
 *     columns via the `DEMO_USER_ID` constant below.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Throw at module load so we fail fast in dev rather than getting
  // confusing 401s later when the client tries to hit an empty URL.
  // eslint-disable-next-line no-console
  console.error(
    '[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Set them in frontend/.env and restart the dev server.',
  );
}

const trackedFetch: typeof fetch = async (input, init) => {
  useNetworkActivity.getState().increment();
  try {
    return await fetch(input, init);
  } finally {
    useNetworkActivity.getState().decrement();
  }
};

const AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
};

export const supabase: SupabaseClient = createClient(url ?? '', anonKey ?? '', {
  auth: AUTH_OPTIONS,
  global: { fetch: trackedFetch },
});

/** Silent client for background polls — uses native fetch so the progress bar is never triggered. */
export const supabaseSilent: SupabaseClient = createClient(url ?? '', anonKey ?? '', {
  auth: AUTH_OPTIONS,
});

/**
 * Bootstrap admin's id — seeded in `900_seed_data.sql` with this hardcoded UUID.
 * Used as the actor for `created_by` / `updated_by` audit columns until real auth is wired.
 */
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

/** Whether the Supabase client is configured (env vars present). */
export const isSupabaseConfigured = (): boolean => Boolean(url) && Boolean(anonKey);
