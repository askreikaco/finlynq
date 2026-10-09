"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackButton({
  href,
  label = "Back",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      data-slot="back-button"
      className={cn(
        "inline-flex items-center justify-center",
        "min-h-11 min-w-11",
        "rounded-md hover:bg-accent transition-colors",
        // Below regular (640px): round liquid-glass button, 44px (see .glass-capsule in globals.css).
        "glass-capsule max-regular:size-11 max-regular:rounded-full",
        className
      )}
      aria-label={label}
    >
      <ChevronLeft className="size-5" aria-hidden />
    </Link>
  );
}
