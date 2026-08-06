import type { Metadata } from "next";

/**
 * The onboarding tours are a one-time, post-signup surface tied to a specific
 * account — there is nothing here for a search engine to index, and an indexed
 * tour would only drop strangers onto a page that bounces them to /sign-in.
 */
export const metadata: Metadata = {
  title: "Pengenalan Salda",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `bg-canvas` here, not just on the pages: the tour columns are sized in
  // viewport units, and on a short viewport the page ends before the screen
  // does. Without it the gap under the fold renders as the root white.
  return (
    <div className="min-h-screen w-full bg-canvas">
      {children}
    </div>
  );
}
