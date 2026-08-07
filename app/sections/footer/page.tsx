import Link from "next/link";

/* ==========================================================================
   Footer — ported from design/Salda_Landing.dc.html (markup lines 496-519,
   `footerCols` at line 715).

   A directory and a giant wordmark. No animation: the design gives this
   section none, and nothing here is hidden behind an observer.
   ========================================================================== */

/*
 * NOTE ON EXPORTS — this file sits at app/sections/footer/page.tsx, so Next
 * treats it as a ROUTE and a route module may only carry the named exports
 * Next allows. `COLUMNS` is module-private.
 */

/**
 * The design's `footerCols`.
 *
 * Every link in the design points at `href="#"` — a placeholder, not a
 * destination. The four that have a real destination in this app now point at
 * it; the other five have no page to go to, so they render as plain text
 * rather than as anchors that scroll you to the top of the document and call
 * it navigation. A dead link is worse than an unlinked label: it promises
 * something and then does nothing.
 */
const COLUMNS = [
  {
    title: "Produk",
    links: [
      { label: "Cari host", href: "/streamers" },
      { label: "Harga", href: null },
      { label: "Untuk host", href: null },
    ],
  },
  {
    title: "Perusahaan",
    links: [
      { label: "Tentang TROLIVE", href: null },
      { label: "Kontak", href: null },
      { label: "Karier", href: null },
    ],
  },
  {
    title: "Bantuan",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "WhatsApp support", href: "https://wa.me/62895700120901" },
      { label: "Syarat & ketentuan", href: "/terms" },
    ],
  },
] as const;

export default function Footer() {
  return (
    <footer className="mx-auto max-w-[1180px] overflow-hidden px-[clamp(20px,5vw,48px)] pb-16 pt-[clamp(56px,9vh,100px)]">
      <div className="flex flex-wrap justify-between gap-10 border-t border-hairline pt-8">
        <div>
          <div className="mb-[9px] flex items-baseline gap-[7px]">
            <span className="font-serif text-title font-semibold text-ink">Salda</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-ghost">
              by TROLIVE
            </span>
          </div>
          <p className="text-meta text-ink-faint">
            Platform live commerce untuk brand Indonesia.
          </p>
        </div>

        <div className="flex flex-wrap gap-12">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="mb-[13px] font-mono text-[10.5px] uppercase tracking-[.1em] text-ink-ghost">
                {column.title}
              </p>
              <div className="flex flex-col gap-[9px]">
                {column.links.map((link) =>
                  link.href === null ? (
                    <span key={link.label} className="text-[13px] text-ink-muted">
                      {link.label}
                    </span>
                  ) : link.href.startsWith("http") ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-ink-muted transition-colors hover:text-brand"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-[13px] text-ink-muted transition-colors hover:text-brand"
                    >
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/*
        The giant wordmark. It bleeds off the bottom of the page by its own
        negative bottom margin (-.16em), which is why the footer clips
        overflow. `text-surface-tint` is #f2f1ee, the design's colour, used
        here as a text colour rather than a fill. It is decoration — the real
        "Salda" lockup is above it — so it is hidden from assistive tech and
        from selection.
      */}
      <p
        aria-hidden
        className="mb-[-.16em] mt-[clamp(28px,5vh,56px)] select-none font-serif text-[clamp(72px,17vw,220px)] font-semibold leading-[.9] tracking-[-.04em] text-surface-tint"
      >
        Salda
      </p>
    </footer>
  );
}
