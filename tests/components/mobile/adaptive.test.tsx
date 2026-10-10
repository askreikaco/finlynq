/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, cleanup } from "@testing-library/react";
import { CompactOnly, FromMd } from "@/components/mobile/adaptive";

afterEach(cleanup);

describe("CompactOnly", () => {
  it("renders a div with regular:hidden by default (regular = 40rem viewport)", () => {
    const { container } = render(<CompactOnly>x</CompactOnly>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el.className.split(/\s+/)).toContain("regular:hidden");
    expect(el.className.split(/\s+/)).not.toContain("max-regular:hidden");
    expect(el.className).not.toMatch(/(^|\s)(max-)?md:/);
  });

  it("honours as=\"span\"", () => {
    const { container } = render(<CompactOnly as="span">Add</CompactOnly>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("Add");
    expect(el.className.split(/\s+/)).toContain("regular:hidden");
  });

  it("merges className and passes data attributes through", () => {
    const { container } = render(
      <CompactOnly className="space-y-4" data-slot="accounts-mobile-list">x</CompactOnly>
    );
    const el = container.firstElementChild as HTMLElement;
    const classes = el.className.split(/\s+/);
    expect(classes).toContain("regular:hidden");
    expect(classes).toContain("space-y-4");
    expect(el.getAttribute("data-slot")).toBe("accounts-mobile-list");
  });
});

describe("FromMd", () => {
  it("renders a div with max-regular:hidden by default", () => {
    const { container } = render(<FromMd>x</FromMd>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el.className.split(/\s+/)).toContain("max-regular:hidden");
    expect(el.className.split(/\s+/)).not.toContain("regular:hidden");
    expect(el.className).not.toMatch(/(^|\s)(max-)?md:/);
  });

  it("honours as=\"span\"", () => {
    const { container } = render(<FromMd as="span">Create Account</FromMd>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.className.split(/\s+/)).toContain("max-regular:hidden");
  });

  it("merges className and passes data attributes through", () => {
    const { container } = render(
      <FromMd className="grid grid-cols-2 gap-3" data-testid="desk">x</FromMd>
    );
    const el = container.firstElementChild as HTMLElement;
    const classes = el.className.split(/\s+/);
    expect(classes).toContain("max-regular:hidden");
    expect(classes).toContain("grid");
    expect(el.getAttribute("data-testid")).toBe("desk");
  });
});
