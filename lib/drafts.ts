/**
 * Signup / setup drafts: what a half-finished form is allowed to remember.
 *
 * Drafts exist because the streamer flow is 30-60 minutes of work (a bio, a
 * video link, a photo shoot) that used to be lost to a refresh or a dead
 * battery. They used to live in `localStorage`, which failed us twice:
 *
 *   1. On a shared laptop or a warnet, the next person could read the previous
 *      person's draft — including their home address and phone number —
 *      indefinitely. There is no expiry and no account boundary in
 *      `localStorage`.
 *   2. A draft was invisible to us, so someone abandoning halfway looked
 *      identical to someone who never started, and it never followed them to
 *      another device.
 *
 * So drafts now live in `public.signup_drafts`, one row per user, protected by
 * RLS. That fixes "who can read it", but it does NOT answer "what should be in
 * it at all" — a server-side row of plaintext KTP numbers would be worse than
 * the localStorage bug, not better. This module answers that second question
 * and is the only place that decides it.
 *
 * THE RULE: {@link sanitizeDraft} iterates the ALLOWLIST, never the input. A
 * field that nobody deliberately added here is not persisted — not by the
 * client, not by the API route, not ever. The original bug happened precisely
 * because `full_address` was added to a state object that was being written to
 * storage wholesale, and nobody had to make a decision about it. Deny-by-default
 * forces that decision to be made, here, in writing.
 */

import { USERNAME_MAX } from "@/lib/username";

/* -------------------------------------------------------------------------- */
/* Kinds                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which flow a draft belongs to. Stored in `signup_drafts.kind`.
 *
 * A user has at most one draft row (`user_id` is the primary key), so the kind
 * is how we avoid handing a half-finished brand signup back to the streamer
 * setup wizard.
 */
export const DRAFT_KINDS = [
  /** The streamer account form under /streamer-sign-up. */
  "streamer_signup",
  /** The post-signup profile wizard under /streamer-setup. */
  "streamer_setup",
  /** The brand/client account form under /sign-up. */
  "client_signup",
] as const;

export type DraftKind = (typeof DRAFT_KINDS)[number];

