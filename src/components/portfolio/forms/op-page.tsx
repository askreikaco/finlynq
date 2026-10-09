"use client";

/**
 * Shared chrome for the level-2 portfolio operation pages (/portfolio/new/<op>).
 * Native form layout: glass top bar (back to /portfolio/new, centred title, Save in the bar),
 * then inset grouped rows with the label on the left. Each form keeps its own state,
 * validation and API payload; this file only renders.
 */

import * as React from "react";
import { PageHeader, SectionLabel } from "@/components/mobile";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NEW_OP_HREF } from "./op-catalog";

export const DEFAULT_OP_RETURN = "/portfolio";

/**
 * Post-save destination from ?returnTo=. Same-app relative paths only: no protocol, no //,
 * no backslash, no control characters (browsers strip tab/newline, so "/\t/host" is "//host").
 * Anything else falls back to /portfolio.
 */
export function safeReturnHref(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_OP_RETURN;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return DEFAULT_OP_RETURN;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_OP_RETURN;
  return raw;
}

/** Control and input classes: 44px rows, 16px text on phones, no box (the row is the field). */
export const OP_INPUT =
  "border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent dark:disabled:bg-transparent";
export const OP_SELECT =
  "w-full border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent regular:pointer-fine:text-sm";

export function OpPage({
  title,
  saveLabel = "Save",
  saving = false,
  saveDisabled = false,
  onSubmit,
  children,
}: {
  title: string;
  saveLabel?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  /** Omit for read-only states (loading, empty, error): no Save in the bar. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit ?? ((e) => e.preventDefault())}
      className="pb-[max(24px,var(--sab,0px))]"
    >
      <PageHeader
        title={title}
        backHref={NEW_OP_HREF}
        backLabel="All operations"
        actions={
          onSubmit ? (
            <Button
              type="submit"
              variant="ghost"
              className="h-11 px-3 text-sm font-semibold text-primary regular:pointer-fine:h-8"
              disabled={saving || saveDisabled}
            >
              <Check className="hidden size-4 max-regular:block" aria-hidden />
              {saving ? "Saving…" : saveLabel}
            </Button>
          ) : null
        }
      />
      <div className="mt-4 space-y-6">{children}</div>
    </form>
  );
}

/** Inset grouped list (iOS Settings style): rounded card, hairline dividers, optional UPPERCASE label. */
export function OpGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <div className="divide-y divide-border/50 overflow-hidden rounded-2xl bg-card">{children}</div>
    </section>
  );
}

/** One label-left row (96px label column, 44pt+ tall). `error` renders as a row under the field. */
export function OpRow({
  label,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={cn("flex min-h-11 items-center gap-3 px-4 py-2", className)}>
        <span className="w-28 shrink-0 text-sm text-muted-foreground">{label}</span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error ? (
        <p className="px-4 pb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Message row inside a group (loading, empty, submit error, warnings). */
export function OpNote({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "destructive" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "px-4 py-3 text-sm",
        tone === "muted" && "text-muted-foreground",
        tone === "destructive" && "text-destructive",
        tone === "warning" && "text-warning",
      )}
    >
      {children}
    </p>
  );
}

/** Footer text under a group (help text, previews). */
export function OpFooter({ children }: { children: React.ReactNode }) {
  return <p className="px-4 text-xs text-muted-foreground">{children}</p>;
}
