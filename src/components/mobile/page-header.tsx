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
  /** Optional grey second line under the label (e.g. a branch name). */
  description?: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
}

/**
 * Secondary header action: visible from regular (640px) up, moved to the overflow menu below it.
 * Viewport variant `max-regular:` (globals.css), not a container query (design-system-spec 3f).
 */
export const HEADER_SECONDARY = "max-regular:hidden";

/** Alias of HEADER_SECONDARY, kept so existing callers keep working. */
export const HEADER_DESKTOP_ONLY = HEADER_SECONDARY;

/**
 * Sticky top bar, every size (owner D5). Pinned at the top of the scroll container: the window below
 * regular (safe-area inset), <main> from regular (top 0). z-30 above section labels (z-10).
 * From regular the bar is opaque (translucent background + blur, no glass).
 * Sticky is inert if any ancestor between the bar and the scroller has overflow-* other than visible/clip.
 * Keep ONE position class on the bar: cn()/twMerge drops sticky if a relative/absolute/fixed class is merged in.
 */
export const PHONE_BAR_STICKY =
  "glass-bar sticky top-[var(--sat,0px)] z-30 regular:top-0 regular:bg-background/90 regular:backdrop-blur-sm";

/**
 * Phone top bar (below regular), shared by PageHeader and the settings detail row. Adds to PHONE_BAR_STICKY:
 * full-bleed (-mx-4 cancels the app shell's px-4), a three-column grid, min-h --phone-header-h (3.75rem).
 * Columns: [left slot | title | right capsule]. The side tracks are min 2.75rem (one 44pt target) and
 * size to their content, so the title column is exactly the space between the MEASURED slots: a title or
 * subtitle can never run under the capsule. Equal min sides keep the title centred when one side is empty.
 * items-center puts a 44px control centred in the 60px bar (no ring on the hairline).
 * No pt-[var(--sat)]: body already pads its in-flow top by --sat.
 */
export const PHONE_BAR =
  "glass-bar sticky top-[var(--sat,0px)] z-30 regular:top-0 regular:bg-background/90 regular:backdrop-blur-sm max-regular:-mx-4 max-regular:grid max-regular:min-h-[var(--phone-header-h)] max-regular:grid-cols-[minmax(2.75rem,auto)_minmax(0,1fr)_minmax(2.75rem,auto)] max-regular:items-center max-regular:px-4";

/** Left slot placeholder (no back target): keeps the title column aligned. */
export const PHONE_BAR_SIDE = "hidden max-regular:flex max-regular:size-11 max-regular:shrink-0 max-regular:col-start-1 max-regular:row-start-1";

/** Title block: the middle grid column (between the measured slots). min-w-0 lets the title truncate.
 * pointer-events-none: taps reach the buttons. */
export const PHONE_BAR_CENTER =
  "max-regular:col-start-2 max-regular:row-start-1 max-regular:flex max-regular:min-w-0 max-regular:flex-col max-regular:items-center max-regular:justify-center max-regular:text-center max-regular:pointer-events-none";

/** Class added to the primary action below regular: an icon-only 44px filled circle (see globals.css). */
export const PHONE_PRIMARY_CLASS = "phone-icon-action";

/** Title at regular and up: one system style at every size (owner D4, 28/800). text-3xl is the nearest
 * system step to 28px, so no arbitrary size. */
export const HEADER_TITLE_CLASS = "text-3xl/9 font-extrabold tracking-tight";

/** Title below regular: system scale (iOS headline is 17pt semibold; text-base is the nearest step), one line. */
export const PHONE_BAR_TITLE =
  "max-regular:max-w-full max-regular:text-base max-regular:font-semibold max-regular:tracking-normal max-regular:truncate max-regular:text-center";

/** Subtitle, every size: muted, one line. Shown from regular up as a line under the title; below regular it
 * is a truncated caption (text-xs, the system caption step) centred under the title. */
export const HEADER_SUBTITLE_CLASS = "block text-sm text-muted-foreground mt-1";
export const PHONE_BAR_SUBTITLE = "max-regular:mt-0 max-regular:w-full max-regular:truncate max-regular:text-center max-regular:text-xs";

