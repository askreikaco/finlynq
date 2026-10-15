"use client";

/**
 * /admin/feedback — review queue for user-submitted feedback. Filter by status,
 * change status inline, attach a PRIVATE admin note, and reply to the user via
 * the thread dialog (the reply IS visible to the user; the note is not). Gated
 * server-side by requireAdmin.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Overlay } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { Paperclip, X } from "lucide-react";
import { FeedbackAttachmentView } from "@/components/feedback/attachment-view";
import { validateFeedbackAttachment } from "@/lib/feedback/attachment-policy";
import type { FeedbackMessage, FeedbackThread } from "@shared/types";
import { SectionPage } from "@/components/templates/section-page";
import { Field } from "@/components/ui/field";
import { TW } from "@/lib/design/tokens";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface FeedbackRow {
  id: number;
  userId: string;
  type: string;
  message: string;
  pageUrl: string | null;
  appVersion: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  username: string | null;
  email: string | null;
  replyCount: number;
  adminUnread: boolean;
}

const FILTERS = ["all", "new", "triaged", "resolved"] as const;
type Filter = (typeof FILTERS)[number];
const STATUSES = ["new", "triaged", "resolved"];

const typeColor: Record<string, string> = {
  bug: "bg-destructive/15 text-destructive",
  idea: "bg-primary/15 text-primary",
  question: "bg-info/15 text-info",
  other: "bg-muted text-muted-foreground",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function Bubble({
  side,
  label,
  at,
  body,
}: {
  side: "left" | "right";
  label: string;
  at: string;
  body: string;
}) {
  return (
    <div className={cn("flex flex-col", side === "right" ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
          side === "right" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground",
        )}
      >
        {body}
      </div>
      <span className="mt-1 text-xs text-muted-foreground">
        {label} · {fmt(at)}
      </span>
    </div>
  );
}

function AdminThreadDialog({
  feedbackId,
  onClose,
  onChanged,
}: {
  feedbackId: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [thread, setThread] = useState<FeedbackThread | null>(null);
  const [reply, setReply] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const clearReplyFile = () => {
    setReplyFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickReplyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      clearReplyFile();
      return;
    }
    const check = validateFeedbackAttachment({ filename: f.name, mime: f.type, size: f.size });
    if ("code" in check) {
      setError(check.message);
      clearReplyFile();
      return;
    }
    setReplyFile(f);
  };

  useEffect(() => {
    if (feedbackId == null) {
      setThread(null);
      setReply("");
      setReplyFile(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setThread(null);
    setError(null);
    fetch(`/api/admin/feedback/${feedbackId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((t: FeedbackThread) => {
        if (!cancelled) setThread(t);
        // GET marked admin-read server-side — refresh the list dot.
        onChanged();
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load this thread.");
      });
    return () => {
      cancelled = true;
    };
    // onChanged is stable enough (parent useCallback); intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackId]);

  // Scroll to the bottom of the thread whenever it loads or a new message arrives.
  useEffect(() => {
    if (thread) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
    }
  }, [thread]);

  const send = async () => {
    const body = reply.trim();
    if (!body || feedbackId == null) return;
    setSending(true);
    setError(null);
    try {
      let res: Response;
      if (replyFile) {
        const form = new FormData();
        form.append("body", body);
        form.append("attachment", replyFile);
        res = await fetch(`/api/admin/feedback/${feedbackId}/reply`, {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch(`/api/admin/feedback/${feedbackId}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to send reply.");
      }
      const msg: FeedbackMessage = await res.json();
      setThread((t) =>
        t
          ? {
              ...t,
              messages: [...t.messages, msg],
              messageCount: t.messageCount + 1,
              status: t.status === "new" ? "triaged" : t.status,
            }
          : t,
      );
      setReply("");
      clearReplyFile();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  const who = thread ? thread.username || thread.email || "user" : "";

  return (
    <Overlay
      open={feedbackId != null}
      onClose={onClose}
      title={<span className="capitalize">{thread ? `${thread.type} feedback` : "Feedback"}</span>}
      info={<>{thread ? `From ${who}. ` : ""}Your reply is visible to the user.</>}
    >
        {error && !thread && <p className="text-sm text-destructive">{error}</p>}

        {thread && (
          <>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              <Bubble side="left" label={who} at={thread.createdAt} body={thread.seed} />
              {thread.attachment && feedbackId != null && (
                <FeedbackAttachmentView
                  attachment={thread.attachment}
                  url={`/api/admin/feedback/${feedbackId}/attachment`}
                  align="left"
                />
              )}
              {thread.messages.map((m) => (
                <div key={m.id} className="space-y-1">
                  <Bubble
                    side={m.authorRole === "admin" ? "right" : "left"}
                    label={m.authorRole === "admin" ? "You" : who}
                    at={m.createdAt}
                    body={m.body}
                  />
                  {m.attachment && feedbackId != null && (
                    <FeedbackAttachmentView
                      attachment={m.attachment}
                      url={`/api/admin/feedback/${feedbackId}/attachment?messageId=${m.id}`}
                      align={m.authorRole === "admin" ? "right" : "left"}
                    />
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="space-y-2">
              <Field
                control="textarea"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onPaste={(e) => {
                  const items = Array.from(e.clipboardData?.items ?? []);
                  const imageItem = items.find(
                    (item) => item.kind === "file" && item.type.startsWith("image/"),
                  );
                  if (!imageItem) return; // non-image paste → let browser handle normally
                  const blob = imageItem.getAsFile();
                  if (!blob) return;
                  const pasted = new File(
                    [blob],
                    `screenshot-${Date.now()}.${blob.type.split("/")[1] ?? "png"}`,
                    { type: blob.type },
                  );
                  setError(null);
                  const check = validateFeedbackAttachment({
                    filename: pasted.name,
                    mime: pasted.type,
                    size: pasted.size,
                  });
                  if ("code" in check) {
                    setError(check.message);
                    clearReplyFile();
                    return;
                  }
                  setReplyFile(pasted);
                }}
                rows={3}
                maxLength={4000}
                placeholder="Reply to the user…"
              />
              <input
                ref={fileRef}
                type="file"
                onChange={onPickReplyFile}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                {replyFile ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{replyFile.name}</span>
                    <span className="shrink-0 text-muted-foreground">{fmtBytes(replyFile.size)}</span>
                    <button
                      type="button"
                      onClick={clearReplyFile}
                      aria-label="Remove attachment"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4" /> Attach
                  </Button>
                )}
                <Button className="ml-auto" onClick={send} disabled={sending || !reply.trim()}>
                  {sending ? "Sending…" : "Send reply"}
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </>
        )}
    </Overlay>
  );
}

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/admin/feedback${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRows(data.feedback);
      const seed: Record<number, string> = {};
      for (const r of data.feedback as FeedbackRow[]) seed[r.id] = r.adminNote ?? "";
      setNotes(seed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) load();
  };

  return (
    <SectionPage
      id="admin-feedback"
      title="User feedback"
      width="report"
      center
    >
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            onClick={() => setFilter(f)}
            variant="outline" pressed={filter === f} className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No feedback in this view.</p>
      )}

      <div data-slot="feedback-cards" className={TW.grid3}>
        {rows?.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={typeColor[r.type] ?? typeColor.other}>{r.type}</Badge>
              <Badge variant="outline" className="capitalize">
                {r.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {r.username || r.email || r.userId}
              </span>
              <span className="text-xs text-muted-foreground">
                · {new Date(r.createdAt).toLocaleString()}
              </span>
              {r.appVersion && r.appVersion !== "web" && (
                <span className="text-xs text-muted-foreground">· {r.appVersion}</span>
              )}
              {r.adminUnread && (
                <span
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary"
                  title="New reply from the user"
                >
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  New reply
                </span>
              )}
            </div>

            <p className="mt-2 whitespace-pre-wrap text-sm">{r.message}</p>

            {r.pageUrl && (
              <p className="mt-1 text-xs text-muted-foreground">Page: {r.pageUrl}</p>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border/50 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <Field
                  control="select"
                  value={r.status}
                  onValueChange={(v) => patch(r.id, { status: v })}
                  controlClassName="capitalize"
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setOpenId(r.id)}>
                {r.replyCount > 0
                  ? `View thread (${r.replyCount})`
                  : "Reply to user"}
              </Button>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <Field
                label="Admin note (private — not shown to the user)"
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Admin note…"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch(r.id, { adminNote: notes[r.id] ?? "" })}
              >
                Save note
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <AdminThreadDialog
        feedbackId={openId}
        onClose={() => {
          setOpenId(null);
          load();
        }}
        onChanged={load}
      />
    </SectionPage>
  );
}
