"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 motion-safe:active:translate-y-px active:opacity-90",
  {
    variants: {
      variant: {
        default: "bg-primary shadow-[var(--shadow-card)] text-primary-foreground [a]:hover:bg-primary/80 active:bg-primary/80",
        outline:
          "surface-card border-border hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:hover:bg-input/50",
        secondary:
          "surface-card text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/25 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40 shadow-[var(--shadow-card)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Touch sizes are pointer-based: pointer-coarse:* is 44px on every coarse device (iPhone and iPad).
      // dense:pointer-fine:* only shrinks fine-pointer desktops in compact density; coarse never matches it.
      size: {
        default:
          "h-8 pointer-coarse:h-11 dense:pointer-fine:h-7 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 pointer-coarse:before:content-[''] gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 pointer-coarse:h-11 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 pointer-coarse:h-11 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 pointer-coarse:size-11 dense:pointer-fine:size-7",
        "icon-xs":
          "size-6 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 pointer-coarse:before:content-[''] rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 pointer-coarse:size-11 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9 pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Base UI's Button assumes a native <button> and, for any other element, either warns (nativeButton) or overrides
 * the semantics with role="button". A link rendered through `render` (render={<Link href=... />}) must stay a
 * link, so a `render` element that is not a literal <button> is rendered with useRender (props merged onto the
 * element, no button behaviour) instead of ButtonPrimitive.
 */
function isNonButtonRender(render: unknown): boolean {
  return React.isValidElement(render) && render.type !== "button"
}

function ButtonAsElement({
  className,
  variant = "default",
  size = "default",
  render,
  disabled,
  ref,
  nativeButton: _nativeButton,
  focusableWhenDisabled: _focusableWhenDisabled,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  void _nativeButton
  void _focusableWhenDisabled
  return useRender({
    render: render as React.ReactElement,
    ref: ref as React.Ref<HTMLAnchorElement> | undefined,
    props: mergeProps<"a">(
      {
        "data-slot": "button",
        "data-size": size,
        "data-variant": variant,
        className: cn(buttonVariants({ variant, size, className }), "aria-disabled:pointer-events-none aria-disabled:opacity-50"),
        ...(disabled ? { "aria-disabled": true, tabIndex: -1 } : {}),
      } as React.ComponentPropsWithRef<"a">,
      props as React.ComponentPropsWithRef<"a">
    ),
  })
}

function Button(props: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  if (isNonButtonRender(props.render) && props.nativeButton !== true) return <ButtonAsElement {...props} />
  const { className, variant = "default", size = "default", ...rest } = props
  return (
    <ButtonPrimitive
      data-slot="button"
      data-size={size}
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...rest}
    />
  )
}

export { Button, buttonVariants }
