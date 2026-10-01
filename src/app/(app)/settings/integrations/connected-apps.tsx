"use client";

/**
 * Connected apps — per-user OAuth grant list + revoke (FINLYNQ-154).
 *
 * Lists the live OAuth grants the user has authorized (MCP clients like Claude
 * / ChatGPT). Each row shows the client name, scope, and when it was connected,
 * with a Revoke button that kills the WHOLE grant (access + refresh) so the app
 * can no longer reach the user's data.
 *
 * Follows the settings-page convention: bespoke fetch/useState/useEffect (no
 * SWR), shared ConfirmDialog for the destructive confirm, parseSaveError for
 * failed mutations.
 */

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateTimeLocal } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import { Plug, Loader2 } from "lucide-react";

interface ConnectedApp {
  id: number;
  clientId: string;
  clientName: string;
  scope: string;
  createdAt: string;
  expiresAt: string;
}

interface ConnectedAppsData {
  apps: ConnectedApp[];
  mcpApiKeyLastUsedAt: string | null;
}

function formatDate(iso: string): string {
  return formatDateTimeLocal(iso) || iso;
}

function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
}

export function ConnectedApps() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [mcpApiKeyLastUsedAt, setMcpApiKeyLastUsedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/settings/connected-apps");
      if (!res.ok) {
        setLoadError(await parseSaveError(res, "Failed to load connected apps"));
        setApps([]);
        setMcpApiKeyLastUsedAt(null);
        return;
      }
      const data: ConnectedAppsData = await res.json();
      setApps(Array.isArray(data.apps) ? data.apps : []);
      setMcpApiKeyLastUsedAt(data.mcpApiKeyLastUsedAt || null);
    } catch {
      setLoadError("Failed to load connected apps");
      setApps([]);
      setMcpApiKeyLastUsedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revokeTarget = apps.find((a) => a.id === revokeId) ?? null;

  async function handleRevoke() {
    if (revokeId == null) return;
    setRevoking(true);
    setRevokeError("");
    try {
      const res = await fetch(`/api/settings/connected-apps?id=${revokeId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setRevokeError(await parseSaveError(res, "Failed to revoke access"));
        return;
      }
      // Optimistically drop the row, then close the dialog.
      setApps((prev) => prev.filter((a) => a.id !== revokeId));
      setRevokeId(null);
    } catch {
      setRevokeError("Failed to revoke access");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Connected apps</CardTitle>
            <CardDescription>AI assistants and other apps you&apos;ve authorized to access your data over OAuth. Connections you don&apos;t use are automatically removed after 60 days; you can also revoke them anytime.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </div>
        ) : apps.length === 0 && !mcpApiKeyLastUsedAt ? (
          <p className="text-sm text-muted-foreground">
            No connected apps. When you authorize an AI assistant (like Claude or ChatGPT) to
            access your data over OAuth, it will appear here so you can revoke it any time.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border">
            {mcpApiKeyLastUsedAt && (
              <li key="mcp-api-key" className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">MCP client (API key)</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      Last used {formatRelativeTime(mcpApiKeyLastUsedAt)}
                    </span>
                  </div>
                </div>
                <Link href="/settings/developer">
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                  >
                    Manage API key
                  </Button>
                </Link>
              </li>
            )}
            {apps.map((app) => (
              <li key={app.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{app.clientName}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs font-mono">{app.scope}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Connected {formatDate(app.createdAt)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => { setRevokeError(""); setRevokeId(app.id); }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        {revokeError && (
          <p className="text-sm text-destructive">{revokeError}</p>
        )}
      </CardContent>

      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(open) => { if (!open) { setRevokeId(null); setRevokeError(""); } }}
        title="Revoke access"
        description={
          <>
            Revoke access for <span className="font-medium text-foreground">{revokeTarget?.clientName ?? "this app"}</span>?
            It will no longer be able to read or change your data. Any active session is cut off immediately and
            it would need to be re-authorized to reconnect.
          </>
        }
        confirmLabel="Revoke"
        busyLabel="Revoking…"
        busy={revoking}
        onConfirm={handleRevoke}
      />
    </Card>
  );
}
