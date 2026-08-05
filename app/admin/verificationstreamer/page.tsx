import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Search,
  User,
  XCircle,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerificationStatusBadge } from "@/components/ui/verification-badge";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAdmin } from "@/lib/admin";
import {
  approveStreamerVerification,
  rejectStreamerVerification,
} from "../actions";

// The queue must reflect the row an admin just acted on, never a cached copy.
export const dynamic = "force-dynamic";

const BUCKET = "verification_documents";
const BUCKET_PREFIX = `${BUCKET}/`;
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const QUEUE_PATH = "/admin/verificationstreamer";

/**
 * The page is `force-dynamic`, so everything below re-runs on every load and
 * after every approve/reject. That makes the page size a real cost, not a
 * cosmetic one: it bounds the storage round trips and the row payload per
 * request.
 */
const PAGE_SIZE = 20;

/**
 * A search term is resolved to streamer/user ids first (see `findMatchingIds`).
 * Those lookups are capped so a one-letter query cannot pull the whole user
 * table into an `in.(...)` filter; a search that broad is not a search.
 */
const ID_MATCH_CAP = 500;

type SubmissionStatus = "pending" | "approved" | "rejected";

const STATUS_TABS: { value: SubmissionStatus | "all"; label: string }[] = [
  { value: "pending", label: "Menunggu Review" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "all", label: "Semua" },
];

const VALID_STATUSES = STATUS_TABS.map((tab) => tab.value);

interface SubmissionRow {
  id: string;
  streamer_id: number;
  user_id: string | null;
  id_card_url: string | null;
  selfie_url: string | null;
  platform_proof_url: string | null;
  platform_handle: string | null;
  status: SubmissionStatus;
  notes: string | null;
  created_at: string | null;
  streamer: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    platform: string | null;
    location: string | null;
    city_slug: string | null;
    verification_status: string | null;
    is_active: boolean | null;
  } | null;
  /** Joined in application code, not by PostgREST — see the query below. */
  user?: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
}

interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
}

/**
 * Reads go through the service role when it is configured: the submissions
 * table and the private document bucket hold other people's KYC data, which no
 * end-user RLS policy grants an admin. Without the key we still try with the
 * caller's session so the page degrades to "empty queue" instead of crashing.
 */
function readClient(sessionClient: SupabaseClient): SupabaseClient {
  return createAdminClient() ?? sessionClient;
}

