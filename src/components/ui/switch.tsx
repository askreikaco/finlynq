"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // On coarse pointers the ::before hit-slop covers >=44pt tall (border-box 24px + 2x12px on the padding box); visual track stays compact.
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors outline-none",
        "before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
        "pointer-coarse:before:-inset-x-2 pointer-coarse:before:-inset-y-3",
        "active:bg-input/80 data-[checked]:active:bg-primary/80",
        "focus-visible:ring-3 focus-visible:ring-ring/50 data-[checked]:bg-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[checked]:translate-x-[1.05rem]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
