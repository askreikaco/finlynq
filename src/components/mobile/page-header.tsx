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
import { Dialog } from "@/components/ui/dialog";
import { BackButton } from "./back-button";
import { FromMd } from "./adaptive";
import { useBackTarget } from "@/components/adaptive/use-back-target";

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
 * Sticky top bar, every breakpoint. Pinned at the top of the scroll container: the window on phones
 * (safe-area inset), <main> on md+ (top 0). z-30 above section labels (z-10).
 * md+ gets a translucent background (glass-bar only exists below md) so scrolled content does not show through.
 * Sticky is inert if any ancestor between the bar and the scroller has overflow-* other than visible/clip.
 * Keep ONE position class on the bar: cn()/twMerge drops sticky if a relative/absolute/fixed class is merged in.
 */
export const PHONE_BAR_STICKY =
  "glass-bar sticky top-[var(--sat,0px)] z-30 md:top-0 md:bg-background/90 md:backdrop-blur-sm";

/**
 * Phone top bar (max-md layout), shared by PageHeader and the settings detail row. Adds to PHONE_BAR_STICKY:
 * full-bleed (-mx-4 cancels the app shell's px-4), a three-column grid, min-h --phone-header-h (3.75rem).
 * Columns: [left slot | title | right capsule]. The side tracks are min 2.75rem (one 44pt target) and
 * size to their content, so the title column is exactly the space between the MEASURED slots: a title or
 * subtitle can never run under the capsule. Equal min sides keep the title centred when one side is empty.
 * items-center puts a 44px control centred in the 60px bar (no ring on the hairline).
 * No pt-[var(--sat)]: body already pads its in-flow top by --sat.
 */
export const PHONE_BAR =
  "glass-bar sticky top-[var(--sat,0px)] z-30 md:top-0 md:bg-background/90 md:backdrop-blur-sm max-md:-mx-4 max-md:grid max-md:min-h-[var(--phone-header-h)] max-md:grid-cols-[minmax(2.75rem,auto)_minmax(0,1fr)_minmax(2.75rem,auto)] max-md:items-center max-md:px-4";

/** Left slot placeholder (no back target): keeps the title column aligned. */
export const PHONE_BAR_SIDE = "hidden max-md:flex max-md:size-11 max-md:shrink-0 max-md:col-start-1 max-md:row-start-1";

/** Title block: the middle grid column (between the measured slots). min-w-0 lets the title truncate.
 * pointer-events-none: taps reach the buttons. */
export const PHONE_BAR_CENTER =
  "max-md:col-start-2 max-md:row-start-1 max-md:flex max-md:min-w-0 max-md:flex-col max-md:items-center max-md:justify-center max-md:text-center max-md:pointer-events-none";

/** Class added to the primary action on phones: an icon-only 44px filled circle (see globals.css). */
export const PHONE_PRIMARY_CLASS = "phone-icon-action";

/** Title on phones: system scale (iOS headline is 17pt semibold; text-base is the nearest step), one line. */
export const PHONE_BAR_TITLE =
  "max-md:max-w-full max-md:text-base max-md:font-semibold max-md:tracking-normal max-md:truncate max-md:text-center";

/** Subtitle line under the title on phones (muted, one line, ellipsis). text-xs = 12px, the system caption step. */
export const PHONE_BAR_SUBTITLE = "max-md:mt-0 max-md:w-full max-md:truncate max-md:text-center max-md:text-xs";

/** Right slot on phones: ONE glass capsule (pill, 44px high, no padding) in the third grid column. Its width
 * is capped at 9.5rem (three 44px circles) and it scrolls inside that cap, so it never runs past the right edge. */
export const PHONE_BAR_RIGHT =
  "glass-capsule max-md:col-start-3 max-md:row-start-1 max-md:flex max-md:h-11 max-md:max-w-[9.5rem] max-md:min-w-0 max-md:shrink-0 max-md:flex-nowrap max-md:items-center max-md:justify-self-end max-md:gap-0 max-md:overflow-x-auto max-md:rounded-full max-md:p-0";

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

