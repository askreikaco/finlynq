"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

interface AdminUser {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  emailVerified: number;
  mfaEnabled: number;
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

      await onSave(updates);
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
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Change this account&apos;s profile, role, plan or 2FA. Only the fields you change are saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div
              role="alert"
              id="edit-user-error"
              className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200"
            >
              <div className="flex gap-2">
                <AlertCircle aria-hidden="true" className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              aria-describedby={error ? "edit-user-error" : undefined}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              aria-describedby={error ? "edit-user-error" : undefined}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              pattern="[a-z0-9._-]+"
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              aria-describedby={error ? "edit-user-error" : undefined}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="emailVerified"
              type="checkbox"
              checked={emailVerified}
              onChange={(e) => setEmailVerified(e.target.checked)}
              disabled={loading}
              className="h-4 w-4"
            />
            <Label htmlFor="emailVerified">Email Verified</Label>
          </div>

          <div>
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={handleRoleChange} disabled={loading}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="plan">Plan</Label>
            <Select value={plan} onValueChange={(val) => val && setPlan(val)} disabled={loading}>
              <SelectTrigger id="plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="planExpiresAt">Plan Expires At</Label>
            <Input
              id="planExpiresAt"
              type="date"
              value={planExpiresAt}
              onChange={(e) => setPlanExpiresAt(e.target.value)}
              disabled={loading}
            />
          </div>

          {user.mfaEnabled ? (
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
            <div>
              <Label htmlFor="mfaCode">Your authenticator code (6 digits)</Label>
              <Input
                id="mfaCode"
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-describedby={error ? "edit-user-error" : undefined}
                placeholder="000000"
                disabled={loading}
              />
            </div>
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
