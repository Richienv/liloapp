"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { SignUpResponse } from "@/app/types/auth";
import { format } from 'date-fns';
import { createNotification, createStreamNotifications, createItemReceivedNotification, type NotificationType } from '@/services/notification-service';
import { suggestUsername, validateUsername, withSuffix } from "@/lib/username";
import { normalizePhone, PHONE_INVALID_MESSAGE } from "@/lib/phone";
import { resolveCity } from "@/lib/cities";

// Add this helper function at the top of the file
function sanitizeFileName(fileName: string): string {
  // Remove special characters and spaces, replace with underscores
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/** Generic Indonesian copy for anything we can't (or shouldn't) explain to a user. */
const GENERIC_ERROR_MESSAGE = "Terjadi kesalahan. Silakan coba lagi.";

/**
 * Throwaway origin used only to resolve a post-sign-in redirect path. The host
 * is deliberately unreachable (.invalid is reserved by RFC 2606), so a value
 * that escapes this origin during parsing is self-evidently not our path.
 */
const SAFE_REDIRECT_BASE = "https://redirect-base.invalid";

/**
 * Split a submitted city into the two columns that store it.
 *
 * The signup forms now emit a canonical slug, but `location` is not an internal
 * key — it is rendered straight into profile pages, cards, page titles and
 * structured data, and it is what the brand-side location filter matches
 * against. Writing the slug there would publish "bandar-lampung" as a streamer's
 * city and stop a brand typing "Bandar Lampung" from matching anyone. So
 * `location` gets the display name and `city_slug` gets the slug. Text we can't
 * resolve is passed through unchanged rather than discarded.
 */
function cityFields(raw: string | null | undefined): {
  location: string | null;
  citySlug: string | null;
} {
  const city = resolveCity(raw);
  return {
    location: city?.name ?? raw ?? null,
    citySlug: city?.slug ?? null,
  };
}

/**
 * Supabase reports auth failures as English strings written for developers.
 * Showing them verbatim in an Indonesian product is both untranslated and
 * unhelpful — "Invalid login credentials" reads as a system fault rather than a
 * typo. Map the cases a user can act on and fall back to generic copy; callers
 * keep console.error-ing the real error so nothing is lost server-side.
 */
function translateAuthError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string {
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();
  const matches = (...needles: string[]) =>
    needles.some((needle) => code === needle || message.includes(needle));

  if (matches("invalid_credentials", "invalid login credentials")) {
    return "Email atau kata sandi salah.";
  }
  if (matches("email_not_confirmed", "email not confirmed")) {
    return "Email kamu belum diverifikasi. Cek kotak masuk untuk tautan verifikasi.";
  }
  if (matches("user_already_exists", "email_exists", "already registered", "already been registered")) {
    return "Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.";
  }
  if (matches("over_request_rate_limit", "over_email_send_rate_limit", "rate limit", "too many requests")) {
    return "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.";
  }
  if (matches("weak_password", "password should be at least")) {
    return "Kata sandi terlalu lemah. Gunakan minimal 6 karakter.";
  }
  if (matches("validation_failed", "unable to validate email address", "invalid email")) {
    return "Format email tidak valid.";
  }
  if (matches("signup_disabled", "signups not allowed")) {
    return "Pendaftaran sedang ditutup sementara.";
  }
  if (matches("user_not_found", "user not found")) {
    return "Akun tidak ditemukan.";
  }

  return GENERIC_ERROR_MESSAGE;
}

type UserFacingError = Error & { userFacing: true };

/**
 * Tags an error whose message is copy we wrote ourselves — already Indonesian
 * and safe to show. Everything else thrown inside the signup flows is driver
 * text that {@link toFriendlyError} must swallow. A property rather than an
 * Error subclass because `instanceof` on a subclassed Error does not survive
 * downlevel transpilation.
 */
function signupError(message: string): UserFacingError {
  return Object.assign(new Error(message), { userFacing: true as const });
}

function toFriendlyError(error: unknown): string {
  if (error instanceof Error && (error as Partial<UserFacingError>).userFacing) {
    return error.message;
  }
  if (error && typeof error === "object") {
    // Auth errors carry a code/message we can map; anything else (Postgres,
    // storage) falls through to the generic message rather than leaking SQL.
    return translateAuthError(error as { message?: string; code?: string });
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * The middleware parks the originally-requested path in `redirect_to` before
 * bouncing an anonymous visitor to /sign-in. Honour it, but only as a
 * same-origin *path*: "//evil.example" and "/\evil.example" are both read by
 * browsers as protocol-relative URLs, which would turn our login into an open
 * redirect.
 */
function safeRedirectPath(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const candidate = raw.trim();
  if (!candidate.startsWith("/")) return null;

  // Resolve against a throwaway origin instead of pattern-matching the string.
  // A prefix check on "//" and "/\" looks sufficient but isn't: browsers strip
  // tab, CR and LF from a URL before resolving it, so "/\t/evil.example" passes
  // every string test and *then* becomes "//evil.example" — protocol-relative,
  // and our login is an open redirect. URL parsing applies the same WHATWG
  // rules the browser will, so anything that escapes our origin fails here too.
  let url: URL;
  try {
    url = new URL(candidate, SAFE_REDIRECT_BASE);
  } catch {
    return null;
  }
  if (url.origin !== SAFE_REDIRECT_BASE) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

export interface StreamerProfileResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export async function signUpAction(formData: FormData): Promise<SignUpResponse> {
  const supabase = createClient();
  
  try {
    // Get basic info
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const firstName = formData.get("first_name") as string;
    const lastName = formData.get("last_name") as string;
    const location = formData.get("location") as string;

    // Get brand info
    const brandName = formData.get("brand_name") as string;
    const brandDescription = formData.get("brand_description") as string;
    const brandGuidelineFile = formData.get("brand_doc") as File;

    // WhatsApp is how Salda and streamers actually reach a brand, and the privacy
    // notice already promises we collect a phone number — so it is required, and
    // stored in one canonical shape regardless of how it was typed. Validate
    // before auth.signUp so a bad number never leaves an orphaned auth user.
    const phone = normalizePhone(formData.get("phone") as string | null);
    if (!phone) {
      return { success: false, error: PHONE_INVALID_MESSAGE };
    }

    const { location: locationName, citySlug } = cityFields(location);

    // 1. Create the user (auth.signUp already errors on a duplicate email)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          user_type: 'client',
          brand_name: brandName,
          location: locationName,
          city_slug: citySlug,
          phone,
        }
      },
    });

    if (authError || !authData.user) {
      console.error('Sign up auth error:', authError);
      return {
        success: false,
        error: translateAuthError(authError)
      };
    }

    // 3. Upload brand guidelines if provided
    let brandGuidelineUrl = null;
    if (brandGuidelineFile && brandGuidelineFile.size > 0) {
      const fileName = `${authData.user.id}/${Date.now()}_${sanitizeFileName(brandGuidelineFile.name)}`;

      const { error: uploadError, data } = await supabase.storage
        .from('brand_guideline')
        .upload(fileName, brandGuidelineFile);

      if (uploadError) {
        console.error('Brand guideline upload error:', uploadError);
        const admin = createAdminClient();
        if (admin) {
          await admin.auth.admin.deleteUser(authData.user.id);
        } else {
          console.error('SUPABASE_SERVICE_ROLE_KEY not set — cannot roll back orphaned auth user');
        }
        return {
          success: false,
          error: 'Gagal mengunggah brand guideline. Silakan coba lagi.'
        };
      }

      brandGuidelineUrl = supabase.storage
        .from('brand_guideline')
        .getPublicUrl(fileName).data.publicUrl;
    }

    // 4. Create user profile
    const { error: profileError } = await supabase
      .from("users")
      .insert({
        id: authData.user.id,
        email: authData.user.email,
        first_name: firstName,
        last_name: lastName,
        user_type: 'client',
        brand_name: brandName,
        brand_description: brandDescription,
        brand_guidelines_url: brandGuidelineUrl,
        location: locationName,
        city_slug: citySlug,
        phone,
        profile_picture_url: null,
        bio: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      // Clean up: delete user and uploaded file if profile creation fails
      console.error('Sign up profile insert error:', profileError);
      const admin = createAdminClient();
      if (admin) {
        await admin.auth.admin.deleteUser(authData.user.id);
      } else {
        console.error('SUPABASE_SERVICE_ROLE_KEY not set — cannot roll back orphaned auth user');
      }
      return {
        success: false,
        error: 'Gagal membuat profil. Silakan coba lagi.'
      };
    }

    // Onboarding, not /protected: a brand that lands straight on the dashboard
    // has no brand profile to book with yet.
    return {
      success: true,
      redirectTo: '/client-onboarding'
    };

  } catch (error) {
    console.error('Sign up error:', error);
    return {
      success: false,
      error: toFriendlyError(error)
    };
  }
}

/**
 * One sign-in path for both audiences.
 *
 * The account's `user_type` is known the instant the password verifies, so
 * which button was pressed carries no information we don't already have.
 * Previously a streamer who used the brand form was signed back out and told to
 * "use the streamer login page" — a page reached only by a toggle they'd just
 * left. Now the password decides authentication and `user_type` decides the
 * destination; nobody is ever signed out for guessing wrong.
 */
async function signInWithPassword(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  // Deep link the middleware saved before bouncing an anonymous visitor here.
  const requestedPath = safeRedirectPath(formData.get("redirect_to"));
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Hand the email and the pending deep link back on every failure path, so a
  // wrong password costs the user one field instead of retyping the form and
  // losing wherever they were originally headed.
  const retryParams = { email, redirect_to: requestedPath };

  if (error) {
    console.error("Sign-in error:", error);
    return encodedRedirect("error", "/sign-in", translateAuthError(error), retryParams);
  }

  // Defensive: a non-error response without a user means the session is unusable.
  if (!data.user) {
    console.error("Sign-in returned no user for", email);
    return encodedRedirect("error", "/sign-in", GENERIC_ERROR_MESSAGE, retryParams);
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("user_type")
    .eq("id", data.user.id)
    .single();

  // The session itself is valid — only the profile row is missing — so keep the
  // user signed in and point them at support instead of dropping the session.
  if (userError || !userData) {
    console.error("Sign-in: could not read user_type", userError);
    return encodedRedirect(
      "error",
      "/sign-in",
      "Data akun kamu belum lengkap. Hubungi dukungan Salda lewat WhatsApp.",
    );
  }

  const home = userData.user_type === "streamer" ? "/streamer-dashboard" : "/protected";
  return redirect(requestedPath ?? home);
}

export const signInAction = async (formData: FormData) => signInWithPassword(formData);

/**
 * Kept as its own export because the sign-in page still renders a separate
 * streamer form; both now run the same logic, so the two entry points can never
 * disagree about where a user belongs.
 */
export const signInAsStreamerAction = async (formData: FormData) => signInWithPassword(formData);

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = createClient();
  // Prefer the configured site URL; fall back to the request Origin header.
  // A configured value guarantees the redirect target is one Supabase allows.
  const origin = process.env.NEXT_PUBLIC_SITE_URL || headers().get("origin");
  // Same treatment as `redirect_to` on sign-in: this value is attacker-supplied
  // and lands the user somewhere immediately after a genuine reset email goes
  // out — the most credible possible moment to phish the reset code.
  const callbackUrl = safeRedirectPath(formData.get("callbackUrl"));

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email wajib diisi.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/reset-password`,
  });

  if (error) {
    console.error("Forgot password error:", error);
    return encodedRedirect(
      "error",
      "/forgot-password",
      translateAuthError(error),
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Cek emailmu untuk tautan pengaturan ulang kata sandi.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return encodedRedirect(
      "error",
      "/reset-password",
      "Kata sandi dan konfirmasi kata sandi wajib diisi.",
    );
  }

  if (password !== confirmPassword) {
    return encodedRedirect(
      "error",
      "/reset-password",
      "Konfirmasi kata sandi tidak cocok.",
    );
  }

  // A valid (recovery) session is required to update the password. If the link
  // expired or was opened without a session, send them back to request a new one.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Tautan pengaturan ulang sudah kedaluwarsa. Silakan minta tautan baru.",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    console.error("Reset password error:", error);
    return encodedRedirect(
      "error",
      "/reset-password",
      translateAuthError(error),
    );
  }

  return encodedRedirect(
    "success",
    "/sign-in",
    "Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.",
  );
};

export const signOutAction = async () => {
  const supabase = createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

/**
 * Advisory availability check for the streamer signup form.
 *
 * Usernames live on `streamers` (this used to query `users`, where the column
 * does not exist, so it answered "available" for everything). Malformed and
 * reserved names are rejected before the query so the user gets the specific
 * reason rather than a bare "taken". The answer is deliberately advisory: two
 * signups a millisecond apart can both see "available", which is why the insert
 * in streamerSignUpAction lets the unique index be the arbiter.
 */
export async function checkUsernameAvailability(
  username: string,
): Promise<{ available: boolean; error: string | null; suggestion?: string }> {
  const validation = validateUsername(username);
  if (!validation.ok) {
    return { available: false, error: validation.reason };
  }
  const candidate = validation.username;

  const supabase = createClient();
  // Prefix match in one round trip: it answers "is this exact name taken?" and
  // supplies the neighbours needed to pick a free suffix. `ilike` also covers
  // legacy rows stored with different casing. A `_` in the candidate is a LIKE
  // wildcard, which only widens the result set — harmless, because membership is
  // decided by exact comparison below.
  const { data, error } = await supabase
    .from("streamers")
    .select("username")
    .ilike("username", `${candidate}%`)
    .limit(50);

  if (error) {
    console.error("Username check error:", error);
    return { available: false, error: "Gagal memeriksa username. Coba lagi." };
  }

  const taken = new Set(
    (data ?? [])
      .map((row) => (row.username ?? "").toLowerCase())
      .filter(Boolean),
  );

  if (!taken.has(candidate)) {
    return { available: true, error: null };
  }

  let suggestion: string | undefined;
  for (let n = 2; n <= 20; n++) {
    const next = withSuffix(candidate, n);
    if (!taken.has(next)) {
      suggestion = next;
      break;
    }
  }

  return {
    available: false,
    error: "Username ini sudah dipakai.",
    suggestion,
  };
}

export async function updateUserProfile(formData: FormData) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { error: 'Not authenticated' };
    }

    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const location = formData.get('location') as string;
    const image = formData.get('image') as File;

    // First update the users table. `city_slug` is re-resolved alongside
    // `location` on every write — updating one without the other would leave the
    // canonical city pointing at where the user used to live.
    const updateData: any = {
      first_name: firstName,
      last_name: lastName,
      location: cityFields(location).location,
      city_slug: cityFields(location).citySlug,
      updated_at: new Date().toISOString(),
    };

    // Handle profile picture upload if present
    if (image && image.size > 0) {
      const fileExt = image.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${uuidv4()}.${fileExt}`;
      const filePath = `profile_picture/${fileName}`;

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('profile_picture')
        .upload(filePath, image, {
          cacheControl: '3600',
          upsert: true,
          contentType: image.type
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return { error: 'Failed to upload profile image' };
      }

      const { data: { publicUrl } } = supabase.storage
        .from('profile_picture')
        .getPublicUrl(filePath);

      updateData.profile_picture_url = publicUrl;
    }

    // Update users table
    const { error: userUpdateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.id);

    if (userUpdateError) {
      console.error('User update error:', userUpdateError);
      return { error: 'Failed to update user profile' };
    }

    // If user is a streamer, also update streamers table
    const { data: streamerData } = await supabase
      .from('streamers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (streamerData) {
      const streamerUpdateData = {
        first_name: firstName,
        last_name: lastName,
        location: updateData.location,
        city_slug: updateData.city_slug,
        ...(updateData.profile_picture_url && { image_url: updateData.profile_picture_url })
      };

      const { error: streamerUpdateError } = await supabase
        .from('streamers')
        .update(streamerUpdateData)
        .eq('user_id', user.id);

      if (streamerUpdateError) {
        console.error('Streamer update error:', streamerUpdateError);
        return { error: 'Failed to update streamer profile' };
      }
    }

    return { 
      success: true, 
      profilePictureUrl: updateData.profile_picture_url 
    };

  } catch (error) {
    console.error('Profile update error:', error);
    return { error: 'Failed to update profile' };
  }
}

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';
/** Enough suffixes to clear any realistic name collision without spinning. */
const MAX_USERNAME_ATTEMPTS = 6;