export function isDraftKind(value: unknown): value is DraftKind {
  return (
    typeof value === "string" &&
    (DRAFT_KINDS as readonly string[]).indexOf(value) !== -1
  );
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Everything a draft may hold is a plain, small, JSON-safe value. No nesting:
 * nested objects are how an unreviewed sub-object (a `security: {...}` blob, a
 * `documents: {...}` blob) sneaks past a field-level allowlist.
 */
export type DraftValue = string | number | boolean | string[];

export type DraftData = { [field: string]: DraftValue };

/** What callers hand to {@link sanitizeDraft} — anything at all; we filter it. */
export type DraftInput = Record<string, unknown>;

export interface DraftRecord {
  kind: DraftKind;
  data: DraftData;
  /** ISO timestamp of the last successful save. */
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Field policy                                                                */
/* -------------------------------------------------------------------------- */

type FieldSpec =
  | { type: "text"; max: number; meta?: true }
  | { type: "int"; min: number; max: number; meta?: true }
  | { type: "flag"; meta?: true }
  | { type: "tags"; maxItems: number; maxLength: number; meta?: true };

type FieldPolicy = { [field: string]: FieldSpec };

const text = (max: number): FieldSpec => ({ type: "text", max });
const tags = (maxItems: number, maxLength = 40): FieldSpec => ({
  type: "tags",
  maxItems,
  maxLength,
});

/**
 * Bookkeeping the form needs back but which is not "content" — a draft holding
 * only these is an empty draft (see {@link hasDraftContent}).
 */
const stepField: FieldSpec = { type: "int", min: 1, max: 20, meta: true };

/**
 * Name and contact. `email` and `phone` are in because they *are* the account:
 * without them a restored draft cannot be submitted, and both are already
 * shown to the admin and to any brand that books the streamer, so a draft adds
 * no new exposure now that the row is per-user and RLS-protected.
 */
const CONTACT_FIELDS: FieldPolicy = {
  first_name: text(80),
  last_name: text(80),
  email: text(254),
  /** National digits, e.g. "81234567890" — see components/ui/phone-input. */
  phone: text(20),
};

/**
 * Public profile fields. Every one of these ends up on a page anyone can read,
 * so a draft copy exposes nothing that publishing will not.
 *
 * Both spellings of the city field are allowed on purpose: the streamer form
 * calls it `city`, the client form and the database call it `location` /
 * `city_slug`. Same for `platform`/`platforms` and `category`/`categories`,
 * where the form state is an array and the column is a comma-joined string.
 */
const STREAMER_PROFILE_FIELDS: FieldPolicy = {
  username: text(USERNAME_MAX),
  city: text(64),
  city_slug: text(64),
  location: text(64),
  bio: text(2000),
  video_url: text(500),
  /** Kept as text because the field is typed, not numeric, until submit. */
  price: text(20),
  gender: text(20),
  age: text(4),
  experience: text(500),
  platform: text(120),
  platforms: tags(8),
  category: text(200),
  categories: tags(12),
};

/**
 * Brand fields. `brand_description` is marketing copy the brand will publish
 * anyway; the uploaded brand document is not here — see the exclusions below.
 */
const CLIENT_BRAND_FIELDS: FieldPolicy = {
  brand_name: text(120),
  brand_description: text(2000),
};

/**
 * THE ALLOWLIST. Adding a field here is a deliberate act: it means "this may
 * sit in our database, in plaintext, for as long as the person takes to finish
 * signing up". If you are unsure, leave it out — the cost is one retyped field.
 */
export const DRAFT_FIELD_POLICY: { [K in DraftKind]: FieldPolicy } = {
  streamer_signup: {
    ...CONTACT_FIELDS,
    ...STREAMER_PROFILE_FIELDS,
    step: stepField,
  },
  streamer_setup: {
    ...CONTACT_FIELDS,
    ...STREAMER_PROFILE_FIELDS,
    step: stepField,
  },
  client_signup: {
    ...CONTACT_FIELDS,
    ...CLIENT_BRAND_FIELDS,
    location: text(64),
    step: stepField,
  },
};

/**
 * WHAT IS DELIBERATELY EXCLUDED, AND WHY.
 *
 * `password`, `confirm_password`
 *   A draft is a copy that outlives the session. Credentials never get a copy.
 *   The password is also the one field nobody minds retyping.
 *
 * `full_address` / `alamat`
 *   The field's own help text promises "Hanya dilihat admin dan brand yang
 *   membooking kamu". A draft row is neither of those readers, and a promise we
 *   printed next to the input is a promise about every place the value lands —
 *   not just the column we meant at the time. The address is asked once, at the
 *   end, and is cheap to retype; the promise is not cheap to break. This is the
 *   exclusion that the original localStorage bug violated.
 *
 * `image`, `gallery`, `brand_doc`, any File / data: URL / base64 blob
 *   Three reasons: File objects do not survive JSON at all, a base64 workaround
 *   would turn a draft table into an unmetered file host, and the photos people
 *   attach to a signup are exactly the ones we least want a second copy of.
 *   Photos are re-picked after a restore; the form must never send the user
 *   past the upload step on a restored draft.
 *
 * `ktp_number`, `nik`, `ktp_url`, `selfie_url`, `npwp`, any identity document
 *   These belong to the verification flow, which has its own private bucket and
 *   its own access rules. A convenience cache must not become a second, weaker
 *   copy of the KYC pipeline.
 *
 * `bank_name`, `account_number`, `rekening`, payout details
 *   Financial credentials. Same argument as identity documents, plus the fraud
 *   value of a table full of them.
 *
 * `otp`, tokens, session identifiers
 *   Short-lived secrets stop being short-lived the moment they are persisted.
 *
 * {@link FORBIDDEN_FIELD_PATTERN} enforces this list mechanically, so a future
 * edit to the allowlist above cannot quietly re-admit any of it.
 */
const FORBIDDEN_FIELD_PATTERN =
  /(password|passwd|sandi|secret|token|otp|pin\b|ktp|nik\b|npwp|identity|identitas|selfie|id_card|bank|rekening|account_number|iban|cvv|card_number|address|alamat|file|upload|image|photo|foto|gallery|galeri|base64|data_url|doc\b|document|dokumen)/i;

/**
 * True when a field name may never be persisted, whatever the allowlist says.
 * Exported so a form can assert the same rule on its own state shape.
 */
export function isForbiddenDraftField(field: string): boolean {
  return FORBIDDEN_FIELD_PATTERN.test(field);
}

/* -------------------------------------------------------------------------- */
/* Sanitizing                                                                  */
/* -------------------------------------------------------------------------- */

function coerce(spec: FieldSpec, raw: unknown): DraftValue | undefined {
  if (raw === null || raw === undefined) return undefined;

  if (spec.type === "text") {
    // Numbers arrive from number inputs; everything else that is not a string
    // (objects, Files, functions) is dropped rather than stringified into
    // "[object Object]".
    const value =
      typeof raw === "string"
        ? raw
        : typeof raw === "number" && isFinite(raw)
          ? String(raw)
          : null;
    if (value === null) return undefined;
    return value.slice(0, spec.max);
  }

  if (spec.type === "int") {
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!isFinite(value)) return undefined;
    return Math.min(Math.max(Math.round(value), spec.min), spec.max);
  }

  if (spec.type === "flag") {
    return raw === true || raw === "true";
  }

  // tags
  if (!Array.isArray(raw)) return undefined;
  const items: string[] = [];
  for (let i = 0; i < raw.length && items.length < spec.maxItems; i++) {
    const item = raw[i];
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed) items.push(trimmed.slice(0, spec.maxLength));
  }
  return items;
}

