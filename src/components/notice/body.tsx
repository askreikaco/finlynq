"use client";

/**
 * The drawing of Notice (see index.tsx for the contract): every banner, alert, empty/error state, loading skeleton and
 * tips card of the app is this one markup, switched by `variant` / `tone` and the optional parts. No mount animation.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info, Inbox, RefreshCw, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Disclosure } from "@/components/adaptive";
import { cn } from "@/lib/utils";
import { readUserItem, useSessionUserId, writeUserItem } from "@/lib/client/user-storage";
import type { NoticeAction, NoticePlacement, NoticeProps, NoticeTone, NoticeVariant } from "./types";

const SELF = "self";

const TONE: Record<NoticeTone, { box: string; icon: string; iconBg: string; text: string }> = {
  info: { box: "border-primary/30 bg-primary/10", icon: "text-primary", iconBg: "bg-primary/10", text: "text-foreground" },
  success: { box: "border-pos/30 bg-pos/10", icon: "text-pos", iconBg: "bg-pos/10", text: "text-foreground" },
  warning: { box: "border-warning/40 bg-warning/10", icon: "text-warning", iconBg: "bg-warning/10", text: "text-foreground" },
  danger: { box: "border-destructive/50 bg-destructive/5", icon: "text-destructive", iconBg: "bg-destructive/10", text: "text-destructive" },
  neutral: { box: "border-foreground/20 bg-background", icon: "text-muted-foreground", iconBg: "bg-muted/60", text: "text-foreground" },
};

const TONE_ICON: Record<NoticeTone, LucideIcon | null> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  neutral: null,
};

/** Fixed placements. bottom-start clears the desktop rail + the phone tab bar; bottom-end sits above the tab bar. */
const PLACEMENT: Record<NoticePlacement, string> = {
  flow: "",
  top: "pointer-events-auto",
  "bottom-start":
    "fixed left-4 right-4 max-w-sm bottom-[calc(var(--mobile-bar-clearance)-8px)] regular:bottom-4 regular:right-auto regular:left-[calc(5rem+var(--sal)+1rem)] z-50 shadow-lg",
  "bottom-end": "fixed right-4 z-50 max-regular:bottom-[calc(var(--mobile-bar-clearance)+0.5rem)] regular:bottom-4 shadow-lg",
};

function defaultRole(variant: NoticeVariant, tone: NoticeTone): "alert" | "status" | undefined {
  if (variant === "skeleton" || variant === "empty") return undefined;
  if (variant === "error" || tone === "danger" || tone === "warning") return "alert";
  return "status";
}

function ActionButton({ action, size = "sm", className }: { action: NoticeAction; size?: "sm" | "md"; className?: string }) {
  const variant = action.tone === "outline" ? "outline" : "primary";
  return action.href ? (
    <Button size={size} variant={variant} className={className} data-testid={action.testId} onClick={action.onClick} href={action.href}>
      {action.label}
    </Button>
  ) : (
    <Button size={size} variant={variant} className={className} data-testid={action.testId} disabled={action.disabled} loading={action.busy} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

function DismissButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn("shrink-0 text-muted-foreground hover:text-foreground max-regular:-m-3 max-regular:p-3", className)}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────

function SkeletonBody({ kind = "table", rows = 5, className }: { kind?: "table" | "cards" | "list"; rows?: number; className?: string }) {
  if (kind === "cards") {
    return (
      <div data-slot="notice" data-variant="skeleton" className={cn("space-y-5", className)}>
        <div className="h-7 w-48 animate-shimmer rounded-lg" />
        <div className="h-4 w-64 animate-shimmer rounded-md" />
        <div className="mt-4 grid grid-cols-1 gap-4 regular:grid-cols-2 wide:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-36 animate-shimmer rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (kind === "list") {
    return (
      <div data-slot="notice" data-variant="skeleton" className={cn("space-y-5", className)}>
        <div className="h-7 w-48 animate-shimmer rounded-lg" />
        <div className="h-4 w-64 animate-shimmer rounded-md" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-16 animate-shimmer rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div data-slot="notice" data-variant="skeleton" className={cn("space-y-5", className)}>
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 animate-shimmer rounded-lg" />
          <div className="mt-2 h-4 w-64 animate-shimmer rounded-md" />
        </div>
        <div className="h-9 w-32 animate-shimmer rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="h-10 animate-shimmer" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 animate-shimmer border-t border-border" />
        ))}
      </div>
    </div>
  );
}