/**
 * Icon cells in the capsule: at most this many phone-visible non-primary actions (icon buttons, HeaderStatus).
 * The overflow trigger is one more cell, so the capsule holds at most 4 x 44px = 11rem. Anything beyond goes into
 * the overflow menu (secondary: HEADER_SECONDARY + an `overflow` entry). Enforced statically by
 * tests/ios/header-actions.test.ts.
 */
export const HEADER_MAX_PHONE_ACTIONS = 3;

/**
 * Right group below regular (grid column 3): the capsule (data-slot="header-capsule") and the primary
 * (data-slot="header-primary") as two siblings, 10px apart. Width = capsule + gap + primary, so the title column
 * (minmax(2.75rem,auto) 1fr minmax(2.75rem,auto)) keeps reserving the measured space. From regular the group is
 * the plain actions row (actionsClassName).
 */
export const PHONE_BAR_RIGHT =
  "max-regular:col-start-3 max-regular:row-start-1 max-regular:flex max-regular:min-w-0 max-regular:shrink-0 max-regular:flex-nowrap max-regular:items-center max-regular:justify-self-end max-regular:gap-2.5";

/**
 * The capsule: ONE glass pill (44px high, no padding, no gaps) holding only icon cells and the overflow trigger.
 * Each cell is a 44px slot; a single cell makes a 44px circle. Max 4 cells = 11rem; no horizontal scroll.
 * Icon buttons and text buttons never share a capsule (HIG), so text is never a cell.
 */
export const PHONE_CAPSULE =
  "glass-capsule flex items-center gap-2 max-regular:h-11 max-regular:max-w-[11rem] max-regular:min-w-0 max-regular:shrink-0 max-regular:flex-nowrap max-regular:gap-0 max-regular:rounded-full max-regular:p-0";

/** The primary action's own slot: a separate control to the right of the capsule (never inside it). */
export const PHONE_PRIMARY_SLOT = "flex shrink-0 items-center";

/**
 * A status indicator in the header (e.g. a saving spinner). It is one 44px capsule slot like an icon button, has
 * role=status and never becomes the primary action.
 */
