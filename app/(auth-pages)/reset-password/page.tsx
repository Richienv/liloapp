import { resetPasswordAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

// This page lives OUTSIDE /protected on purpose: the recovery link lands here
// via /auth/callback, and gating it behind the /protected middleware guard
// would bounce users to /sign-in before they can set a new password. Instead we
// validate the recovery session here and show a clear message for bad links.
export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Message;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col w-full max-w-md p-4 gap-3 text-center">
        <h1 className="text-2xl font-medium">Link tidak valid</h1>
        <p className="text-sm text-foreground/60">
          Link reset password ini tidak valid atau sudah kedaluwarsa. Silakan minta link baru.
        </p>
        <Link href="/forgot-password" className="text-blue-600 hover:underline">
          Minta link reset password baru
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col w-full max-w-md p-4 gap-2 [&>input]:mb-4">
      <h1 className="text-2xl font-medium">Reset password</h1>
      <p className="text-sm text-foreground/60">
        Please enter your new password below.
      </p>
      <Label htmlFor="password">New password</Label>
      <Input
        type="password"
        name="password"
        placeholder="New password"
        required
      />
      <Label htmlFor="confirmPassword">Confirm password</Label>
      <Input
        type="password"
        name="confirmPassword"
        placeholder="Confirm password"
        required
      />
      <SubmitButton formAction={resetPasswordAction}>
        Reset password
      </SubmitButton>
      <FormMessage message={searchParams} />
    </form>
  );
}
