# liloapp / salda.id — Audit, Master Context & Fix Plan

> Generated from a 6-agent parallel audit of the repository. This file has two parts:
> **Part 1** is a self-contained "master context prompt" — read it (or paste it into a fresh AI session) to fully understand the app, its architecture, and every known problem.
> **Part 2** is a trackable checklist of every fix, each with a concrete way to verify it yourself and a status box.
>
> Nothing in the codebase has been changed yet. This is the plan.

---

# PART 1 — MASTER CONTEXT PROMPT

*(A complete briefing on the system. Accurate as of the audit. Use this to prime full understanding before touching anything.)*

## 1.1 What the product is

**liloapp** is deployed publicly as **salda.id** (see the host redirect in `next.config.js`). It is an **Indonesian streamer/talent booking marketplace** for live-selling / live-shopping promotion (TikTok Live / Shopee Live style). The core loop:

- **Clients** browse streamers, pick date/time slots, and book them to host live-selling sessions.
- **Streamers** receive bookings, accept/reject/reschedule them, run the live session (`startStream` → `endStream`), and manage their schedule, price, gallery, and discounts.
- **Admins** verify streamers and brands, manage vouchers, and (aspirationally) view reports.
- Payment is taken up front via **Midtrans** (Snap checkout + server-to-server webhook).
- Language of the product UI and notification templates is **Bahasa Indonesia**.

## 1.2 Tech stack

- **Next.js 14.2.13**, App Router (`app/`). A vestigial Pages Router file (`pages/_document.tsx`) also exists but is inert.
- **React 18.2.0** (exact-pinned), TypeScript 5.3.3 (`strict: true`, but see hygiene issues).
- **Supabase** — Postgres + Auth (cookie sessions) + Storage. **Two client strategies are in use simultaneously**: the modern `@supabase/ssr` and the **deprecated** `@supabase/auth-helpers-nextjs` (migration was started but never finished).
- **Midtrans** (`midtrans-client`) for payments.
- **Tailwind CSS** + **shadcn/ui** + Radix primitives; `framer-motion`/`motion` for animation; `three` for a custom hero particle field.
- **Sentry** (`@sentry/nextjs`) and **Vercel Analytics** are installed but **both are effectively inert** (see hygiene issues).
- **No test suite, no CI (`.github/workflows` absent), no ESLint config, no Prettier config.**

## 1.3 Roles & auth model

- Roles are expressed via a `user_type` concept (client / streamer / admin; brands appear in verification flows).
- Sessions are established with Supabase Auth cookies. `middleware.ts` → `utils/supabase/middleware.ts#updateSession()` refreshes the session on every request **but only gates two path prefixes**: `/protected` and `/booking-detail`. Everything else (`/admin`, `/streamer-dashboard`, `/settings`, `/messages`, `/client-bookings`, `/notifications`) passes through with **no server-side session or role check**.
- Client-side Supabase calls run with the **anon key**, so table access is governed entirely by Row Level Security (RLS) — which is **not defined in-repo** for almost any table (see §1.7).

## 1.4 Routing map (App Router, `app/`)

- `app/page.tsx` — marketing homepage, composed from `app/sections/{hero,preview,about,wrapup,faq,footer}`.
- `app/(auth-pages)/` — `sign-in`, `sign-up` (client), `streamer-sign-up`, `forgot-password`.
- `app/(onboarding)/` — `client-onboarding`, `streamer-onboarding` profile wizards.
- `app/[username]/page.tsx` — **public SEO streamer landing page** (async server component; canonical URL emitted by `app/sitemap.ts`). **Body is currently blank** — renders only structured-data tags with a `{/* Rest of your streamer page component */}` placeholder.
- `app/location/[city]/page.tsx` — SEO city landing page (server component). **Also blank body.**
- `app/streamers/[id]/page.tsx` — full client-rendered streamer profile/booking UI (1099 lines). **Appears orphaned** — nothing links to `/streamers/{id}`; real profile viewing happens in a modal inside `components/streamer-card.tsx`.
- `app/streamers/page.tsx` — streamer directory (client-side fetch).
- `app/booking-detail/` — booking review + Midtrans payment initiation/callback.
- `app/client-bookings/`, `app/streamer-dashboard/` (2895 lines), `app/streamer-schedule/` — dashboards.
- `app/messages/`, `app/notifications/`, `app/settings/`.
- `app/admin/` — `layout.tsx`, `page.tsx`, `reports/`, `streamers/`, `verificationbrand/`, `verificationstreamer/`, `vouchers/`. **Only `vouchers` uses live Supabase data; the rest render hardcoded mock arrays.**
- `app/protected/` — legacy logged-in landing + `reset-password`.
- `app/api/` — `accept-booking`, `bookings`, `payment-webhook`, `payments/{create,callback}`, `streamers`, `upload`, `auth/callback`.

