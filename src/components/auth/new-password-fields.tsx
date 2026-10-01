"use client";

/**
 * New-password + confirm fields shared by the account-recovery flows
 * (passkey, this device, recovery code). Controlled; the parent owns the
 * values and decides when the form is submittable (see isNewPasswordValid).
 */

export const NEW_PASSWORD_MIN = 12;

export const AUTH_INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function isNewPasswordValid(password: string, confirm: string): boolean {
  return password.length >= NEW_PASSWORD_MIN && password === confirm;
}

export function NewPasswordFields({
  idPrefix,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
}: {
  idPrefix: string;
  password: string;
  confirm: string;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
}) {
  const mismatch = confirm.length > 0 && password !== confirm;
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-new-password`} className="mb-1.5 block text-sm font-medium text-foreground">
          New password
        </label>
        <input
          id={`${idPrefix}-new-password`}
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="At least 12 characters"
          autoComplete="new-password"
          minLength={NEW_PASSWORD_MIN}
          required
          className={AUTH_INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-confirm-password`} className="mb-1.5 block text-sm font-medium text-foreground">
          Confirm new password
        </label>
        <input
          id={`${idPrefix}-confirm-password`}
          type="password"
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          autoComplete="new-password"
          required
          aria-invalid={mismatch}
          className={AUTH_INPUT_CLASS}
        />
        {mismatch && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            Passwords do not match.
          </p>
        )}
      </div>
    </div>
  );
}
