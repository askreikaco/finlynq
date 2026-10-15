import * as React from "react"

import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { InfoTip } from "@/components/ui/info-tip"
import { CARD_ICON_TILE, CARD_LABEL_GAP, CARD_LABEL_TEXT, resolveTone, type MetricTone } from "@/components/mobile/card-label"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 dense:pointer-fine:gap-3 overflow-hidden rounded-xl surface-card py-3 regular:py-4 dense:pointer-fine:py-2.5 text-sm text-card-foreground border border-border/50 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-5 pt-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 dense:pointer-fine:[.border-b]:pb-3 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({
  className,
  icon: Icon,
  tone = "muted",
  info,
  infoLabel,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: LucideIcon
  tone?: MetricTone | (string & {})
  /** Help text shown in an (i) tip after the title (replaces a visible CardDescription). */
  info?: React.ReactNode
  /** Accessible name of the (i) button. Default "More info". */
  infoLabel?: string
}) {
  return (
    <div
      data-slot="card-title"
      className={cn(CARD_LABEL_TEXT, Icon && ["flex items-center", CARD_LABEL_GAP], className)}
      {...props}
    >
      {Icon && (
        <span className={cn(CARD_ICON_TILE, resolveTone(tone))} data-slot="card-label-icon">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
      {Icon ? <span className="min-w-0 break-words">{children}</span> : children}
      {info ? <InfoTip text={info} label={infoLabel} className="ml-0.5" /> : null}
    </div>
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
