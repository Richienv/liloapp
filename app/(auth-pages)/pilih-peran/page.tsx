"use client";

import { selectRoleAction } from "@/app/actions";
import { readAccountState, type AuthActionResponse } from "@/app/types/auth";
import { FormMessage } from "@/components/form-message";
import { CityCombobox } from "@/components/ui/city-combobox";
import { nextPathFor, ROLE_PICKER_PATH, type UserRole } from "@/lib/auth-redirect";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, ArrowRight, Loader2, Radio, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

/**
 * "Saya ingin…" — the one question signup no longer asks up front.
 *
 * The account already exists by the time anyone sees this page, which is the
 * whole point: an abandonment here costs us a profile, not a person. The role
 * itself is chosen, never typed.
 *
 * A brand then answers exactly one more question — which city they are in — on
 * a second screen. It is the only field here, and it is here because leaving it
 * out is not free: `components/streamer-card` reads `users.location` /
 * `users.city_slug` to work out how long shipping a product to the host takes,
 * and with no city on file every brand is quietly charged the out-of-town
 * 3-day lead time, even for a host in their own city. One picker beats two
 * silently wasted days on every booking.
 *
 * It is a second step rather than a field inside the brand card because each
 * card is itself the submit button, and a combobox is a button too — nesting
 * one inside the other is invalid HTML and unusable with a keyboard.
 */

/**
 * Written by /sign-up when the visitor arrived from /streamer-sign-up. Read
 * here only to pre-highlight a card — it never picks for them. The key is
 * duplicated in app/(auth-pages)/sign-up/page.tsx; both must match.
 */
const ROLE_INTENT_STORAGE_KEY = "salda:role-intent";

type GateStatus = "checking" | "ready" | "leaving";

const GENERIC_ERROR = "Terjadi kesalahan. Silakan coba lagi.";

/**
 * A `redirect()` inside a server action arrives on the client as a thrown error
 * carrying this digest; it must be re-thrown for Next's router to act on it.
 */
function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function asRole(value: unknown): UserRole | null {
  return value === "client" || value === "streamer" ? value : null;
}