/** Flatten Fragments so a fragment-wrapped action is seen as its own child (no DOM change). */
function flattenActions(node: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(node).flatMap((c) => {
    if (React.isValidElement(c) && c.type === React.Fragment) {
      const inner = (c.props as { children?: React.ReactNode }).children;
      return flattenActions(inner).map((child) =>
        React.isValidElement(child) ? React.cloneElement(child, { key: `${String(c.key)}/${String(child.key)}` }) : child,
      );
    }
    return [c];
  });
}

/** Non-visual roots render no element; their triggers are the real actions. Never the primary themselves. */
function isPhoneInvisible(c: React.ReactElement): boolean {
  return c.type === Dialog || c.type === DropdownMenu || c.type === FromMd;
}

/** The primary action is the last visible (not max-md:hidden) child of the actions. Returns the children with
 * that one gaining an aria-label (its visible text, if none was set) and the icon-only phone class. */
export function withPhonePrimary(actions: React.ReactNode): React.ReactNode {
  const items = flattenActions(actions);
  let idx = -1;
  items.forEach((c, i) => {
    if (!React.isValidElement(c) || isPhoneInvisible(c)) return;
    const cn0 = String((c.props as { className?: string }).className ?? "");
    if (!cn0.includes("max-md:hidden")) idx = i;
  });
  if (idx < 0) return items;
  return items.map((c, i) => {
    if (i !== idx || !React.isValidElement(c)) return c;
    const p = c.props as { className?: string; "aria-label"?: string; children?: React.ReactNode };
    const label = p["aria-label"] ?? textOf(p.children);
    return React.cloneElement(c as React.ReactElement<{ className?: string; "aria-label"?: string }>, {
      "aria-label": label || undefined,
      className: cn(p.className, PHONE_PRIMARY_CLASS),
    });
  });
}

/** Visible text of a node (strings and nested children; icons contribute nothing). */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

/**
 * Page header. Below md (native): one glass top bar (PHONE_BAR): [left 44px circle back | lead |
 * spacer] [title centred, subtitle under it] [ONE glass capsule holding the actions and the ⋯
 * overflow menu]. Subtitle shows on phones too. At md+ it renders the page's original markup:
 * the original classes (`className`, `titleClassName`, `subtitleClassName`, `actionsClassName`)
 * are re-emitted with `md:` prefixes; every phone class is max-md only.
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
  // No backHref: a level 2+ route (per the nav registry) gets a back button to its parent.
  const autoBack = useBackTarget();
  const effectiveBackHref = backHref ?? (autoBack && autoBack.level >= 2 ? autoBack.href ?? undefined : undefined);
  const hasRight = !!actions || (overflow?.length ?? 0) > 0;
  const noTracking = !/(^|\s)tracking-/.test(titleClassName);
  const h1 = (
    <h1
      data-slot="page-header-title"
      className={cn(
        "text-3xl/9 font-bold tracking-tight",
        noTracking && "md:tracking-normal",
        desktopClasses(titleClassName),
        PHONE_BAR_TITLE,
      )}
    >
      {title}
    </h1>
  );
  const titleBlock = (
    <div data-slot="page-header-title-block" className={PHONE_BAR_CENTER}>
      {h1}
      {subtitle ? (
        <p data-slot="page-header-subtitle" className={cn("block", subtitleClassName, PHONE_BAR_SUBTITLE)}>
          {subtitle}
        </p>
      ) : null}
      {belowTitle}
    </div>
  );
  const hasLeft = !!effectiveBackHref || !!lead;
  const phoneActions = withPhonePrimary(actions);
  return (
    <div data-slot="page-header" className={cn(className, PHONE_BAR)}>
      {hasLeft ? (
        <div className={cn(leadClassName, "max-md:contents")}>
          {effectiveBackHref ? <BackButton href={effectiveBackHref} label={backLabel} className="justify-self-start" /> : null}
          {lead}
          {titleBlock}
        </div>
      ) : (
        <>
          <span aria-hidden data-slot="page-header-spacer" className={PHONE_BAR_SIDE} />
          {titleBlock}
        </>
      )}
      {hasRight ? (
        <div data-slot="page-header-actions" className={cn(actionsClassName, PHONE_BAR_RIGHT)}>
          {overflow && overflow.length > 0 ? <OverflowMenu items={overflow} /> : null}
          {phoneActions}
        </div>
      ) : null}
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
