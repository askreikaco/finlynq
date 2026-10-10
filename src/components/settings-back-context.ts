import * as React from "react";

/**
 * Provided by SettingsShell to its sub-pages (single back control rule).
 * - detail: the shell's detail bar is shown, so it owns the level-2 back to /settings. PageHeader then
 *   skips its automatic back.
 * - setOwnBack: a page that passes an explicit backHref reports it (PageHeader effect). The shell then hides
 *   its own bar back, so the page's back is the only one.
 */
export interface SettingsBackState {
  detail: boolean;
  setOwnBack: (on: boolean) => void;
}

export const SettingsBackContext = React.createContext<SettingsBackState | null>(null);
