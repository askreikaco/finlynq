"use client";

/**
 * SectionPage: the chrome of a settings or admin section page.
 * Owns the global PageHeader (back to `backFallback`, or the registry auto-back when omitted), the width token,
 * the bottom pad, the `<id>-root` testid and the Suspense boundary for the page body (useSearchParams and friends).
 * The page passes only its config and children. Every variant prop is optional; omitted = the original output.
 */

import * as React from "react";
import { PageHeader } from "@/components/mobile";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";

export type SectionPageWidth = "section" | "report" | "form" | "doc" | "console" | "none";
export type SectionPagePad = "default" | "max" | "none";
export type SectionPageStack = "6" | "5" | "4";

/** Page-header passthrough (PageHeader props the section chrome forwards). */
export type SectionPageHeader = Pick<
  React.ComponentProps<typeof PageHeader>,
  "actions" | "overflow" | "className" | "actionsClassName" | "belowTitle"
>;

export interface SectionPageProps {
  /** Stable page id; the root carries `data-testid="<id>-root"`. */
  id: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Route the back control goes to (PageHeader backHref). Omitted = no explicit backHref, so PageHeader
   * uses its nav-registry auto-back (today's settings/admin pages).
   */
  backFallback?: string;
  /** Back control label (PageHeader backLabel). */
  backLabel?: string;
  /**
   * Width token. "section" = max-w-section (settings forms), "report" = max-w-report (wide admin tables),
   * "form" = max-w-form, "doc" = max-w-doc, "console" = max-w-console, "none" = no width cap.
   * Default "section".
   */
  width?: SectionPageWidth;
  /** Bottom pad: "default" = form pad, "max" = max(24px, safe-area) pad, "none" = no pad. Default "default". */
  padBottom?: SectionPagePad;
  /** Adds `min-w-0` to the root so long children can shrink. Default true. */
  minW0?: boolean;
  /** Adds `mx-auto` to the root. Default false. */
  center?: boolean;
  /** Vertical rhythm between the header and body (`space-y-<n>`). Default "6". */
  stack?: SectionPageStack;
  /** Passthrough to PageHeader (actions, overflow, className, actionsClassName, belowTitle). */
  header?: SectionPageHeader;
  /** Appended last to the root className (escape hatch, e.g. `p-6`). */
  className?: string;
  /** Wrap the body in a Suspense boundary. Default true. */
  suspense?: boolean;
  children: React.ReactNode;
}

const WIDTH_CLASS: Record<SectionPageWidth, string> = {
  section: TW.section,
  report: TW.report,
  form: TW.form,
  doc: TW.doc,
  console: TW.console,
  none: "",
};

const PAD_CLASS: Record<SectionPagePad, string> = {
  default: TW.formPad,
  max: TW.formPadMax,
  none: "",
};

const STACK_CLASS: Record<SectionPageStack, string> = {
  "6": "space-y-6",
  "5": "space-y-5",
  "4": "space-y-4",
};

export function SectionPage({
  id,
  title,
  subtitle,
  backFallback,
  backLabel,
  width = "section",
  padBottom = "default",
  minW0 = true,
  center = false,
  stack = "6",
  header,
  className,
  suspense = true,
  children,
}: SectionPageProps) {
  const body = suspense ? <React.Suspense fallback={null}>{children}</React.Suspense> : children;
  return (
    <div
      data-testid={`${id}-root`}
      className={cn(
        minW0 && "min-w-0",
        STACK_CLASS[stack],
        WIDTH_CLASS[width],
        PAD_CLASS[padBottom],
        center && "mx-auto",
        className,
      )}
    >
      <PageHeader
        title={title}
        subtitle={subtitle}
        backHref={backFallback}
        backLabel={backLabel}
        actions={header?.actions}
        overflow={header?.overflow}
        className={header?.className}
        actionsClassName={header?.actionsClassName}
        belowTitle={header?.belowTitle}
      />
      {body}
    </div>
  );
}
