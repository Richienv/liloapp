import { redirect } from "next/navigation";

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @param {Record<string, string | null | undefined>} [extraParams] - Extra query
 *   params to carry through the redirect. Used to hand a form back the values the
 *   user already typed: a failed sign-in that clears the email field makes the
 *   user retype it to find out the password was the wrong part. Empty and
 *   nullish values are dropped so the URL never grows `?email=`.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: "error" | "success",
  path: string,
  message: string,
  extraParams?: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams();
  params.set(type, message);

  for (const [key, value] of Object.entries(extraParams ?? {})) {
    if (value) params.set(key, value);
  }

  return redirect(`${path}?${params.toString()}`);
}