export function HeaderStatus({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span
      role="status"
      aria-label={label}
      data-slot="header-status"
      className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
    >
      {children}
    </span>
  );
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

/** The primary action is the last child that is not a secondary action (HEADER_SECONDARY). Returns the children
 * with that one gaining an aria-label (its visible text, if none was set) and the icon-only class below regular. */
export function withPhonePrimary(actions: React.ReactNode): React.ReactNode[] {
  const items = flattenActions(actions);
  let idx = -1;
  items.forEach((c, i) => {
    if (!React.isValidElement(c) || isPhoneInvisible(c) || c.type === HeaderStatus) return;
    const cn0 = String((c.props as { className?: string }).className ?? "");
    if (!cn0.includes(HEADER_SECONDARY)) idx = i;
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

/** A secondary action: hidden below regular (HEADER_SECONDARY), so it never takes a phone slot. */
function isSecondaryNode(c: React.ReactNode): boolean {
  return React.isValidElement(c) && String((c.props as { className?: string }).className ?? "").includes(HEADER_SECONDARY);
}

/**
 * Splits the actions into the capsule cells (everything except the primary, in order) and the primary, which
 * PageHeader renders as its own control beside the capsule.
 */
export function splitPhoneActions(actions: React.ReactNode): { cells: React.ReactNode[]; primary: React.ReactNode | null } {
  const cells: React.ReactNode[] = [];
  let primary: React.ReactNode | null = null;
  for (const c of withPhonePrimary(actions)) {
    if (React.isValidElement(c) && String((c.props as { className?: string }).className ?? "").includes(PHONE_PRIMARY_CLASS)) {
      primary = c;
    } else {
      cells.push(c);
    }
  }
  return { cells, primary };
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
 * Page header, one component for every size. The phone design is the base: below regular (640px) it is one
 * glass top bar (PHONE_BAR): [left 44px circle back | lead | spacer] [title centred, subtitle under it]
 * [ONE glass capsule holding the primary action and the ⋯ overflow menu]. From regular up the same bar is
 * opaque, the title and subtitle use the system style, the primary action shows its label, and secondary
 * actions (HEADER_SECONDARY) appear inline. `className` and `actionsClassName` are the page's own layout
 * classes and apply at every size.
 *
 * `actions` is the page's action node(s). Secondary buttons inside it must carry HEADER_SECONDARY and have a
 * matching entry in `overflow`; the primary stays visible at every size.
 *
 * Capsule rule (phones): all right-side items sit in ONE capsule (data-slot="header-capsule"), each a 44px slot:
 * icon buttons, the overflow trigger, the primary (filled circle) and HeaderStatus indicators. At most
 * HEADER_MAX_PHONE_ACTIONS phone-visible actions; extra secondary actions MUST go to the overflow menu.
 * Never put a spinner or any other control outside `actions`: it would render as a separate circle beside the capsule.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  overflow,
  className,
  actionsClassName = "flex items-center gap-2",
  lead,
  leadClassName = "flex items-center gap-3",
  belowTitle,
  backHref,
  backLabel,
  onBack,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  overflow?: OverflowAction[];
  /** Page layout classes for the bar (apply at every size). */
  className?: string;
  /**
   * @deprecated No-op since G2-07: the title is one system style at every size. Still accepted and ignored,
   * so existing callers keep compiling. Remove the prop at the call site.
   */
  titleClassName?: string;
  /**
   * @deprecated No-op since G2-07: the subtitle is one system style at every size. Still accepted and ignored.
   * Remove the prop at the call site.
   */
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
  /** Back as a button (history back, etc.) when no link fits. Ignored when a back href applies. */
  onBack?: () => void;
}) {
  // No backHref: a level 2+ route (per the nav registry) gets a back button to its parent. An explicit backHref wins.
  const autoBack = useBackTarget();
  // An onBack button wins over any link (the page's own back, e.g. history back or closing a detail).
  const effectiveBackHref = onBack
    ? undefined
    : backHref ?? (autoBack && autoBack.level >= 2 ? autoBack.href ?? undefined : undefined);
  const hasRight = !!actions || (overflow?.length ?? 0) > 0;
  const h1 = (
    <h1 data-slot="page-header-title" className={cn(HEADER_TITLE_CLASS, PHONE_BAR_TITLE)}>
      {title}
    </h1>
  );
  const titleBlock = (
    <div data-slot="page-header-title-block" className={PHONE_BAR_CENTER}>
      {h1}
      {subtitle ? (
        <p data-slot="page-header-subtitle" className={cn(HEADER_SUBTITLE_CLASS, PHONE_BAR_SUBTITLE)}>
          {subtitle}
        </p>
      ) : null}
      {belowTitle}
    </div>
  );
  const hasLeft = !!effectiveBackHref || !!onBack || !!lead;
  const { cells, primary } = splitPhoneActions(actions);
  const hasCells = (overflow?.length ?? 0) > 0 || cells.some((c) => !isSecondaryNode(c));
  return (
    <div data-slot="page-header" className={cn(className, PHONE_BAR)}>
      {hasLeft ? (
        <div className={cn(leadClassName, "max-regular:contents")}>
          {effectiveBackHref ? (
            <BackButton href={effectiveBackHref} label={backLabel} className="justify-self-start" />
          ) : onBack ? (
            <BackButton onClick={onBack} label={backLabel} className="justify-self-start" />
          ) : null}
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
          {hasCells ? (
            <div data-slot="header-capsule" className={PHONE_CAPSULE}>
              {overflow && overflow.length > 0 ? <OverflowMenu items={overflow} /> : null}
              {cells}
            </div>
          ) : (
            // Only secondary actions (hidden below regular): no capsule, so no empty glass pill on phones.
            cells
          )}
          {primary ? <div data-slot="header-primary" className={PHONE_PRIMARY_SLOT}>{primary}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** "⋯" button (44px below regular) + accessible menu. Visible below regular only. */
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
            className="regular:hidden"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <DropdownMenuItem
              key={it.label}
              disabled={it.disabled}
              variant={it.destructive ? "destructive" : "default"}
              icon={Icon ? <Icon aria-hidden /> : undefined}
              description={it.description}
              onClick={it.onSelect}
              {...(it.href ? { render: <Link href={it.href} /> } : {})}
            >
              {it.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
