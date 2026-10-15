"use client";

/**
 * Overlay — the ONE modal surface (confirm, form, detail, picker). Replaces Sheet, Dialog, ConfirmDialog,
 * DetailSheet and the hand-rolled drawers. Every part is a field you show or hide per case.
 *
 * Built on one base-ui Dialog: one focus trap, one Escape / outside-press handler, one aria wiring
 * (role=dialog + aria-labelledby the title), focus returns to the opener, page scroll is locked.
 *
 *   <Overlay open={open} onClose={() => setOpen(false)} variant="form" title="Edit rule" size="lg"
 *            actions={[{ label: "Cancel" }, { label: "Save", kind: "primary", onClick: save }]}>
 *     ...fields...
 *   </Overlay>
 *
 * Fields
 *   open, onClose        controlled; onClose fires on X / Escape / outside press / a Cancel action. Blocked while `busy`.
 *   variant              form (default) | confirm | detail | picker. Sets title style, footer layout and the default presentation.
 *   presentation         auto (default: bottom sheet on phones, centred dialog from `regular` up; confirm is always a
 *                        centred dialog) | dialog | sheet-right.
 *   title, subtitle      subtitle is a short identity value (a type, a date), never prose.
 *   info                 the shared InfoTip next to the title. The only place explanatory text goes (no helper paragraphs).
 *   headerAction         slot at the right of the header (e.g. a settings button).
 *   toolbar              slot under the header that does not scroll (e.g. a search field).
 *   children             the scrolling body.
 *   message              confirm body: the consequence in one sentence.
 *   items                detail body: label/value rows (a <dl>), children render below.
 *   actions              footer buttons: { label, kind: primary | secondary | destructive | ghost, onClick, ... }.
 *                        An action without onClick closes the overlay (Cancel). Confirm defaults to Cancel + Delete
 *                        (confirmLabel / cancelLabel / onConfirm / busyLabel / destructive).
 *   footer               custom footer slot, rendered before `actions`.
 *   onSubmit             wraps body + footer in a <form>; an action with type="submit" submits it.
 *   size                 sm | md | lg (default) | xl | 2xl | 3xl | 4xl | full: max width from `regular` up (full = 97vw x 95dvh).
 *   busy                 blocks dismissal while a request is in flight.
 *   showClose            the X button (default true).
 *   testId, className, bodyClassName, footerClassName   escape hatches.
 */

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertTriangle, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";

export type OverlayVariant = "form" | "confirm" | "detail" | "picker";
export type OverlayPresentation = "auto" | "dialog" | "sheet-right";
export type OverlaySize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";

export interface DetailItem {
  label: React.ReactNode;
  value: React.ReactNode;
}

export interface OverlayAction {
  label: React.ReactNode;
  /** primary (default look), secondary (outline), destructive, ghost. Default secondary. */
  kind?: "primary" | "secondary" | "destructive" | "ghost";
  /** Omit to close the overlay (a Cancel / Close action). */
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** Replaces the label with `busyLabel` (if given) and disables the button. */
  busy?: boolean;
  busyLabel?: React.ReactNode;
  testId?: string;
  /** Extra classes (e.g. "text-destructive"). */
  className?: string;
}

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  variant?: OverlayVariant;
  presentation?: OverlayPresentation;
  size?: OverlaySize;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  info?: React.ReactNode;
  /** Accessible name when there is no visible `title`. */
  ariaLabel?: string;
  headerAction?: React.ReactNode;
  toolbar?: React.ReactNode;
  children?: React.ReactNode;
  message?: React.ReactNode;
  items?: DetailItem[];
  actions?: OverlayAction[];
  footer?: React.ReactNode;
  /** confirm: label of the confirming action. Default "Delete". */
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  onConfirm?: () => void;
  busyLabel?: React.ReactNode;
  /** confirm: false renders a neutral (primary) confirm instead of a destructive one. Default true. */
  destructive?: boolean;
  busy?: boolean;
  showClose?: boolean;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  testId?: string;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

const SIZE_CLASS: Record<OverlaySize, string> = {
  sm: "regular:max-w-sm",
  md: "regular:max-w-md",
  lg: "regular:max-w-lg",
  xl: "regular:max-w-2xl",
  "2xl": "regular:max-w-3xl",
  "3xl": "regular:max-w-4xl",
  "4xl": "regular:max-w-5xl",
  // Nearly the whole viewport (wide data matrices). dvh, never vh.
  full: "h-[95dvh] max-h-[95dvh] regular:max-h-[95dvh] regular:w-[97vw] regular:max-w-[97vw]",
};

