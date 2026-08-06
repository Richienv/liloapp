"use client";

import { selectRoleAction } from "@/app/actions";
import { readAccountState, type AuthActionResponse } from "@/app/types/auth";
import { FormMessage } from "@/components/form-message";
import { CityCombobox } from "@/components/ui/city-combobox";
import { nextPathFor, ROLE_PICKER_PATH, type UserRole } from "@/lib/auth-redirect";
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, ArrowRight, Check, Loader2, Radio, Search } from "lucide-react";
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
const ROLE_PANELS: Record<UserRole, {
  eyebrow: string;
  title: string;
  sub: string;
  points: string[];
  stats: { value: string; label: string }[];
  dark: boolean;
}> = {
  client: {
    eyebrow: 'Untuk brand',
    title: 'Host yang siap live, tanpa cari sana-sini.',
    sub: 'Lihat harga di depan, pilih jadwal, bayar sekali. Semua di satu tempat.',
    points: [
      'Semua host sudah diverifikasi dan punya rekam jejak sesi.',
      'Harga dan jadwal terlihat sebelum kamu memesan.',
      'Dana ditahan sampai sesi selesai — aman untuk dua pihak.',
    ],
    stats: [
      { value: '250+', label: 'Host aktif' },
      { value: '4,9', label: 'Rating rata-rata' },
      { value: '3 hari', label: 'Rata-rata mulai live' },
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
    stats: [
      { value: 'Rp 443rb', label: 'Rata-rata per sesi' },
      { value: '76 jam', label: 'Siaran per bulan' },
      { value: '0%', label: 'Potongan dari kamu' },
    ],
    dark: true,
  },
};

/**
 * "Langkah 1 dari 2" / "Langkah 2 dari 2".
 *
 * The old screen said "Akun kamu sudah aktif 🎉" and then, one screen later,
 * "Satu langkah lagi" — so the first screen never admitted a second one was
 * coming. Naming both ends of the count up front is what stops the city
 * question feeling like the flow moved the goalposts.
 */
function StepCount({ step }: { step: 1 | 2 }) {
  return (
    <p className="text-micro font-semibold tracking-normal text-ink-faint">
      LANGKAH {step} DARI 2
    </p>
  );
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
      <div className="w-full max-w-[560px]">
        <div className="rounded-frame border border-hairline bg-surface p-8">
          <div className="flex items-center gap-3 text-ink-soft">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Menyiapkan akun kamu…</span>
          </div>
        </div>
      </div>
    );
  }

  const busy = pendingRole !== null || status === "leaving";

  // Step two, brands only: one field, then straight into the marketplace.
  if (step === "client-city") {
    return (
      <div className="w-full max-w-[560px]">
        <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
          <div className="p-8">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("choose");
              }}
              disabled={busy}
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600
                transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>

            <div className="mb-6">
              <StepCount step={2} />
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

              <label
                htmlFor="client-city"
                className="mb-2 block text-copy font-medium text-ink"
              >
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

              <button
                type="submit"
                disabled={busy}
                aria-busy={pendingRole === "client"}
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg
                  bg-brand px-5 text-lede font-semibold text-white transition-colors
                  hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-ring focus-visible:ring-offset-2
                  disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingRole === "client" || status === "leaving" ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  <>
                    Mulai cari host
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
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
    // on the right. The form column is capped at 452px because a two-option
    // choice set any wider stops reading as a pair. The panel is hidden below
    // `lg` rather than stacked — on a phone it would push the actual decision
    // off the first screen, which is the opposite of what it is for.
    <div className="grid w-full max-w-[1080px] overflow-hidden rounded-frame border border-hairline bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="mx-auto w-full max-w-[452px] p-8">
        <StepCount step={1} />
        <h1 className="mt-2 font-serif text-section font-medium text-ink">Saya ingin…</h1>
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
                      isPreviewing || isSuggested
                        ? "border-brand bg-brand-tint"
                        : "border-hairline-input bg-surface hover:bg-surface-raised"
                    }
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    focus-visible:ring-offset-2
                    disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-field ${
                      isPreviewing || isSuggested
                        ? "bg-brand text-white"
                        : "bg-surface-tint text-ink-faint"
                    }`}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-ui font-semibold text-ink">{title}</span>
                      {isSuggested && (
                        <span className="rounded-chip bg-brand px-1.5 py-0.5 text-micro font-semibold tracking-normal text-white">
                          Pilihan kamu tadi
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-meta leading-relaxed text-ink-soft">
                      {outcome}
                    </span>
                  </span>

                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-ghost transition-colors group-hover:text-brand" />
                </button>
              </form>
            );
          })}
        </div>

        {/* Clear about the consequence without making it feel permanent: the
            choice routes the next screen, it is not a contract. */}
        <p className="mt-6 border-t border-hairline-soft pt-5 text-meta leading-relaxed text-ink-soft">
          Pilihan ini menentukan tampilan Salda untuk kamu dan langkah setup
          berikutnya. Belum ada yang dikirim ke siapa pun, dan kalau ternyata
          salah pilih, tim Salda bisa memindahkan akun kamu — cukup hubungi
          dukungan lewat WhatsApp.
        </p>
      </div>

      {/* ------------------------------------------------- the proof panel */}
      <aside
        className={`hidden flex-col justify-center p-10 lg:flex ${
          panel.dark ? "bg-ink text-white" : "bg-surface-tint text-ink"
        }`}
      >
        <p
          className={`text-micro font-semibold tracking-normal ${
            panel.dark ? "text-white/55" : "text-ink-faint"
          }`}
        >
          {panel.eyebrow.toUpperCase()}
        </p>
        <h2 className="mt-3 max-w-[22ch] font-serif text-display font-medium">{panel.title}</h2>
        <p
          className={`mt-3 max-w-[38ch] text-lede ${
            panel.dark ? "text-white/70" : "text-ink-muted"
          }`}
        >
          {panel.sub}
        </p>

        <ul className="mt-7 flex flex-col gap-3">
          {panel.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5">
              <Check
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  panel.dark ? "text-white/60" : "text-positive"
                }`}
              />
              <span className={`text-copy ${panel.dark ? "text-white/80" : "text-ink-body"}`}>
                {point}
              </span>
            </li>
          ))}
        </ul>

        <div
          className={`mt-8 grid grid-cols-3 gap-4 border-t pt-6 ${
            panel.dark ? "border-white/15" : "border-hairline"
          }`}
        >
          {panel.stats.map((stat) => (
            <div key={stat.label}>
              <p className="numeric text-title font-semibold">{stat.value}</p>
              <p className={`mt-0.5 text-mini ${panel.dark ? "text-white/55" : "text-ink-soft"}`}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
