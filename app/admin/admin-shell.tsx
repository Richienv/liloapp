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
  isExpanded?: boolean;
  children?: {
    title: string;
    href: string;
  }[];
}

const navItems: NavItem[] = [
  {
    title: "Overview",
    href: "/admin",
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    title: "Streamers",
    href: "/admin/streamers",
    icon: <Users className="w-5 h-5" />,
  },
  {
    title: "Verification",
    href: "#",
    icon: <ShieldCheck className="w-5 h-5" />,
    children: [
      { title: "Brand Verification", href: "/admin/verificationbrand" },
      { title: "Streamer Verification", href: "/admin/verificationstreamer" },
    ],
  },
  {
    title: "Reports",
    href: "/admin/reports",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    title: "Vouchers",
    href: "/admin/vouchers",
    icon: <Ticket className="w-5 h-5" />,
  },
  {
    // Answers the question the product could not answer at all before: of the
    // people who start signing up, where exactly do they stop?
    title: "Funnel",
    href: "/admin/funnel",
    icon: <TrendingDown className="w-5 h-5" />,
  },
];

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '';

  const getBreadcrumbs = () => {
    const paths = pathname.split('/').filter(Boolean);
    return paths.map((path, index) => ({
      title: path.charAt(0).toUpperCase() + path.slice(1),
      href: '/' + paths.slice(0, index + 1).join('/'),
      isLast: index === paths.length - 1
    }));
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href;
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren && item.children) {
      return (
        <div key={item.href} className="space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-ink-muted">
            {item.icon}
            <span>{item.title}</span>
          </div>
          <div className="ml-4 space-y-1 border-l-2 border-hairline pl-4">
            {item.children.map(child => (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "block py-2 px-3 text-sm rounded-lg transition-colors",
                  pathname === child.href
                    ? "text-blue-600 bg-blue-50 font-medium"
                    : "text-ink-muted hover:bg-surface-tint"
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
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          "hover:bg-surface-tint",
          isActive ? "text-blue-600 bg-blue-50" : "text-ink-muted"
        )}
      >
        {item.icon}
        <span>{item.title}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface-tint/30">
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 border-r border-hairline-input bg-surface px-4 py-6">
            <div className="flex items-center gap-2 px-3 mb-8">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-white font-semibold">A</span>
              </div>
              <span className="font-semibold text-ink">Admin Portal</span>
            </div>

            <nav className="space-y-1">
              {navItems.map(renderNavItem)}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            {/* Breadcrumb */}
            <div className="border-b border-hairline-input bg-surface">
              <div className="px-8 py-4">
                <div className="flex items-center gap-2 text-sm">
                  {getBreadcrumbs().map((crumb, index) => (
                    <div key={crumb.href} className="flex items-center">
                      {index > 0 && <span className="mx-2 text-ink-faint">/</span>}
                      {crumb.isLast ? (
                        <span className="text-ink font-medium">
                          {crumb.title}
                        </span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="text-ink-muted hover:text-ink"
                        >
                          {crumb.title}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Page Content */}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
