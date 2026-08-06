"use client";

import Image from "next/image";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-[#faf9f6] z-50 border-b border-hairline">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo with TROLIVE text */}
          <div className="flex items-center">
            <div className="relative">
              <Image
                src="/images/salda-logoB.png"
                alt="Salda"
                width={160}
                height={53}
                className="h-8 w-auto md:h-10"
                priority
              />
              <span className="absolute -bottom-1 right-0 text-[10px] text-ink tracking-wide font-light">
                by TROLIVE
              </span>
            </div>
          </div>

          {/* Contact Button with WhatsApp Icon */}
          <a
            href="https://wa.me/62895700120901"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white px-2.5 sm:px-4 py-2 rounded-full text-sm font-medium transition-all duration-300"
          >
            <Image
              src="/whatsapp-icon.png"
              alt="WhatsApp"
              width={20}
              height={20}
              className="w-5 h-5"
            />
            <span className="hidden sm:inline">Contact Us</span>
          </a>
        </div>
      </div>
    </nav>
  );
} 