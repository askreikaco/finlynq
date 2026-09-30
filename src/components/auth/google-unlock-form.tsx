"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { googleUIStrings, maskEmail } from "@/lib/ui/google-ui";

interface GoogleUnlockFormProps {
  /** Email to display in the prompt (will be masked) */
  email: string;
  /** Callback when unlock is successful */
  onSuccess?: () => void;
  /** Custom redirect URL after success */
  redirectTo?: string;
}

export function GoogleUnlockForm({ email, onSuccess, redirectTo }: GoogleUnlockFormProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryAvailable, setRetryAvailable] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setRetryAvailable(false);

    try {
      const res = await fetch("/api/auth/google/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include", // Include cookies
      });

      if (!res.ok) {
        const data = await res.json();

        if (res.status === 401) {
          // Wrong password
          setError(googleUIStrings.unlockWrongPassword);
          if (data.retry) {
            setRetryAvailable(true);
            setError(
              googleUIStrings.unlockWrongPassword + " " + googleUIStrings.unlockRetryAvailable
            );
          }
        } else if (res.status === 429) {
          // Too many attempts
          setError(googleUIStrings.unlockTooManyAttempts);
        } else {
          setError(data.error || "Unlock failed");
        }
        setLoading(false);
        return;
      }

      const responseData = await res.json();

      // Handle MFA if required
      if (responseData.mfaRequired) {
        // In a full implementation, this would navigate to MFA verification
        // For now, show an error that MFA is required
        setError("MFA verification required (not yet implemented)");
        setLoading(false);
        return;
      }

      // Success - clear password field and redirect or call callback
      setPassword("");
      if (onSuccess) {
        onSuccess();
      } else if (redirectTo) {
        window.location.href = redirectTo;
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setError(googleUIStrings.googleSigninError);
      setLoading(false);
      console.error("Unlock error:", err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{googleUIStrings.unlockHeading}</h2>
        <p className="text-sm text-gray-600 mt-1">{googleUIStrings.unlockDescription}</p>
      </div>

      <div>
        <Label htmlFor="password" className="text-sm">
          {googleUIStrings.unlockPrompt(email)}
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          placeholder="Enter your password"
          autoFocus
          className="mt-1"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={loading || !password}
        className="w-full"
      >
        {loading ? "Unlocking..." : googleUIStrings.unlockButtonLabel}
      </Button>

      {retryAvailable && (
        <p className="text-xs text-gray-500 text-center">
          {googleUIStrings.unlockRetryAvailable}
        </p>
      )}
    </form>
  );
}
