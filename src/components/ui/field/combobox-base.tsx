"use client"

/**
 * Internal to Field: a type-ahead-filterable single-select dropdown on the shared control surface, built on
 * `@base-ui/react/combobox` (single-selection mode; filtering is automatic when `items` are passed). Pages never
 * import this file (tests/guards/one-field.test.ts); they render <Field control="combobox" options={...} />.
 *
 * base-ui's `onValueChange` may pass `null`: the wrapper coerces to a string with `?? ""` before invoking the caller.
 */

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { CONTROL_BOX, CONTROL_BOX_COMPACT, CONTROL_FOCUS_VISIBLE, CONTROL_STATE, CONTROL_SURFACE } from "../control-surface"

export type ComboboxItemShape = {
  value: string
  label: string
  disabled?: boolean
}

function ComboboxTrigger({
  className,
  compact = false,
  invalid = false,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props & { compact?: boolean; invalid?: boolean }) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      data-invalid={invalid || undefined}
      className={cn(
        CONTROL_SURFACE,
        compact ? CONTROL_BOX_COMPACT : CONTROL_BOX,
        CONTROL_STATE,
        CONTROL_FOCUS_VISIBLE,
        "flex items-center justify-between gap-1.5 whitespace-nowrap select-none data-placeholder:text-muted-foreground active:bg-muted/50 *:data-[slot=combobox-value]:line-clamp-1 *:data-[slot=combobox-value]:flex *:data-[slot=combobox-value]:items-center *:data-[slot=combobox-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxValue({
  className,
  ...props
}: ComboboxPrimitive.Value.Props & { className?: string }) {
  return (
    <span data-slot="combobox-value" className={cn("flex flex-1 text-left", className)}>
      <ComboboxPrimitive.Value {...props} />
    </span>
  )
}

function ComboboxContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "relative isolate z-50 max-h-(--available-height) min-w-(--anchor-width) max-w-[24rem] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

/**
 * `autoFocus` is deliberate: opening the popup leaves focus on the TRIGGER
 * button, so without it you had to click the search box before typing —
 * which defeats the point of a type-ahead control (measured on
 * /settings/general: `document.activeElement` was `BUTTON[role=combobox]`
 * after opening). Keyboard users were unaffected either way (base-ui forwards
 * printable keys from the trigger), but pointer users had to click twice.
 */
function ComboboxInput({
  className,
  placeholder = "Search…",
  autoFocus = true,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-2">
      <SearchIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function ComboboxList({
  className,
  children,
  ...props
}: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("max-h-72 overflow-y-auto overflow-x-hidden p-1 scroll-py-1", className)}
      {...props}
    >
      {children}
    </ComboboxPrimitive.List>
  )
}

function ComboboxEmpty({
  className,
  children,
  ...props
}: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-3 py-2 text-sm text-muted-foreground", className)}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Empty>
  )
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "pointer-coarse:min-h-11",
        className
      )}
      {...props}
    >
      <span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">{children}</span>
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

// ---------------------------------------------------------------------------
// The wrapper Field renders.

export type ComboboxProps = {
  value?: string
  onValueChange?: (value: string) => void
  items: ReadonlyArray<ComboboxItemShape>
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  compact?: boolean
  /** Extra classes for the trigger (the control surface). */
  className?: string
  /** Trigger adornments rendered before / after the value. */
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  /** Optional id forwarded to the trigger button. */
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "data-testid"?: string
}

export function Combobox({
  value,
  onValueChange,
  items,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  disabled,
  required,
  invalid,
  compact,
  className,
  prefix,
  suffix,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "data-testid": testId,
}: ComboboxProps) {
  // base-ui passes objects ({value,label}) through onValueChange; we use the
  // raw string IDs as item values so handlers stay simple, and pass the items
  // array for built-in label-based filtering.
  const itemsForFilter = React.useMemo(
    () => items.map((it) => ({ value: it.value, label: it.label })),
    [items]
  )

  // Look up the label for the current value so the trigger renders the human
  // text rather than the raw ID.
  const selectedLabel = React.useMemo(() => {
    if (value == null || value === "") return undefined
    return items.find((it) => it.value === value)?.label
  }, [items, value])

  const handleChange = React.useCallback(
    (next: unknown) => {
      // base-ui can hand back the full selected ITEM ({value,label}) rather
      // than the raw string id (notably on type-ahead auto-select). Always
      // normalize to the string `value` so consumers — some of which render
      // the chosen value directly as JSX text — never receive an object
      // (which would throw React error #31 "objects are not valid as a child").
      const str =
        next == null
          ? ""
          : typeof next === "object"
            ? String((next as { value?: unknown }).value ?? "")
            : String(next)
      onValueChange?.(str)
    },
    [onValueChange]
  )

  return (
    <ComboboxPrimitive.Root<string, false>
      value={value ?? null}
      onValueChange={handleChange}
      items={itemsForFilter}
      disabled={disabled}
      required={required}
      itemToStringLabel={(item) => {
        // base-ui passes the full item object from `items`
        // (i.e. `{ value, label }`), NOT the raw string value. Pull the
        // label off directly. Returning `String(item)` here would yield
        // the literal "[object Object]" for every entry, which broke the
        // filter introduced in PR #68 (issue #87).
        if (typeof item === "object" && item !== null) {
          return (item as { label?: string }).label ?? ""
        }
        return (
          items.find((it) => it.value === String(item))?.label ??
          String(item ?? "")
        )
      }}
    >
      <ComboboxTrigger
        id={id}
        compact={compact}
        invalid={invalid}
        className={className}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        data-testid={testId}
      >
        {prefix}
        <ComboboxValue>
          {selectedLabel ?? (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </ComboboxValue>
        {suffix}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder={searchPlaceholder} />
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: ComboboxItemShape) => (
            <ComboboxItem key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </ComboboxPrimitive.Root>
  )
}
