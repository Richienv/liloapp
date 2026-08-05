# Sign-in & User Creation — Re-Audit, Brainstorm & Recommendations

> Multi-agent re-audit (4 parallel agents) of the oldest code in the repo: sign-in, client
> sign-up, streamer sign-up, and location/city handling. Findings are grounded in real
> `file:line` references. Nothing here is implemented yet — this is the plan.
>
> Companion to `AUDIT-AND-FIX-PLAN.md` (the repo-wide audit).

---

## TL;DR — the five things that matter most

1. **Your entire public SEO surface is dead.** `username` is never captured at signup, but every public page keys off it. Result: all `/[username]` profile pages 404, `sitemap.ts` submits `https://salda.id/undefined` to Google, and every streamer card links to `/undefined`.
2. **Anyone can become a bookable streamer with zero verification** — and brands ship physical products to their address. The admin verification page is mock data with no write path.
3. **Auth middleware fails open.** Any thrown error leaves *every* protected route ungated.
4. **Same-city shipping is silently broken for 100% of bookings** — the client's location is read from a `profiles` table that does not exist.
5. **City-based discovery is 0% functional** — free-text city + exact-match lookups + no sitemap entries + no internal links.

---

# PART 1 — AUDIT FINDINGS

## 1.1 P0 — Broken in production right now

| # | Issue | Evidence | Impact |
|---|-------|----------|--------|
| P0-1 | **`username` never captured or persisted** | Absent from the streamer form's `FormData` (`streamer-sign-up/page.tsx:31-55`) and both inserts (`actions.ts:571-608`). `checkUsernameAvailability` (`actions.ts:311-325`) has **zero callers** and queries the wrong table (`users`, not `streamers`). | `app/[username]/page.tsx:56` always returns null → every public profile 404s. `sitemap.ts:39` emits `/undefined`. `location/[city]/page.tsx:95` links to `/undefined`. **The SEO pages we built are unreachable.** |
| P0-2 | **No identity verification of any kind** | No KYC, no ID upload, no platform-ownership proof, no admin approval. `actions.ts:647-650` returns the streamer straight to the dashboard, instantly bookable. `admin/verificationstreamer/page.tsx:56` is `mockStreamers` with no `createClient` and no approve/reject path. | Brands ship physical goods to an unverified stranger's `full_address`. `streamer-onboarding/page.tsx:65` promises *"Pembayaran terlindungi dari penipuan dan fraud"* — nothing in the code backs that claim. |
| P0-3 | **Middleware fails open** | `utils/supabase/middleware.ts:69-76` — the catch returns `NextResponse.next()`. Also `"@supabase/ssr": "latest"` (`package.json:30`, resolved 0.5.1); ≥0.6 removes the legacy `get/set/remove` adapter middleware still uses (`:16-26`) → throw → swallowed. | Any error ⇒ **all protected routes ungated**. A routine `npm install` could trigger it. |
| P0-4 | **`profiles` table does not exist** | `components/streamer-card.tsx:934` `.from('profiles').select('location')` — the only occurrence of `profiles` in the entire repo. | `clientLocation` is always `''` ⇒ `isSameCity` (`:579`, `:1441`, `:2054`) is **always false** ⇒ every booking gets the out-of-town shipping penalty (3-day min instead of 1; +2 days instead of +0). |
| P0-5 | **Signup rollback silently no-ops** | `actions.ts:659-661` — if `SUPABASE_SERVICE_ROLE_KEY` is unset, `createAdminClient()` returns null and cleanup is skipped. | Orphaned auth user + burned email: the user can never re-register ("User already registered") and can't use the account. |
| P0-6 | **`is_active` never set at signup** | Not present in the `streamers` insert (`actions.ts:591-608`). | Unless the column defaults `true`, new streamers are invisible to `/location/[city]` (`.eq('is_active', true)`) and `sitemap.ts`. |
| P0-7 | **Login-breaking bugs** | `actions.ts:199` — `data.user.id` with no null guard (the client path has one at `:157`). `sign-in/page.tsx:19-29` — no `try/finally`, so a rejected action leaves the button **permanently stuck** on "Signing in…". `navbar.tsx:108` — `throw streamerError` skips `setUserData` ⇒ a logged-in streamer sees the **signed-out navbar** (no logout, no menu). | Real users get hard-stuck logins. |

