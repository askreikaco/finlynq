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

const DEFAULT_ROOT = "min-w-0 space-y-6 pb-[var(--form-bottom-pad)]";

describe("SectionPage variants", () => {
  it("default props render the original root className literal", () => {
    render(
      <SectionPage id="v-default" title="D" back={{ href: "/settings" }}>
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-default-root").className).toBe(DEFAULT_ROOT);
  });

  it("omitted back: header matches a bare PageHeader", () => {
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
      <SectionPage id="v-label" title="L" back={{ href: "/settings", label: "Up" }}>
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
  ] as const)("width=%s applies no %s cap (full width on desktop)", (width, cls) => {
    render(
      <SectionPage id={`v-w-${width}`} title="W" back={{ href: "/x" }} width={width}>
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId(`v-w-${width}-root`)).not.toHaveClass(cls);
    expect(screen.getByTestId(`v-w-${width}-root`).className).not.toMatch(/max-w-/);
  });

  it("width=report is full width (no max-width token, no mx-auto even with center)", () => {
    render(
      <SectionPage id="v-w-report" title="W" back={{ href: "/x" }} width="report" center>
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-w-report-root").className).not.toMatch(/max-w-|mx-auto/);
  });

  it("width=none applies no max-width token", () => {
    render(
      <SectionPage id="v-w-none" title="W" back={{ href: "/x" }} width="none">
        <p>body</p>
      </SectionPage>,
    );
    const cls = screen.getByTestId("v-w-none-root").className;
    expect(cls).not.toMatch(/max-w-/);
  });

  it("padBottom=max uses the max pad token and not the default pad", () => {
    render(
      <SectionPage id="v-pad-max" title="P" back={{ href: "/x" }} padBottom="max">
        <p>body</p>
      </SectionPage>,
    );
    const root = screen.getByTestId("v-pad-max-root");
    expect(root).toHaveClass("pb-[var(--form-bottom-pad-max)]");
    expect(root).not.toHaveClass("pb-[var(--form-bottom-pad)]");
  });

  it("padBottom=none applies no pb- class", () => {
    render(
      <SectionPage id="v-pad-none" title="P" back={{ href: "/x" }} padBottom="none">
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-pad-none-root").className).not.toMatch(/pb-/);
  });

  it("minW0=false drops min-w-0", () => {
    render(
      <SectionPage id="v-minw0" title="M" back={{ href: "/x" }} minW0={false}>
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-minw0-root")).not.toHaveClass("min-w-0");
  });

  it("center=true adds mx-auto", () => {
    render(
      <SectionPage id="v-center" title="C" back={{ href: "/x" }} center>
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
      <SectionPage id={`v-stack-${stack}`} title="S" back={{ href: "/x" }} stack={stack}>
        <p>body</p>
      </SectionPage>,
    );
    const root = screen.getByTestId(`v-stack-${stack}-root`);
    expect(root).toHaveClass(cls);
    expect(root).not.toHaveClass("space-y-6");
  });

  it("header.primary renders in the PageHeader", () => {
    render(
      <SectionPage
        id="v-actions"
        title="A"
        back={{ href: "/x" }}
        header={{ primary: { kind: "save", label: "Save changes", onSelect: () => {} } }}
      >
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("header.more renders the More trigger", () => {
    render(
      <SectionPage
        id="v-overflow"
        title="O"
        back={{ href: "/x" }}
        header={{ more: [{ label: "Export", onSelect: () => {} }] }}
      >
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  });

  it("className is appended last to the root", () => {
    render(
      <SectionPage id="v-class" title="X" back={{ href: "/x" }} className="p-6">
        <p>body</p>
      </SectionPage>,
    );
    const root = screen.getByTestId("v-class-root");
    expect(root).toHaveClass("p-6");
    expect(root.className.endsWith("p-6")).toBe(true);
  });

  it("suspense=false renders the body without a boundary", () => {
    render(
      <SectionPage id="v-nosusp" title="X" back={{ href: "/x" }} suspense={false}>
        <p>direct body</p>
      </SectionPage>,
    );
    expect(screen.getByText("direct body")).toBeInTheDocument();
  });
});

describe("SectionPage variants: grid", () => {
  it("grid renders the body in the 1 / 2 / 3 column card grid", () => {
    render(
      <SectionPage id="v-grid" title="G" back={{ href: "/x" }} grid>
        <p>a</p>
        <p>b</p>
      </SectionPage>,
    );
    const g = screen.getByTestId("v-grid-root").querySelector('[data-slot="section-grid"]');
    expect(g).toHaveClass("grid", "grid-cols-1", "items-start", "regular:grid-cols-2", "wide:grid-cols-3");
    expect(g?.children).toHaveLength(2);
  });

  it("without grid there is no grid wrapper", () => {
    render(
      <SectionPage id="v-nogrid" title="G" back={{ href: "/x" }}>
        <p>a</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("v-nogrid-root").querySelector('[data-slot="section-grid"]')).toBeNull();
  });
});
