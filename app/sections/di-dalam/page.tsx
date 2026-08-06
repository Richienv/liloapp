import { CreditCard, MessageSquare, MousePointerClick, Receipt } from 'lucide-react';

import { Section, SectionHeading } from '../section-heading';

/**
 * "Semua yang kamu butuhkan ada di satu layar."
 *
 * Where "Cara kerja" answers what will be asked of you, this answers where it
 * happens. The sub-copy names the alternative out loud — WhatsApp and a
 * spreadsheet — because that is what a brand is actually doing today, and a
 * product that will not name the incumbent is not making a claim.
 *
 * Copy verbatim from design/REFERENCE.md.
 */
const PANELS = [
  {
    n: '01',
    icon: MousePointerClick,
    title: 'Pesan host',
    body: 'Pilih host, lalu tandai blok jam yang kamu mau.',
  },
  {
    n: '02',
    icon: Receipt,
    title: 'Cek detail booking',
    body: 'Rincian sesi di kiri, total harga selalu terlihat di kanan.',
  },
  {
    n: '03',
    icon: CreditCard,
    title: 'Selesaikan pembayaran',
    body: 'QRIS, virtual account, atau transfer bank.',
  },
  {
    n: '04',
    icon: MessageSquare,
    title: 'Komunikasi dengan host',
    body: 'Kirim brief dan pantau balasan host di aplikasi.',
  },
] as const;

export default function DiDalam() {
  return (
    <Section>
      <SectionHeading
        index="02"
        eyebrow="Di dalam"
        title="Semua yang kamu butuhkan ada di satu layar."
        sub="Jadwal, pembayaran, pesan ke host, dan status sesi. Tidak perlu pindah ke WhatsApp atau spreadsheet."
      />

      <div className="mt-12 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {PANELS.map((panel) => {
          const Icon = panel.icon;
          return (
            <div
              key={panel.n}
              className="flex gap-4 rounded-panel border border-hairline bg-surface p-6"
            >
              {/*
                The icon is quiet — surface-tint, ink-faint. Only one thing per
                section may be blue, and on this page that budget is spent on
                the step numbers in section 01 and the CTA at the end.
              */}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-surface-tint text-ink-faint">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-mini tracking-[.08em] text-ink-ghost">{panel.n}</p>
                <h3 className="mt-1.5 text-title font-semibold text-ink">{panel.title}</h3>
                <p className="mt-1.5 text-copy leading-relaxed text-ink-muted">{panel.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
