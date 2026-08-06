"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-surface-tint border-t border-hairline-input">
      {/* Main Footer Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-[1200px] mx-auto">
          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Office Locations */}
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-ink mb-2">Balikpapan Office</h4>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Jl. Mayjend Sutoyo, Gg. Surya No.89<br />
                  Klandasan Ilir, Kec. Balikpapan Kota<br />
                  Kota Balikpapan, Kalimantan Timur 76113
                </p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink mb-2">Jakarta Office</h4>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Apartment Neo Soho Central Park #3110<br />
                  Tanjung Duren Selatan, Kec. Grogol Petamburan<br />
                  Kota Jakarta Barat, DKI Jakarta 11470
                </p>
              </div>
            </div>

            {/* Contact Details */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-ink mb-2">Hubungi Kami</h4>
                <div className="space-y-2">
                  <p className="text-sm text-ink-muted">
                    <span className="font-medium">Email:</span>{" "}
                    <a href="mailto:admin@trolive.id" className="hover:text-ink">
                      admin@trolive.id
                    </a>
                  </p>
                  <p className="text-sm text-ink-muted">
                    <span className="font-medium">Support Chat:</span>{" "}
                    <a href="https://wa.me/62895700120901" className="hover:text-ink">
                      62895700120901
                    </a>
                  </p>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink mb-2">Ikuti Kami</h4>
                <div className="flex space-x-4">
                  <a href="#" className="text-ink-muted hover:text-ink">Instagram</a>
                  <a href="#" className="text-ink-muted hover:text-ink">LinkedIn</a>
                  <a href="#" className="text-ink-muted hover:text-ink">Twitter</a>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 mt-8 border-t border-hairline-input">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-ink-muted">
                  © 2024 Salda by Trolive. All rights reserved.
                </span>
                <span className="text-ink-ghost">|</span>
                <a href="https://trolive.id" className="text-sm text-ink-muted hover:text-ink">
                  trolive.id
                </a>
              </div>
              <div className="flex items-center space-x-4">
                <select className="text-sm text-ink-muted bg-transparent border-none focus:ring-0">
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
} 