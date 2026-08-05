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
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="flex items-start gap-2 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Brand mengirim produk asli ke alamat rumah kamu, jadi kami perlu memastikan
            identitas setiap host. Dokumen ini bersifat rahasia, hanya dipakai untuk
            verifikasi, dan tidak pernah ditampilkan di profil publik kamu.
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="platform_handle" className="text-sm font-medium text-gray-700">
          Username akun live kamu
        </Label>
        <Input
          id="platform_handle"
          name="platform_handle"
          required
          defaultValue={defaultHandle ?? ""}
          placeholder="@username"
          className="h-11 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white"
          style={{ fontSize: "16px" }}
        />
        <p className="text-xs text-gray-500">
          Tulis persis seperti di TikTok atau Shopee Live, agar cocok dengan screenshot.
        </p>
      </div>

      {DOCUMENT_FIELDS.map((field) => {
        const selected = files[field.name];
        const preview = previews[field.name];

        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name} className="text-sm font-medium text-gray-700">
              {field.label}
            </Label>

            <label
              htmlFor={field.name}
              className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed
                border-gray-200 bg-gray-50/50 p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt={`Pratinjau ${field.label}`}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-white text-gray-400">
                  <Upload className="h-5 w-5" />
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {selected ? selected.name : "Pilih file"}
                </span>
                <span className="block text-xs text-gray-500">{field.help}</span>
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
                  className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
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
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive-emphasis"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-medium
          text-white transition-all hover:from-blue-700 hover:to-indigo-700"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Mengirim…
          </span>
        ) : (
          "Kirim untuk diverifikasi"
        )}
      </Button>
    </form>
  );
}
