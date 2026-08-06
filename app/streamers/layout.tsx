import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Metadata carrier for `/streamers`.
 *
 * The page itself is a client component (it fetches the listing in the browser
 * and renders `StreamerCard`, which is hook-driven), and a client component
 * cannot export `metadata`. Without a canonical of its own the route inherited
 * the root layout's — see the note in `app/layout.tsx` — and told Google it was
 * a duplicate of the homepage. This layout exists only to state the route's own
 * URL; it adds no markup.
 */
export const metadata: Metadata = {
  title: "Host Live Streaming Tersedia | Salda",
  description:
    "Daftar host live streaming profesional yang sudah terverifikasi dan siap dibooking untuk Shopee Live dan TikTok Live.",
  alternates: {
    canonical: absoluteUrl("/streamers"),
  },
};

export default function StreamersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
