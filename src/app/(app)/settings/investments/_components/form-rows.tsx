"use client";

import type { ReactNode } from "react";

/** Plain notice for a route whose record is still loading, missing, or failed to load. */
export function RouteNotice({ children }: { children: ReactNode }) {
  return <p data-keep="status" className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}
