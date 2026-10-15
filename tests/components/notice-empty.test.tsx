/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { Notice } from "@/components/notice";
import { FileText } from "lucide-react";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

describe("Notice variant=empty", () => {
  it("renders title and description", () => {
    const { getByText } = render(
      <Notice variant="empty" icon={FileText} title="No transactions">Add your first transaction to get started</Notice>
    );
    expect(getByText("No transactions")).toBeTruthy();
    expect(getByText("Add your first transaction to get started")).toBeTruthy();
  });

  it("renders link action when href provided", () => {
    const { getByText } = render(
      <Notice variant="empty" icon={FileText} title="No data" action={{ label: "Import", href: "/import" }}>Import your data</Notice>
    );
    const link = getByText("Import");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/import");
  });

  it("renders button action when onClick provided", () => {
    const handleClick = vi.fn();
    const { getByText } = render(
      <Notice variant="empty" icon={FileText} title="Empty" action={{ label: "Add Item", onClick: handleClick }}>Click to add</Notice>
    );
    const button = getByText("Add Item");
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("renders without action", () => {
    const { container } = render(
      <Notice variant="empty" icon={FileText} title="Empty">Nothing here</Notice>
    );
    const buttons = container.querySelectorAll("button");
    const links = container.querySelectorAll("a");
    expect(buttons).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it("renders the icon", () => {
    const { container } = render(
      <Notice variant="empty" icon={FileText} title="Test">Test desc</Notice>
    );
    // Lucide icons render as SVG
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
