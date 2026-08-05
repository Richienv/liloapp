// Server-only by construction: utils/supabase/server calls next/headers, which
// throws if this module is ever pulled into a client component. The `server-only`
// package would state that intent more loudly, but it is not a dependency here
// and adding one for a comment is not worth the lockfile churn.
import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One definition of "is this person an admin".
 *
 * The same allowlist parse was previously copy-pasted into the admin layout,
 * the admin server actions and the verification queue — three copies that had
 * already drifted in what they did when the check failed. Revoking someone's
 * access is only safe if there is one place that decides.
 *
 * Note there are still two sources of truth by design: this env allowlist for
 * the application layer, and `public.admin_users` for database RLS. They must
 * be kept in sync; the database one is what protects a direct PostgREST call,
 * this one is what protects a server action.
 */

export interface AdminIdentity {
  email: string;
  userId: string;
  supabase: SupabaseClient;
}

/** Parse ADMIN_EMAILS once, normalised for comparison. */
function allowlist(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const allowed = allowlist();
  // Fail closed: an unset or empty ADMIN_EMAILS makes nobody an admin, rather
  // than making everybody one.
  if (allowed.length === 0) return false;
  if (!email) return false;
  return allowed.includes(email.toLowerCase());
}

/**
 * Resolve the caller's admin identity, or null.
 *
 * Every admin server action must call this itself. A server action is a
 * directly-POSTable endpoint — the fact that `app/admin/layout.tsx` guards the
 * page it was rendered from protects nothing.
 */
export async function getAdmin(): Promise<AdminIdentity | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isAdminEmail(user.email)) return null;

  return { email: user.email, userId: user.id, supabase };
}
