"use client";

import { useEffect } from "react";
import { SWRConfig } from "swr";
import { dataDefaults } from "./config";
import { installWriteRevalidation } from "./write-revalidation";

/**
 * App-wide data layer (performance plan, Phase 1): one shared SWR cache for every
 * screen under the (app) layout, plus "a successful write refreshes what is on
 * screen". The cache lives in memory only and is discarded by the full-page
 * reload every account change (login / switch / logout / unlock) already does.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => installWriteRevalidation(), []);
  return <SWRConfig value={dataDefaults}>{children}</SWRConfig>;
}
