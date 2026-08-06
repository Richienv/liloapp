"use client";

import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

/**
 * Brand verification queue.
 *
 * WHAT WAS REMOVED, AND WHY
 *
 * The queue used to list "Tech Solutions Inc" and "Fashion Forward" — two
 * invented companies with invented emails, industries, document URLs and
 * submission dates, declared in a `mockBrands` array in this file. The row
 * actions ("Setujui Brand", "Tolak Brand") were menu items with no handler, so
 * approving one of those fictional companies did nothing at all.
 *
 * Nothing on this screen reads a table. The streamer queue next door
 * (`/admin/verificationstreamer`) is the one that does, and it is the model
 * this screen follows when a brand submissions table exists to read. Building
 * that query is a data change, not a presentation change, so it is not done
 * here — the invented rows are simply gone.
 */
export default function BrandVerificationPage() {
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <header className="mb-7 max-w-[620px]">
        <h1 className="font-serif text-section font-semibold text-ink">
          Verifikasi brand
        </h1>
        <p className="mt-2 text-lede text-ink-soft">
          Tinjau pengajuan pendaftaran brand sebelum mereka bisa memesan host.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-ghost" />
          <Input
            placeholder="Cari nama perusahaan atau email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-field border-hairline-input bg-surface pl-9 text-copy text-ink placeholder:text-ink-ghost"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-10 w-[190px] shrink-0 rounded-field border-hairline-input bg-surface text-copy text-ink-body">
            <SelectValue placeholder="Saring berdasarkan status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="pending">Menunggu review</SelectItem>
            <SelectItem value="verified">Disetujui</SelectItem>
            <SelectItem value="rejected">Ditolak</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Verification Table */}
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead className="h-10 w-[280px] font-mono text-tiny uppercase text-ink-ghost">
                Perusahaan
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Industri
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Status
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Diajukan
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Dokumen
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="border-hairline-soft hover:bg-transparent">
              <TableCell colSpan={5} className="px-5 py-14 text-center">
                <p className="font-serif text-title font-semibold text-ink">
                  Antrean verifikasi brand belum tersambung
                </p>
                <p className="mx-auto mt-2 max-w-md text-copy text-ink-soft">
                  Tabel ini sebelumnya menampilkan dua perusahaan contoh lengkap
                  dengan email dan tanggal pengajuan yang ditulis di kode, dengan
                  tombol setujui dan tolak yang tidak terhubung ke apa pun. Baris
                  contoh itu dihapus.
                </p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
