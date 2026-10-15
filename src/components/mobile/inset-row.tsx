"use client";

/**
 * Rows for iOS-style grouped lists. The container + its title is SectionCard (`list`, label inside or outside).
 *  - InsetRow: 56px row with optional outline icon, label, muted value, badge, chevron, or a switch.
 *    Variants: default, accent (primary text), destructive, toggle.
 *  - ThemePicker: Light / Dark / System preview thumbnails as a radiogroup (roving tabindex, arrows).
 * Design tokens only: no palette colours, no breakpoint tokens, no text-[Npx].
 */

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/* ---------- row ---------- */

/** Divider shadow under every row except the last of its group (the --list-divider token, light + dark). */
const DIVIDER = "not-last:shadow-[var(--list-divider)]";

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

  // current: the selected row of a column list (column-nav.tsx): tinted background, accent icon.
  const cls = cn(ROW_BASE, DIVIDER, current && "bg-primary/10 hover:bg-primary/10 [&>svg:first-child]:text-primary", className);
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
    <span aria-hidden="true" className="relative block aspect-[4/5] w-full overflow-hidden rounded-group ring-1 ring-foreground/10">
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
            className="group flex min-h-11 flex-col items-center gap-2 rounded-group outline-none transition-opacity active:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span
              className={cn(
                "block w-full rounded-group p-0.5 ring-2 ring-offset-2 ring-offset-card transition-colors",
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
