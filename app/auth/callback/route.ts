import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // request.url is already absolute — parse it directly instead of
    // reconstructing it from the host header (which mis-parsed when the host
    // appeared more than once and hardcoded the protocol from NODE_ENV).
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const redirectTo = requestUrl.searchParams.get("redirect_to")?.toString();
    // Prefer the configured site URL so redirects use the public origin even
    // behind a proxy; fall back to the request's own origin.
    const origin = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;

    if (!code) {
      console.error("No code provided in auth callback");
      return NextResponse.redirect(`${origin}/auth/error`);
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Auth exchange error:", error);
      return NextResponse.redirect(`${origin}/auth/error`);
    }

    // Successful authentication
    const finalRedirect = redirectTo 
      ? `${origin}${redirectTo}`
      : `${origin}/protected`;

    return NextResponse.redirect(finalRedirect);
  } catch (error) {
    console.error("Auth callback error:", error);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${origin}/auth/error`);
  }
}
