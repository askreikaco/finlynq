/**
 * google-ui.ts — String constants for Google sign-in UI
 * Handles: email masking, prompt texts, status messages
 */

/**
 * Mask email for security: show first character + asterisks + domain
 * Examples:
 *   user@example.com → u***@example.com
 *   alice@domain.co.uk → a****@domain.co.uk
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;

  const firstChar = localPart[0];
  const asterisks = "*".repeat(Math.max(1, localPart.length - 1));
  return `${firstChar}${asterisks}@${domain}`;
}

/**
 * UI strings for Google sign-in flows
 */
export const googleUIStrings = {
  // Google onboarding flow (first-time signup via Google)
  signupHeading: "Sign up with Google",
  signupDescription: "Create a new Finlynq account using your Google account.",

  // Google password unlock flow (existing account, re-login via Google → password entry)
  unlockHeading: "Unlock your account",
  unlockDescription: "Enter your password to complete the sign-in process.",
  unlockPrompt: (email: string) => `Password for ${maskEmail(email)}`,
  unlockButtonLabel: "Unlock",
  unlockWrongPassword: "Incorrect password. Please try again.",
  unlockRetryAvailable: "You can try again.",
  unlockTooManyAttempts: "Too many failed attempts. Please wait 15 minutes before trying again.",

  // Settings: Google account linking page
  googleLinkingHeading: "Google Account",
  googleNotLinked: "Not linked",
  googleLinked: (email: string) => `Linked to ${email}`,
  googleLinkButton: "Link Google account",
  googleUnlinkButton: "Unlink Google account",
  googleUnlinkConfirm: "Are you sure? You won't be able to sign in with Google until you link another account.",

  // Settings: Trusted devices page
  devicesHeading: "Trusted Devices",
  devicesDescription: "Devices where you don't need to enter a password when signing in with Google.",
  noDevices: "No trusted devices yet.",
  deviceCurrent: "This device",
  deviceRevoke: "Revoke",
  deviceRevokeConfirm: "Remove this trusted device?",
  deviceRevokeAll: "Revoke all devices",
  deviceRevokeAllConfirm: "Remove all trusted devices? You'll need to enter your password next time you sign in with Google on any device.",

  // Google button for login/signup
  googleButtonLabel: "Continue with Google",
  googleSigninError: "Google sign-in failed. Please try again.",
  googleCancelled: "Google sign-in cancelled.",

  // Error messages
  errorEmailMissing: "Email not found in Google account.",
  errorAccountMismatch: "This Google account is linked to a different Finlynq account.",
  errorNoPassword: "Your account doesn't have a password set. Please set a password first.",
  errorSessionRequired: "Please sign in again to complete this action.",
};
