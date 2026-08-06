import { Check } from "lucide-react";

/**
 * The split every auth screen sits in: the form on the left, the reason to
 * bother on the right.
 *
 * Extracted so the six auth screens cannot drift. They were built weeks apart
 * and already disagreed about the card radius, the form column width, the field
 * height and the heading size — the sign-up card was 460px wide with 44px
 * fields, forgot-password 420px, and the phone input next to them was 48px tall.
 *
 * A screen with nothing to argue — a password reset, a wrong-account notice —
 * passes no panel and gets the same card in one column: same frame, same width,
 * same padding, same type. Sharing the component rather than re-typing the
 * chrome is the whole point; a proof panel over a dead reset link would be
 * marketing at somebody who is locked out.
 *
 * The panel is hidden below `lg` rather than stacked. On a phone, stacking
 * pushes the actual form off the first screen — the opposite of what a panel
 * arguing "this is worth signing up for" is there to do.
 */
export interface AuthPanel {
  eyebrow: string;
  title: string;
  sub: string;
  points: string[];
  /**
   * Left empty on purpose everywhere today. The figures the design file carried
   * ("250+ host aktif", "4,9 rating rata-rata", "Rp 443rb rata-rata per sesi")
   * are not computed from anything these pages load, so they are claims, not
   * data. The slot stays for the day an aggregate exists behind them.
   */
  stats?: { value: string; label: string }[];
  /** Dark panel for the host side, warm surface for the brand side. */
  dark: boolean;
}

/**
 * Sign-in's panel.
 *
 * Deliberately carries no statistics. There is no reason to repeat an
 * unverified claim on a screen whose visitor already has an account and has
 * nothing left to be persuaded of. These three lines are statements about how
 * the product works, all checkable in the product itself.
 */
export const SIGN_IN_PANEL: AuthPanel = {
  eyebrow: "Salda",
  title: "Satu tempat untuk jadwal, pembayaran, dan pesan.",
  sub: "Masuk sekali. Kami bawa kamu ke dashboard yang sesuai peran kamu.",
  points: [
    "Brand dan host memakai akun yang sama — tidak ada dua kotak login.",
    "Jadwal, booking, dan pembayaran ada di satu riwayat.",
    "Pesan ke host tersimpan di aplikasi, bukan di chat terpisah.",
  ],
  dark: false,
};

/**
 * Sign-up's panel.
 *
 * Same rule as sign-in: every line describes what this form actually does, so
 * nothing here can turn out to be untrue. It answers the only question someone
 * looking at a signup form has — "how much is this going to ask me for?" — and
 * the honest answer is four fields, because the role and the profile moved
 * behind the account on purpose.
 */
export const SIGN_UP_PANEL: AuthPanel = {
  eyebrow: "Salda",
  title: "Buat akun dulu, putuskan sisanya nanti.",
  sub: "Dua langkah pendek. Peran kamu dipilih setelah akun jadi, bukan sebelumnya.",
  points: [
    "Email, kata sandi, nama, dan nomor WhatsApp — hanya itu yang diminta di sini.",
    "Brand atau host memakai akun yang sama; kamu pilih di langkah berikutnya.",
    "Profil lengkap menyusul kapan pun kamu siap.",
  ],
  dark: false,
};

/**
 * One field look for all six screens.
 *
 * 16px is not a typographic choice: iOS zooms the viewport on focus for
 * anything smaller, and the zoom does not undo itself. That is why every one of
 * these inputs used to carry `style={{ fontSize: "16px" }}` inline — the class
 * now says it once, in a place the other five screens can share.
 *
 * 48px tall to match `PhoneInput` and `CityCombobox`, which sit directly beside
 * these fields in the sign-up and role flows and were the visible mismatch.
 */
export const authFieldClass =
  "h-12 rounded-panel border-hairline-input bg-surface-tint px-4 text-base text-ink " +
  "placeholder:text-ink-faint transition-colors " +
  "focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-0";

/** The label above one of those fields. */
export const authLabelClass = "text-ui font-medium text-ink-body";

/**
 * A quiet inline link: ink, with the hairline doing the underlining.
 *
 * Blue is spent once per screen, on the button that submits. Four blue links
 * around a blue button is four things competing to be the one thing.
 */
export const authLinkClass =
  "font-medium text-ink underline decoration-hairline-strong underline-offset-2 " +
  "transition-colors hover:decoration-ink";

