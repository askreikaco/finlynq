/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { BackButton, PageHeader } from "@/components/mobile";

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

describe("BackButton", () => {
  it("renders an <a> with href", () => {
    render(<BackButton href="/previous" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/previous");
  });

  it("has an accessible name (aria-label)", () => {
    render(<BackButton href="/previous" />);
    const link = screen.getByRole("link", { name: "Back" });
    expect(link).toBeTruthy();
  });

  it("uses custom label for aria-label", () => {
    render(<BackButton href="/previous" label="Go back" />);
    const link = screen.getByRole("link", { name: "Go back" });
    expect(link).toBeTruthy();
  });

  it("has minimum 44x44 hit area classes", () => {
    render(<BackButton href="/previous" />);
    const link = screen.getByRole("link");
    expect(cls(link)).toEqual(expect.arrayContaining(["min-h-11", "min-w-11"]));
  });

  it("has data-slot attribute", () => {
    render(<BackButton href="/previous" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("data-slot", "back-button");
  });

  it("renders ChevronLeft icon with aria-hidden", () => {
    const { container } = render(<BackButton href="/previous" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts custom className", () => {
    render(<BackButton href="/previous" className="custom-class" />);
    const link = screen.getByRole("link");
    expect(cls(link)).toContain("custom-class");
  });
});

describe("PageHeader with backHref", () => {
  it("renders back button before title when backHref is set", () => {
    render(
      <PageHeader title="Test Title" backHref="/previous" />
    );
    const link = screen.getByRole("link");
    const h1 = screen.getByRole("heading", { level: 1 });

    // Check that link comes before h1 in DOM order using compareDocumentPosition
    const position = link.compareDocumentPosition(h1);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders back button with custom label", () => {
    render(
      <PageHeader title="Test Title" backHref="/previous" backLabel="Back to accounts" />
    );
    const link = screen.getByRole("link", { name: "Back to accounts" });
    expect(link).toBeTruthy();
  });

  it("does not render back button when backHref is not set", () => {
    render(<PageHeader title="Test Title" />);
    const links = screen.queryAllByRole("link");
    expect(links).toHaveLength(0);
  });

  it("title-only with backHref still renders bare h1 with wrapping container", () => {
    render(
      <PageHeader title="Test Title" backHref="/previous" />
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    // The h1 should still be a bare h1 element
    expect(h1.tagName).toBe("H1");
    expect(h1.getAttribute("data-slot")).toBe("page-header-title");
  });

  it("with both lead and backHref, both render before title", () => {
    render(
      <PageHeader
        title="Test Title"
        lead={<div data-testid="lead-content">Lead</div>}
        backHref="/previous"
      />
    );

    const lead = screen.getByTestId("lead-content");
    const link = screen.getByRole("link");
    const h1 = screen.getByRole("heading", { level: 1 });

    // Back button should come before lead or title
    const backButtonPosition = link.compareDocumentPosition(lead);
    expect(backButtonPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const leadPosition = lead.compareDocumentPosition(h1);
    expect(leadPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("title-only path without backHref returns bare h1 unchanged", () => {
    render(
      <PageHeader title="Test Title" />
    );

    // When title-only without backHref, should be just the h1
    const h1 = screen.getByRole("heading", { level: 1 });
    // The h1 should be minimal - just the h1 with no wrapper
    expect(h1.getAttribute("data-slot")).toBe("page-header-title");
  });

  it("with lead and backHref and other content renders correctly", () => {
    render(
      <PageHeader
        title="Test Title"
        subtitle="Subtitle text"
        lead={<div data-testid="lead">Avatar</div>}
        backHref="/previous"
      />
    );

    const h1 = screen.getByRole("heading", { level: 1 });
    const lead = screen.getByTestId("lead");
    const link = screen.getByRole("link");
    const subtitle = screen.getByText("Subtitle text");

    expect(h1).toBeTruthy();
    expect(lead).toBeTruthy();
    expect(link).toBeTruthy();
    expect(subtitle).toBeTruthy();

    // Verify back button is before lead
    const backVsLead = link.compareDocumentPosition(lead);
    expect(backVsLead & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("with backHref and actions renders all elements in correct order", () => {
    render(
      <PageHeader
        title="Test Title"
        backHref="/previous"
        actions={<button>Action</button>}
      />
    );

    const link = screen.getByRole("link");
    const h1 = screen.getByRole("heading", { level: 1 });
    const button = screen.getByRole("button");

    // Back button should be first, then title, then actions
    const backVsTitle = link.compareDocumentPosition(h1);
    expect(backVsTitle & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const titleVsAction = h1.compareDocumentPosition(button);
    expect(titleVsAction & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("PageHeader backward compatibility", () => {
  it("title-only path without backHref returns exactly what it did before", () => {
    const { container: container1 } = render(
      <PageHeader title="Test Title" />
    );

    // Should just have the h1, nothing else at root
    const h1 = container1.querySelector('h1[data-slot="page-header-title"]');
    expect(h1).toBeTruthy();
    expect(h1?.textContent).toBe("Test Title");
  });

  it("lead path without backHref works as before", () => {
    render(
      <PageHeader
        title="Test Title"
        lead={<div data-testid="lead-avatar">Avatar</div>}
      />
    );

    const lead = screen.getByTestId("lead-avatar");
    const h1 = screen.getByRole("heading", { level: 1 });

    expect(lead).toBeTruthy();
    expect(h1).toBeTruthy();
    // Lead should be positioned before title in the lead container
    const leadVsTitle = lead.compareDocumentPosition(h1);
    expect(leadVsTitle & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("with actions but no backHref works as before", () => {
    render(
      <PageHeader
        title="Test Title"
        actions={<button>Action</button>}
      />
    );

    const h1 = screen.getByRole("heading", { level: 1 });
    const button = screen.getByRole("button");

    expect(h1).toBeTruthy();
    expect(button).toBeTruthy();
    // No back button should be present
    const links = screen.queryAllByRole("link");
    expect(links).toHaveLength(0);
  });
});