**Server Actions** live in `app/actions.ts` (~1280 lines, `"use server"`): auth actions, `updateUserProfile`, `updateStreamerProfile`, `updateStreamerPrice`, `startStream`, `acceptItems`, `acceptBooking`, `rejectBooking`, `endStream`, `requestReschedule`, `checkUsernameAvailability`.

## 1.5 Services layer (`services/`)

- `payment/payment-service.ts` (~20KB, largest) — Midtrans Snap integration: `createPayment`, `createBookingAfterPayment` (multi-day/multi-slot booking creation in **chunks of 10** to dodge Vercel Hobby's 10s timeout; manual timezone-offset math; voucher application; async notification fan-out), and an **unused** `updatePaymentStatus`.
- `notification-service.ts` — notification CRUD; called from webhook, actions, message-service, dashboard, popup.
- `notification-templates.ts` — Bahasa Indonesia templates with `{placeholder}` interpolation.
- `message-service.ts` — conversation/message CRUD + realtime; includes a regex content filter that blocks phone numbers/emails in chat.
- `streamer/streamer-service.ts` — dashboard stats (earnings/bookings/lives; reverse-engineers base price via `price / 1.443`).
- `voucher/voucher-service.ts` — `validateVoucher` + `trackVoucherUsage` (insert + RPC decrement + manual rollback).

## 1.6 Payment flow (as it actually behaves)

1. `app/booking-detail/page.tsx` → `POST /api/payments/create` → `createPayment()` returns a Midtrans Snap token. **`gross_amount` comes from client-supplied `metadata.finalPrice`.**
2. Client pays in the Snap UI.
3. `POST /api/payments/callback` → `createBookingAfterPayment()` inserts the `bookings` rows + a `payments` row with `status:'success'`. **No server-side confirmation with Midtrans; `finalPrice` is trusted from the client.**
4. Midtrans separately calls `POST /api/payment-webhook` (server-to-server) → updates `payments.status` and, on `settlement`, creates notifications. **No signature verification; broken `order_id` parsing; not idempotent; only `settlement` handled.**

**`order_id` format is internally contradictory** — the source of the #1 bug:
- `createPayment` builds it as `` `BOOKING-${Date.now()}-${random}` `` (`payment-service.ts:67`) — **no payment/booking id embedded.**
- The webhook extracts the id via `payload.order_id.split('-')[1]` (`payment-webhook/route.ts:17`) — that grabs the **timestamp**, not the real `payments.id` (`newPayment.id`).
- A code comment claims the format is `BOOKING-{id}-{timestamp}`.
- Net effect: a *legitimate* webhook can essentially never match a real `payment_group_id` and returns HTTP 500.

## 1.7 Database reality

- The app queries **21 distinct tables**: `streamers, bookings, users, notifications, streamer_active_schedules, streamer_ratings, streamer_gallery_photos, streamer_day_offs, voucher_usage, conversations, payments, messages, streamer_schedule, accepted_bookings, streamer_current_discounts, payment_status_history, vouchers, testimonials, streamer_price_history, streamer_profiles, profiles`.
- **Only `streamers` has a `CREATE TABLE` migration**, and even that migration is missing columns the code uses (`first_name`, `last_name`, `bio`, `location`, `video_url`, `full_address`). `supabase/seed.sql` inserts into columns the migration doesn't define → a fresh `migrate + seed` would error.
- **RLS policies exist in-repo only for `streamers` and `storage.objects`.** No RLS for `bookings`, `payments`, `messages`, `notifications`, `vouchers`, etc. Combined with anon-key client access, these tables are only as safe as whatever was hand-configured in the Supabase dashboard (unverifiable from the repo).
- Embedded PostgREST selects like `.select('*, streamers(first_name, last_name)')` require FK constraints that **don't exist in any migration** → the live DB has constraints that were never captured.
- `db-docs-text` documents 16 tables and even mentions a `webhook_logs` table that **no code references** — planned audit logging that was never built. Three non-matching schema pictures exist: migrations, `db-docs-text`, and actual code.

## 1.8 Domain rules & conventions worth preserving

- **Platform fee is +30%**: client-facing prices are computed as `basePrice * 1.3` in several places. But base price is reverse-engineered elsewhere as `finalPrice / 1.443` (≈ a 44.3% markup, **not** the inverse of ×1.3, which would be ÷1.3). These two must be reconciled — pick one fee model. (`1/1.3 ≈ 0.769`; `1/1.443 ≈ 0.693`.)
- Bookings support **multi-day / multi-slot** ranges (`timeRanges` / `BookingWithRanges`); inserts are chunked in batches of 10.
- Timezone handling uses a manual IANA-offset lookup (Indonesia zones added recently).
- Notification/UI copy is Bahasa Indonesia — keep it.
- Vouchers: validate (expiry + remaining quantity), then track usage with an RPC decrement and manual rollback on failure.

## 1.9 Known dead / scratch artifacts (safe to remove after extracting value)

Committed at repo root and in `services/`, none imported at runtime: `ref-payment.ts`, `ref-notif.ts`, `notifaction-ref.tsx`, `solution-ref.txt`, `db-docs-text`, `mobile-resp-ref.txt`, `notifications-table.txt`, `services/ref-booking-detail.tsx` (823 lines), plus two 0-byte files `depth-guideline.txt`, `guidelines-hero.txt`. Two contain real unrealized value: `solution-ref.txt` (a performance-fix plan only partially implemented) and the **unused `updatePaymentStatus()`** (a more-correct payment-status updater with an audit-history insert, defined but never called). `notifications-table.txt` contains raw SQL (enum + indexes + RLS for `notifications`) that likely belongs in a real migration.

## 1.10 The mission

Bring this from "works in the happy path on one developer's live Supabase project" to "secure, reproducible, and maintainable." Fix payment security/correctness and authorization first; make the database reproducible from the repo; then pay down hygiene debt. **Do not break** the Bahasa Indonesia UX, the +30% fee model (once reconciled), multi-slot bookings, or the chunked-insert timeout mitigation.

---

# PART 2 — FIX CHECKLIST

**Legend — Status:** ☐ not started · ◐ in progress · ☑ done & verified
**Legend — Sev:** 🔴 Critical · 🟠 High · 🟡 Medium

> The **Verify it yourself** column is written so you can confirm each fix without reading the code — usually a `curl`, a click-path, or a `grep`.

## Phase A — Do Now (security & payment correctness)

> **Status update (2026-07-23):** A1–A8 implemented in code (branch `claude/repo-audit-parallel-sonnet-0lhmsw`). A9 needs live-DB access — see notes below. Items marked ☑ are code-complete; run the **Verify it yourself** step against a deploy/preview to close them out. A4 is ◐ (partial) by design — see note.

| # | Sev | Issue | File(s) | Fix (what was done) | Verify it yourself | Status |
|---|-----|-------|---------|-----|--------------------|--------|
| A1 | 🔴 | Payment webhook has **no Midtrans signature check** | `app/api/payment-webhook/route.ts` | Added `isValidSignature()` — `sha512(order_id+status_code+gross_amount+ServerKey)` constant-time compared to `signature_key`; rejects with 401 before any DB write | `curl -X POST /api/payment-webhook` with a fake JSON body → returns **401**, not 200 | ☑ |
| A2 | 🔴 | **Broken `order_id` → payment mapping** (webhook can't match real payments) | `app/api/payment-webhook/route.ts` | Replaced `order_id.split('-')[1]` with a lookup by `payments.transaction_id == order_id` (the key `createBookingAfterPayment` actually stores); bookings joined via `payment_group_id == payment.id` | Complete a real sandbox payment → matching `payments` row updates, no 500 in logs | ☑ |
| A3 | 🔴 | Webhook **not idempotent** — Midtrans retries duplicate notifications | `app/api/payment-webhook/route.ts` | Guard: if payment already in a paid state and incoming is paid → 200 no-op; notifications only fire on a genuine unpaid→paid transition (callback already notifies, so no duplicates) | POST the same `settlement` payload twice → exactly **one** set of notifications | ☑ |
| A4 | 🔴 | **Payment amount is client-controlled**, no server verification | `app/api/payments/callback/route.ts`, `services/payment/payment-service.ts` | Added `verifyMidtransTransaction()` (Core API `transaction.status`); callback now rejects unknown/unverifiable orders (fabricated `result` 404s), rejects failed status, and rejects when Midtrans `gross_amount` ≠ claimed `finalPrice`. **Remaining:** preventing *underpayment via a low create-time price* needs server-side price computation → tracked in **B3**. | Call the callback with a fabricated `result`/tampered `finalPrice` → **rejected (400)** | ◐ |
| A5 | 🔴 | **`/admin/*` has no auth or role check** | `utils/supabase/middleware.ts`, `app/admin/layout.tsx`, `app/admin/admin-shell.tsx` (new) | `/admin` (+ other authed routes) added to middleware protected prefixes; `admin/layout.tsx` is now a **server component** enforcing a fail-closed `ADMIN_EMAILS` allowlist; UI moved to `admin-shell.tsx`. **⚠️ You must set `ADMIN_EMAILS` env** (comma-separated) or admin is locked to everyone. | Open `/admin` logged-out → redirect to sign-in; as a non-allowlisted user → redirect to `/` | ☑ |
| A6 | 🔴 | **IDOR on booking mutations** — `acceptBooking` (no ownership), `rejectBooking`/`endStream`/`requestReschedule` (no auth) | `app/actions.ts` | All four now `getUser()` and verify `bookingData.streamers.user_id === user.id` before mutating (same pattern as `startStream`) | As user B, invoke reject/end/reschedule on user A's booking → **Unauthorized** | ☑ |
| A7 | 🔴 | `/api/accept-booking` & `/api/bookings` — **no auth, trust request body** | ~~`app/api/accept-booking/route.ts`, `app/api/bookings/route.ts`~~ | Confirmed **zero callers** in code → **deleted** both routes (superseded by server actions) | `find app/api` → routes gone; app still builds | ☑ |
| A8 | 🔴 | `/api/upload` — unauthenticated, unsanitized filename, no type/size limit | ~~`app/api/upload/route.ts`~~ | Confirmed **zero callers** → **deleted** the route | `find app/api` → route gone | ☑ |
| A9 | 🔴 | **20 of 21 tables have no migration; RLS absent in-repo** | `supabase/migrations/` | **Owner action required — needs live-DB access.** Run `supabase db pull` (or dashboard introspection) to capture the real schema into migrations, then audit/add RLS. I did **not** fabricate migrations (a wrong migration could corrupt the live DB or give false confidence). See notes. | On a fresh Supabase project, `supabase db reset` succeeds; each sensitive table has an RLS policy | ⏳ |

### Phase A implementation notes

- **`ADMIN_EMAILS` env var (required for A5).** Admin access is an email allowlist because the data model has no admin role (`user_type` is only `client`/`streamer`). Set e.g. `ADMIN_EMAILS="owner@salda.id,ops@salda.id"`. It's **fail-closed**: unset ⇒ nobody can reach `/admin` (strictly safer than today's wide-open state). Longer term, consider adding an `is_admin` column and switching the check to the DB.
- **A4 is deliberately partial.** The callback fix stops fabricated callbacks and amount-lying at confirmation time, and it does *not* gate booking creation on `settlement` (Indonesian async methods — GoPay/OVO/VA — legitimately report `pending` at the browser redirect; the webhook confirms them later). Fully closing underpayment requires computing the authoritative price server-side in `createPayment` from the streamer's DB price — which depends on the fee model reconciliation in **B3** (you chose "stacked ~44.3%"). Do B3, then wire the server-computed amount into `createPayment`/`gross_amount`.
- **Middleware scope broadened.** Beyond `/admin`, the protected list now also covers `/streamer-dashboard`, `/client-bookings`, `/settings`, `/messages`, `/notifications` (they previously relied on client-side redirects only). Pure hardening — a logged-in user is unaffected.
- **A9 — why not done here.** The live database was built out-of-band; only the owner (with Supabase credentials) can introspect it. Recommended: `supabase db pull` to generate a baseline migration from the live schema, commit it, then review RLS table-by-table (`bookings`, `payments`, `messages`, `notifications` first). The raw SQL already sitting in `notifications-table.txt` (enum + indexes + RLS for `notifications`) is a useful reference to fold in.

## Phase B — Do Soon (correctness, SEO, consistency)

> **Status update (2026-07-23):** B1/B2/B4/B5 done in code. B3 is ◐ — the pricing model is now centralized, but the one money-direction decision is yours (see note). B6 is ⏳ deferred (blocked — see note).

| # | Sev | Issue | File(s) | Fix (what was done) | Verify it yourself | Status |
|---|-----|-------|---------|-----|--------------------|--------|
| B1 | 🟠 | Webhook only handled `settlement`; failures left bookings stuck | `app/api/payment-webhook/route.ts` | Webhook now cancels still-pending bookings (`status in pending/payment_pending`) and notifies the client on `deny/cancel/expire/failure`; idempotent for the failed state too | Fire a test `expire` webhook (valid signature) → the booking flips to `cancelled` and the client gets a notification | ☑ |
| B2 | 🟠 | **Canonical SEO pages render blank bodies** | `app/[username]/page.tsx`, `app/location/[city]/page.tsx` | Built full server-rendered bodies: profile (photo/name/location/category/rating/price/bio/testimonials/CTA) and a city grid of streamer cards linking to profiles | Visit `/{a-real-username}` and `/location/{a-city}` → full pages render; view-source shows real content, not just JSON-LD | ☑ |
| B3 | 🟠 | **Fee math inconsistency** (`×1.3` vs `÷1.443`) | `lib/pricing.ts` (new) + `components/streamer-card.tsx`, `app/sections/hero/page.tsx`, `app/booking-detail/page.tsx`, `services/streamer/streamer-service.ts`, `app/streamer-dashboard/page.tsx` | Created `lib/pricing.ts` (30% platform + 11% tax = ×1.443, documented) and routed all 6 magic-number sites through it — **behavior-preserving**. **Remaining: your call** — checkout still charges ×1.3 (pre-tax) while the UI says "belum termasuk pajak" and earnings assume ×1.443. Flipping checkout to `totalWithTax` (×1.443) is now one line and also completes A4. | After deciding: book a slot → card, booking-detail, and dashboard earnings are all consistent | ◐ |
| B4 | 🟠 | **Two Supabase auth strategies** (`@supabase/ssr` + deprecated `auth-helpers-nextjs`) | ~~`components/booking-form.tsx`, `app/action.tsx`~~, `app/admin/vouchers/page.tsx`, `package.json` | All auth-helpers usages were **dead**: deleted `app/action.tsx` + `components/booking-form.tsx` (zero importers), removed the unused import in `vouchers`, dropped the dependency from `package.json`/lockfile | `grep -rn "auth-helpers-nextjs" .` → only this doc; login still works | ☑ |
| B5 | 🟠 | **Orphaned `streamers/[id]` route** (1099 lines) | ~~`app/streamers/[id]/page.tsx`~~ | Confirmed no links target it and it's not in `sitemap.ts` → **deleted** | `find app/streamers` → only the listing `page.tsx` remains | ☑ |
| B6 | 🟠 | **Admin panel mostly mock data** (verification/reports/streamers non-functional) | `app/admin/{streamers,verificationbrand,verificationstreamer,reports}/page.tsx` | **Deferred — blocked.** All four pages are 100% mock (zero DB queries). Real wiring needs the verification/reports table schema (not in-repo per A9, may not exist live) and product decisions on the approve/reject workflow. Best done after A9 (`supabase db pull`) reveals the real schema. | — | ⏳ |

### Phase B implementation notes

- **B3 — the one decision left (money).** The app's own UI labels the ×1.3 price *"harga belum termasuk pajak"* and streamer earnings are derived as `÷1.443` (tax-inclusive), but checkout only ever charges ×1.3 — so the 11% tax the UI promises is never collected, and the two conventions disagree. Reconciling means either (a) **charge clients the tax-inclusive total** (`totalWithTax`, +11% to what customers pay — matches the UI/earnings and closes A4's underpayment gap), or (b) **drop the tax** everywhere (earnings ÷1.3, remove the "belum termasuk pajak" note — customers pay the same as today). This is a revenue/pricing call, so it's left to the owner; `lib/pricing.ts` makes either a one-line change.
- **B4 was all dead code.** The "migration split" turned out to be dead files carrying the deprecated dep, not live auth on two strategies — so removal was safe, no runtime auth code changed.
- **B6 depends on A9.** Wiring real admin data requires knowing the live verification/reports schema, which the repo can't see. Revisit after `supabase db pull`.

