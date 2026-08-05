"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Clock, Info, Loader2, Package, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/ui/city-combobox";
import { getCityBySlug, type Timezone } from "@/lib/cities";
import { formatRupiah, priceBandFor, priceHint } from "@/lib/pricing-suggestions";
import {
  DEFAULT_SCHEDULE_LABEL,
  isProfilePublishable,
  missingPublishFields,
} from "@/lib/milestones";
import { slugifyUsername, USERNAME_MAX } from "@/lib/username";
import { saveStreamerProfile } from "../actions";

/**
 * Milestone 1: the eight fields a listing renders and a booking needs.
 *
 * The design principle for this screen is that every field arrives with an
 * answer already in it wherever an answer can be guessed. The old signup made a
 * new host invent a username, name their own hourly rate and type a city from
 * scratch — three open-ended decisions in a row, which is where people stopped.
 * Here each of those is a confirmation instead: a suggested handle, a suggested
 * price band, and a searchable list of real cities.
 */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BIO_MIN = 20;
const BIO_MAX = 1_000;
/** Mirrors ADDRESS_MIN / ADDRESS_MAX in ../actions.ts, which is authoritative. */
const ADDRESS_MIN = 15;
const ADDRESS_MAX = 500;

const PLATFORM_OPTIONS = [
  { value: "TikTok", label: "TikTok Live" },
  { value: "Shopee", label: "Shopee Live" },
];

/**
 * Every option here has a price band in lib/pricing-suggestions, so choosing a
 * category always produces a real suggested rate rather than the generic
 * fallback. Kept in Indonesian, like the rest of the product.
 */
const CATEGORY_OPTIONS = [
  "Fashion",
  "Kecantikan",
  "Elektronik",
  "Makanan",
  "Minuman",
  "Rumah Tangga",
  "Olahraga",
  "Kesehatan",
  "Ibu & Anak",
  "Otomotif",
  "Buku",
  "Mainan",
  "Lainnya",
];

/** Indonesians read time zones as WIB/WITA/WIT, never as an IANA identifier. */
const TIMEZONE_LABEL: Record<Timezone, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

/**
 * Keystroke-safe username normalisation.
 *
 * `slugifyUsername` also trims separators off both ends, which is correct for a
 * finished value but destructive mid-typing: "rizky-" would collapse back to
 * "rizky" and the next character would land as "rizkyp". So while the field has
 * focus we only enforce the character set and strip leading separators, and run
 * the full slugify on blur and on submit.
 */
function normalizeUsernameInput(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[_-]+/, "")
    .slice(0, USERNAME_MAX);
}

/** "150000" -> "150.000", matching how rupiah is typed everywhere else. */
function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parsePriceInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export interface ProfileFormProps {
  defaultUsername: string;
  currentImageUrl: string | null;
  defaultCitySlug: string;
  defaultFullAddress: string;
  defaultCategory: string;
  defaultPlatforms: string[];
  defaultPrice: number | null;
  defaultBio: string;
}

