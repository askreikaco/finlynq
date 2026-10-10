"use client"

/**
 * GroupCombobox — free-text input + listbox of existing values.
 * Typing filters `options`; when the text is not an exact match an
 * `Add "<text>"` row appears; a "No group" row clears the value.
 * Keys: ArrowUp/Down move, Enter picks, Escape closes. Rows are 44px below md.
 */

import * as React from "react"

import { cn } from "@/lib/utils"

type Row = { key: string; kind: "none" | "existing" | "add"; value: string; label: string }

export function GroupCombobox({
  value,
  onChange,
  options,
  placeholder = "Group",
  ariaLabel = "Group",
  noneLabel = "No group",
  invalid,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<string>
  placeholder?: string
  ariaLabel?: string
  noneLabel?: string
  invalid?: boolean
  className?: string
}) {
  const uid = React.useId()
  const listId = `${uid}-list`
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

  function pick(row: Row) {
    onChange(row.value)
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
        const row = rows[active]
        if (row) pick(row)
      }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false) }
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        role="combobox"
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${uid}-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-8 pointer-coarse:h-11 dense:pointer-fine:h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base regular:pointer-fine:text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {rows.map((row, i) => (
            <li
              key={row.key}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={row.kind !== "add" && row.value === value}
              data-highlighted={i === active ? "" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(row)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex min-h-8 pointer-coarse:min-h-11 cursor-default items-center rounded-md px-2 text-sm select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                row.kind === "none" && "text-muted-foreground",
              )}
            >
              {row.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
