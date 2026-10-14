"use client";

import * as React from "react";
import Link from "next/link";
import { Filter, ListChecks, MoreHorizontal, Settings, type LucideIcon } from "lucide-react";
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
import { useBackTarget } from "@/components/adaptive/use-back-target";
import { usePageCustomizeRegistration } from "./page-customize";
import { FilterButton } from "@/components/page-toolbar";

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
 * Secondary header action: hidden from the bar at EVERY width (one top bar, phone design everywhere); it must have a
 * matching entry in the PageHeader `overflow` menu. The `header-secondary` token is the marker splitPhoneActions reads.
 */
export const HEADER_SECONDARY = "header-secondary hidden";

/** Alias of HEADER_SECONDARY, kept so existing callers keep working. */
export const HEADER_DESKTOP_ONLY = HEADER_SECONDARY;

/**
 * Sticky top bar, every width. Pinned at the top of the window (safe-area inset). z-30 above section labels (z-10),
 * below the rail (z-50). Keep ONE position class on the bar: cn()/twMerge drops sticky if a relative/absolute/fixed
 * class is merged in.
 */
export const PHONE_BAR_STICKY = "glass-bar sticky top-[var(--sat,0px)] z-30";

/**
 * The top bar, shared by PageHeader and the settings detail row, at EVERY width. Adds to PHONE_BAR_STICKY:
 * `page-header-bleed` (globals.css) makes the bar span the FULL width of the main area right of the rail (back at the left
 * edge, actions at the right edge, shell padding inside); a three-column grid, min-h --phone-header-h (3.75rem).
 * Columns: [left slot | title | right capsule]. The side tracks are min 2.75rem (one 44pt target) and
 * size to their content, so the title column is exactly the space between the MEASURED slots: a title or
 * subtitle can never run under the capsule. The title block is left-aligned in its column, next to the back button.
 * items-center puts a 44px control centred in the 60px bar (no ring on the hairline).
 * No pt-[var(--sat)]: body already pads its in-flow top by --sat.
 */
export const PHONE_BAR =
  "glass-bar sticky top-[var(--sat,0px)] z-30 page-header-bleed grid min-h-[var(--phone-header-h)] grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 items-center";

/** Left slot placeholder (no back target): keeps the title column aligned. */
export const PHONE_BAR_SIDE = "flex size-11 shrink-0 col-start-1 row-start-1";

/** Title block: the middle grid column (between the measured slots). min-w-0 lets the title truncate.
 * pointer-events-none: taps reach the buttons. */
export const PHONE_BAR_CENTER =
  "col-start-2 row-start-1 flex min-w-0 flex-col items-start justify-center text-left pointer-events-none";

/** Class added to the primary action: an icon-only 44px cell at every width (globals.css). */
export const PHONE_PRIMARY_CLASS = "phone-icon-action";

/**
 * Marks a non-primary header control (avatar link, status toggle, icon link) so it is never chosen as the primary
 * action. It stays a plain neutral capsule cell (no accent fill).
 */
export const HEADER_CELL = "header-cell";

/**
 * Marks the page's SAVE action (Add / Edit screens). At every width it leaves the capsule and is its own round
 * yellow check button beside it (the iOS Notes "Done" pattern, globals.css .header-save). The action keeps its own onClick / form / disabled; give it an
 * aria-label ("Save") and an icon child plus the visible text.
 */
export const HEADER_SAVE = "header-save";

/** Pulls the HEADER_SAVE action out of `actions`; the rest goes through splitPhoneActions as before. */
export function splitHeaderSave(actions: React.ReactNode): { save: React.ReactNode | null; rest: React.ReactNode[] } {
  let save: React.ReactNode | null = null;
  const rest: React.ReactNode[] = [];
  for (const c of flattenActions(actions)) {
    if (save === null && React.isValidElement(c) && String((c.props as { className?: string }).className ?? "").includes(HEADER_SAVE)) {
      save = c;
    } else {
      rest.push(c);
    }
  }
  return { save, rest };
}

/** Title, every width: system scale (iOS headline is 17pt semibold; text-base is the nearest step), one line. */
export const PHONE_BAR_TITLE =
  "max-w-full text-base font-semibold tracking-normal truncate text-left";

/** Subtitle, every width: a truncated muted caption (text-xs, the system caption step) left-aligned under the title. */
export const PHONE_BAR_SUBTITLE = "block mt-0 w-full truncate text-left text-xs text-muted-foreground";

/**
 * Icon cells in the capsule: at most this many phone-visible non-primary actions (icon buttons, HeaderStatus).
 * The overflow trigger is one more cell, so the capsule holds at most 4 x 44px = 11rem. Anything beyond goes into
 * the overflow menu (secondary: HEADER_SECONDARY + an `overflow` entry). Enforced statically by
 * tests/ios/header-actions.test.ts.
 */
