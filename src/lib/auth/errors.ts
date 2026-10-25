/**
 * Maps Supabase Auth error codes to user-facing copy. Messages never confirm whether an email
 * address has an account, and never echo raw server errors.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don’t match. Check them and try again.",
  email_not_confirmed: "Confirm your email first — open the link we sent when you signed up.",
  user_already_exists:
    "We couldn’t create that account. If you already have one, sign in or reset your password.",
  email_exists:
    "We couldn’t create that account. If you already have one, sign in or reset your password.",
  weak_password: "Choose a stronger password — longer, and not a common one.",
  same_password: "Choose a password you haven’t used for this account before.",
  over_email_send_rate_limit: "Too many emails were requested. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
  signup_disabled: "New sign-ups are turned off for this PocketPulse project.",
  email_address_invalid: "That email address can’t be used. Try another one.",
  session_not_found: "Your reset link has expired or was already used. Request a new one.",
  otp_expired: "That link has expired. Request a new one.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong talking to the sign-in service. Try again.";

export function authErrorMessage(error: { code?: string | undefined; status?: number } | null) {
  if (!error) return GENERIC_AUTH_ERROR;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error.status === 429) return MESSAGES.over_request_rate_limit!;
  return GENERIC_AUTH_ERROR;
}
