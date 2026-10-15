"use client";

/**
 * Data feeds of the self-fetching notices (`<Notice source="..." />`): newest pinned announcement, unresolved
 * currency audit, passkey lock, reporting recompute progress and the per-page onboarding tips. Each feed only turns
 * its data into Notice props; the markup is Notice's own (body.tsx).
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lightbulb, Loader2, Megaphone, AlertTriangle } from "lucide-react";
import type { Announcement } from "@shared/types";
import { useHidePageFab } from "@/components/mobile/page-fab";
import { useAppSizeClass } from "@/components/adaptive";
import { usePasskeyLock } from "@/lib/data/passkey-unlock";
import { NoticeBody, PersistedNoticeBody } from "./body";
import type { NoticeItem, NoticeSource } from "./types";

// ── Announcement (server-side read state, GET /api/announcements) ───

function AnnouncementFeed() {
  const [item, setItem] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Announcement[]) => {
        if (cancelled || !Array.isArray(list)) return;
        // Newest unread pinned item (the API sorts pinned-first, then by publish/created date).
        setItem(list.find((a) => a.pinned && !a.read) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    if (!item) return;
    const id = item.id;
    setItem(null);
    fetch(`/api/announcements/${id}/read`, { method: "POST" }).catch(() => {});
  };

  useHidePageFab(item !== null);
  if (!item) return null;

  const warning = item.severity === "warning";
  return (
    <NoticeBody
      variant="card"
      placement="bottom-start"
      tone={warning ? "warning" : "info"}
      icon={warning ? AlertTriangle : Megaphone}
      title={item.title}
      action={{ label: "What's new", href: "/whats-new", onClick: dismiss }}
      secondaryAction={{ label: "Dismiss", onClick: dismiss }}
      dismissible
      dismissLabel="Dismiss announcement"
      onDismiss={dismiss}
    >
      <span className="line-clamp-3 whitespace-pre-wrap">{item.body}</span>
    </NoticeBody>
  );
}

// ── Currency audit (refreshes on `currency-audit-changed`) ──────────

function CurrencyAuditFeed() {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/transactions/audit")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.unresolvedCount === "number") setCount(d.unresolvedCount);
        else setCount(0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("currency-audit-changed", handler);
    return () => window.removeEventListener("currency-audit-changed", handler);
  }, [refresh]);

  if (!count) return null;
  return (
    <NoticeBody variant="banner" tone="warning" href="/transactions/audit" role="none">
      <strong className="font-semibold">{count} transaction{count === 1 ? "" : "s"}</strong> need a currency review.{" "}
      <span className="text-muted-foreground transition-colors group-hover:text-foreground">Review →</span>
    </NoticeBody>
  );
}

// ── Passkey lock (shown only when enrolled AND this page is locked) ─

function PasskeyLockFeed() {
  const { enabled, locked, unlock } = usePasskeyLock();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!enabled || !locked) return null;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  const onUnlock = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await unlock();
      if (!r.ok) setNote(r.code === "cancelled" ? "Cancelled." : "Could not unlock. Try again.");
    } catch {
      setNote("Could not unlock. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <NoticeBody
      variant="banner"
      placement="top"
      pill
      icon={null}
      role="status"
      testId="passkey-lock-banner"
      action={{ label: busy ? "Waiting for passkey…" : "Unlock", tone: "outline", disabled: busy, onClick: () => void onUnlock(), testId: "passkey-lock-unlock" }}
    >
      <span>Offline data locked: use your passkey</span>
      {offline && <span className="text-xs text-muted-foreground" data-testid="passkey-lock-offline">Use your passkey to queue changes offline.</span>}
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </NoticeBody>
  );
}

// ── Reporting recompute progress (polls the status row) ─────────────

type RecomputeView = { running: boolean; target: string; done: number; total: number } | null;

const DONE_FLASH_MS = 8000;
const IDLE_POLL_MS = 5000; // catch a job within ~5s of it starting (any source)
const RUN_POLL_MS = 1500; // tighter cadence while a job is in flight / flashing done

function RecomputeFeed() {
  const [view, setView] = useState<RecomputeView>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Self-scheduling poll; continuous (cheap single-row read) so it reliably catches a recompute whichever page or
    // source kicked it (dashboard/reports self-heal, a Settings currency switch). A hoisted function declaration so it can
    // re-schedule itself (a self-referencing useCallback trips the React Compiler TDZ rule).
    async function poll() {
      let next = IDLE_POLL_MS;
      try {
        const res = await fetch("/api/settings/reporting-currency/status");
        if (!alive) return;
        if (res.ok) {
          const s = await res.json();
          const now = Date.now();
          const started = s.startedAt ? Date.parse(s.startedAt) : 0;
          const finishedAt = s.finishedAt ? Date.parse(s.finishedAt) : 0;
          const running = s.inFlight === true || (!s.finished && started > 0 && now - started < 5 * 60 * 1000);
          const recentlyDone = !!s.finished && finishedAt > 0 && now - finishedAt < DONE_FLASH_MS;
          const target = s.targetCurrency ?? "";

          if (running) {
            setView({ running: true, target, done: s.done ?? 0, total: s.total ?? 0 });
            next = RUN_POLL_MS;
          } else if (recentlyDone) {
            setView({ running: false, target, done: s.done ?? 0, total: s.total ?? 0 });
            next = RUN_POLL_MS;
          } else {
            setView(null);
          }
        }
      } catch {
        /* keep polling at idle cadence */
      }
      if (alive) timer = setTimeout(poll, next);
    }

    poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!view) return null;
  return (
    <NoticeBody
      variant="banner"
      placement="bottom-end"
      pill
      role="status"
      tone={view.running ? "warning" : "success"}
      icon={view.running ? Loader2 : CheckCircle2}
      iconSpin={view.running}
    >
      {view.running ? (
        <span>
          Recalculating reports{view.target ? ` in ${view.target}` : ""}
          {view.total > 0 ? ` (${view.done}/${view.total})` : "…"}
        </span>
      ) : (
        <span>Reports updated{view.target ? ` to ${view.target}` : ""}</span>
      )}
    </NoticeBody>
  );
}