export const HEADER_MAX_PHONE_ACTIONS = 3;

/**
 * Right group (grid column 3, every width), left to right: [secondary capsule][gap-2][PRIMARY]. The capsule
 * (data-slot="header-capsule") holds the neutral secondary 44px cells (icon cells, HeaderStatus, the overflow
 * trigger). The primary (or HEADER_SAVE) is its OWN round yellow 44px button, always rightmost.
 */
export const PHONE_BAR_RIGHT =
  "col-start-3 row-start-1 flex min-w-0 shrink-0 flex-nowrap items-center justify-self-end gap-2";

/**
 * The capsule: ONE glass pill (44px high, no padding, no gaps) holding only icon cells, the primary (as the last
 * icon cell) and the overflow trigger. Each cell is a 44px slot; a single cell makes a 44px circle. Max 4 cells
 * = 11rem; no horizontal scroll.
 * Icon buttons and text buttons never share a capsule (HIG), so text is never a cell.
 */
export const PHONE_CAPSULE =
  "glass-capsule flex h-11 max-w-[11rem] min-w-0 shrink-0 flex-nowrap items-center gap-0 rounded-full p-0";


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

const SECONDARY_RE = /(^|\s)header-secondary(\s|$)/;

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
  return c.type === Dialog || c.type === DropdownMenu;
}

/** The primary action is the last child that is not a secondary action (HEADER_SECONDARY) and not a header cell
 * (HEADER_CELL, an opt-out marker). Returns the children with that one gaining an aria-label (its visible text, if
 * none was set) and the icon-only class (PHONE_PRIMARY_CLASS). */
export function withPhonePrimary(actions: React.ReactNode): React.ReactNode[] {
  const items = flattenActions(actions);
  let idx = -1;
  items.forEach((c, i) => {
    if (!React.isValidElement(c) || isPhoneInvisible(c) || c.type === HeaderStatus) return;
    const cn0 = String((c.props as { className?: string }).className ?? "");
    if (!SECONDARY_RE.test(cn0) && !cn0.includes(HEADER_CELL)) idx = i;
  });
  if (idx < 0) return items;
  return items.map((c, i) => {
    if (i !== idx || !React.isValidElement(c)) return c;
    const p = c.props as { className?: string; "aria-label"?: string; children?: React.ReactNode };
    const label = (p["aria-label"] ?? textOf(p.children)).trim();
    return React.cloneElement(c as React.ReactElement<{ className?: string; "aria-label"?: string }>, {
      "aria-label": label || undefined,
      className: cn(p.className, PHONE_PRIMARY_CLASS),
    });
  });
}

/** A secondary action: hidden at every width (HEADER_SECONDARY), so it never takes a bar slot. */
function isSecondaryNode(c: React.ReactNode): boolean {
  return React.isValidElement(c) && SECONDARY_RE.test(String((c.props as { className?: string }).className ?? ""));
}

