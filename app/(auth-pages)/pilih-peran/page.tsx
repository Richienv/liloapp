"use client";

import { selectRoleAction } from "@/app/actions";
import { readAccountState, type AuthActionResponse } from "@/app/types/auth";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { CityCombobox } from "@/components/ui/city-combobox";
import { nextPathFor, ROLE_PICKER_PATH, type UserRole } from "@/lib/auth-redirect";
import { createClient } from "@/utils/supabase/client";

import { type AuthPanel, AuthShell, AuthStepLabel, authLabelClass } from "../auth-shell";
import { ArrowLeft, ArrowRight, Loader2, Radio, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

/**
 * "Kamu daftar sebagai apa?" — the one question signup no longer asks up front.
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


/**
 * The proof panel, one per role.
 *
 * A role picker asks someone to commit before it has told them anything, so
 * the panel answers "what do I get" for whichever card they are pointing at.
 * It reacts to hover and focus rather than to selection, because the moment a
 * role IS selected the panel has done its job and the screen has moved on.
 *
 * The two are styled as opposites on purpose — a brand is buying and gets the
 * warm quiet surface, a host is earning and gets the dark one. Same layout,
 * different weight, so switching between them reads as switching sides of a
 * marketplace rather than switching pages.
 */
const ROLE_PANELS: Record<UserRole, AuthPanel> = {
  client: {
    eyebrow: 'Untuk brand',
    title: 'Host yang siap live, tanpa cari sana-sini.',
    sub: 'Lihat harga di depan, pilih jadwal, bayar sekali. Semua di satu tempat.',
    points: [
      'Semua host sudah diverifikasi dan punya rekam jejak sesi.',
      'Harga dan jadwal terlihat sebelum kamu memesan.',
      'Dana ditahan sampai sesi selesai — aman untuk dua pihak.',
    ],
    dark: false,
  },
  streamer: {
    eyebrow: 'Untuk host',
    title: 'Isi jadwal kosong kamu dengan sesi berbayar.',
    sub: 'Brand datang ke kamu. Kamu tinggal atur tarif dan hari kerja.',
    points: [
      'Kamu tentukan sendiri tarif per jam dan hari yang tersedia.',
      'Bayaran cair tiap Senin, tanpa biaya penarikan.',
      'Tidak ada biaya bergabung — Salda ambil fee dari sisi brand.',
    ],
    dark: true,
  },
};

/*
 * The stats rows both panels used to carry ("250+ Host aktif", "4,9 Rating
 * rata-rata", "Rp 443rb Rata-rata per sesi", "76 jam Siaran per bulan") came
 * from the design file and are computed from nothing this page loads. They are
 * claims, not data, and design/REFERENCE.md flags them as unconfirmed. They are
 * out until an aggregate exists behind them; `AuthPanel.stats` is still there
 * for the day one does. The points that remain are all statements about how the
 * product works, checkable in the product itself.
 */

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
   * Which panel to show. Seeded from the intent the visitor already expressed
   * on /streamer-sign-up so the first paint is not a coin toss, then driven by
   * pointer and keyboard focus. Never null — an empty half-screen while the
   * mouse is between two cards is worse than showing either one.
   */
  const [previewRole, setPreviewRole] = useState<UserRole>("client");
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
      const stored = asRole(window.sessionStorage.getItem(ROLE_INTENT_STORAGE_KEY));
      setIntentRole(stored);
      // Seed the proof panel from the same signal, so someone who arrived via
      // "Daftar sebagai host" opens on the host panel rather than being shown
      // the brand pitch they already declined.
      if (stored) setPreviewRole(stored);
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

    // A brand still owes us a city. Nothing is written yet; this only moves the
    // screen on, so backing out costs nothing.
    if (role === "client" && step === "choose") {
      setError(null);
      setStep("client-city");
      return;
    }

    // Mirrors the server's check so a missed pick costs no round trip. The
    // server re-validates: this is a hint, not the rule.
    if (role === "client" && !citySlug) {
      setError("Pilih kota brand kamu dari daftar.");
      return;
    }

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
      <AuthShell>
        <div className="flex items-center justify-center gap-3 py-4 text-ink-soft" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-copy">Menyiapkan akun kamu…</span>
        </div>
      </AuthShell>
    );
  }

  const busy = pendingRole !== null || status === "leaving";

  // Step two, brands only: one field, then straight into the marketplace.
  if (step === "client-city") {
    return (
      <AuthShell>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep("choose");
          }}
          disabled={busy}
          className="-ml-1 mb-5 inline-flex items-center gap-1.5 text-meta text-ink-soft
            transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </button>

        <div className="mb-6">
          <AuthStepLabel step={2} />
          <h1 className="mt-2 font-serif text-section font-medium text-ink">
            Brand kamu ada di kota mana?
          </h1>
          <p className="mt-2 text-copy text-ink-soft">
            Kami pakai ini untuk menghitung perkiraan pengiriman produk ke host.
            Tanpa kota, setiap pesanan otomatis dihitung kirim luar kota dan kamu
            harus memesan 3 hari lebih awal — walaupun host-nya satu kota denganmu.
          </p>
        </div>

        {/* Above the submit button, like everywhere else in the flow. */}
        {error && (
          <div className="mb-5">
            <FormMessage message={{ error }} className="max-w-none" />
          </div>
        )}

        <form onSubmit={(event) => handleSubmit(event, "client")}>
          <input type="hidden" name="role" value="client" />

          <label htmlFor="client-city" className={`mb-2 block ${authLabelClass}`}>
            Kota
          </label>
          {/* `name` makes the combobox emit a hidden input, so the slug is in
              the FormData this form submits without any manual wiring. */}
          <CityCombobox
            id="client-city"
            name="city_slug"
            value={citySlug}
            onChange={(slug) => {
              setError(null);
              setCitySlug(slug);
            }}
            disabled={busy}
            placeholder="Pilih kota brand kamu"
            aria-describedby="client-city-help"
            aria-invalid={Boolean(error) && !citySlug}
          />
          <p id="client-city-help" className="mt-2 text-meta text-ink-soft">
            Bisa diubah kapan saja lewat pengaturan akun.
          </p>

          {/* The screen's one accent. */}
          <Button
            type="submit"
            variant="brand"
            size="action-full"
            disabled={busy}
            aria-busy={pendingRole === "client"}
            className="mt-6 gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingRole === "client" || status === "leaving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyimpan…
              </>
            ) : (
              <>
                Mulai cari host
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </AuthShell>
    );
  }

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
        "Berikutnya: pilih kota brand kamu, lalu kamu langsung bisa menelusuri dan membooking host.",
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

  const panel = ROLE_PANELS[previewRole];

  return (
    // Split layout: the question on the left, the answer to "why should I care"
    // on the right. The shell owns the grid now — this file kept its own copy of
    // that markup, which is exactly how the auth screens ended up disagreeing
    // about the card radius and the form column width in the first place.
    <AuthShell panel={panel}>
      <>
        <AuthStepLabel step={1} />
        <h1 className="mt-2 font-serif text-section font-medium text-ink">Kamu daftar sebagai apa?</h1>
        <p className="mt-2 text-copy text-ink-soft">
          Pilih satu, dan kami siapkan langkah berikutnya sesuai pilihan itu.
        </p>

        {/* Above the cards, i.e. above the buttons that submit. */}
        {error && (
          <div className="mt-5">
            <FormMessage message={{ error }} className="max-w-none" />
          </div>
        )}

        <div className="mt-6 space-y-3">
          {cards.map(({ role, title, outcome, Icon }) => {
            const isPending = pendingRole === role;
            const isSuggested = intentRole === role;
            const isPreviewing = previewRole === role;

            return (
              // One form per card: each card is a genuine submit with its own
              // `role` value, so nothing depends on reading the submitter.
              <form key={role} onSubmit={(event) => handleSubmit(event, role)}>
                <input type="hidden" name="role" value={role} />
                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={isPending}
                  // Pointer and keyboard both drive the panel. Focus matters as
                  // much as hover: tabbing between two cards with a static panel
                  // means a keyboard user never sees the second pitch at all.
                  onMouseEnter={() => setPreviewRole(role)}
                  onFocus={() => setPreviewRole(role)}
                  className={`group flex w-full items-start gap-3.5 rounded-panel border p-4 text-left
                    transition-colors
                    ${
                      // Only `isSuggested` paints the card as chosen. `isPreviewing`
                      // deliberately does not: it defaults to "client", so keying the
                      // selected look off it made the brand card look already-picked
                      // before anyone had picked anything — and on a touch device,
                      // where there is no hover and a tap submits, it could never
                      // move off that card. Previewing only drives the panel, and on
                      // pointer devices a quieter hover tint.
                      isSuggested
                        ? "border-brand bg-brand-tint"
                        : isPreviewing
                          ? "border-hairline-strong bg-surface-raised"
                          : "border-hairline-input bg-surface hover:bg-surface-raised"
                    }
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    focus-visible:ring-offset-2
                    disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-field ${
                      // Neutral in both states. The suggested card already
                      // spends the screen's one accent on its border and tint;
                      // a blue tile inside it spends it a second time.
                      isSuggested ? "bg-surface-deep text-ink-body" : "bg-surface-tint text-ink-faint"
                    }`}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-ui font-semibold text-ink">{title}</span>
                      {/* A marker, not a filled pill — the card's own border
                          and tint already say "this one". */}
                      {isSuggested && (
                        <span className="font-mono text-tiny uppercase text-ink-faint">
                          Pilihan kamu tadi
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-meta text-ink-soft">
                      {outcome}
                    </span>
                  </span>

                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-ghost transition-colors group-hover:text-ink" />
                </button>
              </form>
            );
          })}
        </div>

        {/* Clear about the consequence without making it feel permanent: the
            choice routes the next screen, it is not a contract. */}
        <p className="mt-6 border-t border-hairline-soft pt-5 text-meta text-ink-soft">
          Pilihan ini menentukan tampilan Salda untuk kamu dan langkah setup
          berikutnya. Belum ada yang dikirim ke siapa pun, dan kalau ternyata
          salah pilih, tim Salda bisa memindahkan akun kamu — cukup hubungi
          dukungan lewat WhatsApp.
        </p>
      </>
    </AuthShell>
  );
}
