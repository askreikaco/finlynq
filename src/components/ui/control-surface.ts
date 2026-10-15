/**
 * The one surface of an interactive control: the card colour, a visible border and a subtle inner shadow
 * (tokens --control-border / --control-shadow in globals.css, light and dark). Used by every Field control,
 * the range dropdown, the month switcher group, RoundIconButton and the Spending / Income toggle, so they read as
 * one family on every theme. `dark:bg-card` is repeated because the Select / Tabs bases set their own dark background.
 */
export const CONTROL_SURFACE =
  "border border-[color:var(--control-border)] bg-card dark:bg-card shadow-[var(--control-shadow)]";

/**
 * The one control box of a Field: 44px tall (compact density shrinks fine-pointer desktops only), 12px radius,
 * 16px text on touch (no iOS zoom) and 14px on fine-pointer regular+ screens. `compact` Fields (table cells,
 * toolbar chips) are 32px on fine pointers and stay 44px on touch.
 */
export const CONTROL_BOX = "h-11 dense:pointer-fine:h-9 w-full min-w-0 rounded-lg px-3 text-base regular:pointer-fine:text-sm";
export const CONTROL_BOX_COMPACT = "h-8 pointer-coarse:h-11 dense:pointer-fine:h-7 w-full min-w-0 rounded-lg px-2.5 text-sm";

/** Focus, invalid and disabled states shared by every control surface (a wrapper uses focus-within, a button focus-visible). */
export const CONTROL_STATE =
  "transition-colors outline-none data-[invalid=true]:border-destructive data-[invalid=true]:ring-3 data-[invalid=true]:ring-destructive/20 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50";
export const CONTROL_FOCUS_WITHIN = "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50";
export const CONTROL_FOCUS_VISIBLE = "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
