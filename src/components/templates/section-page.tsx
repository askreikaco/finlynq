"use client";

/**
 * SectionPage: the chrome of a settings or admin section page.
 * Owns the global PageHeader (back to `backFallback`), the width token, the bottom pad,
 * the `<id>-root` testid and the Suspense boundary for the page body (useSearchParams and friends).
 * The page passes only its config and children.
 */

import * as React from "react";
import { PageHeader } from "@/components/mobile";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";

export interface SectionPageProps {
  /** Stable page id; the root carries `data-testid="<id>-root"`. */
  id: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Route the back control goes to (PageHeader backHref). */
  backFallback: string;
  /** "section" = max-w-section (settings forms), "report" = max-w-report (wide admin tables). */
  width: "section" | "report";
  children: React.ReactNode;
}

const WIDTH_CLASS: Record<SectionPageProps["width"], string> = {
  section: TW.section,
  report: TW.report,
};

export function SectionPage({ id, title, subtitle, backFallback, width, children }: SectionPageProps) {
  return (
    <div data-testid={`${id}-root`} className={cn("min-w-0 space-y-6", WIDTH_CLASS[width], TW.formPad)}>
      <PageHeader title={title} subtitle={subtitle} backHref={backFallback} />
      <React.Suspense fallback={null}>{children}</React.Suspense>
    </div>
  );
}
