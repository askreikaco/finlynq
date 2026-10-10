"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavDepth } from "@/lib/nav/history-depth";

/** Shared class list: the round glass circle below regular (640px), a plain 44px target above. */
const BACK_BUTTON_CLASS =
  "inline-flex items-center justify-center min-h-11 min-w-11 rounded-md hover:bg-accent transition-colors glass-capsule max-regular:size-11 max-regular:rounded-full";

/** Back control: a link when `href` is given, otherwise a button calling `onClick` (same look). */
export function BackButton({
  href,
  onClick,
  label = "Back",
  className,
}: {
  href?: string;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  if (!href) {
    return (
      <button
        type="button"
        data-slot="back-button"
        className={cn(BACK_BUTTON_CLASS, className)}
        aria-label={label}
        onClick={onClick}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
    );
  }
  // Back is the real browser back when the user navigated inside the app (depth > 0); `href` is the fallback
  // for a fresh entry or a deep link, and what a modified click (new tab) still opens.
  const onLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (getNavDepth() > 0) {
      e.preventDefault();
      window.history.back();
    }
  };
  return (
    <Link
      href={href}
      data-slot="back-button"
      className={cn(BACK_BUTTON_CLASS, className)}
      aria-label={label}
      onClick={onLinkClick}
    >
      <ChevronLeft className="size-5" aria-hidden />
    </Link>
  );
}
