import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin";
import AdminShell from "./admin-shell";

/**
 * Server-side gate for the entire /admin section.
 *
 * The allowlist parse and the membership test used to live here, copy-pasted
 * into `app/admin/actions.ts` and the verification queue as well. They are now
 * in `lib/admin.ts` so that revoking access changes one file, and so that all
 * three surfaces fail the same way.
 *
 * Failure is uniform across every admin surface: `getAdmin()` returning null —
 * whether that means "not signed in" or "signed in but not on the allowlist" —
 * sends the caller to `/`. The signed-out case does not need a friendlier
 * answer here: `utils/supabase/middleware.ts` lists `/admin` as a protected
 * prefix and has already bounced anonymous requests to
 * `/sign-in?redirect_to=...` at the edge, before this layout runs.
 *
 * This layout is not a security boundary for anything but page rendering. Every
 * server action re-checks on its own, because a server action is a POST
 * endpoint that never renders the layout.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdmin();

  if (!admin) {
    redirect("/");
  }

  return <AdminShell>{children}</AdminShell>;
}
