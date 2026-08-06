# Salda design reference

Extracted verbatim from the five `.dc.html` design files. **This is the source
of truth for copy and structure.** Do not paraphrase from memory — if a string
appears here, use it exactly. The Indonesian is deliberate: informal `kamu`,
never `Anda`, and it is already in the voice the brief asks for.

Status column: what exists in the app today.

---

## Tokens

Already in `tailwind.config.ts` and `app/globals.css`.

| Role | Value | Tailwind |
|---|---|---|
| Canvas | `#faf9f6` | `bg-canvas` |
| Card | `#ffffff` / hover `#fdfcfa` | `bg-surface` / `bg-surface-raised` |
| Quiet fill | `#f2f1ee` / `#eceae5` | `bg-surface-tint` / `bg-surface-deep` |
| Ink | `#171717` → `#404040` → `#525252` → `#737373` → `#8a8880` → `#a3a19a` | `text-ink` / `-body` / `-muted` / `-soft` / `-faint` / `-ghost` |
| Hairline | `#e7e5e0` card, `#f0efeb` divider, `#dedbd4` input, `#c7c5be` strong | `border-hairline` / `-soft` / `-input` / `-strong` |
| Accent | `#2563eb`, hover `#1d4ed8`, deep `#1e40af`, tint `#eff6ff` | `bg-brand` / `-hover` / `-deep` / `-tint` |
| Positive | `#166534` on `#f0fdf4` border `#bbf7d0` | `text-positive` / `bg-positive-tint` / `border-positive-line` |
| Caution | `#b45309` on `#fffbeb` border `#fde68a` | `text-caution` / `bg-caution-tint` / `border-caution-line` |

**One accent per section.** If two things on a screen are blue, one is wrong.
**Hairlines, not shadows.** The only real shadow is `shadow-rail`.

Type: Playfair Display for headings, Inter for UI, JetBrains Mono for values
you compare or copy. Section eyebrows are JetBrains Mono 12px, `.08em`,
`#a3a19a`, formatted `01 / Cara kerja`.

Page width is `max-width:1180px`; section padding `clamp(72px,12vh,140px)
clamp(20px,5vw,48px)`.

---

## Landing — `app/page.tsx` + `app/sections/**`

**Status: not built.** Only gradients removed and data fabrication stopped.

Nav: `Cara kerja` · `Host` · `Testimoni` · `FAQ` · `Masuk` · `Cari host`

### Hero
- Eyebrow pill: `Shopee & TikTok Live-Seller Supported`
- H1, Playfair `clamp(40px,7.2vw,86px)`, line-height 1.02, tracking `-.03em`:
  `Host livestreamer terlatih untuk` + a rotating word
- Rotating words: `produk kamu.` → `brand kamu.` → `toko kamu.`
- Sub: `Booking host yang sudah terverifikasi, atur jadwal live, dan bayar di satu tempat. Rata-rata brand mulai live dalam tiga hari setelah mendaftar.`
- CTA: `Mulai cari host`
- Live proof strip: `47 host sedang live` · `12,4rb like hari ini` · `18.902 nonton sekarang` · `LIVE`
- Footnote: `Gratis mendaftar · bayar hanya saat booking`

> These proof numbers are marketing claims. Wire them to real counts or agree
> they are illustrative — do not ship them as facts by accident.

### 01 / Cara kerja — `Delapan langkah dari daftar sampai live.`
Sub: `Kami dampingi di tiap tahap supaya sesi pertama kamu berjalan tanpa kejutan.`

| # | Title | Body |
|---|---|---|
| 01 | Minta Akses | Pastikan kamu sudah membuat akun dan mendapatkan akses dari tim Trolive. Jika belum, silakan klik tombol ini untuk mengirim pesan permintaan akses. |
| 02 | Masuk & Jelajahi | Masuk dengan akun kamu dan lihat-lihat platform untuk membiasakan diri dengan semua fitur yang tersedia. |
| 03 | Pesan Host | Lihat host yang kamu suka dan klik "book livestreamer" untuk memilih jam yang tersedia. |
| 04 | Cek Detail Booking | Periksa detail booking kamu dan pastikan informasi pengiriman barang dan sub akun sudah benar. Hubungi host atau support jika butuh bantuan. |
| 05 | Selesaikan Pembayaran | Selesaikan pembayaran menggunakan QRIS/VA/Transfer Bank yang tersedia. Setelah itu kamu akan diarahkan untuk melihat booking yang baru saja dibuat. |
| 06 | Tunggu Konfirmasi | Kamu bisa menunggu host untuk menerima/menolak booking dan akan mendapat notifikasi di dalam aplikasi, jadi pastikan untuk membuka web app untuk mengecek. |
| 07 | Komunikasi dengan Host | Setelah host menerima, komunikasikan via pesan aplikasi dan kirim produk kamu untuk mereka tampilkan. |
| 08 | Mulai Live | Mereka akan melakukan live sesuai waktu booking kamu dan kamu akan diinformasikan tentang semuanya. Selesai! |

