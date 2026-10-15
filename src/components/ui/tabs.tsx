"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { CONTROL_SURFACE } from "@/components/ui/control-surface"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

/*
 * Tab bar rules (each one fixed a real bug in the 25% split-view pane):
 *  - `relative`: base-ui scrolls the active tab into view using offsetLeft up the offsetParent chain until it reaches the list;
 *    an unpositioned list made it sum offsets up to the page and scroll to the far end (first tab clipped).
 *  - `justify-center-safe`: centered when it fits, start-aligned when it overflows (plain center makes the start unreachable).
 *  - `overflow-x-auto overflow-y-hidden`: overflow-x alone computes overflow-y to auto, and the line underline / coarse hit area
 *    stick out of the 32px bar, which gave a vertical scrollbar.
 */
const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center-safe rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 pointer-coarse:group-data-horizontal/tabs:h-11 dense:pointer-fine:group-data-horizontal/tabs:h-7 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none max-w-full overflow-x-auto overflow-y-hidden",
  {
    variants: {
      variant: {
        default: "bg-muted",
        // Same 44px height as the other toolbar controls (range dropdown, month switcher, search, round buttons).
        segmented: `rounded-full group-data-horizontal/tabs:h-11 dense:pointer-fine:group-data-horizontal/tabs:h-11 ${CONTROL_SURFACE}`,
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground active:text-foreground group-data-[variant=default]/tabs-list:active:bg-background/60 pointer-coarse:before:absolute pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:content-[''] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
