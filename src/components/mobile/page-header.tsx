"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BackButton } from "./back-button";

export interface OverflowAction {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
}

/** Tailwind class for header buttons that must disappear below md (they live in the overflow menu there). */
export const HEADER_DESKTOP_ONLY = "max-md:hidden";

/**
 * Phone sticky header, shared by every PageHeader row and the settings back row (max-md only).
 * Top offset is the safe-area inset alone: body already pads its in-flow top by --sat, but a
 * sticky box pins to the scrollport edge (y=0) and ignores that padding, so top:0 would slide
 * under the notch/status bar on iOS standalone. Stuck box = [sat, sat+56px]; content scrolls
 * under it. Row height = --phone-header-h (3.5rem). Opaque bg, no backdrop blur. z-30 sits above
 * the section labels (z-10). Hairline border-b keeps the bar separate from content.
 * No pt-[var(--sat)]: the row is in flow below body's pad, so adding it again would double the inset.
 */
export const PHONE_HEADER_STICKY =
  "max-md:sticky max-md:top-[var(--sat,0px)] max-md:z-30 max-md:min-h-[var(--phone-header-h)] max-md:border-b max-md:border-border max-md:bg-background";

/** Phone header row for pages with a back control (iOS 26 style): [round glass back | glass
 * title island, centred | actions]. Grid with equal side columns so the island stays
 * centred in the viewport. md+ keeps the page's original classes (nothing here applies there). */
export const PHONE_HEADER_ROW =
  `max-md:grid max-md:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] max-md:items-center max-md:gap-2 ${PHONE_HEADER_STICKY}`;

/** Plain (no back) header wrapper on phones: sticky bar, h1 vertically centred. */
export const PHONE_HEADER_PLAIN = cn(PHONE_HEADER_STICKY, "max-md:flex max-md:flex-col max-md:justify-center");

/** The h1 as the glass title island on phones (large title hidden; the h1 stays in the DOM). */
export const PHONE_TITLE_ISLAND =
  "glass-capsule max-md:block max-md:h-11 max-md:min-w-0 max-md:max-w-[min(60vw,20rem)] max-md:justify-self-center max-md:truncate max-md:rounded-full max-md:px-4 max-md:text-center max-md:text-[15px]/11 max-md:font-semibold max-md:tracking-normal";

/**
 * Turn the page's ORIGINAL desktop h1 classes into md+ classes so the desktop heading is
 * byte-for-byte what it was: every plain token gets `md:`, `sm:` tokens move to `md:`
 * (below md the title is always 28/800), other variants are kept as-is.
 */
export function desktopClasses(original: string): string {
  const out = original
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      if (t.startsWith("sm:")) return `md:${t.slice(3)}`;
      if (t.includes(":")) return t;
      return `md:${t}`;
    });
  return cn(out.join(" "));
}

