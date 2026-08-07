"use client";

import { useEffect, useState } from "react";

/**
 * The 2px brand line across the top of the landing page.
 *
 * Straight from the design file — `position:fixed;top:0;left:0;height:2px;
 * z-index:60;background:#2563eb;box-shadow:0 0 8px rgba(37,99,235,.3)` with its
 * width bound to scroll progress.
 *
 * WHY IT IS ITS OWN COMPONENT
 *
 * It is the only thing on the page that re-renders on scroll. Keeping it in a
 * leaf component means the scroll handler's setState re-renders 2px of markup
 * instead of the whole landing page — eight animated illustrations, two
 * marquees and a count-up included. Putting this state on the page component
 * would repaint all of it on every scroll frame.
 *
 * The listener is passive, so it never blocks scrolling.
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Run once on mount: a reload partway down the page should not start the
    // bar at zero and then jump on the first scroll event.
    onScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      // Decorative. It duplicates information the scrollbar already gives a
      // screen reader, so it is hidden rather than announced as a progressbar.
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[60] h-0.5 bg-brand"
      style={{
        width: `${(progress * 100).toFixed(1)}%`,
        boxShadow: "0 0 8px rgb(37 99 235 / 0.3)",
      }}
    />
  );
}
