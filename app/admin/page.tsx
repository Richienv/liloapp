"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from "@/lib/utils";

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-surface-tint/30">
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            {/* Dashboard Content */}
            <div className="p-8">
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
                <p className="mt-1 text-sm text-ink-soft">
                  Welcome to your admin dashboard. Monitor and manage your platform from here.
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { title: "Total Streamers", value: "1,234", change: "+12%" },
                  { title: "Active Bookings", value: "56", change: "+8%" },
                  { title: "Monthly Revenue", value: "Rp 123.4M", change: "+23%" },
                  { title: "Avg. Rating", value: "4.8", change: "+0.2" },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="bg-surface p-6 rounded-panel border border-hairline-input"
                  >
                    <p className="text-sm font-medium text-ink-muted">{stat.title}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-ink">
                        {stat.value}
                      </span>
                      <span className="text-sm font-medium text-green-600">
                        {stat.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>

        {/* Footer */}
        <footer className="border-t border-hairline-input bg-surface">
          <div className="mx-auto px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-ink-soft">© 2024 Lilo Admin Portal</span>
                <span className="text-ink-ghost">|</span>
                <Link href="/terms" className="text-sm text-ink-soft hover:text-ink">
                  Terms
                </Link>
                <Link href="/privacy" className="text-sm text-ink-soft hover:text-ink">
                  Privacy
                </Link>
              </div>
              <div className="text-sm text-ink-soft">
                Version 1.0.0
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}