"use client";

/**
 * SectionPage: the chrome of a settings or admin section page.
 * Owns the global PageHeader (`back`, or the registry auto-back when omitted), the width token,
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

/** Top bar slots the section chrome forwards (the bar's action props; title, info and back are SectionPage props). */
export type SectionPageHeader = Pick<React.ComponentProps<typeof PageHeader>, "primary" | "more" | "filter" | "bulkEdit">;

export interface SectionPageProps {
  /** Stable page id; the root carries `data-testid="<id>-root"`. */
  id: string;
  title: string;
  /** Help text, shown only in the (i) InfoTip after the title. */
  info?: React.ReactNode;
  /** Back control (PageHeader `back`). Omitted = the nav-registry auto-back; `false` = root destination. */
  back?: React.ComponentProps<typeof PageHeader>["back"];
  /**
   * Width token. Every token is full width on desktop now (no max-w on the root); the names stay so call sites
   * keep compiling. Default "section".
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
  /** Top bar action slots (primary, more, filter, bulkEdit). */
  header?: SectionPageHeader;
  /**
   * Lay the body's children out as the card grid (TW.grid3: 1 col phone, 2 at regular, 3 at wide, items-start).
   * Wrap a child that must span the row (tables, long lists, accordions) in an element with class col-span-full.
   */
  grid?: boolean;
  /** Appended last to the root className (escape hatch, e.g. `p-6`). */
  className?: string;
  /** Wrap the body in a Suspense boundary. Default true. */
  suspense?: boolean;
  children: React.ReactNode;
}

const WIDTH_CLASS: Record<SectionPageWidth, string> = {
  // Full width on desktop at every token (owner 2026-10-13). A capped, non-centred root also broke the
  // page-header bleed (the bar slid left under the rail, see tests/pages/settings-topbar.test.tsx). Prose pages
  // cap the prose element only (TW.prose); the TW.* width tokens stay for dialogs and tests.
  section: "",
  report: "",
  form: "",
  doc: "",
  console: "",
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
  info,
  back,
  width = "section",
  padBottom = "default",
  minW0 = true,
  center = false,
  stack = "6",
  header,
  className,
  suspense = true,
  grid = false,
  children,
}: SectionPageProps) {
  const content = grid ? <SectionGrid>{children}</SectionGrid> : children;
  const body = suspense ? <React.Suspense fallback={null}>{content}</React.Suspense> : content;
  return (
    <div
      data-testid={`${id}-root`}
      className={cn(
        minW0 && "min-w-0",
        STACK_CLASS[stack],
        WIDTH_CLASS[width],
        PAD_CLASS[padBottom],
        center && width !== "report" && width !== "none" && "mx-auto",
        className,
      )}
    >
      <PageHeader
        title={title}
        info={info}
        back={back}
        primary={header?.primary}
        more={header?.more}
        filter={header?.filter}
        bulkEdit={header?.bulkEdit}
      />
      {body}
    </div>
  );
}

/** The card grid body (SectionPage `grid`): 1 col phone, 2 at regular, 3 at wide. */
function SectionGrid({ children }: { children: React.ReactNode }) {
  return (
    <div data-slot="section-grid" className={TW.grid3}>
      {children}
    </div>
  );
}
