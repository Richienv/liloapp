"use client";

// Lightweight hero background.
//
// The previous version rendered hundreds–thousands of individually animated SVG
// dots (<DotPattern glow>) PLUS three infinitely-animated, blur-filtered
// "spotlight" layers — all running forever and never pausing when scrolled past.
// That was the main cause of the laggy scroll / near-crash on mobile.
//
// This replaces it with a couple of STATIC CSS radial-gradient glows on the same
// cream base: no animation, no blur filters, no per-dot nodes — effectively free
// to render while keeping the soft blue glow aesthetic.
export function CustomBackground() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#faf9f5]">
      <div
        className="pointer-events-none absolute left-[10%] top-[20%] h-[420px] w-[420px] rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(74,144,226,0.12) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute right-[10%] top-[28%] h-[420px] w-[420px] rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, rgba(74,144,226,0.10) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
