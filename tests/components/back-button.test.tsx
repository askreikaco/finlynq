/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { PageHeader } from "@/components/mobile";

vi.mock("next/navigation", () => ({
  usePathname: () => "/accounts",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

const cls = (el: Element) => el.className.toString().split(/\s+/).filter(Boolean);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Back control (round iconOnly Button in PageHeader)", () => {
  it("renders an <a> with href", () => {
    render(<PageHeader title="T" back={{ href: "/previous" }} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/previous");
  });

  it("has an accessible name (aria-label)", () => {
    render(<PageHeader title="T" back={{ href: "/previous" }} />);
    const link = screen.getByRole("link", { name: "Back" });
    expect(link).toBeTruthy();
  });

  it("uses custom label for aria-label", () => {
    render(<PageHeader title="T" back={{ href: "/previous", label: "Go back" }} />);
    const link = screen.getByRole("link", { name: "Go back" });
    expect(link).toBeTruthy();
  });

  it("is a 44x44 round hit area (size-11 rounded-full) at every width", () => {
    render(<PageHeader title="T" back={{ href: "/previous" }} />);
    const link = screen.getByRole("link");
    expect(cls(link)).toEqual(expect.arrayContaining(["size-11", "rounded-full"]));
  });

  it("has data-slot attribute", () => {
    render(<PageHeader title="T" back={{ href: "/previous" }} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("data-slot", "back-button");
  });

  it("renders ChevronLeft icon with aria-hidden", () => {
    const { container } = render(<PageHeader title="T" back={{ href: "/previous" }} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

});

describe("PageHeader with an explicit back", () => {
  it("renders the back button before the title", () => {
    render(<PageHeader title="Test Title" back={{ href: "/previous" }} />);
    const link = screen.getByRole("link");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(link.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the back button with a custom label", () => {
    render(<PageHeader title="Test Title" back={{ href: "/previous", label: "Back to accounts" }} />);
    expect(screen.getByRole("link", { name: "Back to accounts" })).toBeTruthy();
  });

  it("renders no back button on a root page without a back", () => {
    render(<PageHeader title="Test Title" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("the title is a bare h1 slot", () => {
    render(<PageHeader title="Test Title" back={{ href: "/previous" }} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.tagName).toBe("H1");
    expect(h1.getAttribute("data-slot")).toBe("page-header-title");
  });

  it("back, title and primary render in that order", () => {
    render(
      <PageHeader title="Test Title" back={{ href: "/previous" }} info="About it" primary={{ kind: "add", label: "Action", onSelect: () => {} }} />,
    );
    const link = screen.getByRole("link");
    const h1 = screen.getByRole("heading", { level: 1 });
    const tip = screen.getByRole("button", { name: "About Test Title" });
    const action = screen.getByRole("button", { name: "Action" });
    expect(link.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h1.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tip.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a button back (onBack) renders before the title too", () => {
    render(<PageHeader title="Test Title" back={{ onBack: () => {}, label: "Back to list" }} />);
    const back = screen.getByRole("button", { name: "Back to list" });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(back.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