export function ProfileForm({
  defaultUsername,
  currentImageUrl,
  defaultCitySlug,
  defaultFullAddress,
  defaultCategory,
  defaultPlatforms,
  defaultPrice,
  defaultBio,
}: ProfileFormProps) {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(defaultUsername);
  const [citySlug, setCitySlug] = useState(defaultCitySlug);
  const [fullAddress, setFullAddress] = useState(defaultFullAddress);
  const [category, setCategory] = useState(defaultCategory);
  const [platforms, setPlatforms] = useState<string[]>(defaultPlatforms);
  const [price, setPrice] = useState(
    defaultPrice ? formatPriceInput(String(defaultPrice)) : "",
  );
  const [bio, setBio] = useState(defaultBio);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Once a host has typed their own rate, a later category change must not
  // overwrite it — the suggestion is a starting point, not a policy.
  const [priceTouched, setPriceTouched] = useState(Boolean(defaultPrice));

  // A category the account already had but that is no longer offered stays
  // selectable, so editing an old profile never silently changes its category.
  const categoryOptions = useMemo(() => {
    if (defaultCategory && !CATEGORY_OPTIONS.includes(defaultCategory)) {
      return [defaultCategory, ...CATEGORY_OPTIONS];
    }
    return CATEGORY_OPTIONS;
  }, [defaultCategory]);

  const city = getCityBySlug(citySlug);
  const band = priceBandFor(category);

  const effectiveImageUrl = photoPreview ?? currentImageUrl;

  // Live readiness, computed with the same function the server and the hub use,
  // so the form can never claim "done" while the milestone says otherwise.
  const draft = {
    username,
    image_url: effectiveImageUrl,
    city_slug: citySlug,
    // Length is checked here as well as on the server, so "Alamat lengkap"
    // stays in the missing list until the value is actually usable rather than
    // clearing the moment a single character is typed.
    full_address: fullAddress.trim().length >= ADDRESS_MIN ? fullAddress : "",
    category,
    platform: platforms.join(","),
    price: parsePriceInput(price),
    bio,
  };
  const ready = isProfilePublishable(draft);
  const missing = missingPublishFields(draft);

  const handleUsernameChange = (value: string) => {
    // Normalise as they type: the field is a URL, and letting someone type
    // "Rizky Pratama" only to be told it is invalid on submit is a wasted round
    // trip. Spaces become hyphens in front of them instead.
    setUsername(normalizeUsernameInput(value));
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);

    // Smart default: naming your own rate cold is the hardest decision in this
    // whole flow. Once a category exists we can answer it for them.
    if (!priceTouched) {
      setPrice(formatPriceInput(String(priceBandFor(value).suggested)));
    }
  };

  const handlePriceChange = (value: string) => {
    setPriceTouched(true);
    setPrice(formatPriceInput(value));
  };

  const togglePlatform = (value: string) => {
    setPlatforms((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const clearPhoto = () => {
    setPhoto(null);
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handlePhotoChange = (file: File | null) => {
    setError(null);

    if (!file) {
      clearPhoto();
      return;
    }

    // Mirror the server's checks so an obviously bad file never costs an upload.
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Foto profil harus berupa file JPG, PNG, atau WEBP.");
      clearPhoto();
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Foto profil maksimal 5 MB.");
      clearPhoto();
      return;
    }

    setPhoto(file);
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Finish the slug now rather than relying on the field having been
      // blurred: submitting with Enter would otherwise send a trailing hyphen
      // the server correctly refuses.
      const finalUsername = slugifyUsername(username);
      if (finalUsername !== username) setUsername(finalUsername);

      // Built by hand rather than from the DOM: the city combobox, the platform
      // toggles and the formatted price all live in React state.
      const formData = new FormData();
      formData.append("username", finalUsername);
      formData.append("city_slug", citySlug);
      formData.append("full_address", fullAddress);
      formData.append("category", category);
      formData.append("platform", platforms.join(","));
      formData.append("price", String(parsePriceInput(price)));
      formData.append("bio", bio);
      if (photo) formData.append("image", photo);

      const result = await saveStreamerProfile(formData);

      if (result.success) {
        // Back to the hub: finishing a milestone should show the next one, not
        // dump the host on a page that looks identical to the one they submitted.
        router.push("/streamer-setup");
        router.refresh();
        return;
      }

      setError(result.error ?? "Terjadi kesalahan. Silakan coba lagi.");
    } catch (submitError) {
      console.error("Profile save failed", submitError);
      setError("Terjadi kesalahan jaringan. Coba lagi sebentar lagi.");
    } finally {
      // Always re-enable. A failed save must never leave the button spinning
      // with the host's answers trapped behind it.
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Profile photo */}
      <div className="space-y-2">
        <Label htmlFor="image" className="text-sm font-medium text-gray-700">
          Foto profil
        </Label>

        <div className="flex items-center gap-4">
          <label
            htmlFor="image"
            className="flex h-20 w-20 flex-shrink-0 cursor-pointer items-center justify-center
              overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50
              transition-colors hover:border-blue-200 hover:bg-blue-50/40"
          >
            {effectiveImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={effectiveImageUrl}
                alt="Pratinjau foto profil"
                className="h-full w-full object-cover"
              />
            ) : (
              <Camera className="h-6 w-6 text-gray-400" />
            )}
          </label>

          <div className="min-w-0 flex-1">
            <label
              htmlFor="image"
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl
                border-2 border-gray-200 px-4 text-sm font-medium text-gray-700 transition-colors
                hover:bg-gray-50"
            >
              {effectiveImageUrl ? "Ganti foto" : "Pilih foto"}
            </label>
            {photo && (
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Batalkan foto yang dipilih"
                className="ml-2 inline-flex h-10 items-center gap-1 rounded-xl px-2 text-sm
                  text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
                Batal
              </button>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Wajah kamu terlihat jelas, JPG/PNG/WEBP, maksimal 5 MB.
            </p>
          </div>
        </div>

        <input
          ref={photoInputRef}
          id="image"
          name="image"
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="sr-only"
          onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
        />
      </div>

      {/* Username — pre-filled from their name, shown as the live public URL. */}
      <div className="space-y-2">
        <Label htmlFor="username" className="text-sm font-medium text-gray-700">
          Username
        </Label>
        <div
          className="flex h-12 w-full items-center rounded-xl border border-gray-200 bg-gray-50
            transition-all duration-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
        >
          <span
            aria-hidden="true"
            className="flex h-full select-none items-center border-r border-gray-200 px-4 text-base text-gray-500"
          >
            salda.id/
          </span>
          <input
            id="username"
            name="username"
            type="text"
            value={username}
            onChange={(event) => handleUsernameChange(event.target.value)}
            onBlur={() => setUsername((current) => slugifyUsername(current))}
            maxLength={USERNAME_MAX}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="username-help"
            className="h-full w-full min-w-0 flex-1 rounded-r-xl bg-transparent px-4 text-base outline-none
              placeholder:text-gray-400"
            placeholder="rizky-pratama"
            style={{ fontSize: "16px" }}
          />
        </div>
        <p id="username-help" className="text-xs text-gray-500">
          Alamat profil publik kamu:{" "}
          <span className="font-medium text-gray-800">salda.id/{username || "…"}</span>. Sudah
          kami isi dari namamu — ubah kalau mau.
        </p>
      </div>

      {/* City — canonical slug only, and the time zone is derived, never asked. */}
      <div className="space-y-2">
        <Label htmlFor="city" className="text-sm font-medium text-gray-700">
          Kota
        </Label>
        <CityCombobox
          id="city"
          value={citySlug}
          onChange={setCitySlug}
          aria-describedby="city-help"
        />
        <p id="city-help" className="text-xs text-gray-500">
          {city ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              Zona waktu kamu {TIMEZONE_LABEL[city.timezone]} — otomatis dipakai untuk jadwal live.
            </span>
          ) : (
            "Dipakai brand untuk memperkirakan lama pengiriman produk ke kamu."
          )}
        </p>
      </div>

      {/* Shipping address. Not portfolio polish: the brand posts a physical
          product to this address, and a booking without one is a booking the
          brand has already paid for and cannot fulfil. */}
      <div className="space-y-2">
        <Label htmlFor="full_address" className="text-sm font-medium text-gray-700">
          Alamat lengkap
        </Label>
        <Textarea
          id="full_address"
          name="full_address"
          value={fullAddress}
          onChange={(event) => setFullAddress(event.target.value)}
          maxLength={ADDRESS_MAX}
          rows={3}
          placeholder="Nama jalan, nomor rumah, kelurahan, kecamatan, kode pos"
          aria-describedby="full_address-help"
          className="min-h-[96px] resize-none rounded-xl border-gray-200 bg-gray-50/50 text-base
            focus:bg-white"
          style={{ fontSize: "16px" }}
        />
        <p
          id="full_address-help"
          className="flex items-start gap-1.5 text-xs text-gray-500"
        >
          <Package className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
          <span>
            Diperlukan untuk pengiriman produk dari brand. Hanya dilihat admin dan brand
            yang sudah membooking kamu — tidak pernah tampil di profil publik.
          </span>
        </p>
      </div>

      {/* Category — the input the price suggestion is derived from. */}
      <div className="space-y-2">
        <Label htmlFor="category" className="text-sm font-medium text-gray-700">
          Kategori produk
        </Label>
        <select
          id="category"
          name="category"
          value={category}
          onChange={(event) => handleCategoryChange(event.target.value)}
          className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-base
            transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          style={{ fontSize: "16px" }}
        >
          <option value="">Pilih kategori</option>
          {categoryOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500">
          Kategori yang paling sering kamu bawakan. Ini juga yang kami pakai untuk menyarankan
          harga.
        </p>
      </div>

      {/* Platform */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Platform live</legend>
        <div className="grid grid-cols-2 gap-3">
          {PLATFORM_OPTIONS.map((option) => {
            const selected = platforms.includes(option.value);
            return (
              <label
                key={option.value}
                htmlFor={`platform-${option.value}`}
                className={`flex h-12 cursor-pointer items-center justify-center rounded-xl border-2
                  px-4 text-sm font-medium transition-colors ${
                    selected
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-200"
                  }`}
              >
                <input
                  id={`platform-${option.value}`}
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => togglePlatform(option.value)}
                />
                {option.label}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">Boleh pilih dua-duanya.</p>
      </fieldset>

      {/* Price — arrives pre-filled from the category band. */}
      <div className="space-y-2">
        <Label htmlFor="price" className="text-sm font-medium text-gray-700">
          Harga per jam
        </Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-medium text-gray-500">
            Rp
          </span>
          <input
            id="price"
            name="price"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={price}
            onChange={(event) => handlePriceChange(event.target.value)}
            placeholder={formatPriceInput(String(band.suggested))}
            aria-describedby="price-help"
            className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-12 pr-4 text-base
              font-medium transition-all duration-200 focus:border-blue-500 focus:outline-none
              focus:ring-1 focus:ring-blue-500"
            style={{ fontSize: "16px" }}
          />
        </div>
        <p id="price-help" className="flex items-start gap-1.5 text-xs text-gray-500">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
          <span>
            {priceHint(category)}{" "}
            {!priceTouched && category
              ? `Kami isi ${formatRupiah(band.suggested)} — ubah kapan saja.`
              : "Kamu bisa mengubahnya kapan saja."}
          </span>
        </p>
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <Label htmlFor="bio" className="text-sm font-medium text-gray-700">
          Deskripsi singkat
        </Label>
        <Textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={BIO_MAX}
          rows={4}
          placeholder="Contoh: Host fashion dengan 2 tahun pengalaman TikTok Live. Terbiasa bawa produk hijab dan outfit harian, rata-rata 3 jam per sesi."
          aria-describedby="bio-help"
          className="min-h-[120px] resize-none rounded-xl border-gray-200 bg-gray-50/50 text-base
            focus:bg-white"
          style={{ fontSize: "16px" }}
        />
        <p id="bio-help" className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span>Satu sampai dua kalimat sudah cukup. Jangan tulis nomor HP atau akun pribadi.</span>
          <span className={bio.length < BIO_MIN ? "text-gray-400" : "text-gray-500"}>
            {bio.length}/{BIO_MAX}
          </span>
        </p>
      </div>

      {/* Live readiness, using the same rule the hub and the server apply. */}
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          ready
            ? "border-green-100 bg-green-50/60 text-green-800"
            : "border-blue-100 bg-blue-50/60 text-blue-900"
        }`}
      >
        <p className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            {ready
              ? // Honest: saving does not put the profile on Salda. Listing also
                // needs an approved verification, which only an admin can give.
                `Semua lengkap. Setelah disimpan, profil kamu siap ditinjau tim Salda — dan kami
                 langsung menyiapkan jadwal awal ${DEFAULT_SCHEDULE_LABEL} yang bisa kamu ubah
                 kapan saja di menu Jadwal.`
              : `Tinggal lengkapi: ${missing.join(", ")}.`}
          </span>
        </p>
      </div>

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
            Menyimpan…
          </span>
        ) : (
          "Simpan profil"
        )}
      </Button>

      <p className="text-center text-xs text-gray-500">
        Progres tersimpan setiap kali kamu menyimpan. Kamu boleh berhenti dan lanjut lagi nanti.
      </p>
    </form>
  );
}