/**
 * Reduce arbitrary form state to the fields this kind of draft may keep.
 *
 * Runs on the client before anything is sent (so an excluded value never leaves
 * the browser) AND again in the API route (so a hand-written request cannot
 * bypass the client). Never throws — a draft failing is not worth breaking a
 * form over — and returns `{}` for anything it cannot understand.
 */
export function sanitizeDraft(kind: DraftKind, data: unknown): DraftData {
  const policy = DRAFT_FIELD_POLICY[kind];
  const out: DraftData = {};

  if (!policy) return out;
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;

  const input = data as DraftInput;

  // Iterating the POLICY, not the input, is the whole point: an unknown key in
  // `input` has no way to reach `out`.
  Object.keys(policy).forEach((field) => {
    if (isForbiddenDraftField(field)) return; // belt and braces, see above
    if (!Object.prototype.hasOwnProperty.call(input, field)) return;

    const value = coerce(policy[field], input[field]);
    if (value === undefined) return;
    // Empty strings/arrays carry no information and only cost bytes.
    if (typeof value === "string" && value.length === 0) return;
    if (Array.isArray(value) && value.length === 0) return;

    out[field] = value;
  });

  return out;
}

/**
 * True when a draft holds something worth saving. A draft that is only "step 2"
 * is a draft of nothing: writing it would create a row for someone who opened
 * the page and typed nothing, and would make the abandonment signal useless.
 */
export function hasDraftContent(kind: DraftKind, data: DraftData): boolean {
  const policy = DRAFT_FIELD_POLICY[kind] ?? {};
  return Object.keys(data).some((field) => {
    const spec = policy[field];
    return !spec || !spec.meta;
  });
}

/* -------------------------------------------------------------------------- */
/* Size                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Hard cap on a stored draft. Every field above is length-capped, so a legitimate
 * draft lands around 3-4 KB; 16 KB leaves room to add fields without anyone
 * being able to use this table as free storage.
 */
export const DRAFT_MAX_BYTES = 16 * 1024;

export function draftByteLength(value: unknown): number {
  const json = JSON.stringify(value ?? {});
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).length;
  }
  // Only reachable in exotic runtimes; close enough for a guard rail.
  return json.length;
}

/* -------------------------------------------------------------------------- */
/* Timing + copy                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Debounce for autosave. Long enough not to write on every keystroke, short
 * enough that "Tersimpan" appears while the user is still looking at the field.
 */
export const DRAFT_SAVE_DELAY_MS = 800;

/**
 * "hari ini 14:05" / "3 Agu 14:05" — the reassurance line next to the autosave
 * indicator. Indonesian, like everything else the user reads.
 */
export function formatDraftTimestamp(iso: string | null | undefined): string {
  if (!iso) return "beberapa saat lalu";

  const saved = new Date(iso);
  if (isNaN(saved.getTime())) return "beberapa saat lalu";

  const time = saved.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (saved.toDateString() === new Date().toDateString()) {
    return `hari ini ${time}`;
  }

  const date = saved.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
  return `${date} ${time}`;
}
