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
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  approveStreamerVerification,
  rejectStreamerVerification,
} from "../actions";

// The queue must reflect the row an admin just acted on, never a cached copy.
export const dynamic = "force-dynamic";

const BUCKET = "verification_documents";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

type SubmissionStatus = "pending" | "approved" | "rejected";

const STATUS_TABS: { value: SubmissionStatus | "all"; label: string }[] = [
  { value: "pending", label: "Menunggu Review" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "all", label: "Semua" },
];

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
    rejection_reason: string | null;
  } | null;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
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

/**
 * Documents live in a private bucket, so the stored value is an object path and
 * has to be signed before it can be shown. Older rows may already hold a full
 * URL; those are passed through untouched.
 */
async function toViewableUrl(
  db: SupabaseClient,
  value: string | null
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const path = value.replace(new RegExp(`^${BUCKET}/`), "");
  const { data } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return data?.signedUrl ?? null;
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
  searchParams: { status?: string; q?: string; error?: string; success?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The layout already gates /admin, but this page reads other people's KYC
  // documents with a service-role client, so it re-checks on its own.
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = user?.email?.toLowerCase();
  if (!email || adminEmails.length === 0 || !adminEmails.includes(email)) {
    redirect("/");
  }

  const db = readClient(supabase);
  const status = (searchParams.status || "pending") as SubmissionStatus | "all";
  const query = (searchParams.q || "").trim();

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
      streamer:streamers!streamer_verification_submissions_streamer_id_fkey (
        id,
        first_name,
        last_name,
        username,
        platform,
        location,
        city_slug,
        verification_status,
        is_active,
        rejection_reason
      ),
      user:users!streamer_verification_submissions_user_id_fkey (
        id,
        email,
        phone
      )
    `
    )
    .order("created_at", { ascending: true });

  if (status !== "all") {
    submissionsQuery = submissionsQuery.eq("status", status);
  }

  const { data, error } = await submissionsQuery;

  const submissions = ((data ?? []) as unknown as SubmissionRow[]).filter(
    (submission) => {
      if (!query) return true;
      const haystack = [
        fullName(submission.streamer),
        submission.streamer?.username,
        submission.user?.email,
        submission.platform_handle,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.toLowerCase());
    }
  );

  // Sign every document up front so each row can render its links directly.
  const documents = await Promise.all(
    submissions.map(async (submission) => ({
      id: submission.id,
      idCard: await toViewableUrl(db, submission.id_card_url),
      selfie: await toViewableUrl(db, submission.selfie_url),
      platformProof: await toViewableUrl(db, submission.platform_proof_url),
    }))
  );
  const documentsById = new Map(documents.map((d) => [d.id, d]));

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
              href={`/admin/verificationstreamer?status=${tab.value}${
                query ? `&q=${encodeURIComponent(query)}` : ""
              }`}
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
              const docs = documentsById.get(submission.id);
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
                      <DocumentLink href={docs?.idCard ?? null} label="KTP" />
                      <DocumentLink href={docs?.selfie ?? null} label="Selfie" />
                      <DocumentLink
                        href={docs?.platformProof ?? null}
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

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-4">
          <div className="text-sm text-gray-500">
            Menampilkan {submissions.length} pengajuan
          </div>
        </div>
      </div>
    </div>
  );
}
