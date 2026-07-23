import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AdminShell from "./admin-shell";

/**
 * Server-side gate for the entire /admin section.
 *
 * There is no admin role in the data model (user_type is only
 * 'client' | 'streamer'), so admin access is granted via an explicit
 * allowlist of email addresses in the ADMIN_EMAILS environment variable
 * (comma-separated). This is fail-closed: if ADMIN_EMAILS is unset or the
 * caller is not on the list, they are redirected away.
 *
 * Set ADMIN_EMAILS in your environment, e.g.:
 *   ADMIN_EMAILS="owner@salda.id,ops@salda.id"
 */
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in -> send to sign-in (middleware also guards /admin, but this
  // makes the server component self-sufficient).
  if (!user) {
    redirect("/sign-in?redirect_to=/admin");
  }

  const adminEmails = getAdminEmails();
  const email = user.email?.toLowerCase();

  if (!email || adminEmails.length === 0 || !adminEmails.includes(email)) {
    // Authenticated but not an admin (or no allowlist configured) -> deny.
    redirect("/");
  }

  return <AdminShell>{children}</AdminShell>;
}
