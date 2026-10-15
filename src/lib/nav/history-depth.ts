/**
 * In-app navigation depth for the Back control. Back goes to the page the user actually came from
 * (browser history) when they have navigated inside the app in this tab; a fresh entry or a deep link
 * (depth 0) falls back to the registry parent instead of leaving the app.
 *
 * Per tab (sessionStorage). The tracker (components/nav-history-tracker.tsx) adds one per client route
 * change and removes one per popstate. Every read and write is guarded: storage can be blocked.
 */

const KEY = "finlynq.nav.depth";

export function getNavDepth(): number {
  try {
    const n = Number(window.sessionStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function setNavDepth(n: number): void {
  try {
    window.sessionStorage.setItem(KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    // storage blocked: Back falls back to the parent link
  }
}

/**
 * Click handler of a Back link: the real browser back when the user navigated inside the app (depth > 0); the link's
 * `href` is the fallback for a fresh entry or a deep link, and what a modified click (new tab) still opens.
 */
export function onBackLinkClick(e: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (getNavDepth() > 0) {
    e.preventDefault();
    window.history.back();
  }
}

export function incrementNavDepth(): void {
  setNavDepth(getNavDepth() + 1);
}

export function decrementNavDepth(): void {
  setNavDepth(getNavDepth() - 1);
}

export function resetNavDepth(): void {
  setNavDepth(0);
}
