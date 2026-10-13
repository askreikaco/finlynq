/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "fs";
import { render, cleanup, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("Button nativeButton", () => {
  it("render={<a>} does not trigger the Base UI native-button warning", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Button render={<a href="/x" />}>Go</Button>);
    expect(screen.getByText("Go").closest("a")).not.toBeNull();
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
