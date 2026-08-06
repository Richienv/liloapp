"use client";

/**
 * The last thing on the page.
 *
 * It is a directory, not a section: nothing here competes for attention, so
 * everything is ink and hairline and the labels are mono micro-caps rather than
 * bold 14px headings. There is no accent in the footer at all — the page spends
 * its last blue on the Closing CTA directly above it.
 */
export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-surface-tint">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
          {/* Tagline — verbatim from the design reference. */}
          <div>
            <p className="font-serif text-title font-medium text-ink">Salda</p>
            <p className="mt-2 max-w-[28ch] text-copy leading-relaxed text-ink-muted">
              Platform live commerce untuk brand Indonesia.
            </p>
          </div>

          {/* Office Locations */}
          <div className="space-y-6">
            <div>
              <h4 className="font-mono text-tiny uppercase text-ink-ghost">Kantor Balikpapan</h4>
              <p className="mt-2 text-copy leading-relaxed text-ink-muted">
                Jl. Mayjend Sutoyo, Gg. Surya No.89<br />
                Klandasan Ilir, Kec. Balikpapan Kota<br />
                Kota Balikpapan, Kalimantan Timur 76113
              </p>
            </div>
            <div>
              <h4 className="font-mono text-tiny uppercase text-ink-ghost">Kantor Jakarta</h4>
              <p className="mt-2 text-copy leading-relaxed text-ink-muted">
                Apartment Neo Soho Central Park #3110<br />
                Tanjung Duren Selatan, Kec. Grogol Petamburan<br />
                Kota Jakarta Barat, DKI Jakarta 11470
              </p>
            </div>
          </div>

          {/* Contact Details */}
          <div className="space-y-6">
            <div>
              <h4 className="font-mono text-tiny uppercase text-ink-ghost">Hubungi kami</h4>
              <dl className="mt-2 space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <dt className="shrink-0 text-copy text-ink-soft">Email</dt>
                  <dd className="min-w-0 truncate">
                    <a
                      href="mailto:admin@trolive.id"
                      className="text-copy text-ink-body transition-colors hover:text-ink"
                    >
                      admin@trolive.id
                    </a>
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="shrink-0 text-copy text-ink-soft">WhatsApp</dt>
                  <dd className="min-w-0 truncate">
                    <a
                      href="https://wa.me/62895700120901"
                      className="numeric text-copy text-ink-body transition-colors hover:text-ink"
                    >
                      62895700120901
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
            <div>
              <h4 className="font-mono text-tiny uppercase text-ink-ghost">Ikuti kami</h4>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                <a href="#" className="text-copy text-ink-muted transition-colors hover:text-ink">Instagram</a>
                <a href="#" className="text-copy text-ink-muted transition-colors hover:text-ink">LinkedIn</a>
                <a href="#" className="text-copy text-ink-muted transition-colors hover:text-ink">Twitter</a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline pt-6">
          <span className="text-meta text-ink-soft">
            © 2024 Salda by Trolive. Hak cipta dilindungi.
          </span>
          <span className="text-ink-ghost">·</span>
          <a
            href="https://trolive.id"
            className="text-meta text-ink-soft transition-colors hover:text-ink"
          >
            trolive.id
          </a>
          {/*
            A `<select>` offering "Indonesia / English" used to sit at the right
            edge. It had no `value`, no `onChange` and no handler anywhere —
            picking English did nothing at all. A control that cannot do the one
            thing it advertises is worse than no control, and the product speaks
            one language on purpose.
          */}
        </div>
      </div>
    </footer>
  );
}
