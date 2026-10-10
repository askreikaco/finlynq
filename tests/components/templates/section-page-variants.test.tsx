/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SectionPage } from "@/components/templates/section-page";
import { PageHeader } from "@/components/mobile";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/general",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DEFAULT_ROOT = "min-w-0 space-y-6 max-w-section pb-[var(--form-bottom-pad)]";

describe("SectionPage variants", () => {
  it("default props render the original root className literal", () => {
    render(
      <SectionPage id="v-default" title="D" backFallback="/settings">
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-default-root").className).toBe(DEFAULT_ROOT);
  });

  it("omitted backFallback passes no backHref: header matches a bare PageHeader", () => {
    const { container: a, unmount } = render(
      <SectionPage id="v-noback" title="N">
        <p>body</p>
      </SectionPage>,
    );
    const fromSection = a.querySelector('[data-slot="page-header"]')?.outerHTML;
    unmount();
    const { container: b } = render(<PageHeader title="N" />);
    const bare = b.querySelector('[data-slot="page-header"]')?.outerHTML;
    expect(fromSection).toBeDefined();
    expect(fromSection).toBe(bare);
  });

  it("backLabel reaches the back control", () => {
    render(
      <SectionPage id="v-label" title="L" backFallback="/settings" backLabel="Up">
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByRole("link", { name: "Up" })).toHaveAttribute("href", "/settings");
  });

  it.each([
    ["form", "max-w-form"],
    ["doc", "max-w-doc"],
    ["console", "max-w-console"],
    ["section", "max-w-section"],
    ["report", "max-w-report"],
  ] as const)("width=%s applies %s", (width, cls) => {
    render(
      <SectionPage id={`v-w-${width}`} title="W" backFallback="/x" width={width}>
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId(`v-w-${width}-root`)).toHaveClass(cls);
  });

  it("width=none applies no max-width token", () => {
    render(
      <SectionPage id="v-w-none" title="W" backFallback="/x" width="none">
        <p>body</p>
      </SectionPage>,
    );
    const cls = screen.getByTestId("v-w-none-root").className;
    expect(cls).not.toMatch(/max-w-/);
  });

  it("padBottom=max uses the max pad token and not the default pad", () => {
    render(
      <SectionPage id="v-pad-max" title="P" backFallback="/x" padBottom="max">
        <p>body</p>
      </SectionPage>,
    );
    const root = screen.getByTestId("v-pad-max-root");
    expect(root).toHaveClass("pb-[var(--form-bottom-pad-max)]");
    expect(root).not.toHaveClass("pb-[var(--form-bottom-pad)]");
  });

  it("padBottom=none applies no pb- class", () => {
    render(
      <SectionPage id="v-pad-none" title="P" backFallback="/x" padBottom="none">
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-pad-none-root").className).not.toMatch(/pb-/);
  });

  it("minW0=false drops min-w-0", () => {
    render(
      <SectionPage id="v-minw0" title="M" backFallback="/x" minW0={false}>
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-minw0-root")).not.toHaveClass("min-w-0");
  });

  it("center=true adds mx-auto", () => {
    render(
      <SectionPage id="v-center" title="C" backFallback="/x" center>
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-center-root")).toHaveClass("mx-auto");
  });

  it.each([
    ["5", "space-y-5"],
    ["4", "space-y-4"],
  ] as const)("stack=%s applies %s and not space-y-6", (stack, cls) => {
    render(
      <SectionPage id={`v-stack-${stack}`} title="S" backFallback="/x" stack={stack}>
        <p>body</p>
      </SectionPage>,
    );
    const root = screen.getByTestId(`v-stack-${stack}-root`);
    expect(root).toHaveClass(cls);
    expect(root).not.toHaveClass("space-y-6");
  });

  it("header.actions renders in the PageHeader", () => {
    render(
      <SectionPage
        id="v-actions"
        title="A"
        backFallback="/x"
        header={{ actions: <button type="button">Save changes</button> }}
      >
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("header.overflow renders the overflow trigger", () => {
    render(
      <SectionPage
        id="v-overflow"
        title="O"
        backFallback="/x"
        header={{ overflow: [{ label: "Export", onSelect: () => {} }] }}
      >
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  });

  it("className is appended last to the root", () => {
    render(
      <SectionPage id="v-class" title="X" backFallback="/x" className="p-6">
        <p>body</p>
      </SectionPage>,
    );
    const root = screen.getByTestId("v-class-root");
    expect(root).toHaveClass("p-6");
    expect(root.className.endsWith("p-6")).toBe(true);
  });

  it("suspense=false renders the body without a boundary", () => {
    render(
      <SectionPage id="v-nosusp" title="X" backFallback="/x" suspense={false}>
        <p>direct body</p>
      </SectionPage>,
    );
    expect(screen.getByText("direct body")).toBeInTheDocument();
  });
});
