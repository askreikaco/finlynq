"use client";

/**
 * /admin/inbox — admin triage for non-import emails. One column: the list of emails; tap one to open its conversation in a bottom sheet.
 *
 * List: Mailbox / Trash tabs. The selected email's full
 * CONVERSATION — their inbound messages + our sent replies (from
 * /api/admin/inbox/[id]/thread) — plus a reply box. Replying sends via the
 * Resend transport from the mailbox address and is persisted, so the thread
 * shows the back-and-forth.
 *
 * SECURITY: inbound body HTML is attacker-controlled. Render it ONLY in a
 * sandboxed iframe with `srcDoc` + `sandbox="allow-same-origin"` (no scripts,
 * no forms, no top-nav). Never dangerouslySetInnerHTML it into the main DOM.
 * Our own outbound replies + plaintext bodies render as escaped text.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Inbox,
  Trash2,
  RefreshCw,
  ArrowUpFromLine,
  CheckCircle2,
  Send,
  X,
} from "lucide-react";
import { SectionPage } from "@/components/templates/section-page";
import { ListRow, SectionCard } from "@/components/mobile";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface InboxRow {
  id: string;
  category: "mailbox" | "trash";
  toAddress: string;
  fromAddress: string;
  subject: string | null;
  bodyText: string | null;
  attachmentCount: number;
  receivedAt: string;
  expiresAt: string | null;
  triagedAt: string | null;
}

interface ThreadMessage {
  kind: "inbound" | "outbound";
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  at: string;
}

interface Thread {
  id: string;
  category: "mailbox" | "trash";
  subject: string | null;
  counterparty: string;
  triagedAt: string | null;
  messages: ThreadMessage[];
}

function hoursUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Wrap untrusted HTML for a sandboxed iframe (no scripts run under sandbox). */
function htmlSrcDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:12px;color:#111">${html}</body></html>`;
}

function MessageBody({ m }: { m: ThreadMessage }) {
  const text = (m.bodyText || "").trim();
  if (text) {
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed m-0">
        {text}
      </pre>
    );
  }
  if (m.bodyHtml) {
    return (
      <iframe
        title="Email body"
        sandbox="allow-same-origin"
        srcDoc={htmlSrcDoc(m.bodyHtml)}
        className="w-full h-[320px] rounded border bg-white"
      />
    );
  }
  return <p className="text-sm text-muted-foreground">(no body content)</p>;
}

