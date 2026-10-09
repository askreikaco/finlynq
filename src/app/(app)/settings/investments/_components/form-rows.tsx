"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Label-left form card for the investments create/edit pages (compact rows). */
export function FormCard({ children }: { children: ReactNode }) {
  return <div className="divide-y rounded-xl border bg-card">{children}</div>;
}

export function FormRow({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-2">
      <div className="flex min-h-12 items-center gap-3">
        <Label htmlFor={htmlFor} className="w-28 shrink-0 text-sm font-normal text-muted-foreground">
          {label}
        </Label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error ? (
        <p className="pb-1 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <div className="pb-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/** Bottom action bar: clears the phone safe area. */
export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2 pb-[calc(var(--sab,0px)+1.5rem)]">
      {children}
    </div>
  );
}

/** Pill toggle used for Auto-fetch / Manual pricing. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="inline-flex rounded-lg border p-0.5">
      {options.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={
            "min-h-9 rounded-md px-3 py-1 text-xs font-medium transition-colors " +
            (value === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
          }
        >
          {labels[mode]}
        </button>
      ))}
    </div>
  );
}

/** Plain notice for a route whose record is still loading, missing, or failed to load. */
export function RouteNotice({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}
