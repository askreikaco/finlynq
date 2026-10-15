"use client"

/**
 * Internal to Field (control="group-combobox"): free-text input + listbox of existing values.
 * Typing filters `options`; when the text is not an exact match an `Add "<text>"` row appears; a "No group" row
 * clears the value. Keys: ArrowUp/Down move, Enter picks, Escape closes. Rows are 44px on touch.
 */

import * as React from "react"

import { cn } from "@/lib/utils"
import { BARE_INPUT, FieldRowContext, Surface } from "./surface"

type Row = { key: string; kind: "none" | "existing" | "add"; value: string; label: string }

export function GroupCombobox({
  value,
  onChange,
  options,
  placeholder = "Group",
  ariaLabel = "Group",
  noneLabel = "No group",
  invalid,
  compact,
  disabled,
  id,
  prefix,
  suffix,
  className,
  "aria-describedby": describedBy,
  "data-testid": testId,
}: {
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<string>
  placeholder?: string
  ariaLabel?: string
  noneLabel?: string
  invalid?: boolean
  compact?: boolean
  disabled?: boolean
  id?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  className?: string
  "aria-describedby"?: string
  "data-testid"?: string
}) {
  const uid = React.useId()
  const listId = `${uid}-list`
  const row = React.useContext(FieldRowContext)
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const typed = value.trim()
  const rows = React.useMemo<Row[]>(() => {
    const q = typed.toLowerCase()
    const out: Row[] = [{ key: "none", kind: "none", value: "", label: noneLabel }]
    for (const g of options) {
      if (!q || g.toLowerCase().includes(q)) out.push({ key: `g:${g}`, kind: "existing", value: g, label: g })
    }
    if (typed && !options.some((g) => g.toLowerCase() === q)) {
      out.push({ key: "add", kind: "add", value: typed, label: `Add "${typed}"` })
    }
    return out
  }, [options, typed, noneLabel])

  React.useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  function pick(r: Row) {
    onChange(r.value)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) { setOpen(true); setActive(0); return }
      setActive((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault()
        const r = rows[active]
        if (r) pick(r)
      }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false) }
    }
  }

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <Surface row={row} compact={compact} invalid={invalid} disabled={disabled}>
        {prefix}
        <input
          id={id}
          role="combobox"
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${uid}-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          data-testid={testId}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={BARE_INPUT}
        />
        {suffix}
      </Surface>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {rows.map((r, i) => (
            <li
              key={r.key}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={r.kind !== "add" && r.value === value}
              data-highlighted={i === active ? "" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex min-h-8 pointer-coarse:min-h-11 cursor-default items-center rounded-md px-2 text-sm select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                r.kind === "none" && "text-muted-foreground",
              )}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
