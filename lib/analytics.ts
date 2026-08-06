import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Funnel logging for signup and onboarding.
 *
 * We currently cannot answer the single most important product question — where
 * do people fall out of signup? — because nothing records that a step happened.
 * This module writes one row per milestone into `public.onboarding_events`, and
 * `app/admin/funnel/page.tsx` reads them back as a drop-off table.
 *
 * Two rules govern everything below.
 *
 * 1. ANALYTICS MUST NEVER BREAK A SIGNUP. A telemetry table is not worth a
 *    failed registration, so `trackEvent` never throws and never rejects: the
 *    insert's promise has its `.catch` attached synchronously before it is
 *    handed back, so ignoring the return value is safe (no unhandled rejection)
 *    and awaiting it is also safe (it always resolves). Errors are logged, not
 *    propagated.
 *
 * 2. NO PERSONAL DATA IN `props`. IDs and enums only — never an email, phone
 *    number, address, real name, document URL or storage path, or any free
 *    text a user typed. `props` ends up in a table that ops staff read in
 *    aggregate; it is not a place to store things we would have to honour a
 *    deletion request for. `sanitiseProps` below enforces this at runtime as a
 *    backstop, but the rule is the contract: if a prop of yours gets dropped,
 *    the fix is to send an id or an enum instead, not to rename around it.
 */

const TABLE = "onboarding_events";

/**
 * The signup funnel, in order. Add a constant here rather than passing a raw
 * string, so the funnel view and the callers cannot drift apart.
 */
export const ONBOARDING_EVENTS = {
  /** auth.users row created (either role, before a role is chosen). */
  ACCOUNT_CREATED: "account_created",
  /** User picked client or streamer; `users.user_type` stops being NULL. */
  ROLE_SELECTED: "role_selected",
  /** First step of the role's profile wizard was opened. */
  PROFILE_SETUP_STARTED: "profile_setup_started",
  /** Profile completed and made visible; `streamers.profile_published_at` set. */
  PROFILE_PUBLISHED: "profile_published",
  /** KYC documents uploaded; a row landed in the verification queue. */
  VERIFICATION_SUBMITTED: "verification_submitted",
  /** An admin approved the submission — the streamer is now bookable. */
  VERIFICATION_APPROVED: "verification_approved",
  /** An admin rejected the submission (a branch out of the funnel, not a stage). */
  VERIFICATION_REJECTED: "verification_rejected",
  /** Payout/bank account saved, so the streamer can actually be paid. */
  PAYOUT_ACCOUNT_ADDED: "payout_account_added",
} as const;

export type OnboardingEvent =
  (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];

/** Only primitives. `undefined` entries are dropped rather than stored as null. */
export type EventProps = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Keys that name personal data. Matching props are dropped before the write.
 * Deliberately blunt and over-eager: a dropped prop costs a metric, a leaked
 * one costs a person's phone number sitting in an analytics table forever.
 */
const PII_KEY_PATTERN =
  /email|mail|phone|telepon|whatsapp|address|alamat|name|nama|nik|ktp|passport|birth|lahir|url|uri|link|path|file|token|secret|password|sandi|rekening|iban|card|kartu|query|search|note|catatan|reason_text|message/i;

/** A uuid is an id, not personal data, even though it is a long opaque string. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Values that look like personal data whatever the key is called: an address
 * with an `@`, anything URL-shaped, or a long digit run (a phone number or a
 * bank account). Numeric ids arrive as `number`, not `string`, so they are not
 * caught by the digit rule.
 */
const PII_VALUE_PATTERN = /@|^https?:\/\/|^\/|\d{7,}/;

/** Enum labels and short ids only. Anything longer is prose we do not want. */
const MAX_VALUE_LENGTH = 100;