### 02 / Di dalam — `Semua yang kamu butuhkan ada di satu layar.`
Sub: `Jadwal, pembayaran, pesan ke host, dan status sesi. Tidak perlu pindah ke WhatsApp atau spreadsheet.`

| # | Title | Body |
|---|---|---|
| 01 | Pesan host | Pilih host, lalu tandai blok jam yang kamu mau. |
| 02 | Cek detail booking | Rincian sesi di kiri, total harga selalu terlihat di kanan. |
| 03 | Selesaikan pembayaran | QRIS, virtual account, atau transfer bank. |
| 04 | Komunikasi dengan host | Kirim brief dan pantau balasan host di aplikasi. |

### 03 / Apa kata mereka — `Kita udah ngebantu mereka.`
Sub: `Sekarang kita ingin ngebantu kamu.`

### 04 / FAQ — `Pertanyaan yang sering ditanyakan.`
Sub: `Temukan jawaban untuk pertanyaan umum seputar layanan Salda dan cara kerjanya.`
Footer: `Masih punya pertanyaan?` / `Hubungi tim support kami`

### Closing
`Sesi live pertama kamu bisa mulai minggu ini.`
`Daftar gratis, lihat host yang tersedia, dan bayar hanya saat kamu booking.`
CTA `Mulai cari host`. Footer tagline: `Platform live commerce untuk brand Indonesia.`

---

## Client

| Screen | Design title | App route | Status |
|---|---|---|---|
| Marketplace | `Host siap live minggu ini` | `/protected`, `/streamers` | built |
| Booking | `Atur sesi live` | `/booking/[streamerId]` | built |
| Checkout | `Detail pemesanan` | `/booking-detail` | built |
| Bookings | `Booking saya` | `/client-bookings` | built |
| Notifications | `Notifikasi` | `/notifications` | built |
| Success | `Pembayaran diterima` | `/payment-success` | built |

> The "Paling sering dibooking" sort chip is rendered **disabled**. Nothing in
> the listing payload counts completed bookings, and ranking hosts by an
> invented number is the fabricated data this redesign has been removing. It
> lights up when there is an aggregate behind it.

### Filter bar
Sort: `Rekomendasi` · `Harga terendah` · `Rating tertinggi` · `Paling sering dibooking`
Facets: `Kota` · `Platform` · `Harga per jam` · `Rating` · `Bersihkan semua filter`
Empty: `Belum ada host yang cocok` / `Coba longgarkan filter kota atau harga.`

### Booking — `Atur sesi live`
Sub: `Tiga langkah. Kamu bisa kembali kapan saja tanpa kehilangan pilihan.`

Step 1 `Dua hal yang menentukan jadwal` —
`Pengiriman produk menentukan tanggal paling awal yang bisa kamu pilih. Platform menentukan akun apa yang perlu kamu siapkan nanti.`
Questions: `Perlu kirim produk ke host?` / `Live di platform mana?`

Step 2 `Pilih tanggal`. Legend: `■ Terpilih` · `● Ada slot kosong` · `● Host libur atau penuh`
Empty: `Belum ada tanggal` / `Kembali ke langkah 2 dan pilih tanggal dulu.`

**`Kenapa slotnya 2 jam`** —
`Satu sesi live minimal 2 jam, dan antar sesi di hari yang sama perlu jeda minimal 2 jam. Dengan blok 2 jam, dua aturan itu selalu terpenuhi — pilih blok yang berdampingan untuk sesi lebih panjang.`

> This is the "2-hour blocks" rule from the brief, with its reason. The app
> currently offers 1-hour slots with a 3-slot minimum, which satisfies the first
> rule but not the inter-session gap. Changing it touches
> `lib/booking-rules.ts` and its tests.

Rail: `Pajak 11%`, `Total`, and
`Pembatalan gratis hingga 24 jam sebelum jadwal. Setelah itu dikenakan biaya 50%.`

### Checkout — `Detail pemesanan`
Sub: `Periksa sekali lagi, lalu selesaikan pembayaran.`
Sections: `Sesi yang dipesan` · `Yang perlu kamu siapkan`
(`Host tidak bisa mulai live tanpa tiga hal ini.` — sub-account, `Kata sandi`, `Permintaan khusus`)
· `Ringkasan pembayaran` (`Voucher`, `Pakai`, `Total pembayaran`) · CTA `Bayar sekarang`

