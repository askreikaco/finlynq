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
 * Phone header row for pages with a back control (iOS 26 style): [round glass back | glass
 * title island, centred | actions]. Sticky, grid with equal side columns so the island stays
 * centred in the viewport. md+ keeps the page's original classes (nothing here applies there).
 */
export const PHONE_HEADER_ROW =
  "max-md:grid max-md:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] max-md:items-center max-md:gap-2 max-md:sticky max-md:top-0 max-md:z-10 max-md:bg-background max-md:pt-[var(--sat)]";

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
  // Title only: emit just the h1 so the page's DOM stays exactly as it was.
  if (!subtitle && !belowTitle && !lead && !hasRight && !className && !backHref) return h1;
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
    return className ? <div className={className}>{headingWithBack}</div> : headingWithBack;
  }
  return (
    <div
      data-slot="page-header"
      className={cn(className, "max-md:flex max-md:flex-row max-md:flex-nowrap max-md:items-center max-md:justify-between max-md:gap-3")}
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
