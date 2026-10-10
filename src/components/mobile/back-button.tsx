"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return (
    <Link
      href={href}
      data-slot="back-button"
      className={cn(BACK_BUTTON_CLASS, className)}
      aria-label={label}
    >
      <ChevronLeft className="size-5" aria-hidden />
    </Link>
  );
}
