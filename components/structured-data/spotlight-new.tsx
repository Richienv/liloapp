"use client";

// The hero background, and by now the whole of it is the canvas.
//
// History: this rendered thousands of individually animated SVG dots plus three
// blur-filtered, infinitely-animated "spotlight" layers, which is what made the
// landing page crawl on a phone. That was replaced by two static CSS radial
// glows — cheap to render, but still two soft blue washes bleeding across the
// top of the page.
//
// Those glows are gone now. The redesign allows a gradient in exactly two
// places: a scrim that buys white text contrast over a photograph, and the edge
// fade on a marquee. A decorative glow behind a headline is neither, and a blue
// one spends the page's single accent on nothing at all — the hero's blue
// belongs to "Mulai cari host". What is left is the warm canvas the rest of the
// product sits on, stated as a token instead of the hand-typed `#faf9f5` (which
// was a shade off `#faf9f6` and seamed visibly against every section below it).
export function CustomBackground() {
  return <div className="h-full w-full bg-canvas" />;
}
