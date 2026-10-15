"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Field } from "@/components/ui/field";
import { getPasskeyStepUp } from "@/lib/client/passkey-stepup";
import { DialogHeading } from "@/components/ui/dialog-heading";

interface AdminUser {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  emailVerified: number;
  mfaEnabled: number;
  hasPasskey?: boolean;
  plan: string;
  planExpiresAt: string | null;
}

interface EditUserModalProps {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}

export function EditUserModal({
  user,
  open,
  onOpenChange,
  onSave,
}: EditUserModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [emailVerified, setEmailVerified] = useState(user.emailVerified === 1);
  const [role, setRole] = useState(user.role);
  const [plan, setPlan] = useState(user.plan);
  const [planExpiresAt, setPlanExpiresAt] = useState(user.planExpiresAt ? user.planExpiresAt.split("T")[0] : "");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requiresMfaCode, setRequiresMfaCode] = useState(false);

  const handleRoleChange = (newRole: string | null) => {
    if (newRole) setRole(newRole);
  };

  // The server decides whether step-up is needed (acting admin has MFA and the
  // change is role / email / 2FA reset); it answers 403 MFA_REQUIRED and the
  // code field appears. Re-submitting with the code completes the change.
  const handleResetMfa = async () => {
    await handleSubmit(true);
  };

  const handleSubmit = async (resetMfa = false) => {
    setError(null);
    setLoading(true);

    try {
      const updates: Record<string, unknown> = {};
      // Only CHANGED fields are sent. null and "" are the same "empty" value,
      // and an emptied username/email is never sent (the API rejects it).
      if (displayName !== (user.displayName ?? "")) updates.displayName = displayName;
      if (username && username !== (user.username ?? "")) updates.username = username;
      if (email && email !== (user.email ?? "")) updates.email = email;
      if (emailVerified !== (user.emailVerified === 1)) updates.emailVerified = emailVerified;
      if (role !== user.role) updates.role = role;
      if (plan !== user.plan) updates.plan = plan;
      if (planExpiresAt !== (user.planExpiresAt?.split("T")[0] ?? "")) {
        updates.planExpiresAt = planExpiresAt || null;
      }
      if (resetMfa) updates.disableMfa = true;

      if (Object.keys(updates).length === 0 && !resetMfa) {
        setError("No changes made.");
        setLoading(false);
        return;
      }

      if (mfaCode) updates.mfaCode = mfaCode;

      try {
        await onSave(updates);
      } catch (err) {
        // Passkey-only admin: confirm with a passkey assertion and retry once.
        if ((err as { code?: string } | null)?.code !== "PASSKEY_REQUIRED") throw err;
        const step = await getPasskeyStepUp("admin-user-update");
        if (!step.ok) {
          setError(step.code === "cancelled" ? "Passkey confirmation was cancelled." : "Passkey confirmation failed.");
          return;
        }
        await onSave({ ...updates, passkeyStepUp: step.passkeyStepUp });
      }
      setMfaCode("");
      setRequiresMfaCode(false);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update user";
      if ((err as { code?: string } | null)?.code === "MFA_REQUIRED") {
        setRequiresMfaCode(true);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogHeading help={<>Change this account&apos;s profile, role, plan or 2FA. Only the fields you change are saved.</>}>Edit User</DialogHeading>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div
              role="alert"
              id="edit-user-error"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/30"
            >
              <div className="flex gap-2">
                <AlertCircle aria-hidden="true" className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            </div>
          )}

          <Field
            label="Display Name"
            id="displayName"
            aria-describedby={error ? "edit-user-error" : undefined}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            disabled={loading}
          />

          <Field
            label="Username"
            id="username"
            aria-describedby={error ? "edit-user-error" : undefined}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            pattern="[a-z0-9._-]+"
            disabled={loading}
          />

          <Field
            label="Email"
            id="email"
            aria-describedby={error ? "edit-user-error" : undefined}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <Field
            label="Email Verified"
            control="switch"
            id="emailVerified"
            checked={emailVerified}
            onCheckedChange={setEmailVerified}
            disabled={loading}
          />

          <Field
            label="Role"
            control="select"
            value={role}
            onValueChange={handleRoleChange}
            disabled={loading}
            id="role"
            options={[{ value: "user", label: "User" }, { value: "admin", label: "Admin" }]}
          />

          <Field
            label="Plan"
            control="select"
            value={plan}
            onValueChange={(val) => val && setPlan(val)}
            disabled={loading}
            id="plan"
            options={[
              { value: "free", label: "Free" },
              { value: "pro", label: "Pro" },
              { value: "premium", label: "Premium" },
            ]}
          />

          <Field
            label="Plan Expires At"
            control="date"
            id="planExpiresAt"
            value={planExpiresAt}
            onChange={(e) => setPlanExpiresAt(e.target.value)}
            disabled={loading}
          />

          {user.mfaEnabled || user.hasPasskey ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleResetMfa}
              disabled={loading}
              className="w-full"
            >
              Reset 2FA (disable two-factor)
            </Button>
          ) : null}

          {requiresMfaCode && (
            <Field
              label="Your authenticator code (6 digits)"
              id="mfaCode"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby={error ? "edit-user-error" : undefined}
              placeholder="000000"
              disabled={loading}
            />
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => handleSubmit()} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
