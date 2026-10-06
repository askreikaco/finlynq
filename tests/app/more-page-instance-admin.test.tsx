/** @vitest-environment node */
import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/more-menu", () => ({ MoreMenu: () => null }));
import MorePage from "@/app/(app)/more/page";
import { MoreMenu } from "@/components/more-menu";

afterEach(() => { vi.unstubAllEnvs(); });

describe("MorePage passes the runtime flag to MoreMenu", () => {
  it("flag unset -> instanceAdminEnabled === false", () => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", "");
    const el = MorePage() as ReactElement<{ instanceAdminEnabled: boolean }>;
    expect(el.type).toBe(MoreMenu);
    expect(el.props.instanceAdminEnabled).toBe(false);
  });
  it("flag=1 -> instanceAdminEnabled === true", () => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", "1");
    const el = MorePage() as ReactElement<{ instanceAdminEnabled: boolean }>;
    expect(el.props.instanceAdminEnabled).toBe(true);
  });
});
