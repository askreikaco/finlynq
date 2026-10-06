/** @vitest-environment node */
import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("@/components/nav", () => ({ Nav: () => null }));
for (const m of ["unlock-gate","announcement-banner","prompt-gate","currency-provider","dropdown-order-provider","language-provider","font-provider","animation-provider","reporting-recompute-indicator","version-gate","web-vitals"]) {
  vi.doMock(`@/components/${m}`, () => new Proxy({}, { get: () => () => null }));
}
vi.mock("@/lib/data", () => ({ DataProvider: () => null }));

import AppLayout from "@/app/(app)/layout";
import { Nav } from "@/components/nav";

// walk the element tree (children props only; no rendering) to find <Nav/>
function findNav(node: ReactNode): ReactElement<{ instanceAdminEnabled?: boolean }> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findNav(n); if (f) return f; } return null; }
  const el = node as ReactElement<{ children?: ReactNode; instanceAdminEnabled?: boolean }>;
  if (el.type === Nav) return el;
  return findNav(el.props?.children);
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("AppLayout passes the runtime flag to Nav", () => {
  it("unset -> false", () => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", "");
    expect(findNav(AppLayout({ children: null }))?.props.instanceAdminEnabled).toBe(false);
  });
  it("1 -> true", () => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", "1");
    expect(findNav(AppLayout({ children: null }))?.props.instanceAdminEnabled).toBe(true);
  });
});
