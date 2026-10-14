"use client";

import * as React from "react";

/**
 * The pathname the column shell (column-nav.tsx) is drawn for, or null outside it. Lets the More list and the Settings
 * hub mark the current row without reading the router themselves (they render stacked, without a shell, on phones).
 */
export const ColumnCurrentContext = React.createContext<string | null>(null);

export function useColumnCurrent(): string | null {
  return React.useContext(ColumnCurrentContext);
}

/** True when `href` (a route, no query) is the current path or an ancestor of it. Query-string shortcuts never match. */
export function isCurrentRoute(current: string | null, href: string): boolean {
  if (!current || href.includes("?")) return false;
  const cur = current.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return cur === href || cur.startsWith(href + "/");
}
