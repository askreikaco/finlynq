"use client";

/**
 * /admin/email-inbox — cross-user operator oversight of inbound email-import
 * rows (FINLYNQ-121). The cross-user counterpart to the per-user Email tab
 * (`/import?tab=email`) and a sibling of `/admin/inbox` (incoming_emails).
 * Gated server-side by requireAdmin + managed-mode.
 *
 * METADATA-FIRST by design: from/subject preview is shown ONLY for service-tier
 * rows (operator-decryptable); user-tier rows render a "🔒 user-encrypted"
 * placeholder because an admin cannot decrypt user-DEK content. The per-user
 * panel surfaces the needs_review backlog + unparseable rate across all users.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { List, Lock, RefreshCw, Users } from "lucide-react";
import { ListRow, SectionCard } from "@/components/mobile";
import { SectionPage } from "@/components/templates";

interface ByUser {
  userId: string;
  username: string | null;
  email: string | null;
  total: number;
  needsReview: number;
  unparseable: number;
  unparseableRate: number;
}

interface InboxRow {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  encryptionTier: string | null;
  fromAddress: string | null;
  subject: string | null;
  redacted: boolean;
  action: string;
  sourceKind: string;
  parseConfidence: string | null;
  receivedAt: string;
  messageId: string | null;
  matchedRuleId: number | null;
  recordedTransactionId: number | null;
}

interface ApiResponse {
  rows: InboxRow[];
  byUser: ByUser[];
  total: number;
  limit: number;
  offset: number;
}

const ACTIONS = [
  "all",
  "needs_review",
  "unparseable",
  "auto_recorded",
  "manually_recorded",
  "duplicate_skipped",
  "discarded",
  "pending",
] as const;
type ActionFilter = (typeof ACTIONS)[number];

const SOURCE_KINDS = ["all", "body", "attachment"] as const;
type SourceFilter = (typeof SOURCE_KINDS)[number];

const actionColor: Record<string, string> = {
  needs_review: "bg-warning/15 text-warning border-warning/30",
  unparseable: "bg-destructive/15 text-destructive",
  auto_recorded: "bg-pos/15 text-pos",
  manually_recorded: "bg-pos/15 text-pos",
  duplicate_skipped: "bg-muted text-muted-foreground",
  discarded: "bg-muted text-muted-foreground",
  pending: "bg-info/15 text-info",
};

function who(u: { username: string | null; email: string | null; userId: string }): string {
  return u.username || u.email || u.userId;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function AdminEmailInboxPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionFilter>("all");
  const [sourceKind, setSourceKind] = useState<SourceFilter>("all");
  const [userId, setUserId] = useState<string>("");
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (action !== "all") p.set("action", action);
      if (sourceKind !== "all") p.set("sourceKind", sourceKind);
      if (userId) p.set("userId", userId);
      if (since) p.set("since", since);
      if (until) p.set("until", until);
      const qs = p.toString();
      const res = await fetch(`/api/admin/email-inbox${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [action, sourceKind, userId, since, until]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedUserLabel = useMemo(() => {
    if (!userId || !data) return null;
    const u = data.byUser.find((g) => g.userId === userId);
    return u ? who(u) : userId;
  }, [userId, data]);

  return (
    <SectionPage
      id="admin-email-inbox"
      title="Email Oversight"
      width="report"
      center
      header={{
        actions: (
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        ),
      }}
    >
      <p className="text-sm text-muted-foreground mt-0.5">
        Cross-user view of inbound email-import rows. Metadata is always
        shown; from/subject preview is available only for service-tier rows
        (before the owner&apos;s next login). User-tier content is encrypted
        with the owner&apos;s key and cannot be read here.
      </p>

      {error && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* ─── Per-user grouped counts ──────────────────────────────────────── */}
      <SectionCard
        label="By user" icon={Users} tone="indigo"
        padded={false}
        className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]"
      >
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          Counts honor the action / source / date filters (not the selected user).
        </p>
        {data?.byUser.map((g) => (
          <ListRow
            key={g.userId}
            title={who(g)}
            subtitle={`${g.total} total · ${g.needsReview} need review · ${g.unparseable} unparseable (${(g.unparseableRate * 100).toFixed(0)}%)`}
            value={
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setUserId(userId === g.userId ? "" : g.userId)}
              >
                {userId === g.userId ? "Clear" : "Filter"}
              </Button>
            }
            className={userId === g.userId ? "bg-primary/5" : undefined}
          />
        ))}
        {data && data.byUser.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No email-import rows match these filters.
          </p>
        )}
      </SectionCard>

      {/* ─── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`rounded-md border px-2.5 py-1 text-xs capitalize transition-colors ${
                action === a
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {a.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {SOURCE_KINDS.map((s) => (
            <button
              key={s}
              onClick={() => setSourceKind(s)}
              className={`rounded-md border px-2.5 py-1 text-xs capitalize transition-colors ${
                sourceKind === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        {selectedUserLabel && (
          <Badge variant="outline" className="gap-1">
            user: {selectedUserLabel}
            <button className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => setUserId("")}>
              ×
            </button>
          </Badge>
        )}
      </div>

      {/* ─── Rows ─────────────────────────────────────────────────────────── */}
      <SectionCard label="Rows" icon={List} tone="muted" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
        {loading && !data && (
          <p className="p-6 text-sm text-muted-foreground text-center">Loading…</p>
        )}
        {data && data.rows.length === 0 && (
          <p className="p-8 text-sm text-muted-foreground text-center">No rows match these filters.</p>
        )}
        {data && data.rows.map((r) => (
          <div key={r.id} className="py-1">
            <ListRow
              title={who(r)}
              subtitle={
                r.redacted ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Lock className="h-3 w-3" /> user-encrypted
                  </span>
                ) : r.fromAddress || r.subject ? (
                  <>
                    <span className="font-mono">{r.fromAddress || "—"}</span>
                    {" · "}
                    {r.subject || <span className="italic">(no subject)</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
              value={
                <Badge
                  variant="outline"
                  className={`text-xs ${actionColor[r.action] ?? "bg-muted text-muted-foreground"}`}
                >
                  {r.action.replace(/_/g, " ")}
                </Badge>
              }
              secondary={fmt(r.receivedAt)}
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-2 text-xs text-muted-foreground">
              <span>Source {r.sourceKind}</span>
              <span>Confidence {r.parseConfidence ?? "—"}</span>
              <span>Tier {r.encryptionTier ?? "service"}</span>
              <span className="font-mono">Rule {r.matchedRuleId ?? "—"}</span>
              <span className="font-mono">Txn {r.recordedTransactionId ?? "—"}</span>
            </div>
          </div>
        ))}
      </SectionCard>
    </SectionPage>
  );
}
