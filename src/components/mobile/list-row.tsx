import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SecondaryTone = "pos" | "neg" | "muted";
const TONE: Record<SecondaryTone, string> = {
  pos: "text-pos",
  neg: "text-neg",
  muted: "text-muted-foreground",
};

export interface ListRowProps {
  title: React.ReactNode;
  /** At most one subtitle line. */
  subtitle?: React.ReactNode;
  /** The ONE primary value (usually an <Amount/>). */
  value?: React.ReactNode;
  /** At most one small secondary value (converted amount, %). */
  secondary?: React.ReactNode;
  secondaryTone?: SecondaryTone;
  /** Leading 36px circle tile: an icon, initials, or any node. */
  icon?: LucideIcon;
  initials?: string;
  leading?: React.ReactNode;
  /** Link row. */
  href?: string;
  /** Button row (e.g. open a DetailSheet). */
  onPress?: () => void;
  /** Defaults to true for interactive rows. */
  chevron?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Native list row: [36px circle tile | title + subtitle | value + secondary | chevron],
 * min-h 56px (44px when data-density=compact; never below 44px). Below md lists never use multi-column tables: one primary value on the
 * right, everything else lives in a detail sheet.
 */
export function ListRow({
  title, subtitle, value, secondary, secondaryTone = "muted",
  icon: Icon, initials, leading, href, onPress, chevron, className, ...rest
}: ListRowProps) {
  const interactive = !!href || !!onPress;
  const showChevron = chevron ?? interactive;
  const tile =
    leading ??
    (Icon || initials ? (
      <span
        data-slot="list-row-tile"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground"
      >
        {Icon ? <Icon className="size-[18px]" aria-hidden /> : initials}
      </span>
    ) : null);

  const body = (
    <>
      {tile}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        {subtitle ? <span className="block truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
      {value !== undefined || secondary !== undefined ? (
        <span className="flex max-w-[55%] shrink-0 flex-col items-end">
          {value}
          {secondary !== undefined ? (
            <span
              data-slot="list-row-secondary"
              data-tone={secondaryTone}
              className={cn("tabular-nums whitespace-nowrap text-xs", TONE[secondaryTone])}
            >
              {secondary}
            </span>
          ) : null}
        </span>
      ) : null}
      {showChevron ? <ChevronRight data-slot="list-row-chevron" aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  const cls = cn(
    "flex min-h-[56px] dense:min-h-11 w-full items-center gap-3 px-1 py-2 text-left",
    interactive && "outline-none transition-colors hover:bg-muted/50 active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg",
    className,
  );
  if (href) return <Link data-slot="list-row" href={href} className={cls} {...rest}>{body}</Link>;
  if (onPress) return <button data-slot="list-row" type="button" onClick={onPress} className={cls} {...rest}>{body}</button>;
  return <div data-slot="list-row" className={cls} {...rest}>{body}</div>;
}