## Phase C — Nice to Have (hygiene, dead code, tooling)

> **Status update (2026-07-23):** C4/C5/C7/C9 done, C2 mostly done (CI + Prettier added; ESLint deferred). C1/C3/C6/C8/C10/C11 remain — most are judgment calls or larger sweeps, noted below.

| # | Sev | Issue | File(s) | Fix (what was done / plan) | Verify it yourself | Status |
|---|-----|-------|---------|-----|--------------------|--------|
| C1 | 🟡 | **Sentry installed but inert** (1-byte configs, no init) | `sentry.client.config.ts`, `sentry.server.config.ts`, `next.config.js` | **Your call:** wire up `Sentry.init` + `withSentryConfig` (needs a Sentry DSN), or remove `@sentry/nextjs`. Not done automatically because it's a product/observability choice. | Throw a test error → appears in Sentry; **or** the dep is gone | ☐ |
| C2 | 🟡 | **No ESLint / CI / tests / Prettier config** | `.github/workflows/ci.yml` (new), `.prettierrc.json` (new) | **Done (mostly):** added a CI workflow running `next build` (type-check + compile) on every PR/push, and a Prettier config. **Deferred:** ESLint (adding a config makes `next build` fail on existing `any`/`<img>` issues → needs `eslint.ignoreDuringBuilds` first) and a test suite. | Push a branch with a deliberate type error → CI fails | ◐ |
| C3 | 🟡 | **58 `any`/`as any`, 1 `@ts-ignore`, 366 `console.*`** | worst: `components/payment-modal.tsx`, `app/booking-detail/page.tsx`, `services/payment/payment-service.ts`, `components/streamer-card.tsx`, `app/actions.ts` | **Remaining** — large sweep. Type the worst offenders; strip debug `console.*` (keep intentional error logging). Best done incrementally once ESLint (C2) can gate it. | `grep -rn ": any\|as any\|@ts-ignore" app services components \| wc -l` trends toward 0 | ☐ |
| C4 | 🟡 | **Loose scratch/reference files** | root + `services/*` | **Done:** deleted 12 dead scratch files; relocated the 2 with lasting value into `supabase/` (`SCHEMA_REFERENCE.md`, `notifications_reference.sql`) for the A9 work. | `ls` root → ref/scratch files gone; app still builds | ☑ |
| C5 | 🟡 | **Redundant deps**: 6 unused tsparticles pkgs, stray `"i"` pkg, 4 concurrent toast systems | `package.json` | **Done:** removed all 6 tsparticles pkgs + `"i"` (confirmed zero imports). **Remaining:** the 3 toast libs (`react-hot-toast`/`react-toastify`/`sonner`) are all *in use* across pages — consolidating to one is a UI refactor (part of C6). | `npm ls tsparticles i` → not found | ◐ |
| C6 | 🟡 | **Duplicated logic**: `calculateDuration` (6 copies), fee formula, notification-create, 3 toast libs | multiple | **Partially addressed:** the fee formula is now centralized in `lib/pricing.ts` (B3). **Remaining:** consolidate the 6 `calculateDuration` copies into one shared helper and standardize on a single toast library. | `grep -rn "calculateDuration" app components lib` → one definition | ☐ |
| C7 | 🟡 | **Dead `pages/_document.tsx` + inconsistent metadata sources** | `pages/_document.tsx`, `app/layout.tsx`, `app/metadata.ts` | **Done:** deleted `pages/_document.tsx` (app is now pure App Router). **Remaining (minor):** favicon/OG tags still live in both `app/layout.tsx` and `app/metadata.ts` — worth consolidating. | `/` favicon/OG still correct | ◐ |
| C8 | 🟡 | **Unnecessary `"use client"`** on static pages (hurts SEO/perf) | `app/tutorial/video-guide/page.tsx`, `app/sections/footer/page.tsx`, `app/terms/page.tsx`, `app/privacy-notice/page.tsx`, `app/admin/page.tsx`, `app/streamers/page.tsx` | **Remaining.** Convert to server components; isolate any animation into small client wrappers. Each needs per-file verification (no client-only hooks), so left as a careful follow-up. | view-source on `/terms` shows server-rendered content | ☐ |
| C9 | 🟡 | **Dead code files** (zero importers) | `lib/utils.ts`, `lib/constants/indonesia-cities.ts`, `utils/cn.ts`, `utils/image-loader.ts`, `utils/analytics.tsx` | **Done:** deleted the 4 dead files + stripped the unused `calculateDuration`/`calculateTotalPrice` exports from `lib/utils.ts` (kept `cn`). | `next build` still passes | ☑ |
| C10 | 🟡 | **Config baked into source** (`images.unoptimized:true`, hardcoded `liloapp.vercel.app`→`salda.id` redirect) | `next.config.js` | **Remaining (minor).** Move canonical host to env; reconsider disabling image optimization. | Preview deploys redirect via env, not a code edit | ☐ |
| C11 | 🟡 | **Two different components named `Navbar`** | `app/components/navbar/navbar.tsx`, `components/ui/navbar.tsx` | **Remaining (low priority).** Rename one (e.g. `MarketingNavbar`). | `grep -rn "import.*[Nn]avbar"` → unambiguous names | ☐ |

### Phase C implementation notes

- **CI is now the safety net (C2).** `.github/workflows/ci.yml` runs `next build` (type-check + compile) on every PR — this is exactly what would have caught the Phase A build break before it hit Vercel. ESLint is intentionally not wired: turning it on would make `next build`/Vercel fail on the existing `any`/`<img>` issues; do C3 (or set `eslint.ignoreDuringBuilds`) first.
- **Remaining Phase C is judgment calls + sweeps.** C1 (Sentry) is a product decision; C3 (types/logging) and C8 (`use client`) are incremental sweeps best gated by ESLint; C6/C10/C11 are lower-value polish. None block the app.

---

## How to use this document

1. Work top-down: **Phase A before B before C.** A1–A4 (payments) and A5–A6 (authz) are the highest real-world risk.
2. As each item is fixed, change its `☐` to `◐` while in progress and `☑` once you've run the **Verify it yourself** step.
3. Several "dead" items (A7, A8, B5, C4, C9) are resolved by *deletion* — always run the `grep` verification first to confirm nothing imports them.
4. Keep Part 1 updated if the architecture changes; it's the shared source of truth for future work.