function fullName(streamer: SubmissionRow["streamer"]): string {
  const name = `${streamer?.first_name ?? ""} ${streamer?.last_name ?? ""}`.trim();
  return name || "Tanpa nama";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function queueHref(params: {
  status: SubmissionStatus | "all";
  q: string;
  page: number;
}): string {
  const search = new URLSearchParams();
  search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  if (params.page > 1) search.set("page", String(params.page));
  return `${QUEUE_PATH}?${search.toString()}`;
}

/**
 * Build the `ilike` pattern for a user-typed term, or null if there is nothing
 * left to search for.
 *
 * `%` and `_` are `ilike` wildcards and `,`/`(`/`)`/`"` are structural in
 * PostgREST's `or=(...)` grammar, so they are stripped rather than escaped:
 * none of them belong in a name, username, email or platform handle, and
 * stripping keeps the generated filter unambiguous. A term made only of those
 * characters would collapse to `%%` and quietly match every row, so it is
 * treated as no search at all.
 */
function likePattern(query: string): string | null {
  const cleaned = query.replace(/[,()%_\\"]/g, " ").trim();
  return cleaned ? `%${cleaned}%` : null;
}

/**
 * Resolve a search term to the streamer ids and user ids it matches.
 *
 * The search has to cover columns on three tables (streamer name/username,
 * user email, submission handle), and the submission's `user_id` points at
 * `auth.users`, so there is no single embeddable query that spans them. Two
 * bounded lookups run in parallel and their ids are folded into one `or(...)`
 * on the submissions query — so filtering still happens in the database. It
 * used to happen in JS over every row in the table, which is only correct if
 * you never paginate.
 */
async function findMatchingIds(
  db: SupabaseClient,
  pattern: string,
): Promise<{ streamerIds: number[]; userIds: string[] }> {
  const [streamers, users] = await Promise.all([
    db
      .from("streamers")
      .select("id")
      .or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},username.ilike.${pattern}`,
      )
      .limit(ID_MATCH_CAP),
    db.from("users").select("id").ilike("email", pattern).limit(ID_MATCH_CAP),
  ]);

  return {
    streamerIds: (streamers.data ?? []).map((row: { id: number }) => row.id),
    userIds: (users.data ?? []).map((row: { id: string }) => row.id),
  };
}

function storagePath(value: string | null): string | null {
  if (!value) return null;
  // Older rows may hold a full URL rather than an object path; those need no
  // signing and are passed through by `viewableUrl` instead.
  if (/^https?:\/\//i.test(value)) return null;
  return value.startsWith(BUCKET_PREFIX)
    ? value.slice(BUCKET_PREFIX.length)
    : value;
}

/**
 * Sign every document on the page in ONE storage call.
 *
 * Each row has three private documents, and each used to be signed with its own
 * `createSignedUrl` awaited sequentially inside the row's map callback — 3
 * serialised round trips per row, on a route that re-runs on every load. A page
 * of 20 rows is now a single `createSignedUrls` request.
 */
async function signDocuments(
  db: SupabaseClient,
  values: (string | null)[],
): Promise<Map<string, string>> {
  const paths = Array.from(
    new Set(
      values
        .map(storagePath)
        .filter((path): path is string => Boolean(path)),
    ),
  );

  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const { data } = await db.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  for (const entry of data ?? []) {
    // Per-object failures are reported inside the batch; a missing file must
    // not take the other documents down with it.
    if (entry.path && entry.signedUrl && !entry.error) {
      signed.set(entry.path, entry.signedUrl);
    }
  }

  return signed;
}

function viewableUrl(
  value: string | null,
  signed: Map<string, string>,
): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const path = storagePath(value);
  return (path && signed.get(path)) || null;
}

function DocumentLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <FileWarning className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

export default async function StreamerVerificationPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    q?: string;
    page?: string;
    error?: string;
    success?: string;
  };
}) {
  // The layout gates /admin, but this page reads other people's KYC documents
  // with a service-role client, so it re-checks on its own with the same helper
  // and fails the same way.
  const admin = await getAdmin();
  if (!admin) {
    redirect("/");
  }

  const db = readClient(admin.supabase);

  const requestedStatus = (searchParams.status || "pending") as
    | SubmissionStatus
    | "all";
  const status = VALID_STATUSES.includes(requestedStatus)
    ? requestedStatus
    : "pending";
  const query = (searchParams.q || "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let submissionsQuery = db
    .from("streamer_verification_submissions")
    .select(
      `
      id,
      streamer_id,
      user_id,
      id_card_url,
      selfie_url,
      platform_proof_url,
      platform_handle,
      status,
      notes,
      created_at,
      streamer:streamers (
        id,
        first_name,
        last_name,
        username,
        platform,
        location,
        city_slug,
        verification_status,
        is_active
      )
    `,
      // `exact` is what makes "menampilkan 1-20 dari N" and the Next button
      // honest without fetching the whole table to count it.
      { count: "exact" },
    );

  if (status !== "all") {
    submissionsQuery = submissionsQuery.eq("status", status);
  }

  const pattern = query ? likePattern(query) : null;
  if (pattern) {
    const { streamerIds, userIds } = await findMatchingIds(db, pattern);

    const orParts = [`platform_handle.ilike.${pattern}`];
    if (streamerIds.length) {
      orParts.push(`streamer_id.in.(${streamerIds.join(",")})`);
    }
    if (userIds.length) {
      orParts.push(`user_id.in.(${userIds.join(",")})`);
    }

    submissionsQuery = submissionsQuery.or(orParts.join(","));
  }

  // Ordering and paging come last: every filter has to be applied before the
  // range, or the page would be sliced out of the unfiltered table.
  //
  // Oldest first — this is a review queue, so whoever has been waiting longest
  // is at the top. `id` breaks ties so paging is stable when two submissions
  // share a timestamp.
  const { data, error, count } = await submissionsQuery
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  const submissionRows = (data ?? []) as unknown as SubmissionRow[];
  const total = count ?? submissionRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // `user_id` is a foreign key into auth.users, so PostgREST cannot embed the
  // public.users profile row through it. The two tables share the same uuid, so
  // the contact details are fetched with one extra `in (...)` query for the
  // whole page — one round trip regardless of how many rows are on it, never
  // one per row.
  const userIds = Array.from(
    new Set(
      submissionRows
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: profiles } = userIds.length
    ? await db.from("users").select("id, email, phone").in("id", userIds)
    : { data: [] as UserProfile[] };
  const profilesById = new Map(
    ((profiles ?? []) as UserProfile[]).map((profile) => [profile.id, profile]),
  );

  const submissions = submissionRows.map((row) => ({
    ...row,
    user: (row.user_id ? profilesById.get(row.user_id) : null) ?? null,
  }));

  // One storage call for all three documents of all rows on this page.
  const signedDocuments = await signDocuments(
    db,
    submissions.flatMap((submission) => [
      submission.id_card_url,
      submission.selfie_url,
      submission.platform_proof_url,
    ]),
  );

  const rangeStart = total === 0 ? 0 : from + 1;
  const rangeEnd = from + submissions.length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Verifikasi Streamer
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Tinjau dokumen identitas dan bukti kepemilikan akun sebelum streamer
            bisa dibooking dan menerima kiriman produk.
          </p>
        </div>
      </div>

      {/* Action feedback */}
      {searchParams.success && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
          <p className="text-sm text-green-800">{searchParams.success}</p>
        </div>
      )}
      {searchParams.error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{searchParams.error}</p>
        </div>
      )}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-800">
            Gagal memuat antrean verifikasi: {error.message}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <form className="relative flex-1 min-w-[240px] max-w-md" method="GET">
          {/* No `page` field: a new search always starts on page 1. */}
          <input type="hidden" name="status" value={status} />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Cari nama, username, email, atau handle..."
            className="pl-10"
          />
        </form>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={queueHref({ status: tab.value, q: query, page: 1 })}
              className={
                tab.value === status
                  ? "rounded-md bg-[#0066FF] px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              }
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Verification Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="font-medium w-[260px]">Streamer</TableHead>
              <TableHead className="font-medium">Akun Platform</TableHead>
              <TableHead className="font-medium">Dokumen</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium">Diajukan</TableHead>
              <TableHead className="font-medium w-[320px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-gray-500">
                  Tidak ada pengajuan verifikasi pada filter ini.
                </TableCell>
              </TableRow>
            )}
            {submissions.map((submission) => {
              const streamer = submission.streamer;
              const isDecided = submission.status !== "pending";

              return (
                <TableRow key={submission.id} className="align-top hover:bg-gray-50/50">
                  <TableCell>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {fullName(streamer)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {submission.user?.email || "Email tidak tersedia"}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          {streamer?.username ? `@${streamer.username}` : "Belum punya username"}
                          {" · "}
                          {streamer?.city_slug || streamer?.location || "Kota tidak diisi"}
                        </div>
                        {submission.user?.phone && (
                          <div className="text-xs text-gray-400">
                            {submission.user.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-sm font-medium text-gray-900">
                      {submission.platform_handle || "-"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {streamer?.platform || "Platform tidak diisi"}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <DocumentLink
                        href={viewableUrl(submission.id_card_url, signedDocuments)}
                        label="KTP"
                      />
                      <DocumentLink
                        href={viewableUrl(submission.selfie_url, signedDocuments)}
                        label="Selfie"
                      />
                      <DocumentLink
                        href={viewableUrl(
                          submission.platform_proof_url,
                          signedDocuments,
                        )}
                        label="Bukti akun"
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <VerificationStatusBadge status={submission.status} />
                      {streamer?.is_active === false && (
                        <span className="text-[11px] text-gray-500">
                          Akun nonaktif
                        </span>
                      )}
                      {submission.notes && (
                        <span className="text-[11px] text-gray-500">
                          Catatan: {submission.notes}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-sm text-gray-500">
                    {formatDate(submission.created_at)}
                  </TableCell>

                  <TableCell>
                    {isDecided ? (
                      <p className="text-xs text-gray-500">
                        Sudah diproses. Status streamer saat ini:{" "}
                        {streamer?.verification_status || "tidak diketahui"}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <form action={approveStreamerVerification}>
                          <input
                            type="hidden"
                            name="submissionId"
                            value={submission.id}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            className="w-full bg-green-600 text-white hover:bg-green-700"
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            Setujui
                          </Button>
                        </form>

                        <form action={rejectStreamerVerification} className="space-y-2">
                          <input
                            type="hidden"
                            name="submissionId"
                            value={submission.id}
                          />
                          <textarea
                            name="rejectionReason"
                            required
                            rows={2}
                            placeholder="Alasan penolakan (wajib, dikirim ke streamer)"
                            className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-200"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            className="w-full border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="mr-1.5 h-4 w-4" />
                            Tolak
                          </Button>
                        </form>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-4">
          <div className="text-sm text-gray-500">
            Menampilkan {rangeStart}-{rangeEnd} dari {total} pengajuan
            {totalPages > 1 && ` · halaman ${page} dari ${totalPages}`}
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={queueHref({ status, q: query, page: page - 1 })}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Sebelumnya
              </Link>
            ) : (
              <span className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
                Sebelumnya
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={queueHref({ status, q: query, page: page + 1 })}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Berikutnya
              </Link>
            ) : (
              <span className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
                Berikutnya
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
