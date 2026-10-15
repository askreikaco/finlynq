/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "fs";
import { render, cleanup, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("Button nativeButton", () => {
  it("href renders a link and does not trigger the Base UI native-button warning", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Button href="/x">Go</Button>);
    // Stays a real link (no role="button" override) and carries the button styling.
    const link = screen.getByRole("link", { name: "Go" });
    expect(link.getAttribute("role")).toBeNull();
    expect(link.getAttribute("data-slot")).toBe("button");
    const msgs = err.mock.calls.map((c) => String(c[0]));
    err.mockRestore();
    expect(msgs.filter((m) => m.includes("nativeButton"))).toEqual([]);
  });
});

describe("hydration: JSON-LD nonce", () => {
  it("the JSON-LD script suppresses the (browser-hidden) nonce mismatch and nothing else does", () => {
    const src = fs.readFileSync("src/components/seo/json-ld.tsx", "utf8");
    expect(src).toMatch(/nonce=\{nonce\}[\s\S]*suppressHydrationWarning/);
    expect((src.match(/suppressHydrationWarning/g) ?? []).length).toBe(1);
  });
});
