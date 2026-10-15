"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import {
  setAnalyticsConsent,
  getAnalyticsConsent,
} from "@/components/analytics-consent";

type ConsentState = "accepted" | "declined" | "unset";

export function ConsentControls() {
  const [consent, setConsent] = useState<ConsentState>("unset");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setConsent(getAnalyticsConsent());
    const onChange = () => setConsent(getAnalyticsConsent());
    window.addEventListener("finlynq:analytics-consent", onChange);
    return () => {
      window.removeEventListener("finlynq:analytics-consent", onChange);
    };
  }, []);

  if (!hydrated) {
    return (
      <div className="my-4 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-lg border border-border bg-card p-4">
      <p className="text-sm mb-3">
        Current choice:{" "}
        <strong>
          {consent === "accepted"
            ? "Accepted"
            : consent === "declined"
              ? "Declined"
              : "Not yet decided"}
        </strong>
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          onClick={() => setAnalyticsConsent("accepted")}
          variant="outline"
        >
          Accept analytics
        </Button>
        <Button
          type="button"
          onClick={() => setAnalyticsConsent("declined")}
          variant="outline"
        >
          Decline analytics
        </Button>
      </div>
    </div>
  );
}
