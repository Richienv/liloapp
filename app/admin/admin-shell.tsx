"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  Ticket,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  children?: {
    title: string;
    href: string;
  }[];
}

/**
 * Sentence case, Bahasa Indonesia, one word where one word will do.
 *
 * The nav used to be "Overview / Streamers / Verification / Reports" — English
 * Title Case in a product whose every other surface speaks Indonesian in
 * sentence case. An internal tool is still the same product.
 */
const navItems: NavItem[] = [
  {
    title: "Ringkasan",
    href: "/admin",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    title: "Streamer",
    href: "/admin/streamers",
    icon: <Users className="h-4 w-4" />,
  },
  {
    title: "Verifikasi",
    href: "#",
    icon: <ShieldCheck className="h-4 w-4" />,
    children: [
      { title: "Brand", href: "/admin/verificationbrand" },
      { title: "Streamer", href: "/admin/verificationstreamer" },
    ],
  },
  {
    title: "Laporan",
    href: "/admin/reports",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    title: "Voucher",
    href: "/admin/vouchers",
    icon: <Ticket className="h-4 w-4" />,
  },
  {
    // Answers the question the product could not answer at all before: of the
    // people who start signing up, where exactly do they stop?
    title: "Funnel",
    href: "/admin/funnel",
    icon: <TrendingDown className="h-4 w-4" />,
  },
];

/**
 * Path segment → what a human calls it.
 *
 * The breadcrumb used to be `segment[0].toUpperCase() + segment.slice(1)`,
 * which turned `/admin/verificationstreamer` into "Admin / Verificationstreamer"
 * — a route name shown to a person. Anything not in this map still falls back
 * to the capitalised slug, so a new route degrades instead of disappearing.
 */
const CRUMB_LABELS: Record<string, string> = {
  admin: "Admin",
  streamers: "Streamer",
  verificationbrand: "Verifikasi brand",
  verificationstreamer: "Verifikasi streamer",
  reports: "Laporan",
  vouchers: "Voucher",
  funnel: "Funnel",
};

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '';

  const getBreadcrumbs = () => {
    const paths = pathname.split('/').filter(Boolean);
    return paths.map((path, index) => ({
      title: CRUMB_LABELS[path] ?? path.charAt(0).toUpperCase() + path.slice(1),
      href: '/' + paths.slice(0, index + 1).join('/'),
      isLast: index === paths.length - 1
    }));
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href;
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren && item.children) {
      return (
        <div key={item.title} className="pt-2">
          <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-ui text-ink-faint">
            {item.icon}
            <span className="truncate">{item.title}</span>
          </div>
          <div className="ml-[1.0625rem] space-y-0.5 border-l border-hairline pl-3">
            {item.children.map(child => (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "block truncate rounded-field px-2.5 py-1.5 text-ui transition-colors",
                  pathname === child.href
                    ? "bg-surface-deep font-medium text-ink"
                    : "text-ink-soft hover:bg-surface-tint hover:text-ink"
                )}
              >
                {child.title}
              </Link>
            ))}
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-2.5 rounded-field px-2.5 py-1.5 text-ui transition-colors",
          isActive
            ? "bg-surface-deep font-medium text-ink"
            : "text-ink-soft hover:bg-surface-tint hover:text-ink"
        )}
      >
        {item.icon}
        <span className="truncate">{item.title}</span>
      </Link>
    );
  };

  return (
    /*
      One plane, not three. The old shell layered a `bg-surface-tint/30` page
      under a white sidebar under a white breadcrumb bar, which drew two extra
      horizontal edges before any content appeared. Canvas everywhere, hairlines
      for the seams, and white reserved for the cards that hold data.
    */
    <div className="flex h-screen flex-col bg-canvas">
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-hairline px-3 py-5">
          <div className="mb-7 flex items-baseline gap-2 px-2.5">
            <span className="font-serif text-title font-semibold text-ink">
              Salda
            </span>
            <span className="font-mono text-micro uppercase text-ink-ghost">
              Admin
            </span>
          </div>

          <nav className="space-y-0.5">
            {navItems.map(renderNavItem)}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="border-b border-hairline px-8 py-3">
            <div className="flex items-center font-mono text-mini text-ink-soft">
              {getBreadcrumbs().map((crumb, index) => (
                <div key={crumb.href} className="flex items-center">
                  {index > 0 && (
                    <span className="mx-2 text-ink-ghost">/</span>
                  )}
                  {crumb.isLast ? (
                    <span className="text-ink">{crumb.title}</span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="transition-colors hover:text-ink"
                    >
                      {crumb.title}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