## 1.2 P1 — Broken UX & conversion killers

**Sign-in**
- **The split client/streamer login is actively hostile.** Submit the wrong form and you are *signed out* (`actions.ts:173-176`), bounced to `/sign-in?error=…`, which resets to the **client form again** (`sign-in/page.tsx:16`) with both fields cleared — holding a message telling you to use a page you can't see, rendered *below* the buttons. The system already knows `user_type` the moment the password verifies.
- **No "Forgot password?" link anywhere on the sign-in page.** Reachable only from `/reset-password` and `/auth/error`.
- **Error text is invisible.** `components/form-message.tsx:15` uses `text-destructive-black` / `border-destructive-black` — classes in neither `tailwind.config.ts` nor `globals.css`. Errors render as plain black, identical to success, no icon, no `role="alert"`.
- **`redirect_to` is ignored.** Middleware sets it (`middleware.ts:59`) but neither sign-in action reads it; both hardcode `/protected` or `/streamer-dashboard`. Deep links are lost. `encodedRedirect` (`utils/utils.ts:15`) also wipes it on every error.
- **Auth is English in an Indonesian product**, and leaks raw Supabase strings (`Sign-in failed: Invalid login credentials`).
- **Navbar flicker is structural.** The server-rendered `components/header-auth.tsx` is **dead code (never imported)**; everything uses client-side `navbar.tsx` with `ProfileButton` at `ssr:false` — 2-3 sequential round trips of skeletons and guaranteed layout shift on every load.

**Both signup forms**
- **Double-submit is possible** (`sign-up/page.tsx:676`, `streamer-sign-up/page.tsx:1466-1485` — `isSigningUp` changes the label but never `disabled`).
- **Enter key destroys the form.** Neither `<form>` has `onSubmit`/`preventDefault`; on any step with a single text input, Enter triggers native GET submission → full reload → **all state lost**, including selected `File` objects.
- **No draft saving.** `currentStep` is React state, not URL — Back exits the page. The streamer form is a realistic **30-60 minute** task (shoot a video, gather 5 photos) that must be completed in one sitting.
- **Both onboarding flows are orphaned dead code** — `client-onboarding` (409 lines) and `streamer-onboarding` (352 lines) have **zero inbound links**. Signup redirects straight past them, so the streamer safety screen ("Semua transaksi WAJIB melalui Salda") is never shown to anyone.

**Data collection gaps**
- **No phone / WhatsApp is ever captured** — despite `privacy-notice/page.tsx:45` telling users you collect *"nama, email, nomor telepon"*, and WhatsApp being the primary support channel (`wa.me/62895700120901` in navbar, footer, FAQ, messages).
- **No payout account collected** — there is no way to actually pay a streamer.
- `types/user.ts` declares `username: string` as required — a type that lies.
- Price has **no min/max**; `"0"` passes validation (`actions.ts:599`) → Rp 0/hour streamers. The Step 6 preview shows base×1.3 in the card but the raw base right below it (`streamer-sign-up/page.tsx:1286`) — two different prices on one screen.
- `streamers.profile_picture_url` (read by public pages) vs `image_url` (written at signup, `actions.ts:600`) — blank avatars even once usernames work.

## 1.3 Location / city — 0% functional today

**Capture:** every entry point is unvalidated free text. Client signup (`sign-up/page.tsx:235-241`), streamer signup (`streamer-sign-up/page.tsx:442-452`), settings (`settings/page.tsx:925-941`, `:1052-1058`), and even the filter (`filter-modal.tsx:165-172`). The *only* normalization in the app is naive title-casing (`streamer-sign-up/page.tsx:391-395`) — no trim, no validation. Settings can overwrite a normalized `"Jakarta"` with `"jakarta "`.

