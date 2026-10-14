/**
 * The one surface of an interactive toolbar control: the card colour, a visible border and a subtle inner shadow
 * (tokens --control-border / --control-shadow in globals.css, light and dark). Used by the range dropdown, the month
 * switcher group, RoundIconButton and the Spending / Income toggle, so they read as one family on every theme.
 * `dark:bg-card` is repeated because the Select / Tabs bases set their own dark background.
 */
export const CONTROL_SURFACE =
  "border border-[color:var(--control-border)] bg-card dark:bg-card shadow-[var(--control-shadow)]";