/**
 * Splits the actions into the capsule cells (everything except the primary, in order) and the primary. PageHeader
 * renders the primary inside the capsule, after the cells and before the overflow trigger.
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
 * Page header, one design at every width (owner 2026-10-13): one glass top bar (PHONE_BAR): [left 44px circle back |
 * lead | spacer] [title left-aligned, subtitle under it] [ONE glass capsule holding the secondary icon cells and the
 * ⋯ overflow menu, then the primary as its own round button]. The glass spans the main area right of the rail;
 * the grid fills it edge to edge. There is no separate desktop layout.
 *
 * `actions` is the page's action node(s). Secondary buttons inside it must carry HEADER_SECONDARY (hidden at every
 * width) and have a matching entry in `overflow`; the primary stays visible.
 *
 * Capsule rule: secondary items sit in ONE capsule (data-slot="header-capsule"), each a 44px slot: icon buttons,
 * the overflow trigger and HeaderStatus indicators. The primary is a separate round button on the far right
 * (primary = the main action, secondary = More). At most HEADER_MAX_PHONE_ACTIONS visible actions; extra secondary
 * actions MUST go to the overflow menu. Never put a spinner or any other control outside `actions`.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  overflow,
  filter,
  bulkEdit,
  hideMore,
  className,
  lead,
  belowTitle,
  backHref,
  backLabel,
  onBack,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  overflow?: OverflowAction[];
  /**
   * Filter: opens the page's filter + sort page. Top bar actions, right to left: PRIMARY (yellow Add / Edit), then a
   * secondary group of at most 2 buttons: [bulk-edit or Filter] on the right, [More] on its left. Bulk edit wins the
   * slot; with a `bulkEdit` the Filter entry moves INSIDE More. The Customize-cards action (usePageCustomize) is
   * always a More item, never a bar button. A page declares what it has; it never lays the bar out itself.
   */
  filter?: { href: string | (() => string); activeCount?: number };
  /** Bulk-edit / select-mode toggle for lists (icon button, aria-label `label`, default "Edit list"). */
  bulkEdit?: { onToggle: () => void; active?: boolean; label?: string };
  /** Render no More button at all (e.g. /categories). Also skips Customize cards. With `hideMore`, `bulkEdit` and `filter` both render (bulk edit, then Filter) since that still keeps the group at 2 buttons. */
  hideMore?: boolean;
  /** Page layout classes for the bar; the bar's grid layout always wins over conflicting ones. */
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
  /** @deprecated No-op: the right group is the fixed bar layout. Accepted and ignored. */
  actionsClassName?: string;
  /** Node left of the title block (e.g. an avatar tile). */
  lead?: React.ReactNode;
  /** @deprecated No-op: the left slot is part of the fixed bar grid. Accepted and ignored. */
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
  const { save, rest: otherActions } = splitHeaderSave(actions);
  // Set by a page with cards (usePageCustomize): the Customize button joins the More group, right after More.
  const customize = usePageCustomizeRegistration();
  // More menu: Filter (only when bulk edit took its slot), the page's own items, then Customize cards.
  const moreItems: OverflowAction[] = hideMore ? [] : [
    ...(bulkEdit && filter
      ? [{ label: "Filter", icon: Filter, href: typeof filter.href === "function" ? filter.href() : filter.href }]
      : []),
    ...(overflow ?? []),
    ...(customize ? [{ label: "Customize cards", icon: Settings, onSelect: customize.onOpen }] : []),
  ];
  const hasRight = !!actions || moreItems.length > 0 || !!filter || !!bulkEdit;
  const h1 = (
    <h1 data-slot="page-header-title" className={PHONE_BAR_TITLE}>
      {title}
    </h1>
  );
  const titleBlock = (
    <div data-slot="page-header-title-block" className={PHONE_BAR_CENTER}>
      {h1}
      {subtitle ? (
        <p data-slot="page-header-subtitle" className={PHONE_BAR_SUBTITLE}>
          {subtitle}
        </p>
      ) : null}
      {belowTitle}
    </div>
  );
  const hasLeft = !!effectiveBackHref || !!onBack || !!lead;
  const { cells, primary } = splitPhoneActions(otherActions);
  // With a HEADER_SAVE the save is the primary (round yellow, rightmost) and any other primary stays a capsule cell.
  // Otherwise the primary is its OWN yellow round button on the far right, the secondary cells + overflow a capsule on its left.
  const primaryOwn = !save && !!primary;
  const capsulePrimary = save ? primary : null;
  const hasCapsule =
    moreItems.length > 0 || !!filter || !!bulkEdit || !!capsulePrimary || cells.some((c) => !isSecondaryNode(c));
  return (
    <div data-slot="page-header" className={cn(className, PHONE_BAR)}>
      {hasLeft ? (
        <div className="contents">
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
          <span aria-hidden data-slot="page-header-spacer" className="hidden" />
          {titleBlock}
        </>
      )}
      {hasRight ? (
        <div data-slot="page-header-actions" className={PHONE_BAR_RIGHT}>
          {hasCapsule ? (
            <div data-slot="header-capsule" className={PHONE_CAPSULE}>
              {cells}
              {capsulePrimary}
              {moreItems.length > 0 ? <OverflowMenu items={moreItems} /> : null}
              {bulkEdit ? (
                <Button
                  type="button"
                  variant={bulkEdit.active ? "secondary" : "outline"}
                  size="icon"
                  aria-label={bulkEdit.label ?? "Edit list"}
                  aria-pressed={bulkEdit.active ?? false}
                  data-slot="bulk-edit-trigger"
                  onClick={bulkEdit.onToggle}
                >
                  <ListChecks className="size-4" aria-hidden />
                </Button>
              ) : filter ? (
                <FilterButton {...filter} variant="outline" />
              ) : null}
              {/* No More button (hideMore): bulk edit and Filter are then the two secondary buttons. */}
              {hideMore && bulkEdit && filter ? <FilterButton {...filter} variant="outline" /> : null}
            </div>
          ) : (
            // Only secondary actions (hidden at every width): no capsule, so no empty glass pill.
            cells
          )}
          {primaryOwn ? primary : null}
          {save}
        </div>
      ) : null}
    </div>
  );
}

/** "⋯" button (44px) + accessible menu. Shown at every width (the More group). */
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
