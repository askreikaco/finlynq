/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SectionPage } from "@/components/templates/section-page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/general",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("SectionPage", () => {
  it("renders the root testid, title, subtitle and children", () => {
    render(
      <SectionPage id="settings-general" title="General" subtitle="Display" backFallback="/settings" width="section">
        <p>body</p>
      </SectionPage>,
    );
    const root = screen.getByTestId("settings-general-root");
    expect(root).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("links Back to backFallback", () => {
    render(
      <SectionPage id="admin-x" title="X" backFallback="/admin" width="report">
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/admin");
  });

  it("applies the section width token", () => {
    render(
      <SectionPage id="w-section" title="S" backFallback="/settings" width="section">
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("w-section-root")).toHaveClass("max-w-section");
    expect(screen.getByTestId("w-section-root")).not.toHaveClass("max-w-report");
  });

  it("applies the report width token", () => {
    render(
      <SectionPage id="w-report" title="R" backFallback="/admin" width="report">
        <p>body</p>
      </SectionPage>,
    );
    expect(screen.getByTestId("w-report-root")).toHaveClass("max-w-report");
    expect(screen.getByTestId("w-report-root")).not.toHaveClass("max-w-section");
  });

  it("owns a Suspense boundary for the body", async () => {
    let resolved = false;
    const pending = new Promise<void>((r) => setTimeout(() => { resolved = true; r(); }, 0));
    function Suspender() {
      if (!resolved) throw pending;
      return <p>loaded body</p>;
    }
    render(
      <SectionPage id="susp" title="Susp" backFallback="/settings" width="section">
        <Suspender />
      </SectionPage>,
    );
    expect(await screen.findByText("loaded body")).toBeInTheDocument();
  });
});
