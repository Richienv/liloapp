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

| # | Sev | Issue | File(s) | Fix | Verify it yourself | Status |
|---|-----|-------|---------|-----|--------------------|--------|
| A1 | 🔴 | Payment webhook has **no Midtrans signature check** | `app/api/payment-webhook/route.ts` | Compute `sha512(order_id + status_code + gross_amount + ServerKey)` and reject if it ≠ `payload.signature_key` before any DB write | `curl -X POST /api/payment-webhook` with a fake JSON body → must return **401/403**, not 200 | ☐ |
| A2 | 🔴 | **Broken `order_id` → payment mapping** (webhook can't match real payments) | `services/payment/payment-service.ts:67`, `app/api/payment-webhook/route.ts:17` | Embed the real `payments.id` in `order_id` (e.g. `SALDA-{payment.id}`) **or** look up the payment by the full `order_id` string instead of `split('-')[1]` | Complete a real test-mode payment; confirm the matching `payments` row flips to `settlement`/`success` and no 500 appears in logs | ☐ |
| A3 | 🔴 | Webhook **not idempotent** — Midtrans retries duplicate notifications | `app/api/payment-webhook/route.ts:44-65` | Guard: if payment already `settlement`, return 200 without re-notifying; add a unique constraint on notifications where feasible | Send the same `settlement` webhook payload twice → exactly **one** set of notification rows created | ☐ |
| A4 | 🔴 | **Payment amount is client-controlled**, no server verification | `app/api/payments/callback/route.ts`, `services/payment/payment-service.ts` | Verify the charge server-side via Midtrans `transaction.status(orderId)` and use the amount **Midtrans reports**, not `metadata.finalPrice`, before creating a paid booking | Call the callback with a tampered low `finalPrice` → booking must be **rejected** or corrected to the real charged amount | ☐ |
| A5 | 🔴 | **`/admin/*` has no auth or role check** | `utils/supabase/middleware.ts`, `app/admin/layout.tsx` | Add `/admin` to protected prefixes in middleware **and** a server-side `getUser()` + `user_type === 'admin'` gate in `admin/layout.tsx` | Open `/admin` in a logged-out browser (or as a normal client) → must **redirect to sign-in**, not render | ☐ |
| A6 | 🔴 | **IDOR on booking mutations** — `acceptBooking` (no ownership), `rejectBooking`/`endStream`/`requestReschedule` (no auth) | `app/actions.ts` | Add `getUser()` to all four and verify the caller owns/streams the booking before mutating | As user B, invoke reject/end/reschedule on user A's booking id → must **fail with Unauthorized** | ☐ |
| A7 | 🔴 | `/api/accept-booking` & `/api/bookings` — **no auth, trust request body** (`client_id`, `price`, etc.) | `app/api/accept-booking/route.ts`, `app/api/bookings/route.ts` | These have no callers (superseded by server actions). **Confirm dead → delete.** If kept, add auth + ownership + zod validation | `grep -rn "api/accept-booking\|api/bookings" app components` → no callers, then confirm nothing breaks after removal | ☐ |
| A8 | 🔴 | `/api/upload` — unauthenticated, unsanitized filename, no type/size limit | `app/api/upload/route.ts` | Require auth; sanitize `file.name` (reuse `sanitizeFileName` from `app/actions.ts`); enforce content-type allowlist + max size. If route is dead, delete it | `curl -X POST /api/upload` unauthenticated with `../evil.svg` → must be **rejected** | ☐ |
| A9 | 🔴 | **20 of 21 tables have no migration; RLS absent in-repo** | `supabase/migrations/` | Introspect the live DB and add migrations for all tables + FKs + **RLS policies** (start with `bookings`, `payments`, `messages`, `notifications`). Fold `notifications-table.txt` SQL into a real migration | On a fresh Supabase project, `supabase db reset` succeeds and the app runs; each sensitive table has an RLS policy | ☐ |

## Phase B — Do Soon (correctness, SEO, consistency)

| # | Sev | Issue | File(s) | Fix | Verify it yourself | Status |
|---|-----|-------|---------|-----|--------------------|--------|
| B1 | 🟠 | Webhook only handles `settlement`; `deny/cancel/expire/pending/refund` don't update `bookings.status` | `app/api/payment-webhook/route.ts` | Map every Midtrans status to a booking state (and `capture` → check `fraud_status`); notify the client on failure/expiry | Fire a test `expire` webhook → booking moves out of pending and client is notified | ☐ |
| B2 | 🟠 | **Canonical SEO pages render blank bodies** | `app/[username]/page.tsx`, `app/location/[city]/page.tsx` | Replace the `{/* Rest of your ... */}` placeholder with the real profile/city content | Visit `/{a-real-username}` → a full page renders; view-source shows real content, not just JSON-LD | ☐ |
| B3 | 🟠 | **Fee math inconsistency** (`×1.3` vs `÷1.443`) | `components/streamer-card.tsx`, `app/sections/hero/page.tsx`, `app/settings/page.tsx`, `app/booking-detail/page.tsx`, `services/streamer/streamer-service.ts`, `app/streamer-dashboard/page.tsx` | Decide the true fee model, put it in one shared helper (`lib/pricing.ts`), and replace every hardcoded factor | Book a slot and compare the price shown on the streamer card, booking-detail, and dashboard earnings → all consistent | ☐ |
| B4 | 🟠 | **Two Supabase auth strategies** (`@supabase/ssr` + deprecated `auth-helpers-nextjs`) | `components/booking-form.tsx`, `app/admin/vouchers/page.tsx`, `app/api/accept-booking/route.ts`, `app/action.tsx` | Migrate the 4 holdouts to `@supabase/ssr`; remove `@supabase/auth-helpers-nextjs` from `package.json` | `grep -rn "auth-helpers-nextjs" .` → no matches; auth/login still works | ☐ |
| B5 | 🟠 | **Orphaned `streamers/[id]` route** (1099 lines) | `app/streamers/[id]/page.tsx` | Confirm no links target it; delete, or wire it up if it should be the real profile page | `grep -rn "streamers/" app components \| grep -v "\[id\]"` shows no linker → safe to remove | ☐ |
| B6 | 🟠 | **Admin panel mostly mock data** (verification/reports/streamers non-functional) | `app/admin/{streamers,verificationbrand,verificationstreamer,reports}/page.tsx` | Replace `mockBrands`/`mockStreamers`/hardcoded stats with real Supabase queries (after A5 gates access) | Load each admin page → shows real DB rows, not Twitch/YouTube mock data | ☐ |

## Phase C — Nice to Have (hygiene, dead code, tooling)

| # | Sev | Issue | File(s) | Fix | Verify it yourself | Status |
|---|-----|-------|---------|-----|--------------------|--------|
| C1 | 🟡 | **Sentry installed but inert** (1-byte configs, no init) | `sentry.client.config.ts`, `sentry.server.config.ts`, `next.config.js` | Either wire up `Sentry.init` + `withSentryConfig`, or remove `@sentry/nextjs` | Throw a test error → it appears in Sentry; **or** the dep is gone from `package.json` | ☐ |
| C2 | 🟡 | **No ESLint / CI / tests / Prettier config** | repo root, `package.json`, `.github/` | Add `.eslintrc`, a Prettier config, a `test` script, and a minimal CI workflow (typecheck + lint + build) | Push a branch → CI runs and fails on a deliberate type error | ☐ |
| C3 | 🟡 | **58 `any`/`as any`, 1 `@ts-ignore`, 366 `console.*`** | worst: `components/payment-modal.tsx`, `app/booking-detail/page.tsx`, `services/payment/payment-service.ts`, `components/streamer-card.tsx`, `app/actions.ts` | Type the worst offenders; strip debug `console.*` (keep intentional error logging) | `grep -rn ": any\|as any\|@ts-ignore" app services components \| wc -l` trends toward 0 | ☐ |
| C4 | 🟡 | **10 loose scratch/reference files (~62KB)** | root + `services/ref-booking-detail.tsx` | Extract value first (`solution-ref.txt` plan, unused `updatePaymentStatus`, `notifications-table.txt` SQL → migration), then delete all 10; add to `.gitignore` if needed | `ls` root → the ref/scratch files are gone; app still builds | ☐ |
| C5 | 🟡 | **Redundant deps**: 6 unused tsparticles pkgs, stray `"i"` pkg, 4 concurrent toast systems | `package.json` | Remove all 6 tsparticles + `"i"`; standardize on **one** toast lib and drop the other three | `npm ls tsparticles i` → not found; one toast import style repo-wide | ☐ |
| C6 | 🟡 | **Duplicated logic**: `calculateDuration` (6 copies), fee formula, notification-create | multiple | Consolidate into `lib/` shared helpers, import everywhere | `grep -rn "calculateDuration" app components lib` → all point at one definition | ☐ |
| C7 | 🟡 | **Dead `pages/_document.tsx` + 3 inconsistent metadata sources** | `pages/_document.tsx`, `app/layout.tsx`, `app/metadata.ts` | Delete `pages/_document.tsx`; consolidate favicon/OG/theme tags into one source | `/` still shows correct favicon/OG; only one metadata definition remains | ☐ |
| C8 | 🟡 | **Unnecessary `"use client"`** on static pages (hurts SEO/perf) | `app/tutorial/video-guide/page.tsx`, `app/sections/footer/page.tsx`, `app/terms/page.tsx`, `app/privacy-notice/page.tsx`, `app/admin/page.tsx`, `app/streamers/page.tsx` | Convert to server components; isolate any animation into small client wrappers | view-source on `/terms` shows server-rendered content; `streamers` listing is crawlable | ☐ |
| C9 | 🟡 | **Dead code files** (zero importers) | `lib/utils.ts` (`calculateDuration`/`calculateTotalPrice`), `lib/constants/indonesia-cities.ts`, `utils/cn.ts`, `utils/image-loader.ts`, `utils/analytics.tsx` | Remove unused exports/files (note: Vercel Analytics wrapper is never rendered — decide keep+mount or remove) | `npm run build` still passes after removal | ☐ |
| C10 | 🟡 | **Config baked into source** (`images.unoptimized:true`, hardcoded `liloapp.vercel.app`→`salda.id` redirect) | `next.config.js` | Move canonical host to env; reconsider disabling image optimization | Preview deploys redirect correctly via env, not a code edit | ☐ |
| C11 | 🟡 | **Two different components named `Navbar`** | `app/components/navbar/navbar.tsx`, `components/ui/navbar.tsx` | Rename one (e.g. `MarketingNavbar`) to remove ambiguity | `grep -rn "import.*[Nn]avbar"` → unambiguous names | ☐ |

---

## How to use this document

1. Work top-down: **Phase A before B before C.** A1–A4 (payments) and A5–A6 (authz) are the highest real-world risk.
2. As each item is fixed, change its `☐` to `◐` while in progress and `☑` once you've run the **Verify it yourself** step.
3. Several "dead" items (A7, A8, B5, C4, C9) are resolved by *deletion* — always run the `grep` verification first to confirm nothing imports them.
4. Keep Part 1 updated if the architecture changes; it's the shared source of truth for future work.