**Canonical list:** none. `lib/constants/indonesia-cities.ts` (30 cities with province mapping) existed but had zero importers and was deleted in commit `0018a52`.

**Consumption:** `app/location/[city]/page.tsx:30` does `.eq('location', city)` — case- and byte-exact against the raw URL segment. So `/location/Jakarta` works only if someone typed exactly that; `/location/jakarta` 404s; `/location/jakarta-selatan` never matches `"Jakarta Selatan"`. The browse filter (`protected/page.tsx:209-210`) is a client-side `.toLowerCase().includes()` over already-fetched rows — unindexed, unpaginated, and it throws on any null location.

**Discovery:** `sitemap.ts` emits **zero** `/location/*` URLs, there are **no internal links** to them anywhere, and the breadcrumb points at `https://salda.id/locations` — **a route that doesn't exist**.

**Net effect:** three Jakarta streamers typing `jakarta`, `Jakarta Selatan`, `DKI Jakarta` produce three disjoint one-streamer buckets, two of which 404 on the obvious slug. City discovery has 0 entry points, 0 sitemap URLs, 0 internal links, and exact-match retrieval over an uncontrolled vocabulary.

---

# PART 2 — BRAINSTORM & RECOMMENDATIONS

## 2.1 Reframe: what is location actually *for*?

The instinct is "find a streamer near me" — but the stream is **remote**, so proximity doesn't matter for the service itself. Location matters for exactly two things:

1. **Logistics.** Brands ship physical product to the streamer (`full_address`, `bookings.items_received`). Distance drives the shipping lead time that already exists in `streamer-card.tsx:579-580`.
2. **SEO.** `/location/[city]` pages are how you capture *"jasa live streaming Jakarta"* search intent.

Everything else (timezone) follows from province (WIB/WITA/WIT). So model location as **logistics + SEO**, not proximity. That reframing should drive the schema.

## 2.2 Recommended location model

```sql
create table provinces (
  id smallint primary key,
  name text not null,
  timezone text not null                    -- 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura'
);

create table cities (
  id int primary key,
  slug citext unique not null,              -- 'jakarta-selatan'  → clean SEO URLs
  name text not null,                       -- 'Jakarta Selatan'
  province_id smallint references provinces,
  aliases text[],                           -- {'dki jakarta','jaksel','jkt'} → forgiving search
  is_active boolean default true
);

alter table streamers add column city_id int references cities(id);
alter table users     add column city_id int references cities(id);
create index on streamers (city_id) where is_active;
```

