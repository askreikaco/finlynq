"use client";

/**
 * New-password + confirm fields shared by the account-recovery flows
 * (passkey, this device, recovery code). Controlled; the parent owns the
 * values and decides when the form is submittable (see isNewPasswordValid).
 */

import { Field } from "@/components/ui/field";

export const NEW_PASSWORD_MIN = 12;

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
      <Field
        label="New password"
        id={`${idPrefix}-new-password`}
        type="password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        placeholder="At least 12 characters"
        autoComplete="new-password"
        minLength={NEW_PASSWORD_MIN}
        required
      />
      <Field
        label="Confirm new password"
        id={`${idPrefix}-confirm-password`}
        type="password"
        value={confirm}
        onChange={(e) => onConfirmChange(e.target.value)}
        autoComplete="new-password"
        required
        error={mismatch ? "Passwords do not match." : undefined}
      />
    </div>
  );
}