/** Centred dialog geometry (from `regular` up for `auto`, always for `dialog`). Safe-area and keyboard aware. */
const DIALOG_POS =
  "top-[calc(50%+(var(--sat)-var(--sab))/2-var(--kb-inset,0px)/2)] left-1/2 w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem-var(--sat)-var(--sab)-var(--kb-inset,0px))] -translate-x-1/2 -translate-y-1/2 rounded-xl ring-1 ring-foreground/10 data-open:zoom-in-95 data-closed:zoom-out-95";

/** `regular:` twins of DIALOG_POS, resetting the phone bottom-sheet geometry. */
const AUTO_REGULAR_POS =
  "regular:inset-x-auto regular:bottom-auto regular:top-[calc(50%+(var(--sat)-var(--sab))/2-var(--kb-inset,0px)/2)] regular:left-1/2 regular:w-full regular:max-w-[calc(100%-2rem)] regular:max-h-[calc(100dvh-2rem-var(--sat)-var(--sab)-var(--kb-inset,0px))] regular:-translate-x-1/2 regular:-translate-y-1/2 regular:rounded-xl regular:border-0 regular:pb-0 regular:ring-1 regular:ring-foreground/10";

/** Phone bottom sheet: lifts above the on-screen keyboard (--kb-inset) and keeps the bottom safe-area inset. */
const SHEET_BOTTOM =
  "inset-x-0 bottom-[var(--kb-inset,0px)] max-h-[calc(100dvh-var(--kb-inset,0px)-var(--sat))] rounded-t-2xl border-t pb-[var(--sab)] data-open:slide-in-from-bottom-10 data-closed:slide-out-to-bottom-10";

const SHEET_RIGHT =
  "inset-y-0 right-0 h-full w-full border-l pt-[var(--sat)] pr-[var(--sar)] pb-[var(--sab)] regular:max-w-md data-open:slide-in-from-right-10 data-closed:slide-out-to-right-10";

function popupPosition(presentation: OverlayPresentation, variant: OverlayVariant): string {
  if (presentation === "sheet-right") return SHEET_RIGHT;
  // A confirm is an alert: centred on every breakpoint.
  if (presentation === "dialog" || variant === "confirm") return DIALOG_POS;
  // The picker's phone sheet is taller-cornered and capped lower.
  const phone = variant === "picker" ? SHEET_BOTTOM.replace("rounded-t-2xl", "rounded-t-3xl max-h-[min(70dvh,calc(100dvh-var(--kb-inset,0px)))]") : SHEET_BOTTOM;
  return cn(phone, AUTO_REGULAR_POS, "regular:data-open:zoom-in-95 regular:data-closed:zoom-out-95 regular:data-open:slide-in-from-bottom-0 regular:data-closed:slide-out-to-bottom-0");
}

function ActionButton({ action, variant }: { action: OverlayAction; variant: OverlayVariant }) {
  const kind = action.kind ?? "secondary";
  const label = action.busy && action.busyLabel !== undefined ? action.busyLabel : action.label;
  const common = {
    variant: (kind === "primary" ? "default" : kind === "secondary" ? "outline" : kind) as "default" | "outline" | "destructive" | "ghost",
    disabled: action.disabled || action.busy,
    "data-testid": action.testId,
    className: cn(variant === "confirm" && "flex-1", variant === "detail" && "h-11", action.className),
  };
  // No onClick (and not a submit): a plain Cancel / Close, dismissed through the dialog primitive.
  if (!action.onClick && action.type !== "submit") {
    return <DialogPrimitive.Close render={<Button {...common} />}>{label}</DialogPrimitive.Close>;
  }
  return (
    <Button {...common} type={action.type ?? "button"} onClick={action.onClick}>
      {label}
    </Button>
  );
}

