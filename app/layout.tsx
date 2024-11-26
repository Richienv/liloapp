import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Navbar } from "@/components/ui/navbar";
import { Toaster } from 'react-hot-toast';
import "react-datepicker/dist/react-datepicker.css";

const defaultUrl = process.env.VERCEL_URL 
  ? `https://liloapp.vercel.app`
  : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Salda",
  description: "The fastest way to build apps with Next.js and Supabase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className={`${GeistSans.className} overflow-x-hidden w-full`}>
        <Toaster position="top-center" />
        <main className="min-h-screen flex flex-col items-center w-full max-w-full overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
