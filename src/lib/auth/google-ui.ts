import { safeReturnTo } from "@/lib/accounts/groups-return-to";

/**
 * Google sign-in UI helpers and strings.
 *
 * Provides error messages, URL helpers, and localized strings for the Google OAuth flow.
 */

const LOCALE = "en";

/**
 * Error message map for all Google sign-in error codes.
 * Each code has English and Vietnamese translations.
 */
export const GOOGLE_ERRORS: Record<string, { en: string; vi: string }> = {
  google_denied: {
    en: "Google sign-in was cancelled.",
    vi: "Đăng nhập bằng Google đã bị hủy.",
  },
  google_server_error: {
    en: "Google sign-in failed. Please try again.",
    vi: "Đăng nhập bằng Google không thành công. Vui lòng thử lại.",
  },
  google_missing_params: {
    en: "Your sign-in session expired. Please try again.",
    vi: "Phiên đăng nhập của bạn đã hết hạn. Vui lòng thử lại.",
  },
  google_no_state: {
    en: "Your sign-in session expired. Please try again.",
    vi: "Phiên đăng nhập của bạn đã hết hạn. Vui lòng thử lại.",
  },
  google_invalid_state: {
    en: "Your sign-in session expired. Please try again.",
    vi: "Phiên đăng nhập của bạn đã hết hạn. Vui lòng thử lại.",
  },
  google_state_mismatch: {
    en: "Your sign-in session expired. Please try again.",
    vi: "Phiên đăng nhập của bạn đã hết hạn. Vui lòng thử lại.",
  },
  google_exchange_failed: {
    en: "Could not verify your Google account. Please try again.",
    vi: "Không thể xác minh tài khoản Google của bạn. Vui lòng thử lại.",
  },
  google_token_invalid: {
    en: "Could not verify your Google account. Please try again.",
    vi: "Không thể xác minh tài khoản Google của bạn. Vui lòng thử lại.",
  },
  google_user_not_found: {
    en: "No account is linked to this Google account. Create one instead.",
    vi: "Không có tài khoản nào được liên kết với tài khoản Google này. Hãy tạo một tài khoản thay thế.",
  },
  google_rate_limit: {
    en: "Too many attempts. Wait a minute and try again.",
    vi: "Quá nhiều lần thử. Chờ một phút và thử lại.",
  },
  google_link_session: {
    en: "Your session changed during linking. Sign in again and retry.",
    vi: "Phiên của bạn đã thay đổi khi liên kết. Đăng nhập lại và thử lại.",
  },
  google_already_linked: {
    en: "That Google account is already linked to another Finlynq account.",
    vi: "Tài khoản Google đó đã được liên kết với tài khoản Finlynq khác.",
  },
};

/**
 * Get the error message for a given Google error code.
 * Falls back to google_server_error text if the code is unknown.
 */
export function googleErrorMessage(code: string): string {
  const messages = GOOGLE_ERRORS[code];
  if (messages) {
    return LOCALE === "en" ? messages.en : messages.vi;
  }
  // Unknown code falls back to generic server error
  const fallback = GOOGLE_ERRORS.google_server_error;
  return LOCALE === "en" ? fallback.en : fallback.vi;
}

/**
 * Validate a redirect URL for safety.
 * Must start with "/", not "//", and contain no backslashes or scheme.
 *
 * @param next The URL to validate
 * @param fallback The URL to return if validation fails (default: "/dashboard")
 * @returns The safe URL or the fallback
 */
export function safeNext(
  next: string | null | undefined,
  fallback: string = "/dashboard"
): string {
  if (!next) return fallback;
  // Browsers strip tab/CR/LF inside URLs ("/\t/evil.com" -> "//evil.com"); safeReturnTo rejects them.
  if (safeReturnTo(next, "") !== next) return fallback;
  return next;
}

/**
 * Build the Google start URL for initiating OAuth flow.
 *
 * @param intent "login" or "link"
 * @param next The redirect URL after sign-in
 * @returns The URL to navigate to (for use in an <a href>)
 */
export function googleStartUrl(intent: string, next: string): string {
  return (
    "/api/auth/google/start?" +
    new URLSearchParams({
      intent,
      next: safeNext(next),
    }).toString()
  );
}

/**
 * UI strings for Google sign-in flows.
 */
export const STRINGS = {
  buttonText: "Continue with Google",
  divider: "or",
  unlockTitle: "Confirm your password",
  unlockHelp: "Enter your Finlynq password once to link Google to your account.",
  registerHint: "Signing up with Google. Choose a username and password; your password encrypts your data.",
} as const;