### Host profile drawer
`Tentang {firstName}` · `Kategori produk` · `Jadwal minggu ini` · `Kata brand sebelumnya`
· `per jam · minimal 2 jam` · CTA `Atur sesi`

### Success — `Pembayaran diterima`
CTAs: `Lihat booking saya` · `Cari host lain`

---

## Host dashboard — `app/streamer-dashboard`

| # | Section | Status |
|---|---|---|
| 1 | `Yang harus kamu lakukan sekarang` | built |
| 2 | `Permintaan yang menunggu jawaban kamu` | built |
| 3 | `Ringkasan minggu ini` | missing |
| 4 | `Minggu ini sekilas` | missing |
| 5 | `Sesi yang perlu kamu urus` | partial |
| 6 | `Sudah selesai` | missing |
| 7 | `Uang yang bisa kamu ambil sekarang` | built — backend in `20260806140000_payouts.sql` |
| 8 | `Dari mana uangnya bulan ini` | built |
| 9 | `Riwayat pembayaran` | built |
| 10 | `Ini yang brand lihat` | built |
| 11 | `Atur harga dan hari kerja` | built |
| 12 | `Performa kamu` | built, minus response time — no schema support |

> Balances are **derived** from bookings, never stored: a stored total drifts
> the first time a booking is cancelled after it was incremented. Every figure
> runs through `salda_host_earnings()` so the ÷1.443 happens in exactly one
> place — the chart previously plotted the raw brand price and over-reported a
> host's earnings by ~44%.

Copy worth keeping exact:

- Request card: `Bayaran kamu` · `Durasi` · `Batas jawab` · `Tolak` · `Terima booking`
- Reject modal: `Pilih satu alasan` /
  `Brand akan melihat alasan ini. Menolak terlalu sering menurunkan urutan kamu di pencarian.`
  · `Batal` · `Kirim penolakan`
- Empty: `Tidak ada yang menunggu jawaban` / `Semua permintaan sudah kamu jawab. Kerja bagus.`
- Earnings: `Pendapatan 7 hari terakhir` · `Saldo siap dicairkan` ·
  `Rp … menunggu sesi selesai` · `Tarik saldo` · `Diproses tiap Senin ke BCA ••4471.`
- Balance: `Siap dicairkan` · `Selesai, siap cair` · `Tertahan` · `Total di Salda` ·
  `Dana tertahan cair otomatis setelah sesi selesai.` ·
  `Dana masuk ke BCA ••4471 dalam 1×24 jam kerja. Tidak ada biaya penarikan.` ·
  `Pencairan otomatis berjalan tiap Senin. Kamu juga bisa tarik kapan saja.` · `Ubah rekening`
- `Ini yang brand lihat` / `Kartu kamu di hasil pencarian` /
  `Brand memutuskan dalam hitungan detik. Tiga hal yang paling menentukan: harga, rating, dan seberapa cepat kamu membalas.`
- Pricing: `Tarif dasar per jam` / `Ini yang kamu terima. Salda menambah 30% di atasnya.` /
  `Brand membayar` / `Hari kamu siap live` /
  `Brand hanya bisa memesan di hari yang kamu nyalakan.` /
  `Perubahan berlaku untuk booking baru. Sesi yang sudah dipesan tidak berubah.`

---

## Auth — `app/(auth-pages)`

| Screen | Design title | Status |
|---|---|---|
| Role picker | `Kamu daftar sebagai apa?` | built |
| Sign in | `Masuk ke akun kamu` | built — shares `AuthShell` with the role picker |

> Sign-in's proof panel carries **no statistics**. The role picker's panels quote
> figures lifted from the design file that nobody has confirmed are true
> ("250+ Host aktif", "4,9 Rating rata-rata", "Rp 443rb rata-rata per sesi") —
> those are still awaiting a decision. There is no reason to repeat an
> unverified claim to someone who already has an account.

Layout: `minmax(0,1fr) minmax(0,1.05fr)`, form column max 452px, proof panel
`#f2f1ee` for brand and `#171717` for host. Step label `Langkah 1 dari 2`.

Password strength: `+1 if length>=8`, `+1 if uppercase or symbol`,
`+1 if digit and length>=10`. Bar colours `#f59e0b` → `#2563eb` → `#166534`.

Proof panel content is in `ROLE_PANELS` in `app/(auth-pages)/pilih-peran/page.tsx`.

---

## Two bugs the brief says not to repeat

1. **Grid hairlines** — a bordered cell inside a grid double-draws against its
   neighbour. Use `shadow-cell` (`0 0 0 .5px #e7e5e0`), not a border.
2. **Scroll reveal** — content is visible by default. The hidden state only
   applies under `.reveal-armed`, which script sets after confirming it runs.
   See `app/globals.css`.
