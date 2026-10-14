// @vitest-environment jsdom
/** Kill-switch guards: SPA routes 404 like the Next middleware did (FAMILY_WEALTH_ENABLED, FINLYNQ_INSTANCE_ADMIN). */
import { Component, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ flags: { categoriesMerged: false, instanceAdmin: false, familyWealth: true, apiBuild: null as string | null }, loaded: true }));
vi.mock("@/spa/flags", () => ({ useFlags: () => state.flags, useFlagsLoaded: () => state.loaded }));

import { guardOf, guarded } from "@/spa/guards";
import { NotFoundError } from "@/spa/shims/next-navigation";

class Boundary extends Component<{ children: ReactNode }, { err: unknown }> {
  state = { err: null as unknown };
  static getDerivedStateFromError(err: unknown) { return { err }; }
  render() { return this.state.err ? <span>{this.state.err instanceof NotFoundError ? "not-found" : "other-error"}</span> : this.props.children; }
}
const Page = () => <span>page</span>;

describe("guardOf", () => {
  it("guards /family* by familyWealth and /admin/instance* by instanceAdmin only", () => {
    const f = { categoriesMerged: false, instanceAdmin: false, familyWealth: true, apiBuild: null };
    expect(guardOf("/family")?.(f)).toBe(true);
    expect(guardOf("/family/accept")?.({ ...f, familyWealth: false })).toBe(false);
    expect(guardOf("/admin/instance")?.(f)).toBe(false);
    expect(guardOf("/admin/instance/x")?.({ ...f, instanceAdmin: true })).toBe(true);
    expect(guardOf("/familyx")).toBeNull();
    expect(guardOf("/admin/feedback")).toBeNull();
    expect(guardOf("/accounts")).toBeNull();
  });
});

describe("guarded()", () => {
  it("is the identity for unguarded routes", () => {
    expect(guarded("/accounts", Page)).toBe(Page);
  });
  it("renders the page when the flag allows it", () => {
    state.loaded = true; state.flags = { ...state.flags, familyWealth: true };
    const G = guarded("/family", Page);
    render(<Boundary><G /></Boundary>);
    expect(screen.getByText("page")).toBeTruthy();
  });
  it("404s (NotFoundError) when the kill switch is off, and renders nothing until the flags answered", () => {
    state.loaded = true; state.flags = { ...state.flags, instanceAdmin: false };
    const G = guarded("/admin/instance", Page);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r1 = render(<Boundary><G /></Boundary>);
    expect(screen.getByText("not-found")).toBeTruthy();
    r1.unmount();
    state.loaded = false;
    const r2 = render(<Boundary><G /></Boundary>);
    expect(r2.container.textContent).toBe("");
    spy.mockRestore();
  });
});
