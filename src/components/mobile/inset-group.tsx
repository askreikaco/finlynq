"use client";

/**
 * iOS-style grouped (inset) lists. Pieces:
 *  - InsetSectionHeader: small grey heading above a group.
 *  - InsetGroup: one rounded container (rounded-3xl, bg-card, no border). Hairlines between its rows
 *    start after the leading icon (or avatar) and never follow the last row.
 *  - InsetRow: 56px row with optional outline icon, label, muted value, badge, chevron, or a switch.
 *    Variants: default, accent (primary text), destructive, toggle.
 *  - AccountCard: an avatar row for the signed-in account and the account list.
 *  - ThemePicker: Light / Dark / System preview thumbnails as a radiogroup (roving tabindex, arrows).
 * Design tokens only: no palette colours, no breakpoint tokens, no text-[Npx].
 */

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/* ---------- section header ---------- */

export function InsetSectionHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 data-slot="inset-section-header" className={cn("px-4 text-sm font-medium text-muted-foreground", className)}>
      {children}
    </h2>
  );
}

/* ---------- group ---------- */

export interface InsetGroupProps {
  children: React.ReactNode;
  className?: string;
  /** Where hairlines start: after a 22px icon (default) or after a 36-40px avatar. */
  inset?: "icon" | "avatar";
  "data-testid"?: string;
  "aria-label"?: string;
}

const INSET_SEP: Record<NonNullable<InsetGroupProps["inset"]>, string> = {
  icon: "3.125rem",
  avatar: "4rem",
};

