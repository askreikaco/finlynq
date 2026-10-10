/** @vitest-environment node */
import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("@/components/nav", () => ({ AppTabs: () => null, isTabBarHidden: () => false }));
for (const m of ["unlock-gate","announcement-banner","prompt-gate","currency-provider","dropdown-order-provider","language-provider","font-provider","animation-provider","reporting-recompute-indicator","version-gate","web-vitals"]) {
  vi.doMock(`@/components/${m}`, () => new Proxy({}, { get: () => () => null }));
}
vi.mock("@/lib/data", () => ({ DataProvider: () => null }));

import AppLayout from "@/app/(app)/layout";
import { AppTabs } from "@/components/nav";

// walk the element tree (children props only; no rendering) to find <AppTabs/>
function findTabs(node: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findTabs(n); if (f) return f; } return null; }
  const el = node as ReactElement<{ children?: ReactNode } & Record<string, unknown>>;
  if (el.type === AppTabs) return el;
  return findTabs(el.props?.children);
}

afterEach(() => { vi.unstubAllEnvs(); });

// The tab bar and rail have no admin group: the instance flag is read by the More page, not by the shell.
describe("AppLayout does not feed the instance flag to the tab bar", () => {
  it.each(["", "1"])("FINLYNQ_INSTANCE_ADMIN=%j: AppTabs gets no props", (value) => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", value);
    const tabs = findTabs(AppLayout({ children: null }));
    expect(tabs).not.toBeNull();
    expect(Object.keys(tabs!.props)).toEqual([]);
  });
});