export default function RolePicker() {
  const router = useRouter();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [intentRole, setIntentRole] = useState<UserRole | null>(null);
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * "choose" is the two cards; "client-city" is the brand's one follow-up
   * question. A host never sees the second screen — their city is part of the
   * profile they are about to build, and asking twice would be the kind of
   * duplicate the revamp existed to remove.
   */
  const [step, setStep] = useState<"choose" | "client-city">("choose");
  const [citySlug, setCitySlug] = useState("");
  /**
   * Set once a role has been recorded. The pending flag clears in `finally`,
   * before the navigation lands, so this is what stops a second submission.
   */
  const submittedRef = useRef(false);

  /**
   * Only a signed-in account with no role belongs here. Someone who already
   * chose is sent on to wherever they actually belong rather than being handed
   * a screen that would silently overwrite that choice.
   */
  useEffect(() => {
    let cancelled = false;

    const gate = async () => {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace(
          `/sign-in?redirect_to=${encodeURIComponent(ROLE_PICKER_PATH)}`,
        );
        return;
      }

      // The same read the server actions, the OAuth callback and the middleware
      // use, so all four agree about what this account has finished.
      const state = await readAccountState(supabase, user.id);

      if (cancelled) return;

      if (state?.userType) {
        // nextPathFor is the single answer to "where does this person go now?",
        // so the picker never invents its own destination.
        router.replace(nextPathFor(state));
        return;
      }

      // A missing users row lands here too. The picker is still the right
      // screen — selectRoleAction is what can say precisely what is wrong with
      // the account, and it says it in the one place errors are shown.
      setStatus("ready");
    };

    gate().catch((err) => {
      console.error("Role picker gate error:", err);
      if (cancelled) return;
      // Failing the check must not trap the user on a blank screen — show the
      // choice; selectRoleAction re-checks the session server-side anyway.
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Pre-highlight the card the visitor already implied by clicking "Daftar
  // sebagai host". Read once the picker is actually on screen.
  useEffect(() => {
    if (status !== "ready") return;
    try {
      setIntentRole(
        asRole(window.sessionStorage.getItem(ROLE_INTENT_STORAGE_KEY)),
      );
    } catch {
      // Private mode / storage disabled: no highlight, nothing else changes.
    }
  }, [status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>, role: UserRole) => {
    event.preventDefault();

    // Guard the in-flight and already-done cases as well as disabling the
    // cards: both cards are separate forms, and two fast Enter presses can land
    // before React re-renders either of them.
    if (pendingRole || submittedRef.current) return;

    // Snapshot before awaiting — React nulls out `currentTarget` once the event
    // is recycled. The `role` key comes from the hidden input in the form.
    const formData = new FormData(event.currentTarget);

    setError(null);
    setPendingRole(role);

    try {
      const result: AuthActionResponse = await selectRoleAction(formData);

      if (!result?.success) {
        // Includes the deliberate refusal to *change* a settled role, which
        // reads as a plain explanation rather than a failure.
        setError(result?.error ?? GENERIC_ERROR);
        return;
      }

      submittedRef.current = true;
      setStatus("leaving");

      // The intent has done its job the moment a role is recorded.
      try {
        window.sessionStorage.removeItem(ROLE_INTENT_STORAGE_KEY);
      } catch {
        /* storage blocked — nothing to clean up */
      }

      // A full page load, not router.push: user_type just changed server-side
      // and every gate downstream reads it fresh.
      window.location.href =
        result.redirectTo ?? nextPathFor({ userType: role, streamer: null });
    } catch (err) {
      if (isRedirectError(err)) throw err;
      console.error("Select role error:", err);
      setError("Terjadi kesalahan tak terduga. Silakan coba lagi.");
    } finally {
      // In `finally` so a thrown action never leaves the cards permanently dead.
      setPendingRole(null);
    }
  };

  if (status === "checking") {
    return (
      <div className="w-full max-w-[560px]">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
          <div className="flex items-center gap-3 text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Menyiapkan akun kamu…</span>
          </div>
        </div>
      </div>
    );
  }

  const busy = pendingRole !== null || status === "leaving";

  const cards: Array<{
    role: UserRole;
    title: string;
    outcome: string;
    Icon: typeof Search;
  }> = [
    {
      role: "client",
      title: "Cari host untuk brand saya",
      outcome:
        "Berikutnya: lengkapi profil brand singkat, lalu kamu langsung bisa menelusuri dan membooking host.",
      Icon: Search,
    },
    {
      role: "streamer",
      title: "Jadi host live streaming",
      outcome:
        "Berikutnya: susun profil host kamu — foto, tarif, jadwal — supaya brand bisa menemukan dan membooking kamu.",
      Icon: Radio,
    },
  ];

  return (
    <div className="w-full max-w-[560px]">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        <div className="p-8">
          <div className="mb-6">
            <p className="text-sm font-medium text-blue-600">
              Akun kamu sudah aktif 🎉
            </p>
            <h1 className="mt-2 text-2xl font-semibold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Saya ingin…
            </h1>
            <p className="mt-2 text-gray-600">
              Pilih satu, dan kami siapkan langkah berikutnya sesuai pilihan itu.
            </p>
          </div>

          {/* Above the cards, i.e. above the buttons that submit. */}
          {error && (
            <div className="mb-5">
              <FormMessage message={{ error }} className="max-w-none" />
            </div>
          )}

          <div className="space-y-4">
            {cards.map(({ role, title, outcome, Icon }) => {
              const isPending = pendingRole === role;
              const isSuggested = intentRole === role;

              return (
                // One form per card: each card is a genuine submit with its own
                // `role` value, so nothing depends on reading the submitter.
                <form key={role} onSubmit={(event) => handleSubmit(event, role)}>
                  <input type="hidden" name="role" value={role} />
                  <button
                    type="submit"
                    disabled={busy}
                    aria-busy={isPending}
                    className={`group flex w-full items-start gap-4 rounded-2xl border-2 p-5 text-left
                      transition-all duration-200
                      ${
                        isSuggested
                          ? "border-blue-500 bg-blue-50/40"
                          : "border-gray-200 bg-white"
                      }
                      hover:border-blue-500 hover:bg-blue-50/40 hover:shadow-[0_4px_24px_rgba(0,0,0,0.08)]
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100
                      focus-visible:border-blue-600
                      disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-gray-200
                      disabled:hover:bg-white disabled:hover:shadow-none`}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50
                        text-blue-600 transition-colors group-hover:bg-blue-100"
                    >
                      {isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-gray-900">
                          {title}
                        </span>
                        {isSuggested && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Sesuai pilihan kamu tadi
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 block text-sm leading-relaxed text-gray-600">
                        {outcome}
                      </span>
                    </span>

                    <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-gray-400 transition-colors group-hover:text-blue-600" />
                  </button>
                </form>
              );
            })}
          </div>

          {/* Clear about the consequence without making it feel permanent: the
              choice routes the next screen, it is not a contract. */}
          <p className="mt-6 border-t border-gray-100 pt-5 text-sm leading-relaxed text-gray-500">
            Pilihan ini menentukan tampilan Salda untuk kamu dan langkah setup
            berikutnya. Belum ada yang dikirim ke siapa pun, dan kalau ternyata
            salah pilih, tim Salda bisa memindahkan akun kamu — cukup hubungi
            dukungan lewat WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
