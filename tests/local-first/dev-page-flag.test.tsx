// @vitest-environment jsdom
/**
 * Hidden dev page (local-first P1, PKG-10). Flag off -> notFound(); flag on -> panel renders.
 * next/navigation is mocked: notFound throws the way Next's real one does (control flow).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { notFound } from "next/navigation";
import LocalFirstDevPage from "@/app/(proto)/dev/local-first/page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

describe("/dev/local-first page flag", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.FINLYNQ_LOCAL_FIRST_DEV;
    delete process.env.FINLYNQ_LOCAL_FIRST_DEV;
    vi.mocked(notFound).mockClear();
  });

  afterEach(() => {
    cleanup();
    if (saved === undefined) delete process.env.FINLYNQ_LOCAL_FIRST_DEV;
    else process.env.FINLYNQ_LOCAL_FIRST_DEV = saved;
  });

  it("flag unset: the page calls notFound()", () => {
    expect(() => LocalFirstDevPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("flag '0' and 'false': the page calls notFound()", () => {
    for (const v of ["0", "false"]) {
      process.env.FINLYNQ_LOCAL_FIRST_DEV = v;
      expect(() => LocalFirstDevPage()).toThrow("NEXT_NOT_FOUND");
    }
    expect(notFound).toHaveBeenCalledTimes(2);
  });

  it("flag on: the page renders the dev panel and does not call notFound()", () => {
    process.env.FINLYNQ_LOCAL_FIRST_DEV = "1";
    render(<LocalFirstDevPage />);
    expect(screen.getByRole("button", { name: "Import synthetic fixture" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run parity check" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wipe" })).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});
