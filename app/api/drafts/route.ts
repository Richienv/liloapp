/**
 * The caller's own signup draft: read it, write it, throw it away.
 *
 * `public.signup_drafts` holds one row per user (`user_id` is the primary key)
 * and RLS restricts every statement to `auth.uid()`. This route deliberately
 * uses the session-bound Supabase client rather than the service-role client,
 * so RLS is a second lock underneath the check we do here: if the auth check
 * below were ever wrong, the database still refuses to hand over somebody
 * else's draft.
 *
 * Everything written passes through `sanitizeDraft()` again on this side. The
 * hook already strips excluded fields before sending, but "the client stripped
 * it" is not a security property — anyone can `curl` this endpoint.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  DRAFT_MAX_BYTES,
  draftByteLength,
  isDraftKind,
  sanitizeDraft,
  type DraftKind,
} from "@/lib/drafts";
import { createClient } from "@/utils/supabase/server";

/** Reads cookies and per-user rows; must never be cached or statically rendered. */
export const dynamic = "force-dynamic";

const TABLE = "signup_drafts";

/** Private per-user data: no shared cache may ever hold a copy. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: NO_STORE });
}

/**
 * Resolve the signed-in user, or the response to send instead.
 *
 * `getUser()` and not `getSession()`: the latter only decodes whatever JWT is
 * in the cookie, so a tampered cookie would read as signed in.
 */
async function requireUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return {
      ok: false as const,
      response: fail(
        401,
        "unauthenticated",
        "Kamu harus masuk dulu untuk menyimpan draf.",
      ),
    };
  }

  return { ok: true as const, supabase, user: data.user };
}

/* -------------------------------------------------------------------------- */
/* GET /api/drafts?kind=streamer_signup                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const requestedKind = request.nextUrl.searchParams.get("kind");
  if (requestedKind !== null && !isDraftKind(requestedKind)) {
    return fail(400, "invalid_kind", "Jenis draf tidak dikenal.");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("kind, data, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[drafts] read failed", error);
    return fail(500, "read_failed", "Gagal membaca draf. Coba lagi sebentar.");
  }

  // No row, or a draft belonging to a different flow. A user has exactly one
  // draft row, so the brand signup's leftovers must not be offered back inside
  // the streamer wizard.
  if (!data || !isDraftKind(data.kind)) {
    return NextResponse.json({ draft: null }, { headers: NO_STORE });
  }
  if (requestedKind !== null && data.kind !== requestedKind) {
    return NextResponse.json({ draft: null }, { headers: NO_STORE });
  }

  // Sanitize on the way out too. A row written by an older client — or before a
  // field was removed from the allowlist — must not come back to life just
  // because it is already in the table.
  const kind = data.kind as DraftKind;
  return NextResponse.json(
    {
      draft: {
        kind,
        data: sanitizeDraft(kind, data.data),
        updatedAt: data.updated_at,
      },
    },
    { headers: NO_STORE },
  );
}

/* -------------------------------------------------------------------------- */
/* PUT /api/drafts   { kind, data }                                            */
/* -------------------------------------------------------------------------- */

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  // Cheap rejection first, before the body is buffered at all.
  const declaredLength = Number(request.headers.get("content-length"));
  if (isFinite(declaredLength) && declaredLength > DRAFT_MAX_BYTES) {
    return fail(413, "too_large", "Draf terlalu besar untuk disimpan.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail(400, "unreadable_body", "Draf tidak bisa dibaca.");
  }

  // Chunked requests arrive without a content-length, so measure the real body
  // as well: this table is not free storage.
  if (draftByteLength(raw) > DRAFT_MAX_BYTES) {
    return fail(413, "too_large", "Draf terlalu besar untuk disimpan.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_json", "Format draf tidak valid.");
  }

  const payload = (body ?? {}) as { kind?: unknown; data?: unknown };
  if (!isDraftKind(payload.kind)) {
    return fail(400, "invalid_kind", "Jenis draf tidak dikenal.");
  }

  const kind = payload.kind;
  // The allowlist runs here regardless of what the client claims to have done.
  const data = sanitizeDraft(kind, payload.data);
  const updatedAt = new Date().toISOString();

  const { data: saved, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: user.id,
        kind,
        data,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    )
    // An update goes through the set_updated_at trigger, so the row's stamp is
    // the authoritative one; read it back rather than reporting our own guess.
    .select("updated_at")
    .maybeSingle();

  if (error) {
    console.error("[drafts] write failed", error);
    return fail(500, "write_failed", "Gagal menyimpan draf. Coba lagi sebentar.");
  }

  // Echo what was actually stored: the caller can see which fields were
  // dropped instead of assuming the whole form is safely on the server.
  return NextResponse.json(
    { ok: true, kind, data, updatedAt: saved?.updated_at ?? updatedAt },
    { headers: NO_STORE },
  );
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/drafts                                                          */
/* -------------------------------------------------------------------------- */

export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { error } = await supabase.from(TABLE).delete().eq("user_id", user.id);

  if (error) {
    console.error("[drafts] delete failed", error);
    return fail(500, "delete_failed", "Gagal menghapus draf. Coba lagi sebentar.");
  }

  // Deleting is what runs after a successful submit, so it has to be
  // idempotent: deleting a draft that is already gone is a success.
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