export function InsetGroup({ children, className, inset = "icon", ...rest }: InsetGroupProps) {
  return (
    <div
      data-slot="inset-group"
      className={cn("overflow-hidden rounded-3xl bg-card", className)}
      style={{ ["--inset-sep" as string]: INSET_SEP[inset] } as React.CSSProperties}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------- row ---------- */

/** Hairline above every row except the first child of its group, starting at the inset. */
const DIVIDER =
  "before:absolute before:top-0 before:right-0 before:h-px before:bg-border before:left-[var(--inset-sep,3.125rem)] first:before:hidden";

const ROW_BASE =
  "relative flex w-full min-h-14 items-center gap-3 px-4 py-3 text-left text-base outline-none transition-colors " +
  "hover:bg-muted/40 active:bg-muted/60 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 " +
  "disabled:pointer-events-none disabled:opacity-50";

export interface InsetRowProps {
  label: React.ReactNode;
  icon?: LucideIcon;
  /** Muted trailing text, e.g. a plan name. */
  value?: React.ReactNode;
  /** Unread count; renders a primary pill when > 0. */
  badge?: number;
  /** Any extra trailing node (rendered before the chevron). */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** Defaults to true for link/button rows, false for destructive and toggle rows. */
  chevron?: boolean;
  /** Primary (accent) text and icon, e.g. "Add account". */
  accent?: boolean;
  /** Destructive token text and icon, e.g. "Log out". */
  destructive?: boolean;
  /** Row with an iOS switch on the right. */
  toggle?: { checked: boolean; onCheckedChange: (checked: boolean) => void; "aria-label"?: string };
  disabled?: boolean;
  /** Current item (aria-current) for link rows. */
  current?: boolean;
  title?: string;
  className?: string;
  "data-testid"?: string;
}

export function InsetRow({
  label,
  icon: Icon,
  value,
  badge = 0,
  trailing,
  href,
  onClick,
  chevron,
  accent = false,
  destructive = false,
  toggle,
  disabled = false,
  current,
  title,
  className,
  "data-testid": testId,
}: InsetRowProps) {
  const interactive = !!href || !!onClick;
  const showChevron = chevron ?? (interactive && !destructive && !toggle);
  const tone = destructive ? "text-destructive" : accent ? "text-primary" : "text-muted-foreground";
  const labelTone = destructive ? "text-destructive" : accent ? "text-primary" : "text-foreground";

  const content = (
    <>
      {Icon ? (
        <Icon aria-hidden="true" strokeWidth={1.75} className={cn("size-[22px] shrink-0", tone)} />
      ) : null}
      <span className={cn("min-w-0 flex-1 truncate", labelTone)}>{label}</span>
      {value !== undefined && value !== null && value !== "" ? (
        <span data-slot="inset-row-value" className="shrink-0 text-base text-muted-foreground">
          {value}
        </span>
      ) : null}
      {badge > 0 ? (
        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground">
          {badge}
        </span>
      ) : null}
      {trailing}
      {showChevron ? <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  if (toggle) {
    return (
      <div data-slot="inset-row" data-variant="toggle" className={cn(ROW_BASE, DIVIDER, className)} data-testid={testId}>
        {Icon ? <Icon aria-hidden="true" strokeWidth={1.75} className={cn("size-[22px] shrink-0", tone)} /> : null}
        <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
        <Switch
          checked={toggle.checked}
          onCheckedChange={toggle.onCheckedChange}
          disabled={disabled}
          aria-label={toggle["aria-label"] ?? (typeof label === "string" ? label : undefined)}
        />
      </div>
    );
  }

  const cls = cn(ROW_BASE, DIVIDER, className);
  const variant = destructive ? "destructive" : accent ? "accent" : "default";

  if (href) {
    return (
      <Link
        href={href}
        data-slot="inset-row"
        data-variant={variant}
        aria-current={current ? "true" : undefined}
        title={title}
        className={cls}
        data-testid={testId}
      >
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        data-slot="inset-row"
        data-variant={variant}
        onClick={onClick}
        disabled={disabled}
        aria-current={current ? "true" : undefined}
        title={title}
        className={cls}
        data-testid={testId}
      >
        {content}
      </button>
    );
  }
  return (
    <div data-slot="inset-row" data-variant={variant} className={cls} data-testid={testId}>
      {content}
    </div>
  );
}

/* ---------- account card row ---------- */

export interface AccountCardProps {
  /** Avatar text, e.g. "MD". */
  initials: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  subtitleIcon?: LucideIcon;
  /** Highlights the avatar ring (current account). */
  current?: boolean;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
  className?: string;
}

export function AccountCard({
  initials,
  title,
  subtitle,
  subtitleIcon: SubIcon,
  current = false,
  href,
  onClick,
  chevron,
  trailing,
  disabled = false,
  className,
  ...rest
}: AccountCardProps) {
  const interactive = !!href || !!onClick;
  const showChevron = chevron ?? interactive;
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          current ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground",
        )}
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-foreground">{title}</span>
        {subtitle ? (
          <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            {SubIcon ? <SubIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{subtitle}</span>
          </span>
        ) : null}
      </span>
      {trailing}
      {showChevron ? <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );
  const cls = cn(ROW_BASE, DIVIDER, "py-2.5", className);
  if (href) {
    return (
      <Link href={href} data-slot="account-card" className={cls} aria-label={rest["aria-label"]} data-testid={rest["data-testid"]}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        data-slot="account-card"
        onClick={onClick}
        disabled={disabled}
        aria-current={current ? "true" : undefined}
        aria-label={rest["aria-label"]}
        className={cls}
        data-testid={rest["data-testid"]}
      >
        {body}
      </button>
    );
  }
  return (
    <div data-slot="account-card" className={cls} data-testid={rest["data-testid"]}>
      {body}
    </div>
  );
}

/* ---------- theme picker ---------- */

export type ThemeChoice = "light" | "dark" | "system";
const THEME_OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Miniature screen: a fill, two grey lines and an accent dot. Fixed tones, so Light and Dark stay readable in either theme. */
function MiniScreen({ tone }: { tone: "light" | "dark" }) {
  const light = tone === "light";
  return (
    <span className={cn("flex h-full w-full flex-col gap-1.5 p-2.5", light ? "bg-white" : "bg-black")}>
      <span className="size-2.5 rounded-full bg-primary" />
      <span className={cn("h-1.5 w-3/4 rounded-full", light ? "bg-black/20" : "bg-white/30")} />
      <span className={cn("h-1.5 w-1/2 rounded-full", light ? "bg-black/20" : "bg-white/30")} />
    </span>
  );
}

function ThemeThumb({ value }: { value: ThemeChoice }) {
  return (
    <span aria-hidden="true" className="relative block aspect-[4/5] w-full overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      {value === "system" ? (
        <>
          <span className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
            <MiniScreen tone="light" />
          </span>
          <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
            <MiniScreen tone="dark" />
          </span>
        </>
      ) : (
        <MiniScreen tone={value} />
      )}
    </span>
  );
}

export interface ThemePickerProps {
  value: ThemeChoice;
  onChange: (value: ThemeChoice) => void;
  label?: string;
}

/**
 * Appearance thumbnails as a radiogroup. Roving tabindex: the selected option is the tab stop;
 * Arrow keys move and select (Left/Up previous, Right/Down next). Selected = primary ring and label.
 */
export function ThemePicker({ value, onChange, label = "Appearance" }: ThemePickerProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Math.max(0, THEME_OPTIONS.findIndex((o) => o.value === value));

  const step = (from: number, delta: number) => {
    const n = THEME_OPTIONS.length;
    const next = (from + delta + n) % n;
    onChange(THEME_OPTIONS[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      step(i, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      step(i, -1);
    }
  };

  return (
    <div role="radiogroup" aria-label={label} data-slot="theme-picker" className="grid grid-cols-3 gap-3 p-4">
      {THEME_OPTIONS.map((o, i) => {
        const checked = i === selected;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={onKeyDown(i)}
            data-testid={`theme-${o.value}`}
            className="group flex min-h-11 flex-col items-center gap-2 rounded-2xl outline-none transition-opacity active:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span
              className={cn(
                "block w-full rounded-2xl p-0.5 ring-2 ring-offset-2 ring-offset-card transition-colors",
                checked ? "ring-primary" : "ring-transparent",
              )}
            >
              <ThemeThumb value={o.value} />
            </span>
            <span className={cn("text-sm", checked ? "font-semibold text-primary" : "text-muted-foreground")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
