import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { readAccountState } from "@/app/types/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { CLIENT_HOME, nextPathFor, ROLE_PICKER_PATH } from "@/lib/auth-redirect";

import { AuthShell } from "../auth-shell";

/**
 * /streamer-sign-up — kept alive as a signpost, not a form.
 *
 * This URL used to be a nineteen-field wall (photo, video link, five portfolio
 * images: 30-60 minutes) that produced *nothing* if someone stopped halfway —
 * no email, no phone, no way to follow up. All of it now lives in
 * /streamer-setup, which runs after an account exists.
 *
 * The URL itself cannot just be deleted: it is advertised on the sign-in page,
 * in the tutorial and on /streamer-verification, and links already in the wild
 * must keep landing somewhere sensible. So it forwards, carrying the one thing
 * it knows that /sign-up does not — that this person came here to be a host —
 * as `intent=host`, which the role picker uses to pre-highlight that card.
 */

export const metadata = {
  title: "Daftar Jadi Host | Salda",
  // A pure forwarding stub has nothing to offer a crawler, and indexing it
  // would compete with the real host-facing pages.
  robots: { index: false, follow: false },
};

// The destination depends entirely on who is signed in, so this must never be
// served from a build-time cache.
export const dynamic = "force-dynamic";

export default async function StreamerSignUpEntry() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out: make the account first — two short steps, then the picker.
  // `intent=host` is parked in sessionStorage by /sign-up so it survives both
  // account creation and the Google OAuth round trip.
  if (!user) {
    redirect("/sign-up?intent=host");
  }

  // The same read the server actions, the OAuth callback and the middleware
  // use, so all four agree about what this account has finished.
  const state = await readAccountState(supabase, user.id);

  // Signed in but no role yet — which is exactly the question the picker asks.
  // A missing users row goes there too: the picker's action is what can explain
  // an incomplete account, and this page cannot.
  if (!state?.userType) {
    redirect(ROLE_PICKER_PATH);
  }

  if (state.userType === "streamer") {
    // nextPathFor decides between setup, verification and the dashboard; this
    // page does not get its own opinion about where a host belongs.
    redirect(nextPathFor(state));
  }

  // A brand account followed a "daftar sebagai host" link. Bouncing them to the
  // brand dashboard without a word would read as a broken link, so say what
  // happened and offer both ways out.
  return (
    // No proof panel: this screen explains a dead end, it does not sell one.
    // Same card, same width and same type as the rest of the flow.
    <AuthShell>
      <h1 className="font-serif text-section font-medium text-ink">
        Akun ini terdaftar sebagai brand
      </h1>
      <p className="mt-2 text-copy text-ink-muted">
        Kamu sedang masuk dengan akun brand, jadi pendaftaran host tidak berlaku di
        sini. Satu akun hanya punya satu peran — kalau kamu ingin jadi host live
        streaming, tim Salda bisa membantu memindahkan akun kamu lewat dukungan
        WhatsApp.
      </p>

      {/* The pair shares a row from `sm` up and never wraps: below that the
          card itself is narrower than the two labels laid end to end. */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        {/* The screen's one accent. */}
        <Button asChild variant="brand" size="action-compact" className="sm:flex-1">
          <Link href={CLIENT_HOME}>
            Ke dashboard brand
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>

        <Button asChild variant="quiet" size="action-compact" className="sm:flex-1">
          <Link href="/streamers">Lihat daftar host</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