/**
 * Page header. Below md (native): big title (28/800) left + the page's ONE primary action
 * right, subtitle hidden, every secondary action in a "⋯" overflow menu (44px targets).
 * At md+ it renders exactly the page's original markup: the original classes are passed in
 * (`className`, `titleClassName`, `subtitleClassName`, `actionsClassName`) and re-emitted
 * with `md:` prefixes.
 *
 * `actions` is the page's original action node(s). Secondary buttons inside it must carry
 * HEADER_DESKTOP_ONLY and have a matching entry in `overflow`; the primary stays visible.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  overflow,
  className,
  titleClassName = "text-2xl font-bold",
  subtitleClassName = "text-sm text-muted-foreground mt-1",
  actionsClassName = "flex items-center gap-2",
  lead,
  leadClassName = "flex items-center gap-3",
  belowTitle,
  backHref,
  backLabel,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  overflow?: OverflowAction[];
  /** Original wrapper classes (desktop). */
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  actionsClassName?: string;
  /** Node left of the title block (e.g. an avatar tile); wrapped with `leadClassName`. */
  lead?: React.ReactNode;
  leadClassName?: string;
  /** Always-visible node under the h1 (e.g. badges). */
  belowTitle?: React.ReactNode;
  /** Optional back button link href. */
  backHref?: string;
  /** Optional back button label (defaults to "Back"). */
  backLabel?: string;
}) {
  const hasRight = !!actions || (overflow?.length ?? 0) > 0;
  const noTracking = !/(^|\s)tracking-/.test(titleClassName);
  const h1 = (
    <h1
      data-slot="page-header-title"
      className={cn(
        "text-[28px]/9 font-extrabold tracking-tight max-md:flex max-md:items-center max-md:gap-2",
        noTracking && "md:tracking-normal",
        desktopClasses(titleClassName),
        backHref && PHONE_TITLE_ISLAND,
      )}
    >
      {title}
    </h1>
  );
  // Title only: sticky wrapper around just the h1 (no other nodes).
  if (!subtitle && !belowTitle && !lead && !hasRight && !backHref) {
    return (
      <div data-slot="page-header" className={cn(className, PHONE_HEADER_PLAIN)}>
        {h1}
      </div>
    );
  }
  const titleBlock = (
    <div className={cn(!lead && "max-md:min-w-0", !lead && hasRight && "max-md:flex-1", backHref && "max-md:contents")} data-slot="page-header-title-block">
      {h1}
      {subtitle ? (
        <p data-slot="page-header-subtitle" className={cn("hidden md:block", subtitleClassName)}>
          {subtitle}
        </p>
      ) : null}
      {belowTitle}
    </div>
  );
  const heading = lead ? (
    <div className={cn(leadClassName, "max-md:min-w-0", hasRight && "max-md:flex-1", backHref && "max-md:contents")}>
      {lead}
      {titleBlock}
    </div>
  ) : (
    titleBlock
  );
  const headingWithBack = backHref ? (
    <div className={cn(leadClassName, "max-md:min-w-0", hasRight && "max-md:flex-1", "max-md:contents")}>
      <BackButton href={backHref} label={backLabel} className="justify-self-start" />
      {heading}
    </div>
  ) : (
    heading
  );
  if (backHref) {
    return (
      <div data-slot="page-header" className={cn(className, PHONE_HEADER_ROW)}>
        {headingWithBack}
        {hasRight ? (
          <div data-slot="page-header-actions" className={cn(actionsClassName, "max-md:col-start-3 max-md:justify-self-end max-md:shrink-0 max-md:flex-nowrap max-md:gap-2")}>
            {overflow && overflow.length > 0 ? <OverflowMenu items={overflow} /> : null}
            {actions}
          </div>
        ) : null}
      </div>
    );
  }
  if (!hasRight) {
    return (
      <div data-slot="page-header" className={cn(className, PHONE_HEADER_PLAIN)}>
        {headingWithBack}
      </div>
    );
  }
  return (
    <div
      data-slot="page-header"
      className={cn(className, PHONE_HEADER_STICKY, "max-md:flex max-md:flex-row max-md:flex-nowrap max-md:items-center max-md:justify-between max-md:gap-3")}
    >
      {headingWithBack}
      <div data-slot="page-header-actions" className={cn(actionsClassName, "max-md:w-auto max-md:shrink-0 max-md:flex-nowrap max-md:gap-2")}>
        {overflow && overflow.length > 0 ? <OverflowMenu items={overflow} /> : null}
        {actions}
      </div>
    </div>
  );
}

/** "⋯" button (44px) + accessible menu. Visible below md only. */
export function OverflowMenu({ items }: { items: OverflowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="More actions"
            data-slot="overflow-trigger"
            className="md:hidden"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        {items.map((it) => {
          const Icon = it.icon;
          const inner = (
            <>
              {Icon ? <Icon className="size-4" aria-hidden /> : null}
              {it.label}
            </>
          );
          return (
            <DropdownMenuItem
              key={it.label}
              disabled={it.disabled}
              variant={it.destructive ? "destructive" : "default"}
              className="min-h-11 text-sm"
              onClick={it.onSelect}
              {...(it.href ? { render: <Link href={it.href} /> } : {})}
            >
              {inner}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