/**
 * `Langkah 1 dari 2`.
 *
 * Written sentence case and uppercased in CSS, so the string stays in the
 * product's one voice while the eyebrow keeps the mono, tracked treatment every
 * other section eyebrow in the app uses.
 *
 * Naming both ends of the count up front is what stops a second screen feeling
 * like the flow moved the goalposts — the old signup said "Akun kamu sudah
 * aktif 🎉" and then, one screen later, "Satu langkah lagi".
 */
export function AuthStepLabel({
  step,
  total = 2,
  hint,
}: {
  step: number;
  total?: number;
  /** What this step asks for, e.g. `Email & kata sandi`. */
  hint?: string;
}) {
  return (
    <p className="font-mono text-tiny uppercase text-ink-ghost">
      Langkah {step} dari {total}
      {hint ? <span className="text-ink-faint"> · {hint}</span> : null}
    </p>
  );
}

/**
 * Password strength, scored exactly as the brief scores it: +1 for eight
 * characters, +1 for an uppercase letter or a symbol, +1 for a digit once the
 * password is ten or longer.
 *
 * It reports; it never blocks. The only rule that can refuse a password is the
 * minimum length the form already enforces server-side — a meter that quietly
 * gated submission would be a behaviour change wearing a design change's
 * clothes.
 */
export function scorePassword(value: string): 0 | 1 | 2 | 3 {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 1;
  if (/\d/.test(value) && value.length >= 10) score += 1;
  return score as 0 | 1 | 2 | 3;
}

/** Amber → blue → green, the three steps the brief names, as tokens. */
const STRENGTH_FILL = ["bg-caution-dot", "bg-brand", "bg-positive"] as const;
const STRENGTH_LABEL = ["Masih mudah ditebak", "Lemah", "Cukup kuat", "Kuat"] as const;

export function PasswordStrength({ value }: { value: string }) {
  // Nothing typed yet, nothing to say. An empty meter under an empty field is
  // three grey bars telling you off before you have started.
  if (!value) return null;

  const score = scorePassword(value);

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-200 ${
              // Every filled bar takes the colour of the level reached, so the
              // meter reads as one state rather than as a three-colour gradient.
              index < score ? STRENGTH_FILL[score - 1] : "bg-surface-deep"
            }`}
          />
        ))}
      </div>
      {/* The label stays ink: the bars carry the colour, and a second coloured
          thing here would spend the screen's one accent twice. */}
      <p role="status" aria-live="polite" className="shrink-0 text-mini text-ink-soft">
        {STRENGTH_LABEL[score]}
      </p>
    </div>
  );
}

export function AuthProofPanel({ panel }: { panel: AuthPanel }) {
  return (
    <aside
      className={`hidden flex-col justify-center p-10 lg:flex ${
        panel.dark ? "bg-ink text-white" : "bg-surface-tint text-ink"
      }`}
    >
      {/* Uppercased in CSS, not in JS: the string stays sentence case in source
          so it reads the same as every other line in the product. */}
      <p
        className={`font-mono text-tiny uppercase ${
          panel.dark ? "text-white/55" : "text-ink-faint"
        }`}
      >
        {panel.eyebrow}
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

      {panel.stats && (
        <div
          className={`mt-8 grid grid-cols-3 gap-4 border-t pt-6 ${
            panel.dark ? "border-white/15" : "border-hairline"
          }`}
        >
          {panel.stats.map((stat) => (
            <div key={stat.label}>
              <p className="numeric font-mono text-title font-semibold">{stat.value}</p>
              <p className={`mt-0.5 text-mini ${panel.dark ? "text-white/55" : "text-ink-soft"}`}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

/**
 * The card both shapes share. Form column capped at 452px, per the design —
 * and the one-column screens are capped at the same 452px, so moving between
 * sign-up and forgot-password does not visibly resize the card.
 */
export function AuthShell({
  panel,
  children,
}: {
  /** Omit for the screens that have nothing to sell: reset, notices, gates. */
  panel?: AuthPanel;
  children: React.ReactNode;
}) {
  if (!panel) {
    return (
      <div className="w-full max-w-[452px] overflow-hidden rounded-frame border border-hairline bg-surface">
        <div className="p-8">{children}</div>
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-[1080px] overflow-hidden rounded-frame border border-hairline bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="mx-auto w-full max-w-[452px] p-8">{children}</div>
      <AuthProofPanel panel={panel} />
    </div>
  );
}