export default function AdminInboxPage() {
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<"mailbox" | "trash">("mailbox");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [acting, setActing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inbox?category=${category}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/inbox/${id}/thread`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load thread");
    return data as Thread;
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setThread(null);
      setThreadLoading(true);
      setReplyText("");
      setReplyError(null);
      try {
        setThread(await fetchThread(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load thread");
        setSelectedId(null);
      } finally {
        setThreadLoading(false);
      }
    },
    [fetchThread],
  );

  const closeThread = () => {
    setSelectedId(null);
    setThread(null);
    setReplyText("");
    setReplyError(null);
  };

  const sendReply = useCallback(async () => {
    if (!selectedId) return;
    const body = replyText.trim();
    if (!body) return;
    setSending(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/admin/inbox/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send reply");
      setReplyText("");
      setThread(await fetchThread(selectedId));
      load();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }, [selectedId, replyText, fetchThread, load]);

  const markTriaged = useCallback(async () => {
    if (!selectedId) return;
    setActing(true);
    try {
      await fetch(`/api/admin/inbox/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "triage" }),
      });
      setThread((t) => (t ? { ...t, triagedAt: new Date().toISOString() } : t));
      load();
    } finally {
      setActing(false);
    }
  }, [selectedId, load]);

  const promote = useCallback(async () => {
    if (!selectedId) return;
    setActing(true);
    try {
      await fetch(`/api/admin/inbox/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote-to-mailbox" }),
      });
      closeThread();
      load();
    } finally {
      setActing(false);
    }
  }, [selectedId, load]);

  const remove = useCallback(async () => {
    if (!selectedId) return;
    if (!confirm("Delete this email permanently?")) return;
    setActing(true);
    try {
      await fetch(`/api/admin/inbox/${selectedId}`, { method: "DELETE" });
      closeThread();
      load();
    } finally {
      setActing(false);
    }
  }, [selectedId, load]);

  return (
    <SectionPage
      id="admin-inbox"
      title="Admin Inbox"
      info="Non-import email routed to this app. Trash auto-deletes after 24 hours."
      width="report"
      center
      header={{
        more: [{ label: "Refresh", icon: RefreshCw, onSelect: load, disabled: loading }],
      }}
    >
      {error && (
        <SectionCard className="border-destructive/30 bg-destructive/10 py-3 text-sm text-destructive">{error}</SectionCard>
      )}

      {/* ─── List (one column at every width) ─── */}
      <SectionCard padded={false}>
        <Tabs value={category} onValueChange={(v) => setCategory(v as "mailbox" | "trash")}>
          <div className="border-b px-3 pt-3">
            <TabsList>
              <TabsTrigger value="mailbox"><Inbox className="h-4 w-4 mr-1.5" />Mailbox</TabsTrigger>
              <TabsTrigger value="trash"><Trash2 className="h-4 w-4 mr-1.5" />Trash</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
        <div>
          {loading && !rows && (
            <p className="p-6 text-sm text-muted-foreground text-center">Loading…</p>
          )}
          {rows && rows.length === 0 && (
            <p className="p-8 text-sm text-muted-foreground text-center">No {category} messages.</p>
          )}
          {rows && rows.length > 0 && (
            <ul className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] px-3">
              {rows.map((r) => (
                <li key={r.id}>
                  <ListRow
                    title={
                      <span className={`font-mono text-xs ${r.triagedAt ? "font-normal text-muted-foreground" : "font-semibold"}`}>
                        {r.fromAddress}
                      </span>
                    }
                    subtitle={
                      <>
                        {r.subject || "(no subject)"} · → {r.toAddress}
                        {r.attachmentCount > 0 ? ` · 📎 ${r.attachmentCount}` : ""}
                      </>
                    }
                    value={!r.triagedAt ? <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs px-1 py-0">new</Badge> : undefined}
                    secondary={
                      category === "trash" && r.expiresAt
                        ? `${fmtTime(r.receivedAt)} · ${hoursUntil(r.expiresAt)}h left`
                        : fmtTime(r.receivedAt)
                    }
                    onPress={() => openThread(r.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      {/* ─── Conversation (tap a row) ─── */}
      <Sheet open={selectedId !== null} onOpenChange={(open) => { if (!open) closeThread(); }}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl p-0 pb-[var(--sab)]">
          <SheetHeader className="border-b px-4 py-3 pr-12">
            <SheetTitle className="truncate text-base">{thread ? thread.subject || "(no subject)" : "Email"}</SheetTitle>
            <SheetDescription className="truncate font-mono text-xs">{thread?.counterparty ?? ""}</SheetDescription>
          </SheetHeader>

          {selectedId && threadLoading && !thread && (
            <p className="p-6 text-sm text-muted-foreground">Loading conversation…</p>
          )}

          {selectedId && thread && (
            <div className="flex flex-col">
              {/* Actions */}
              <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-3">
                {!thread.triagedAt && (
                  <Button variant="outline" size="sm" onClick={markTriaged} disabled={acting}>
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />Triage
                  </Button>
                )}
                {thread.category === "trash" && (
                  <Button variant="outline" size="sm" onClick={promote} disabled={acting}>
                    <ArrowUpFromLine className="h-4 w-4 mr-1.5" />Keep
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={remove}
                  aria-label="Delete email"
                  disabled={acting}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={closeThread} aria-label="Close thread" className="ml-auto">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Conversation */}
              <div className="space-y-3 px-4 py-3">
                {thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 ${m.kind === "outbound" ? "bg-primary/10 border-primary/30 ml-6" : "bg-muted/40 mr-6"}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-mono truncate">
                        {m.kind === "outbound" ? (
                          <><span className="font-semibold text-primary">You</span> · {m.fromAddress}</>
                        ) : (
                          m.fromAddress
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtTime(m.at)}</span>
                    </div>
                    <MessageBody m={m} />
                  </div>
                ))}
              </div>

              {/* Reply box */}
              {thread.category === "mailbox" && (
                <div className="border-t px-4 py-3 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Reply to <span className="font-mono">{thread.counterparty}</span>
                  </label>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    maxLength={50000}
                    placeholder="Write your reply…"
                    disabled={sending}
                    className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                  />
                  {replyError && <p className="text-xs text-destructive">{replyError}</p>}
                  <div className="flex justify-end">
                    <Button size="sm" onClick={sendReply} disabled={sending || !replyText.trim()}>
                      <Send className={`h-4 w-4 mr-1.5 ${sending ? "animate-pulse" : ""}`} />
                      {sending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </SectionPage>
  );
}
