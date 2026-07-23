import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client used for signup rollback/cleanup.
//
// IMPORTANT: SUPABASE_SERVICE_ROLE_KEY must be set in the environment for
// signup rollback/cleanup (deleting orphaned auth users, rows, and storage
// objects) to work. If it is not set, this factory returns `null` and callers
// must degrade gracefully (log a warning and skip cleanup) rather than throw.
//
// Never expose this client to the browser — the service-role key bypasses RLS.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
