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
import { Button } from "@/components/ui/button";

/**
 * Streamer directory.
 *
 * WHAT WAS REMOVED, AND WHY
 *
 * This table used to be filled from a `mockStreamers` array declared at the top
 * of this file — "Sarah Chen", "Mike Johnson", their prices, their booking
 * counts, their cancellation counts, their join dates. Two invented people with
 * eight invented figures each, rendered in a table an admin would reasonably
 * read as the state of the business.
 *
 * There is no query behind this screen. Restyling those rows would have made
 * the fabrication look measured, so the rows are gone and the screen is what it
 * actually is: the directory's shape, waiting for the query that fills it.
 * Writing that query is a data change, not a presentation change, so it is not
 * done here.
 *
 * The search box and the status filter are kept and still hold their state —
 * they are the real controls this screen needs the moment there are rows.
 */
export default function StreamersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[560px]">
          <h1 className="font-serif text-section font-semibold text-ink">
            Streamer
          </h1>
          <p className="mt-2 text-lede text-ink-soft">
            Kelola dan pantau semua streamer yang terdaftar di platform.
          </p>
        </div>
        {/*
          Disabled rather than removed, the same way the marketplace's "Paling
          sering dibooking" sort chip is disabled: the control belongs on this
          screen, but it has never had a handler behind it. A blue button that
          does nothing when pressed is worse than one that says so up front.
        */}
        <Button
          variant="brand"
          size="action-compact"
          disabled
          title="Belum tersedia — pendaftaran streamer masih lewat alur onboarding"
          className="shrink-0"
        >
          Tambah streamer
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-ghost" />
          <Input
            placeholder="Cari nama atau email streamer…"
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
            <SelectItem value="verified">Terverifikasi</SelectItem>
            <SelectItem value="pending">Menunggu review</SelectItem>
            <SelectItem value="rejected">Ditolak</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Streamers Table */}
      <div className="overflow-hidden rounded-frame border border-hairline bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead className="h-10 w-[300px] font-mono text-tiny uppercase text-ink-ghost">
                Nama
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Status
              </TableHead>
              <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                Harga sekarang
              </TableHead>
              <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                Harga sebelumnya
              </TableHead>
              <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                Total booking
              </TableHead>
              <TableHead className="h-10 text-right font-mono text-tiny uppercase text-ink-ghost">
                Dibatalkan
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Platform
              </TableHead>
              <TableHead className="h-10 font-mono text-tiny uppercase text-ink-ghost">
                Bergabung
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="border-hairline-soft hover:bg-transparent">
              <TableCell colSpan={8} className="px-5 py-14 text-center">
                <p className="font-serif text-title font-semibold text-ink">
                  Daftar streamer belum tersambung
                </p>
                <p className="mx-auto mt-2 max-w-md text-copy text-ink-soft">
                  Tabel ini sebelumnya diisi dua streamer contoh beserta harga,
                  jumlah booking, dan tanggal bergabung yang seluruhnya ditulis
                  di kode. Baris contoh itu dihapus supaya tidak ada yang salah
                  membacanya sebagai data asli.
                </p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
