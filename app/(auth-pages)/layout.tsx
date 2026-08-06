export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen w-full flex-col bg-canvas p-6">
      {/*
        A blue-to-blue wash used to sit behind every auth screen. It made the
        white card float on a coloured field, which is the look the redesign
        removes: the card should be the only bright surface, sitting on the
        warm canvas the rest of the product uses.
      */}
      {/*
        Centred with auto margins, not `items-center justify-center`. Centring a
        flex child on the cross/main axis makes the overflowing top of an
        over-tall child unreachable — you cannot scroll up to it. That bites
        exactly when a form grows: an error banner on a short screen used to
        push the heading (and on the sign-up flow, the first steps) out of
        reach. Auto margins centre short cards identically and simply stop
        centring once the child no longer fits.
        (A `bg-grid-black/[0.02]` overlay used to sit here too; no such utility
        is defined in tailwind.config.ts or globals.css, so it rendered nothing.)
      */}
      <div className="m-auto flex w-full justify-center">{children}</div>
    </main>
  );
}
