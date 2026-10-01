"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { useStepUp } from "./use-step-up";
import { errorMessage, postJson } from "./api";

/**
 * Deep link /family?token=... (also /family/accept?token=..., the link in the invite email).
 * The token is read ONCE into memory and immediately removed from the address bar with
 * history.replaceState, so it never stays in the URL/history/Referer. It is only ever sent in the
 * JSON body of accept/decline - never logged, never placed in another URL.
 */
export function InviteLinkHandler({ onDone }: { onDone?: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const stepUp = useStepUp();
  const read = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const url = new URL(window.location.href);
    const t = url.searchParams.get("token");
    if (!t) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
  }, []);

  if (!token && !result) return null;

  const act = async (action: "accept" | "decline") => {
    if (!token || busy) return;
    setBusy(action);
    setError(null);
    try {
      const res =
        action === "accept"
          ? await stepUp.execute((currentPassword) =>
              postJson("POST", "/api/family/manage/accept", {
                token,
                ...(currentPassword ? { currentPassword } : {}),
              }),
            )
          : await postJson("POST", "/api/family/manage/decline", { token });
      if (!res) return;
      if (!res.ok) {
        setError(res.status === 410 ? FAMILY_STRINGS.accept_expired : await errorMessage(res, FAMILY_STRINGS.accept_error));
        return;
      }
      setToken(null);
      setResult(action === "accept" ? "accepted" : "declined");
      onDone?.();
    } catch {
      setError(FAMILY_STRINGS.error_network);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <CardHeader>
          <CardTitle className="text-base">{FAMILY_STRINGS.accept_card_title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite" className="space-y-3">
            {result === "accepted" && <Alert><AlertDescription>{FAMILY_STRINGS.accept_success}</AlertDescription></Alert>}
            {result === "declined" && <Alert><AlertDescription>{FAMILY_STRINGS.accept_declined}</AlertDescription></Alert>}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          {!result && (
            <>
              <p className="text-sm">{FAMILY_STRINGS.accept_card_message}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => act("accept")} disabled={busy !== null} className="gap-2">
                  {busy === "accept" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {FAMILY_STRINGS.accept_button}
                </Button>
                <Button variant="outline" onClick={() => act("decline")} disabled={busy !== null} className="gap-2">
                  {busy === "decline" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {FAMILY_STRINGS.decline_button}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {stepUp.dialog}
    </>
  );
}