// ── Onboarding tips (dismissed ids stored per user) ─────────────────

export type TipsPage = "dashboard" | "transactions" | "budgets" | "accounts" | "import";

const TIPS_BY_PAGE: Record<TipsPage, NoticeItem[]> = {
  dashboard: [
    {
      id: "dash-overview",
      title: "This is your financial overview",
      body: "Your dashboard shows your net worth, income vs. spending, and alerts at a glance. Cards link to detailed pages.",
      action: { label: "View accounts", href: "/accounts" },
    },
    {
      id: "dash-import",
      title: "Import your bank statements",
      body: "Bring in CSV or OFX/QFX files from your bank to see real data here. The more data you add, the better your insights.",
      action: { label: "Import files", href: "/import" },
    },
  ],
  transactions: [
    {
      id: "txn-search",
      title: "Find any transaction",
      body: "Use the search bar to filter by payee, note, or tag. You can also filter by date range, account, or category.",
    },
    {
      id: "txn-categorize",
      title: "Categorize for better insights",
      body: "Assigning categories to transactions powers your budget tracking and spending breakdown charts.",
    },
  ],
  budgets: [
    {
      id: "budget-start",
      title: "Set monthly spending limits",
      body: "Create budgets per category to track your spending. You'll see progress bars showing how much you've used each month.",
    },
  ],
  accounts: [
    {
      id: "acct-types",
      title: "Track all your money in one place",
      body: "Add bank accounts, credit cards, investments, and loans. Your net worth is calculated from the total of all accounts.",
    },
  ],
  import: [
    {
      id: "import-formats",
      title: "Multiple formats supported",
      body: "Upload CSV or OFX/QFX files from your bank. We'll detect duplicates automatically so nothing gets counted twice.",
    },
  ],
};

function TipsFeed({ page }: { page: TipsPage }) {
  const regular = useAppSizeClass() !== "compact";
  return (
    <PersistedNoticeBody
      dismissKey="pf-dismissed-tips"
      variant="card"
      tone="info"
      icon={Lightbulb}
      collapsible
      testId="onboarding-tips-compact"
      items={TIPS_BY_PAGE[page] ?? []}
      title={(remaining) => (regular ? "Tips for getting started" : `Tips (${remaining})`)}
    />
  );
}

/** Mounts the feed of a `source`; each feed returns nothing when it has nothing to say. */
export function NoticeFeed({ source }: { source: NoticeSource }) {
  switch (source) {
    case "announcement":
      return <AnnouncementFeed />;
    case "currency-audit":
      return <CurrencyAuditFeed />;
    case "passkey-lock":
      return <PasskeyLockFeed />;
    case "reporting-recompute":
      return <RecomputeFeed />;
    default:
      return <TipsFeed page={source.slice("tips:".length) as TipsPage} />;
  }
}
