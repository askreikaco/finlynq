"use client"

import * as React from "react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Single-open accordion (base-ui). `value` is the open item's value or null
 * (all collapsed). Clicking the open item's header collapses it. Panels mount
 * only while open, so section content may fetch on mount.
 */
function Accordion({
  value,
  defaultValue,
  onValueChange,
  className,
  ...props
}: Omit<
  AccordionPrimitive.Root.Props,
  "value" | "defaultValue" | "onValueChange" | "multiple" | "keepMounted"
> & {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
}) {
  const toArr = (v: string | null | undefined) => (v ? [v] : [])
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      multiple={false}
      keepMounted={false}
      {...(value !== undefined ? { value: toArr(value) } : {})}
      {...(defaultValue !== undefined ? { defaultValue: toArr(defaultValue) } : {})}
      onValueChange={(next) =>
        onValueChange?.((next as string[])[0] ?? null)
      }
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function AccordionItem({
  icon,
  title,
  description,
  children,
  className,
  ...props
}: Omit<AccordionPrimitive.Item.Props, "title"> & {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("rounded-xl border bg-card text-card-foreground", className)}
      {...props}
    >
      <AccordionPrimitive.Header className="m-0 text-base font-normal">
        <AccordionPrimitive.Trigger
          data-slot="accordion-trigger"
          className="group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{title}</span>
            {description ? (
              <span className="block truncate text-xs text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180"
          />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Panel
        data-slot="accordion-panel"
        className="border-t px-4 py-4"
      >
        {children}
      </AccordionPrimitive.Panel>
    </AccordionPrimitive.Item>
  )
}

export { Accordion, AccordionItem }