/** Body + footer column; a <form> when the overlay has `onSubmit`, so a submit action posts it. */
function Shell({ onSubmit, children }: { onSubmit?: OverlayProps["onSubmit"]; children: React.ReactNode }) {
  const cls = "flex min-h-0 flex-1 flex-col";
  return onSubmit ? (
    <form onSubmit={onSubmit} data-slot="overlay-shell" className={cls}>
      {children}
    </form>
  ) : (
    <div data-slot="overlay-shell" className={cls}>
      {children}
    </div>
  );
}

export function Overlay({
  open,
  onClose,
  variant = "form",
  presentation = "auto",
  size = "lg",
  title,
  subtitle,
  info,
  ariaLabel,
  headerAction,
  toolbar,
  children,
  message,
  items,
  actions,
  footer,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  busyLabel = "Deleting…",
  destructive = true,
  busy = false,
  showClose = true,
  onSubmit,
  testId,
  className,
  bodyClassName,
  footerClassName,
}: OverlayProps) {
  const footerActions: OverlayAction[] | undefined =
    variant === "confirm" && !actions
      ? [
          { label: cancelLabel, kind: "secondary", disabled: busy },
          { label: confirmLabel, kind: destructive ? "destructive" : "primary", onClick: onConfirm, busy, busyLabel },
        ]
      : actions;

  const hasHeader = title != null || info != null || headerAction != null || showClose;
  const hasFooter = footer != null || (footerActions != null && footerActions.length > 0);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // A destructive request in flight cannot be dismissed from under itself.
        if (!next && !busy) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="overlay-backdrop"
          className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          data-slot="overlay"
          data-variant={variant}
          data-presentation={presentation}
          data-testid={testId}
          aria-label={title == null ? ariaLabel : undefined}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden overscroll-contain bg-background text-sm text-foreground shadow-lg outline-none duration-150 ease-in-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            popupPosition(presentation, variant),
            presentation !== "sheet-right" && SIZE_CLASS[size],
            className,
          )}
        >
          <Shell onSubmit={onSubmit}>
            {hasHeader && (
              <div data-slot="overlay-header" className="flex items-start gap-2 px-4 pt-4 pb-2">
                <div className="min-w-0 flex-1">
                  {title != null && (
                    <div className="flex items-center gap-1">
                      <DialogPrimitive.Title
                        data-slot="overlay-title"
                        className={cn(
                          "flex min-w-0 items-center gap-2 text-base font-semibold leading-snug",
                          variant === "confirm" && destructive && "text-destructive",
                        )}
                      >
                        {variant === "confirm" && destructive && <AlertTriangle className="size-4 shrink-0" aria-hidden />}
                        {title}
                      </DialogPrimitive.Title>
                      {info != null && <InfoTip text={info} label={typeof title === "string" ? `About ${title}` : undefined} />}
                    </div>
                  )}
                  {title == null && info != null && <InfoTip text={info} />}
                  {subtitle != null && <div className="text-xs text-muted-foreground">{subtitle}</div>}
                </div>
                {headerAction}
                {showClose && (
                  <DialogPrimitive.Close
                    data-slot="overlay-close"
                    render={<Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0" />}
                  >
                    <XIcon />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                )}
              </div>
            )}

            {toolbar != null && <div data-slot="overlay-toolbar" className="px-4 pb-2">{toolbar}</div>}

            <div
              data-slot="overlay-body"
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-2",
                variant === "picker" && "gap-0 py-0",
                variant === "detail" && "gap-2 pb-4",
                bodyClassName,
              )}
            >
              {message != null && <div className="text-sm text-muted-foreground">{message}</div>}
              {items && (
                <dl data-slot="detail-list" className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                  {items.map((it, i) => (
                    <div key={i} className="flex min-h-row items-center justify-between gap-4 py-2">
                      <dt className="text-sm text-muted-foreground">{it.label}</dt>
                      <dd className="min-w-0 text-right text-sm font-medium text-foreground break-words">{it.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {children}
            </div>

            {hasFooter && (
              <div
                data-slot="overlay-footer"
                className={cn(
                  "gap-2 px-4 py-3",
                  variant === "form" || variant === "picker"
                    ? "flex flex-col-reverse border-t bg-muted/50 regular:flex-row regular:justify-end"
                    : variant === "confirm"
                      ? "flex pb-4"
                      : "flex flex-col pb-4",
                  footerClassName,
                )}
              >
                {footer}
                {footerActions?.map((a, i) => <ActionButton key={i} action={a} variant={variant} />)}
              </div>
            )}
          </Shell>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
