import Link from "next/link";

// Landing page for failed auth callbacks (expired/invalid/already-used links,
// or a missing PKCE code verifier when the link is opened on another device).
// Previously the callback redirected here but no page existed -> hard 404.
export default function AuthErrorPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center relative p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-blue-100 -z-10" />
      <div className="flex flex-col w-full max-w-md gap-3 text-center">
        <h1 className="text-2xl font-medium">Link tidak valid atau kedaluwarsa</h1>
        <p className="text-sm text-foreground/60">
          Link autentikasi ini tidak dapat diproses. Mungkin sudah kedaluwarsa,
          sudah pernah digunakan, atau dibuka di perangkat/browser yang berbeda.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            Minta link reset password baru
          </Link>
          <Link href="/sign-in" className="text-blue-600 hover:underline">
            Kembali ke halaman masuk
          </Link>
        </div>
      </div>
    </main>
  );
}