function drop(key: string, why: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[analytics] dropped prop "${key}" (${why}). onboarding_events takes ids and enums only.`,
    );
  }
}

function sanitiseProps(props: EventProps): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;

    if (PII_KEY_PATTERN.test(key)) {
      drop(key, "key names personal data");
      continue;
    }

    if (typeof value === "string") {
      if (value.length > MAX_VALUE_LENGTH) {
        drop(key, "value too long to be an id or an enum");
        continue;
      }
      if (!UUID_PATTERN.test(value) && PII_VALUE_PATTERN.test(value)) {
        drop(key, "value looks like an address, URL, path or phone number");
        continue;
      }
    }

    safe[key] = value;
  }

  return safe;
}

/**
 * Pick who writes the row and who it is about.
 *
 * The service role is preferred when it is configured, for two reasons: the
 * account-created event fires before a session cookie exists, and admin actions
 * log events *about the streamer*, which the admin's own session is not allowed
 * to insert under the `user_id = auth.uid()` insert policy. Without the service
 * key we fall back to the caller's session, which can still log that caller's
 * own events; anything else is silently refused by RLS, which is the correct
 * outcome for a telemetry write.
 */
async function resolveWriter(
  explicitUserId?: string,
): Promise<{ db: SupabaseClient; userId: string | null } | null> {
  const service: SupabaseClient | null = createAdminClient();

  if (explicitUserId) {
    // Nothing to look up. With the service key this needs no cookies() call at
    // all, so it also works from contexts that have no request scope. Without
    // it we still skip `getUser()`: that is a network round trip to the auth
    // server whose answer we would immediately discard in favour of the id the
    // caller passed, and it sits on the signup path. The session client can only
    // insert this caller's own events; anything else is refused by RLS, which is
    // the correct outcome for a telemetry write.
    return { db: service ?? createClient(), userId: explicitUserId };
  }

  const session: SupabaseClient = createClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  // `explicitUserId` is handled above, so the caller is the only candidate here.
  const userId = user?.id ?? null;

  // No service key and nobody signed in: the insert could only be refused.
  if (!service && !userId) return null;

  return { db: service ?? session, userId };
}

async function write(
  event: OnboardingEvent,
  props: EventProps,
  explicitUserId?: string,
): Promise<void> {
  const writer = await resolveWriter(explicitUserId);
  if (!writer) return;

  const { error } = await writer.db.from(TABLE).insert({
    user_id: writer.userId,
    event,
    props: sanitiseProps(props),
  });

  if (error) {
    // Logged, never rethrown. A missing table, a denied policy or a network
    // blip must not turn into a failed signup.
    console.warn(`[analytics] failed to record "${event}":`, error.message);
  }
}

/**
 * Record one onboarding milestone.
 *
 * ```ts
 * trackEvent(ONBOARDING_EVENTS.ROLE_SELECTED, { role: "streamer" });
 * await trackEvent(ONBOARDING_EVENTS.ACCOUNT_CREATED, {}, newUserId);
 * ```
 *
 * @param event One of `ONBOARDING_EVENTS`.
 * @param props IDs and enums only — see the module comment. Never personal data.
 * @param userId Who the event is *about*. Defaults to the signed-in caller.
 *   Pass it explicitly when there is no session yet (signup) or when a
 *   different user is acting on this person's behalf (an admin approving a
 *   streamer's verification) — otherwise the event would be attributed to the
 *   admin and the funnel would count the wrong person.
 *
 * @returns A promise that always resolves. Ignore it for fire-and-forget, or
 *   await it when the surrounding function is about to `redirect()` or return —
 *   on a serverless runtime the request may be torn down before an unawaited
 *   insert reaches the database.
 */
export function trackEvent(
  event: OnboardingEvent,
  props: EventProps = {},
  userId?: string,
): Promise<void> {
  // `.catch` is attached here, synchronously, so a caller that discards the
  // return value can never produce an unhandled rejection.
  return write(event, props, userId).catch((error) => {
    console.warn(`[analytics] failed to record "${event}":`, error);
  });
}
