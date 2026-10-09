"use client";

import React from "react";

/**
 * Compact field tile for the new-transaction grid (2 columns).
 * Fixed 52px: one line of icon + label (11px), then the value (14px).
 * Rendered as a button when onClick is given, otherwise as a plain box
 * (used for inline inputs such as Payee and the cross-currency amount).
 */
export function FieldTile({
  icon,
  label,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const shell =
    "flex h-[52px] min-w-0 flex-col justify-center gap-0.5 rounded-2xl border border-border/80 bg-card/90 px-3 text-left";
  const head = (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium leading-4 text-muted-foreground">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
  if (!onClick) {
    return (
      <div className={`${shell} focus-within:border-ring transition-colors`}>
        {head}
        {children}
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${shell} transition-colors active:bg-muted`}>
      {head}
      {children}
    </button>
  );
}
