import { Check } from "lucide-react";

/**
 * The split every auth screen sits in: the form on the left, the reason to
 * bother on the right.
 *
 * Extracted so the role picker and sign-in cannot drift. They were built a week
 * apart and already disagreed about the card radius and the form column width.
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
  stats?: { value: string; label: string }[];
  /** Dark panel for the host side, warm surface for the brand side. */
  dark: boolean;
}

/**
 * Sign-in's panel.
 *
 * Deliberately carries no statistics. The role picker's panels quote figures
 * that came from the design file and are still awaiting confirmation that they
 * are true; there is no reason to repeat an unverified claim on a screen whose
 * visitor already has an account and has nothing left to be persuaded of.
 * These three lines are statements about how the product works, all checkable
 * in the product itself.
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

export function AuthProofPanel({ panel }: { panel: AuthPanel }) {
  return (
    <aside
      className={`hidden flex-col justify-center p-10 lg:flex ${
        panel.dark ? "bg-ink text-white" : "bg-surface-tint text-ink"
      }`}
    >
      <p
        className={`text-micro font-semibold tracking-normal ${
          panel.dark ? "text-white/55" : "text-ink-muted"
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

      {panel.stats && (
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
      )}
    </aside>
  );
}

/** The grid both screens sit in. Form column capped at 452px, per the design. */
export function AuthShell({
  panel,
  children,
}: {
  panel: AuthPanel;
  children: React.ReactNode;
}) {
  return (
    <div className="grid w-full max-w-[1080px] overflow-hidden rounded-frame border border-hairline bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="mx-auto w-full max-w-[452px] p-8">{children}</div>
      <AuthProofPanel panel={panel} />
    </div>
  );
}
