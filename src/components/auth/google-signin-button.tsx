"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { googleUIStrings } from "@/lib/ui/google-ui";

type GoogleSigninIntent = "login" | "link";

interface GoogleSigninButtonProps {
  /** "login" for sign-in flow, "link" for linking to existing account */
  intent: GoogleSigninIntent;
  /** Optional redirect after successful Google auth */
  next?: string;
  /** CSS class names */
  className?: string;
}

export function GoogleSigninButton({ intent, next, className }: GoogleSigninButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    setError("");
    setLoading(true);

    try {
      // Build the start URL with intent and optional redirect
      const params = new URLSearchParams({ intent });
      if (next) {
        params.set("next", next);
      }

      // Call the Google start endpoint which will redirect to Google
      const response = await fetch(`/api/auth/google/start?${params}`, {
        method: "GET",
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || googleUIStrings.googleSigninError);
        setLoading(false);
        return;
      }

      // The start endpoint redirects to Google, so this response should be a redirect
      // The browser will handle the navigation
      window.location.href = response.url;
    } catch (err) {
      setError(googleUIStrings.googleSigninError);
      setLoading(false);
      console.error("Google sign-in error:", err);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        className={className}
        variant="outline"
        type="button"
      >
        {loading ? "Loading..." : googleUIStrings.googleButtonLabel}
      </Button>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