// ── Body ────────────────────────────────────────────────────────────

export interface NoticeBodyProps extends NoticeProps {
  initialDismissed?: string[];
  onDismissedChange?: (ids: string[]) => void;
}

export function NoticeBody(p: NoticeBodyProps) {
  const variant: NoticeVariant = p.variant ?? "inline";
  const tone: NoticeTone = p.tone ?? (variant === "error" ? "danger" : variant === "empty" ? "neutral" : "info");
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set(p.initialDismissed ?? []));

  if (variant === "skeleton") return <SkeletonBody kind={p.skeleton} rows={p.rows} className={p.className} />;

  const t = TONE[tone];
  const centred = variant === "empty" || variant === "error";
  const Icon: LucideIcon | null =
    p.icon === null ? null : (p.icon ?? (variant === "empty" ? Inbox : variant === "error" ? AlertCircle : TONE_ICON[tone]));
  const role = p.role === "none" ? undefined : (p.role ?? defaultRole(variant, tone));

  const dismissMany = (ids: string[]) => {
    const next = new Set(dismissed);
    ids.forEach((id) => next.add(id));
    setDismissed(next);
    p.onDismissedChange?.([...next]);
    if (ids.includes(SELF)) p.onDismiss?.();
  };
  const dismiss = (id: string) => dismissMany([id]);

  const items = p.items?.filter((i) => !dismissed.has(i.id));
  if (p.items && (items?.length ?? 0) === 0) return null;
  if (!p.items && dismissed.has(SELF)) return null;

  const title = typeof p.title === "function" ? p.title(items?.length ?? 0) : p.title;
  const info = p.info ? <InfoTip text={p.info} label={p.infoLabel} /> : null;
  const retryLabel = p.retryLabel ?? "Try again";

  // ── centred empty / error state ──
  if (centred) {
    const heading = variant === "error" ? (title ?? "Something went wrong") : title;
    const body = variant === "error" && p.children == null ? "We couldn't load this data. Please try again." : p.children;
    return (
      <div
        data-slot="notice"
        data-variant={variant}
        data-tone={tone}
        id={p.id}
        data-testid={p.testId}
        role={role}
        className={cn("flex flex-col items-center justify-center px-4 py-16 text-center", p.className)}
      >
        {Icon && (
          <div className={cn("mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-xl", t.iconBg)}>
            <Icon className={cn("h-8 w-8", variant === "error" ? t.icon : "text-muted-foreground")} aria-hidden />
          </div>
        )}
        {heading != null && (
          <h3 className="text-lg font-semibold">
            {heading}
            {info}
          </h3>
        )}
        {body != null && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
        {(p.action || p.secondaryAction) && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {p.action && <ActionButton action={p.action} size="md" />}
            {p.secondaryAction && <ActionButton action={{ tone: "outline", ...p.secondaryAction }} size="md" />}
          </div>
        )}
        {p.retry && (
          <button
            type="button"
            onClick={p.retry}
            className="mt-4 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            {retryLabel}
          </button>
        )}
      </div>
    );
  }

  // ── multi-item card (onboarding tips) ──
  if (items) {
    return (
      <div
        data-slot="notice"
        data-variant={variant}
        data-tone={tone}
        id={p.id}
        data-testid={p.testId}
        className={cn(
          "rounded-xl border px-3 py-1 has-[[data-state=open]]:py-2 regular:p-4 regular:has-[[data-state=open]]:py-4",
          t.box,
          p.className,
        )}
      >
        <Disclosure
          collapseBelow={p.collapsible ? "regular" : undefined}
          defaultOpen
          headerClassName="min-h-11 gap-2 text-left text-primary hover:bg-transparent regular:min-h-0"
          contentClassName="space-y-3 pt-3"
          title={
            <>
              {Icon && <Icon className={cn("h-4 w-4", t.icon)} aria-hidden />}
              <span className="text-sm font-medium text-primary-text">{title}</span>
            </>
          }
          trailing={
            <button
              type="button"
              onClick={() => dismissMany(items.map((i) => i.id))}
              className="min-h-11 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground regular:min-h-0 regular:px-0"
            >
              {p.dismissAllLabel ?? "Dismiss all"}
            </button>
          }
        >
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border bg-white p-3 dark:bg-card">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                {item.body && <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>}
                {item.action && (
                  <Link href={item.action.href} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    {item.action.label}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={p.itemDismissLabel ?? "Dismiss tip"}
                className="-m-3 shrink-0 p-3 text-muted-foreground hover:text-foreground regular:m-0 regular:p-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </Disclosure>
      </div>
    );
  }

  // ── inline / banner / card ──
  const placement = p.placement ?? "flow";
  const compact = variant === "banner";
  const box = (
    <div
      data-slot="notice"
      data-variant={variant}
      data-tone={tone}
      id={p.id}
      data-testid={placement === "top" ? undefined : p.testId}
      role={placement === "top" ? undefined : role}
      className={cn(
        "relative w-full border",
        p.pill ? "rounded-full bg-background/95 px-4 py-2 text-sm backdrop-blur" : cn("rounded-lg", t.box, compact ? "px-3 py-2" : variant === "card" ? "p-4" : "p-3"),
        p.pill && "border-border",
        placement === "top" ? "w-auto max-w-full" : PLACEMENT[placement],
        placement === "bottom-start" && "bg-card",
        placement === "bottom-end" && "w-auto bg-background",
        t.text,
        p.href && "transition-colors hover:border-foreground/30",
        p.className,
      )}
    >
      <div className={cn("flex gap-3", p.pill || compact ? "flex-wrap items-center gap-x-3 gap-y-1" : "items-start")}>
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", !p.pill && !compact && "mt-0.5", t.icon, p.iconSpin && "animate-spin")} aria-hidden />}
        <div className={cn("min-w-0", compact || p.pill ? "flex flex-wrap items-center gap-x-3 gap-y-1" : "flex-1", compact ? "text-xs" : "text-sm")}>
          {title != null && (
            <p className="font-medium">
              {title}
              {info}
            </p>
          )}
          {p.children != null && <div className={cn(title != null && !compact && !p.pill && "mt-1 text-muted-foreground")}>{p.children}</div>}
          {(p.action || p.secondaryAction) && (
            <div className={cn("flex flex-wrap gap-2", !compact && !p.pill && "mt-3")}>
              {p.action && <ActionButton action={p.action} />}
              {p.secondaryAction && <ActionButton action={{ tone: "outline", ...p.secondaryAction }} />}
            </div>
          )}
        </div>
        {p.dismissible && <DismissButton label={p.dismissLabel ?? "Dismiss"} onClick={() => dismiss(SELF)} />}
      </div>
    </div>
  );
  const linked = p.href ? (
    <Link href={p.href} className="group block">
      {box}
    </Link>
  ) : (
    box
  );
  if (placement === "top") {
    return (
      <div role={role} data-testid={p.testId} className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4">
        {linked}
      </div>
    );
  }
  return linked;
}

// ── Persisted dismissal (per user) ──────────────────────────────────

function readIds(base: string, userId: string | null): string[] {
  try {
    const raw = readUserItem(base, userId);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Renders the notice only after the active user is known; dismissals are stored per user (`<dismissKey>:<userId>`). */
export function PersistedNoticeBody(p: NoticeProps & { dismissKey: string }) {
  const { userId, ready } = useSessionUserId();
  const [initial, setInitial] = useState<string[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    setInitial(readIds(p.dismissKey, userId));
  }, [ready, userId, p.dismissKey]);
  if (initial === null) return null;
  return (
    <NoticeBody
      key={userId ?? "anon"}
      {...p}
      initialDismissed={initial}
      onDismissedChange={(ids: string[]) => {
        writeUserItem(p.dismissKey, userId, JSON.stringify(ids));
      }}
    />
  );
}