Keep `full_address` as free text (it's a real postal address, not a facet). Derive timezone from `province.timezone` instead of storing per-booking timezone strings.

**Migration path:** restore the 30-city list (`git show 0018a52^:lib/constants/indonesia-cities.ts`) → seed and expand to ~100 kota/kabupaten → backfill `city_id` by matching `lower(trim(location))` against `slug` + `aliases`, surfacing unmatched rows in an admin queue → swap all forms to a searchable combobox writing `city_id` → change `/location/[city]` to look up by slug + add `generateStaticParams()` + 301 the legacy capitalized URLs → emit slugs from `sitemap.ts`, build the missing `/locations` index, and link city chips from streamer cards.

**To actually rank:** each city page needs ≥5 streamers (roll sparse cities up to province), unique Indonesian copy, and real `ItemList` + `LocalBusiness` structured data — note `components/structured-data/local-business-data.tsx:17-21` is currently hardcoded `"Your Street Address"` / `"Jakarta"`.

## 2.3 Identity: fix the two missing keys

**Username** — add to Step 1 of streamer signup, wired to a debounced `checkUsernameAvailability` (repointed at `streamers`), pattern `^[a-z0-9_-]{3,30}$`, reserved-word blocklist, UNIQUE index, and a backfill for existing rows (`first_name-last_name-id`). This single change resurrects every public profile page, the sitemap, and all card links.

**Phone / WhatsApp** — for an Indonesian marketplace this is the *primary* identity and contact channel, and you already run support through WhatsApp. Collect it at signup, and strongly consider **WhatsApp/SMS OTP** as the verification step (and eventually as a login method). It also closes the gap where your privacy policy claims you collect it.

## 2.4 Cut signup friction hard (progressive onboarding)

Today: **8 required fields across 4 screens** before a client account exists, and **~19 fields plus a 4:5 photo, a YouTube video and 5 portfolio images** for a streamer — in one sitting, with no draft saving, where one Enter keypress wipes everything.

Recommended shape:

- **Account creation = email + password + name (+ phone).** Nothing else. That's the moment to create the user.
- **Everything else moves into the (already-built, currently orphaned) onboarding flows**, with visible progress and a **"Skip for now"**. Brand name/description/guidelines are needed *before a brand books*, not before an account exists. A streamer's portfolio/video is needed *before they go live*, not before they can log in.
- **Persist drafts** to `localStorage` per step, keep `currentStep` in the URL so Back works, and `e.preventDefault()` on both forms.
- Gate *publishing* (not registration) on profile completeness — a "Your profile is 60% complete" nudge converts far better than a wall.

## 2.5 Modernize sign-in

- **One login form.** Look up `user_type` after authentication and route accordingly — deleting the entire wrong-form/sign-out/retype failure mode.
- **Honor `redirect_to`** in both actions and preserve it through `encodedRedirect`.
- **Add Google OAuth** (`[auth.external.*]` are all disabled today) and consider WhatsApp OTP — both dramatically outperform email+password in ID.
- **Add the missing "Forgot password?" link**, fix `text-destructive-black`, translate to Indonesian, stop leaking raw Supabase errors, add `role="alert"`.
- **Kill the navbar flicker** by adopting the already-written server-rendered `header-auth.tsx` pattern.
- Add rate limiting / captcha on auth endpoints (none exists today).

## 2.6 Trust & safety (the biggest business risk)

Brands ship real product to strangers. Minimum viable trust:

- `verification_status` on `streamers` defaulting to `'pending'`; only `'verified'` streamers are listed/bookable.
- Collect an ID document + selfie, and prove platform ownership (post a code in the TikTok/Shopee bio, or OAuth the account).
- Wire `admin/verificationstreamer` to real rows with an approve/reject write path (it's mock data today).
- Collect a **payout account** — you currently have no way to pay anyone.
- Show a verification badge on cards; it's also a conversion asset, not just a control.

## 2.7 Quick wins (cheap, high impact)

| Fix | Effort |
|-----|--------|
| `profiles` → `users` in `streamer-card.tsx:934` (restores same-city shipping) | 1 line |
| `disabled={isSigningUp}` on both signup buttons | 2 lines |
| `e.preventDefault()` on both `<form>`s (stops Enter wiping state) | 2 lines |
| Null-guard `data.user` in `signInAsStreamerAction` | 3 lines |
| `try/finally` in the sign-in handler (unsticks the spinner) | 3 lines |
| Fix `text-destructive-black` → `text-destructive` | 1 line |
| Add "Forgot password?" link to sign-in | 1 line |
| Set `is_active: true` in the streamer insert | 1 line |
| Pin `@supabase/ssr`; make the middleware catch fail **closed** | 2 lines |
| Point signup `redirectTo` at the orphaned onboarding flows | 2 lines |

---

## Suggested sequencing

1. **Week 1 — stop the bleeding:** all of §2.7 quick wins + P0-1 (username) + P0-5 (fail fast if the service-role key is missing).
2. **Week 2 — trust:** verification status + admin approval wiring + payout account.
3. **Week 3 — location:** cities/provinces tables, backfill, combobox, slug-based city pages + sitemap.
4. **Week 4 — conversion:** progressive onboarding, single login form, Google/WhatsApp auth.
