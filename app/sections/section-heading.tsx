/**
 * The landing page's section heading.
 *
 * Three parts in a fixed relationship: a numbered mono eyebrow, a Playfair
 * heading that scales with the viewport, and one line of sub-copy. Every
 * section on the page uses this, which is what makes them read as chapters of
 * one document rather than five separately-designed blocks — the failure the
 * brief describes as "flat contrast".
 *
 * The eyebrow is numbered because the page is an argument in order: here is how
 * it works, here is what you get, here is who else did it, here are your
 * objections, here is the door.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  sub,
}: {
  index: string;
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mx-auto max-w-[46ch] text-center">
      <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">
        {index} / {eyebrow}
      </p>
      <h2 className="mt-4 font-serif text-heading font-medium text-balance text-ink">
        {title}
      </h2>
      {sub && <p className="mt-3.5 text-lede text-ink-muted">{sub}</p>}
    </div>
  );
}

/**
 * The page's section shell. `max-w-[1180px]` and the clamped padding come
 * straight from the design; putting them here rather than on each section is
 * what stops one section drifting 20px narrower than its neighbours.
 */
export function Section({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`mx-auto w-full max-w-[1180px] px-5 pt-[clamp(72px,12vh,140px)] sm:px-8 lg:px-12 ${className}`}
    >
      {children}
    </section>
  );
}
