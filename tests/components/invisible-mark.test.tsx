/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { InvisibleMark } from "@/components/invisible-mark";

afterEach(cleanup);

describe("InvisibleMark", () => {
  it("is an icon with an accessible name, not a text badge", () => {
    const { getByTestId, queryByText } = render(<InvisibleMark />);
    const el = getByTestId("invisible-mark");
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toMatch(/Invisible/);
    expect(el.querySelector("svg")).toBeTruthy();
    expect(queryByText("Invisible")).toBeNull();
  });
});
