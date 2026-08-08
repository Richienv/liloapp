"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitStreamerVerification } from "./actions";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ID_CARD_TYPES = [...IMAGE_TYPES, "application/pdf"];

interface DocumentField {
  name: string;
  label: string;
  help: string;
  accept: string[];
}

const DOCUMENT_FIELDS: DocumentField[] = [
  {
    name: "id_card",
    label: "Foto KTP",
    help: "Pastikan seluruh bagian kartu terlihat dan tulisannya terbaca jelas.",
    accept: ID_CARD_TYPES,
  },
  {
    name: "selfie",
    label: "Foto selfie sambil memegang KTP",
    help: "Wajah kamu dan KTP harus terlihat jelas dalam satu foto.",
    accept: IMAGE_TYPES,
  },
  {
    name: "platform_proof",
    label: "Bukti kepemilikan akun",
    help: "Screenshot halaman profil TikTok atau Shopee Live kamu dalam keadaan sedang login.",
    accept: IMAGE_TYPES,
  },
];

/** Mirrors the server's checks so an obvious problem is caught before an upload. */
function validateFile(file: File, field: DocumentField): string | null {
  if (!field.accept.includes(file.type)) {
    const allowed = field.accept.includes("application/pdf")
      ? "JPG, PNG, WEBP, atau PDF"
      : "JPG, PNG, atau WEBP";
    return `${field.label} harus berupa file ${allowed}.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${field.label} maksimal 5 MB.`;
  }
  return null;
}

export function VerificationForm({ defaultHandle }: { defaultHandle?: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (field: DocumentField, file: File | null) => {
    setError(null);

    if (!file) {
      setFiles((prev) => ({ ...prev, [field.name]: null }));
      setPreviews((prev) => ({ ...prev, [field.name]: null }));
      return;
    }

    const problem = validateFile(file, field);
    if (problem) {
      setError(problem);
      // Clear the input too. handleSubmit builds FormData from the DOM, not from
      // React state, so leaving the rejected file attached would show the
      // previously accepted document in the UI while actually uploading the
      // oversized one — and the server would reject a file the user can see is fine.
      const input = document.getElementById(field.name) as HTMLInputElement | null;
      if (input) input.value = "";
      setFiles((prev) => ({ ...prev, [field.name]: null }));
      setPreviews((prev) => ({ ...prev, [field.name]: null }));
      return;
    }

    setFiles((prev) => ({ ...prev, [field.name]: file }));
    setPreviews((prev) => ({
      ...prev,
      // A PDF has no inline preview; only images get an object URL.
      [field.name]: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    // Snapshot before awaiting: React nulls currentTarget once the handler yields.
    const formData = new FormData(form);

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitStreamerVerification(formData);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "Terjadi kesalahan. Silakan coba lagi.");
      }
    } catch (submitError) {
      console.error("Verification submit failed", submitError);
      setError("Terjadi kesalahan jaringan. Coba lagi sebentar lagi.");
    } finally {
      // Always re-enable: a submission that fails must not leave the button
      // stuck on a spinner with no way forward.
      setIsSubmitting(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* Why we ask, in ink. The one blue on this screen is the submit button. */}
      <p className="flex items-start gap-2 rounded-panel border border-hairline bg-surface-tint px-4 py-3 text-copy text-ink-body">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-ghost" />
        <span>
          Brand mengirim produk asli ke alamat rumah kamu, jadi kami perlu memastikan
          identitas setiap host. Dokumen ini bersifat rahasia, hanya dipakai untuk
          verifikasi, dan tidak pernah ditampilkan di profil publik kamu.
        </span>
      </p>

      <div className="space-y-2">
        <Label htmlFor="platform_handle" className="text-copy font-medium text-ink-body">
          Username akun live kamu
        </Label>
        <Input
          id="platform_handle"
          name="platform_handle"
          required
          defaultValue={defaultHandle ?? ""}
          placeholder="@username"
          className="h-12 rounded-field border-hairline-input bg-surface px-3.5 text-ink
            placeholder:text-ink-ghost focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-0"
          style={{ fontSize: "16px" }}
        />
        <p className="text-meta text-ink-soft">
          Tulis persis seperti di TikTok atau Shopee Live, agar cocok dengan screenshot.
        </p>
      </div>

      {DOCUMENT_FIELDS.map((field) => {
        const selected = files[field.name];
        const preview = previews[field.name];

        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name} className="text-copy font-medium text-ink-body">
              {field.label}
            </Label>

            <label
              htmlFor={field.name}
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-panel border border-dashed
                border-hairline-input bg-surface p-3 transition-colors hover:border-hairline-strong hover:bg-surface-tint"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt={`Pratinjau ${field.label}`}
                  className="h-14 w-14 shrink-0 rounded-field object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-field border border-hairline-soft bg-surface-tint text-ink-faint">
                  <Upload className="h-4 w-4" />
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-ink">
                  {selected ? selected.name : "Pilih file"}
                </span>
                <span className="block text-meta text-ink-soft">{field.help}</span>
              </span>

              {selected && (
                <button
                  type="button"
                  aria-label={`Hapus ${field.label}`}
                  onClick={(event) => {
                    event.preventDefault();
                    handleFileChange(field, null);
                    const input = document.getElementById(field.name) as HTMLInputElement | null;
                    if (input) input.value = "";
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-chip text-ink-ghost transition-colors hover:bg-surface-deep hover:text-ink-body"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>

            <input
              id={field.name}
              name={field.name}
              type="file"
              accept={field.accept.join(",")}
              required
              className="sr-only"
              onChange={(event) => handleFileChange(field, event.target.files?.[0] ?? null)}
            />
          </div>
        );
      })}

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-panel border border-destructive-emphasis/25 bg-destructive-subtle px-4 py-3 text-copy text-destructive-emphasis"
        >
          {error}
        </p>
      )}

      <Button type="submit" variant="brand" size="action-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Mengirim…
          </>
        ) : (
          "Kirim untuk diverifikasi"
        )}
      </Button>
    </form>
  );
}
