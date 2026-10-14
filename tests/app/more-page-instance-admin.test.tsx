/** @vitest-environment node */
import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/more-menu", () => ({ MoreMenu: () => null }));
import MorePage from "@/app/(app)/more/page";
import { MoreMenu } from "@/components/more-menu";
import { ColumnShell } from "@/components/mobile/column-nav";

afterEach(() => { vi.unstubAllEnvs(); });

describe("MorePage passes the runtime flag to MoreMenu", () => {
  it("flag unset -> instanceAdminEnabled === false", () => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", "");
    const el = MorePage() as ReactElement<{ instanceAdminEnabled: boolean; children: ReactElement<{ instanceAdminEnabled: boolean }> }>;
    expect(el.type).toBe(ColumnShell);
    expect(el.props.instanceAdminEnabled).toBe(false);
    expect(el.props.children.type).toBe(MoreMenu);
    expect(el.props.children.props.instanceAdminEnabled).toBe(false);
  });
  it("flag=1 -> instanceAdminEnabled === true", () => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", "1");
    const el = MorePage() as ReactElement<{ instanceAdminEnabled: boolean; children: ReactElement<{ instanceAdminEnabled: boolean }> }>;
    expect(el.props.instanceAdminEnabled).toBe(true);
    expect(el.props.children.props.instanceAdminEnabled).toBe(true);
  });
});
