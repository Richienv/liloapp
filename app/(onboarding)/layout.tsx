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
  return (
    <div className="w-full min-h-screen">
      {children}
    </div>
  );
}