/**
 * Insert the streamer row, letting the database's unique index on `username` be
 * the arbiter of who gets a name. Checking availability first and inserting
 * second loses the race between two signups a millisecond apart and would leave
 * one of them with a half-created account; instead we insert optimistically and
 * take the next suffix on a unique violation.
 */
async function insertStreamerWithUniqueUsername(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  baseUsername: string,
) {
  for (let attempt = 1; attempt <= MAX_USERNAME_ATTEMPTS; attempt++) {
    const username = attempt === 1 ? baseUsername : withSuffix(baseUsername, attempt);

    const { data, error } = await supabase
      .from('streamers')
      .insert({ ...row, username })
      .select()
      .single();

    if (!error) return data;

    // Only a username collision is retryable. Any other unique violation (say a
    // second streamer row for the same user) is a genuine failure and has to
    // reach the rollback path rather than being retried five more times.
    const isUsernameCollision =
      error.code === UNIQUE_VIOLATION &&
      /username/i.test(`${error.message ?? ''} ${error.details ?? ''}`);

    if (!isUsernameCollision) throw error;
    console.warn(`Username "${username}" taken, retrying with a suffix`);
  }

  throw signupError('Username ini sudah dipakai. Silakan pilih username lain.');
}

export async function streamerSignUpAction(formData: FormData): Promise<SignUpResponse> {
  // Track created resources so a failure after auth.signUp can be rolled back
  // in the catch block below (best-effort, reverse order).
  let createdUserId: string | null = null;
  let profileImagePath: string | null = null;
  const uploadedGalleryPaths: string[] = [];
  let usersRowInserted = false;
  let streamerRowId: string | number | null = null;

  try {
    const supabase = createClient();

    const firstName = formData.get('first_name') as string;
    const lastName = formData.get('last_name') as string;
    const city = formData.get('city') as string;

    // Validate everything that can be rejected without touching the database
    // first — every failure after auth.signUp costs a rollback.

    // WhatsApp is the coordination channel between a brand and a streamer around
    // a booking, so a reachable number is not optional.
    const phone = normalizePhone(formData.get('phone') as string | null);
    if (!phone) {
      return { success: false, error: PHONE_INVALID_MESSAGE };
    }

    // The username is the streamer's whole public surface: the /[username]
    // profile route, their sitemap entry, and every card link on the site. A
    // streamer without one is invisible and their profile page 404s, so derive
    // one from their name when the form leaves it blank.
    const submittedUsername = ((formData.get('username') as string | null) ?? '').trim();
    const usernameCheck = validateUsername(
      submittedUsername || suggestUsername(firstName, lastName),
    );
    if (!usernameCheck.ok) {
      return { success: false, error: usernameCheck.reason };
    }
    const baseUsername = usernameCheck.username;

    const { location: cityName, citySlug } = cityFields(city);

    // First, handle image uploads before user creation
    let profileImageUrl = null;
    const profileImage = formData.get('image') as File;

    if (profileImage && profileImage.size > 0) {
      const fileExt = profileImage.name.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${timestamp}_${profileImage.name.toLowerCase()}`;

      console.log('Uploading profile image:', {
        fileName,
        fileType: profileImage.type,
        fileSize: profileImage.size
      });

      // Create user first to get the user ID
      const { data: { user }, error: authError } = await supabase.auth.signUp({
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            user_type: 'streamer',
            location: cityName,
            city_slug: citySlug,
            phone,
          },
        },
      });

      if (authError || !user) {
        console.error('Streamer signup auth error:', authError);
        throw signupError(translateAuthError(authError));
      }

      // Auth user now exists — record it for rollback on any later failure.
      createdUserId = user.id;

      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profile_picture')
        .upload(filePath, profileImage, {
          cacheControl: '3600',
          upsert: true,
          contentType: profileImage.type
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw signupError('Gagal mengunggah foto profil. Silakan coba lagi.');
      }

      // Profile image uploaded — record its path for rollback.
      profileImagePath = filePath;

      const { data: { publicUrl } } = supabase.storage
        .from('profile_picture')
        .getPublicUrl(filePath);

      profileImageUrl = publicUrl;

      // Sequential gallery photos upload with retry mechanism
      const galleryFiles = formData.getAll('gallery') as File[];
      const uploadedGalleryUrls: { url: string; order_number: number }[] = [];
      const maxRetries = 3;

      for (let i = 0; i < galleryFiles.length; i++) {
        const file = galleryFiles[i];
        let retryCount = 0;
        let uploadSuccess = false;

        while (retryCount < maxRetries && !uploadSuccess) {
          try {
            const galleryFileName = `${timestamp}-gallery-${i}`;
            const galleryPath = `streamers/${user.id}/${galleryFileName}`;

            console.log(`Uploading gallery image ${i + 1}/${galleryFiles.length}:`, {
              galleryPath,
              fileType: file.type,
              fileSize: file.size,
              retryAttempt: retryCount + 1
            });

            const { error: uploadError } = await supabase.storage
              .from('gallery_images')
              .upload(galleryPath, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type
              });

            if (uploadError) {
              throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
              .from('gallery_images')
              .getPublicUrl(galleryPath);

            uploadedGalleryUrls.push({
              url: publicUrl,
              order_number: i
            });

            // Record uploaded gallery path for rollback.
            uploadedGalleryPaths.push(galleryPath);

            uploadSuccess = true;
            console.log(`Successfully uploaded gallery image ${i + 1}/${galleryFiles.length}`);

          } catch (error) {
            console.error(`Error uploading gallery image ${i + 1}, attempt ${retryCount + 1}:`, error);
            retryCount++;

            if (retryCount === maxRetries) {
              // If all retries failed, clean up previously uploaded files and throw error
              console.error(`Failed to upload gallery image ${i + 1} after ${maxRetries} attempts`);
              
              // Clean up previously uploaded gallery images
              await Promise.all(uploadedGalleryUrls.map(async (photo) => {
                const pathParts = new URL(photo.url).pathname.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const filePath = `streamers/${user.id}/${fileName}`;
                
                await supabase.storage
                  .from('gallery_images')
                  .remove([filePath]);
              }));

              throw signupError(`Gagal mengunggah foto galeri ke-${i + 1}. Silakan coba lagi.`);
            }

            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          }
        }
      }

      // Begin database transaction
      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: formData.get('email') as string,
          first_name: firstName,
          last_name: lastName,
          user_type: 'streamer',
          location: cityName,
          city_slug: citySlug,
          phone,
          profile_picture_url: profileImageUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (userError) throw userError;

      // Users row inserted — record for rollback.
      usersRowInserted = true;

      // Create streamer profile. `verification_status` and `is_active` are left
      // to their database defaults on purpose: a new streamer starts as
      // 'pending' and is not listed or bookable anywhere until an admin
      // approves them.
      const streamerData = await insertStreamerWithUniqueUsername(
        supabase,
        {
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          platform: (formData.getAll('platforms') as string[]).join(','),
          category: (formData.getAll('categories') as string[]).join(','),
          price: parseInt((formData.get('price') as string)?.replace(/\./g, '') || '0'),
          image_url: profileImageUrl,
          bio: formData.get('bio') as string,
          location: cityName,
          city_slug: citySlug,
          full_address: formData.get('full_address') as string,
          video_url: formData.get('video_url') as string,
          gender: formData.get('gender') as string,
          age: parseInt(formData.get('age') as string),
          experience: formData.get('experience') as string,
        },
        baseUsername,
      );

      // Streamers row inserted — record its id for rollback.
      streamerRowId = streamerData.id;

      // Add gallery photos to database with error handling
      if (uploadedGalleryUrls.length > 0) {
        const { error: galleryError } = await supabase
          .from('streamer_gallery_photos')
          .insert(
            uploadedGalleryUrls.map(photo => ({
              streamer_id: streamerData.id,
              photo_url: photo.url,
              order_number: photo.order_number,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }))
          );

        if (galleryError) {
          // If gallery database insert fails, clean up uploaded files
          await Promise.all(uploadedGalleryUrls.map(async (photo) => {
            const pathParts = new URL(photo.url).pathname.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const filePath = `streamers/${user.id}/${fileName}`;
            
            await supabase.storage
              .from('gallery_images')
              .remove([filePath]);
          }));

          throw galleryError;
        }
      }

      // Onboarding, not the dashboard: a streamer is still 'pending' at this
      // point and the onboarding flow is where that gets explained.
      return {
        success: true,
        redirectTo: '/streamer-onboarding'
      };
    } else {
      throw signupError('Foto profil wajib diunggah.');
    }
  } catch (error) {
    console.error('Streamer sign up error:', error);

    // Best-effort rollback of anything created after auth.signUp, in reverse
    // order. Each step is isolated so one failure doesn't abort the rest.
    const admin = createAdminClient();
    if (!admin) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not set — cannot roll back orphaned streamer signup (auth user, rows, and storage objects may be left behind)');
    } else {
      // 1. Delete streamers row (if inserted)
      if (streamerRowId !== null) {
        try {
          await admin.from('streamers').delete().eq('id', streamerRowId);
        } catch (cleanupError) {
          console.error('Rollback: failed to delete streamers row', cleanupError);
        }
      }

      // 2. Delete users row (if inserted)
      if (usersRowInserted && createdUserId) {
        try {
          await admin.from('users').delete().eq('id', createdUserId);
        } catch (cleanupError) {
          console.error('Rollback: failed to delete users row', cleanupError);
        }
      }

      // 3. Remove uploaded storage objects
      if (profileImagePath) {
        try {
          await admin.storage.from('profile_picture').remove([profileImagePath]);
        } catch (cleanupError) {
          console.error('Rollback: failed to remove profile image', cleanupError);
        }
      }
      if (uploadedGalleryPaths.length > 0) {
        try {
          await admin.storage.from('gallery_images').remove(uploadedGalleryPaths);
        } catch (cleanupError) {
          console.error('Rollback: failed to remove gallery images', cleanupError);
        }
      }

      // 4. Delete the orphaned auth user
      if (createdUserId) {
        try {
          await admin.auth.admin.deleteUser(createdUserId);
        } catch (cleanupError) {
          console.error('Rollback: failed to delete auth user', cleanupError);
        }
      }
    }

    return {
      success: false,
      error: toFriendlyError(error)
    };
  }
}

export async function updateStreamerProfile(formData: FormData): Promise<StreamerProfileResponse> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Handle profile picture upload if present
    let imageUrl;
    const image = formData.get('image') as File;
    if (image && image.size > 0) {
      const fileName = `${user.id}/${Date.now()}_${sanitizeFileName(image.name)}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from('profile_picture')
        .upload(filePath, image, {
          cacheControl: '3600',
          upsert: true,
          contentType: image.type
        });

      if (uploadError) throw uploadError;
      imageUrl = supabase.storage
        .from('profile_picture')
        .getPublicUrl(filePath).data.publicUrl;
    }

    // Update streamer profile basic info. `city_slug` tracks `location` on every
    // write so the canonical city (used by /location/<slug> and city filters)
    // never drifts from the free-text value shown on the profile.
    const streamerLocation = formData.get('location') as string;
    const updateData = {
      first_name: formData.get('firstName'),
      last_name: formData.get('lastName'),
      location: cityFields(streamerLocation).location,
      city_slug: cityFields(streamerLocation).citySlug,
      video_url: formData.get('youtubeVideoUrl'),
      platform: formData.get('platform'),
      category: formData.get('category'),
      bio: formData.get('bio'),
      gender: formData.get('gender'),
      age: parseInt(formData.get('age') as string) || null,
      experience: formData.get('experience'),
      full_address: formData.get('fullAddress'),
      ...(imageUrl && { image_url: imageUrl }),
    };

    console.log('Updating streamer profile with data:', updateData);

    const { error: updateError } = await supabase
      .from('streamers')
      .update(updateData)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating streamer profile:', updateError);
      throw updateError;
    }

    // Get streamer ID first
    const { data: streamerData, error: streamerError } = await supabase
      .from('streamers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (streamerError) throw streamerError;

    // Handle gallery photos with sequential upload and retry mechanism
    const existingPhotos = JSON.parse(formData.get('existingGalleryPhotos') as string || '[]');
    const galleryFiles = formData.getAll('gallery') as File[];
    const maxRetries = 3;
    const uploadedGalleryUrls: string[] = [];
    
    try {
      // First, delete existing gallery photos from storage
      const { data: existingFiles, error: listError } = await supabase.storage
        .from('gallery_images')
        .list(`${user.id}`);

      if (!listError && existingFiles) {
        await Promise.all(existingFiles.map(file => 
          supabase.storage
            .from('gallery_images')
            .remove([`${user.id}/${file.name}`])
        ));
      }

      // Delete existing gallery photo records
      await supabase
        .from('streamer_gallery_photos')
        .delete()
        .eq('streamer_id', streamerData.id);

      // Sequential upload of new gallery photos with retry mechanism
      for (let i = 0; i < galleryFiles.length; i++) {
        const file = galleryFiles[i];
        let retryCount = 0;
        let uploadSuccess = false;

        while (retryCount < maxRetries && !uploadSuccess) {
          try {
            const fileName = `${user.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
            
            console.log(`Uploading gallery image ${i + 1}/${galleryFiles.length}:`, {
              fileName,
              fileType: file.type,
              fileSize: file.size,
              retryAttempt: retryCount + 1
            });

            const { error: uploadError } = await supabase.storage
              .from('gallery_images')
              .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type
              });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from('gallery_images')
              .getPublicUrl(fileName);

            uploadedGalleryUrls.push(publicUrl);
            uploadSuccess = true;
            console.log(`Successfully uploaded gallery image ${i + 1}/${galleryFiles.length}`);

          } catch (error) {
            console.error(`Error uploading gallery image ${i + 1}, attempt ${retryCount + 1}:`, error);
            retryCount++;

            if (retryCount === maxRetries) {
              // If all retries failed, clean up previously uploaded files
              console.error(`Failed to upload gallery image ${i + 1} after ${maxRetries} attempts`);
              
              // Clean up previously uploaded gallery images
              await Promise.all(uploadedGalleryUrls.map(async (url) => {
                const pathParts = new URL(url).pathname.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const filePath = `${user.id}/${fileName}`;
                
                await supabase.storage
                  .from('gallery_images')
                  .remove([filePath]);
              }));

              throw new Error(`Failed to upload gallery image ${i + 1} after ${maxRetries} attempts`);
            }

            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          }
        }
      }

      // Combine existing and new photos
      const allPhotos = [...existingPhotos, ...uploadedGalleryUrls];
      
      // Insert all gallery photos with proper error handling
      if (allPhotos.length > 0) {
        const galleryInserts = allPhotos.map((photo_url, index) => ({
          streamer_id: streamerData.id,
          photo_url,
          order_number: index + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: galleryError } = await supabase
          .from('streamer_gallery_photos')
          .insert(galleryInserts);

        if (galleryError) {
          // If gallery database insert fails, clean up uploaded files
          await Promise.all(uploadedGalleryUrls.map(async (url) => {
            const pathParts = new URL(url).pathname.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const filePath = `${user.id}/${fileName}`;
            
            await supabase.storage
              .from('gallery_images')
              .remove([filePath]);
          }));

          throw galleryError;
        }
      }

      return {
        success: true,
        imageUrl: imageUrl
      };

    } catch (error) {
      // Clean up any uploaded files if there's an error
      await Promise.all(uploadedGalleryUrls.map(async (url) => {
        const pathParts = new URL(url).pathname.split('/');
        const fileName = pathParts[pathParts.length - 1];
        const filePath = `${user.id}/${fileName}`;
        
        await supabase.storage
          .from('gallery_images')
          .remove([filePath]);
      }));

      throw error;
    }

  } catch (error) {
    console.error('Error updating streamer profile:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update profile' 
    };
  }
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error signing out:", error);
    return false;
  }
  revalidatePath("/", "layout");
  return true;
}

export async function acceptBooking(bookingId: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  try {
    // Fetch the booking first
    const { data: bookingData, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('*, streamers(first_name, last_name, user_id)')
      .eq('id', bookingId)
      .single();

    if (bookingFetchError) throw bookingFetchError;

    // Authorization: only the streamer who owns this booking may accept it.
    if (bookingData.streamers?.user_id !== user.id) {
      return { error: 'Unauthorized' };
    }

    // Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'accepted' })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    // Create notification using direct approach
    await createNotification({
      user_id: bookingData.client_id,
      streamer_id: bookingData.streamer_id,
      message: `${bookingData.streamers.first_name} telah menerima booking Anda untuk ${format(new Date(bookingData.start_time), 'dd MMMM HH:mm')} pada platform ${bookingData.platform}.`,
      type: 'booking_accepted',
      booking_id: bookingId,
      is_read: false
    });

    revalidatePath('/streamer-dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error accepting booking:', error);
    return { error: 'Failed to accept booking: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

export async function rejectBooking(bookingId: number, reason?: string) {
  const supabase = createClient();

  try {
    // Authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Not authenticated' };
    }

    // Fetch the booking first to get client and streamer details
    const { data: bookingData, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('*, streamers(first_name, last_name, user_id)')
      .eq('id', bookingId)
      .single();

    if (bookingFetchError) throw bookingFetchError;

    // Authorization: only the streamer who owns this booking may reject it.
    if (bookingData.streamers?.user_id !== user.id) {
      return { error: 'Unauthorized' };
    }

    // Update booking status (store the reason in the standard `reason` column
    // that the reschedule/cancel flows also use).
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'rejected', reason: reason ?? null })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    // Create notification with proper type and error handling
    await createNotification({
      user_id: bookingData.client_id,
      streamer_id: bookingData.streamer_id,
      message: `${bookingData.streamers.first_name} ${bookingData.streamers.last_name} telah menolak booking Anda untuk ${format(new Date(bookingData.start_time), 'dd MMMM HH:mm')} pada platform ${bookingData.platform}.${reason ? ` Alasan: ${reason}` : ''}`,
      type: 'booking_rejected',
      booking_id: bookingId,
      is_read: false
    });

    revalidatePath('/streamer-dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error rejecting booking:', error);
    return { error: 'Failed to reject booking: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

export async function startStream(bookingId: number, streamLink: string) {
  const supabase = createClient();

  try {
    // 1. Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // 2. Fetch booking data with streamer info
    const { data: bookingData, error: bookingFetchError } = await supabase
      .from('bookings')
      .select(`
        *,
        streamers!inner(
          id,
          user_id,
          first_name,
          last_name
        )
      `)
      .eq('id', bookingId)
      .single();

    if (bookingFetchError) throw bookingFetchError;
    if (!bookingData) throw new Error('Booking not found');

    // 3. Verify authorization (streamer owns the booking)
    if (bookingData.streamers.user_id !== user.id) {
      throw new Error('Unauthorized to start this stream');
    }

    // 4. Verify booking status and items received
    if (bookingData.status !== 'accepted') {
      throw new Error('Booking must be in accepted status to start stream');
    }
    if (!bookingData.items_received) {
      throw new Error('Items must be received before starting stream');
    }

    // 5. Validate stream link
    if (!streamLink || !streamLink.trim()) {
      throw new Error('Stream link is required');
    }
    try {
      new URL(streamLink);
    } catch {
      throw new Error('Invalid stream link format');
    }

    // 6. Update the booking with optimistic locking
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        stream_link: streamLink, 
        status: 'live',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .eq('status', 'accepted'); // Ensure status hasn't changed

    if (updateError) throw updateError;

    // 7. Create notification
    try {
      await createStreamNotifications({
        client_id: bookingData.client_id,
        streamer_id: bookingData.streamer_id,
        booking_id: bookingId,
        streamer_name: `${bookingData.streamers.first_name} ${bookingData.streamers.last_name}`,
        start_time: format(new Date(bookingData.start_time), 'dd MMMM HH:mm'),
        platform: bookingData.platform,
        stream_link: streamLink,
        type: 'stream_started'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      // Don't throw here as the main operation succeeded
    }

    revalidatePath('/streamer-dashboard');
    return { success: true, updatedBooking: bookingData };
  } catch (error) {
    console.error('Error starting stream:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start stream'
    };
  }
}

export async function endStream(bookingId: number) {
  const supabase = createClient();

  try {
    // Authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Fetch booking data first
    const { data: bookingData, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('*, streamers(first_name, last_name, user_id)')
      .eq('id', bookingId)
      .single();

    if (bookingFetchError) throw bookingFetchError;
    if (!bookingData) throw new Error('Booking not found');

    // Authorization: only the streamer who owns this booking may end its stream.
    if (bookingData.streamers?.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Update the booking status to 'completed'
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    // Get streamer name safely
    if (!bookingData.streamers?.first_name) {
      console.error('Streamer data not found in booking:', bookingData);
      throw new Error('Streamer data not found');
    }

    // Create notification using the helper function with proper error handling
    await createStreamNotifications({
      client_id: bookingData.client_id,
      streamer_id: bookingData.streamer_id,
      booking_id: bookingId,
      streamer_name: bookingData.streamers.first_name,
      start_time: format(new Date(bookingData.start_time), 'dd MMMM HH:mm'),
      platform: bookingData.platform,
      type: 'stream_ended'
    });

    revalidatePath('/streamer-dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error ending stream:', error);
    return { success: false, error: 'Failed to end stream: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

export async function updateStreamerPrice(streamerId: number, newPrice: number) {
  try {
    const supabase = createClient();

    // Debug log
    console.log('Updating price for streamer:', { streamerId, newPrice });

    // Get current price first
    const { data: currentStreamer, error: streamerError } = await supabase
      .from('streamers')
      .select('price, user_id')
      .eq('id', streamerId)
      .single();

    if (streamerError) {
      console.error('Error fetching streamer:', streamerError);
      throw new Error('Streamer not found');
    }

    // Verify ownership
    const { data: { user } } = await supabase.auth.getUser();
    if (currentStreamer.user_id !== user?.id) {
      throw new Error('Unauthorized');
    }

    // Begin transaction
    // 1. Update streamer's current price
    const { error: updateError } = await supabase
      .from('streamers')
      .update({ 
        price: newPrice,
        last_price_update: new Date().toISOString()
      })
      .eq('id', streamerId);

    if (updateError) {
      console.error('Error updating streamer price:', updateError);
      throw updateError;
    }

    // 2. Try to insert first
    const { error: insertError } = await supabase
      .from('streamer_current_discounts')
      .insert({
        streamer_id: streamerId,
        current_price: newPrice,
        previous_price: currentStreamer.price,
        discount_percentage: newPrice < currentStreamer.price 
          ? Math.round(((currentStreamer.price - newPrice) / currentStreamer.price) * 100)
          : null,
        last_price_update: new Date().toISOString(),
        next_available_update: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

    // If insert fails (record exists), try update
    if (insertError) {
      console.log('Insert failed, trying update:', insertError);
      const { error: updateDiscountError } = await supabase
        .from('streamer_current_discounts')
        .update({
          current_price: newPrice,
          previous_price: currentStreamer.price,
          discount_percentage: newPrice < currentStreamer.price 
            ? Math.round(((currentStreamer.price - newPrice) / currentStreamer.price) * 100)
            : null,
          last_price_update: new Date().toISOString(),
          next_available_update: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('streamer_id', streamerId);

      if (updateDiscountError) {
        console.error('Error updating discount:', updateDiscountError);
        throw updateDiscountError;
      }
    }

    return {
      success: true,
      message: 'Price updated successfully',
      current_price: newPrice,
      previous_price: currentStreamer.price,
      discount_percentage: newPrice < currentStreamer.price 
        ? Math.round(((currentStreamer.price - newPrice) / currentStreamer.price) * 100)
        : null
    };

  } catch (error) {
    console.error('Error in updateStreamerPrice:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update price' 
    };
  }
}

export async function acceptItems(bookingId: number) {
  const supabase = createClient();
  
  try {
    // First verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // Fetch the booking first to get client and streamer details
    const { data: bookingData, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('*, streamers(first_name, last_name, user_id)')
      .eq('id', bookingId)
      .single();

    if (bookingFetchError) {
      throw new Error(`Failed to fetch booking: ${bookingFetchError.message}`);
    }

    // Verify the streamer has permission to accept items for this booking
    if (!bookingData || bookingData.streamers.user_id !== user.id) {
      throw new Error('Unauthorized to accept items for this booking');
    }

    // Update booking status with optimistic locking
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        items_received: true,
        items_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .eq('items_received', false) // Ensure item hasn't been received yet
      .select();

    if (updateError) {
      throw new Error(`Failed to update booking: ${updateError.message}`);
    }

    // Create notification with proper error handling
    try {
      await createItemReceivedNotification({
        client_id: bookingData.client_id,
        streamer_id: bookingData.streamer_id,
        booking_id: bookingId,
        streamer_name: `${bookingData.streamers.first_name} ${bookingData.streamers.last_name}`
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      // Don't throw here, as the main operation succeeded
    }

    revalidatePath('/streamer-dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error accepting items:', error);
    return { 
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

export async function requestReschedule(bookingId: number, reason: string) {
  const supabase = createClient();

  try {
    // Authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Not authenticated' };
    }

    // Fetch the booking first to get client and streamer details
    const { data: bookingData, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('*, streamers(first_name, last_name, user_id)')
      .eq('id', bookingId)
      .single();

    if (bookingFetchError) throw bookingFetchError;

    // Authorization: only the streamer who owns this booking may request a reschedule.
    if (bookingData.streamers?.user_id !== user.id) {
      return { error: 'Unauthorized' };
    }

    // Update booking status with reason
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'reschedule_requested',
        updated_at: new Date().toISOString(),
        reason: reason
      })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    // Create notification for client
    await createNotification({
      user_id: bookingData.client_id,
      streamer_id: bookingData.streamer_id,
      message: `${bookingData.streamers.first_name} ${bookingData.streamers.last_name} mengajukan reschedule untuk sesi live streaming Anda. Alasan: ${reason}`,
      type: 'reschedule_request',
      booking_id: bookingId,
      is_read: false
    });

    revalidatePath('/streamer-dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error requesting reschedule:', error);
    return { error: 'Failed to request reschedule: ' + (error instanceof Error ? error.message : String(error)) };
  }
}