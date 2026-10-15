"use client"

import * as React from "react"
import Link from "next/link"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva } from "class-variance-authority"
import { Loader2, type LucideIcon } from "lucide-react"

import { CONTROL_SURFACE } from "@/components/ui/control-surface"
import { cn } from "@/lib/utils"

/**
 * The ONE button. Every variation is a prop; unused props render nothing.
 *  - variant: primary (yellow, Add / Edit / Save only in the top bar) | secondary | outline | ghost | destructive | link
 *  - size: sm | md | lg | fab (fab = the 56px floating action button)
 *  - shape: rect (rounded-lg) | round (rounded-full)
 *  - iconOnly: square (rect) or circle (round); needs aria-label or tooltip. A round iconOnly Button is the uniform
 *    44px toolbar / header control and a ghost one wears CONTROL_SURFACE (card colour, border, inner shadow) unless surface={false}.
 *  - leading / trailing: an icon component or node; loading swaps the leading icon for a spinner, disables, sets aria-busy
 *  - badge: count pill on the corner (filter active count); pressed: toggle state (aria-pressed)
 *  - href: renders a Link (a disabled link stays a link, aria-disabled)
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 disabled:aria-busy:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 motion-safe:active:translate-y-px active:opacity-90",
  {
    variants: {
      variant: {
        primary: "bg-primary shadow-[var(--shadow-card)] text-primary-foreground [a]:hover:bg-primary/80 active:bg-primary/80",
        outline:
          "surface-card border-border hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary dark:border-input dark:hover:bg-input/50",
        secondary:
          "surface-card text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground aria-pressed:bg-secondary",
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/25 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40 shadow-[var(--shadow-card)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Touch sizes are pointer-based: pointer-coarse:* is 44px on every coarse device (iPhone and iPad).
      // dense:pointer-fine:* only shrinks fine-pointer desktops in compact density; coarse never matches it.
      size: {
        "sm": "h-7 pointer-coarse:h-11 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        "md": "h-8 pointer-coarse:h-11 dense:pointer-fine:h-7 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        "lg": "h-11 pointer-coarse:h-11 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        fab: "size-14 min-h-row min-w-11 p-0 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-white/15 transition-transform duration-150 motion-safe:active:scale-95 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 [&_svg:not([class*='size-'])]:size-6",
      },
      shape: { rect: "rounded-lg", round: "rounded-full" },
      iconOnly: { true: "gap-0 p-0", false: "" },
      fullWidth: { true: "w-full", false: "" },
    },
    compoundVariants: [
      { size: "sm", shape: "rect", class: "rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg" },
      { size: "sm", iconOnly: true, shape: "rect", class: "size-7 pointer-coarse:size-11" },
      { size: "md", iconOnly: true, shape: "rect", class: "size-8 pointer-coarse:size-11 dense:pointer-fine:size-7" },
      { size: "lg", iconOnly: true, shape: "rect", class: "size-11 pointer-coarse:size-11" },
      // A link is inline text: it takes the line height, not a control height.
      { variant: "link", class: "h-auto min-h-0 px-0 pointer-coarse:h-auto" },
      // Round icon buttons are the uniform 44px circle (toolbar, header); sm is the small clear / close circle.
      { size: "sm", iconOnly: true, shape: "round", class: "size-8 pointer-coarse:size-11" },
      { size: "md", iconOnly: true, shape: "round", class: "size-11 pointer-coarse:size-11 dense:pointer-fine:size-11" },
      { size: "lg", iconOnly: true, shape: "round", class: "size-11 pointer-coarse:size-11 dense:pointer-fine:size-11" },
    ],
    defaultVariants: { variant: "primary", size: "md", shape: "rect", iconOnly: false, fullWidth: false },
  }
)

type Variant = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"]
type Size = NonNullable<Parameters<typeof buttonVariants>[0]>["size"]

export interface ButtonProps extends Omit<ButtonPrimitive.Props, "render" | "nativeButton"> {
  variant?: Variant
  size?: Size
  shape?: "rect" | "round"
  iconOnly?: boolean
  /** Card-style control surface (CONTROL_SURFACE). Default: on for a ghost round iconOnly Button, off otherwise. */
  surface?: boolean
  leading?: React.ReactNode | LucideIcon
  trailing?: React.ReactNode | LucideIcon
  loading?: boolean
  badge?: number | React.ReactNode
  pressed?: boolean
  fullWidth?: boolean
  href?: string
  tooltip?: string
}

function renderIcon(icon: React.ReactNode | LucideIcon): React.ReactNode {
  if (icon == null || icon === false) return null
  if (React.isValidElement(icon) || typeof icon === "string" || typeof icon === "number" || Array.isArray(icon)) return icon as React.ReactNode
  return React.createElement(icon as LucideIcon, { "aria-hidden": true })
}

/** A link keeps link semantics: props are merged onto a Next Link (Base UI's Button would force role="button"). */
function ButtonLink({
  href,
  state,
  className,
  off,
  content,
  rest,
  ref,
}: {
  href: string
  state: Record<string, unknown>
  className: string
  off: boolean
  content: React.ReactNode
  rest: Record<string, unknown>
  ref?: React.Ref<HTMLElement>
}) {
  const { nativeButton: _n, focusableWhenDisabled: _f, ...anchorRest } = rest
  void _n
  void _f
  return useRender({
    render: <Link href={href}>{content}</Link>,
    ref: ref as React.Ref<HTMLAnchorElement> | undefined,
    props: mergeProps<"a">(
      {
        ...state,
        className: cn(className, "aria-disabled:pointer-events-none aria-disabled:opacity-50"),
        ...(off ? { "aria-disabled": true, tabIndex: -1 } : {}),
      } as React.ComponentPropsWithRef<"a">,
      anchorRest as React.ComponentPropsWithRef<"a">
    ),
  })
}

function Button({
  variant = "primary",
  size = "md",
  shape = "rect",
  iconOnly = false,
  surface,
  leading,
  trailing,
  loading = false,
  badge,
  pressed,
  fullWidth = false,
  href,
  tooltip,
  className,
  disabled,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const round = shape === "round" || size === "fab"
  const classes = cn(
    buttonVariants({ variant, size, shape: round ? "round" : "rect", iconOnly: iconOnly || size === "fab", fullWidth }),
    (surface ?? (round && iconOnly && variant === "ghost")) && CONTROL_SURFACE,
    className
  )
  const hasBadge = badge != null && badge !== 0 && badge !== false
  const content = (
    <>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : renderIcon(leading)}
      {iconOnly && loading ? null : children}
      {renderIcon(trailing)}
      {hasBadge ? (
        <span
          data-slot="button-badge"
          aria-hidden
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
        >
          {badge}
        </span>
      ) : null}
    </>
  )
  const state = {
    "data-slot": "button",
    "data-size": size,
    "data-variant": variant,
    title: tooltip,
    ...(tooltip && iconOnly && rest["aria-label"] === undefined ? { "aria-label": tooltip } : {}),
    ...(pressed !== undefined ? { "aria-pressed": pressed } : {}),
    ...(loading ? { "aria-busy": true } : {}),
  }
  const off = disabled || loading

  if (href !== undefined) {
    return <ButtonLink href={href} state={state} className={classes} off={!!off} content={content} rest={rest} ref={ref} />
  }
  return (
    <ButtonPrimitive ref={ref as React.Ref<HTMLButtonElement>} disabled={off} className={classes} {...state} {...rest}>
      {content}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
