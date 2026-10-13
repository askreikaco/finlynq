/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { PageHeader, HEADER_SECONDARY } from "@/components/mobile/page-header";
import { usePageCustomize } from "@/components/mobile/page-customize";

vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/adaptive/use-back-target", () => ({ useBackTarget: () => null }));

afterEach(cleanup);

/** A page with cards: registers Customize while mounted. */
function CardsPage({ onOpen }: { onOpen: () => void }) {
  usePageCustomize({ onOpen });
  return (
    <PageHeader
      title="Accounts"
      overflow={[{ label: "Show archived", onSelect: () => {} }]}
      actions={<button>Add</button>}
    />
  );
}

/** A page without cards: registers nothing. */
function NoCardsPage() {
  return <PageHeader title="Import" overflow={[{ label: "Help", onSelect: () => {} }]} actions={<button>Add</button>} />;
}

describe("PageHeader: Customize in the More group", () => {
  it("renders [More, Customize] in that order, then the primary action", () => {
    render(<CardsPage onOpen={() => {}} />);
    const more = screen.getByRole("button", { name: "More actions" });
    const customize = screen.getByRole("button", { name: "Customize" });
    const add = screen.getByRole("button", { name: "Add" });
    expect(more.compareDocumentPosition(customize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(customize.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // More and Customize share one capsule group; the primary sits outside it, on the right
    const capsule = customize.closest('[data-slot="header-capsule"]') as HTMLElement;
    expect(capsule.contains(more)).toBe(true);
    expect(capsule.contains(add)).toBe(false);
    expect(capsule.nextElementSibling).toBe(add);
  });

  it("the Customize button has a gear icon, aria-label and tooltip 'Customize', and a 44px slot on phones", () => {
    render(<CardsPage onOpen={() => {}} />);
    const customize = screen.getByRole("button", { name: "Customize" });
    expect(customize.getAttribute("title")).toBe("Customize");
    expect(customize.querySelector("svg")).not.toBeNull();
    expect(customize.getAttribute("data-slot")).toBe("customize-trigger");
    expect(customize.className).toContain("pointer-coarse:size-11");
  });

  it("clicking Customize calls the page's handler (the page opens its sheet)", () => {
    const onOpen = vi.fn();
    render(<CardsPage onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a page that registers nothing shows no Customize button; More and the primary still render", () => {
    render(<NoCardsPage />);
    expect(screen.queryByRole("button", { name: "Customize" })).toBeNull();
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("the Customize button goes away when the page unmounts its registration", () => {
    const { rerender } = render(<CardsPage onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "Customize" })).toBeTruthy();
    rerender(<NoCardsPage />);
    expect(screen.queryByRole("button", { name: "Customize" })).toBeNull();
  });

  it("a Customize-only header (no overflow items) still renders the group", () => {
    function OnlyCustomize() {
      usePageCustomize({ onOpen: () => {} });
      return <PageHeader title="Only" />;
    }
    render(<OnlyCustomize />);
    const customize = screen.getByRole("button", { name: "Customize" });
    expect(customize.closest('[data-slot="header-capsule"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("keeps the secondary (desktop-only) actions out of the phone capsule as before", () => {
    render(
      <PageHeader
        title="Reports"
        overflow={[{ label: "Export", onSelect: () => {} }]}
        actions={<><button className={HEADER_SECONDARY}>Manage</button><button>Add</button></>}
      />,
    );
    const capsule = screen.getByRole("button", { name: "More actions" }).closest('[data-slot="header-capsule"]') as HTMLElement;
    expect(within(capsule).queryByText("Manage")).not.toBeNull();
    expect(screen.getByText("Manage").className).toContain("max-regular:hidden");
  });
});

describe("usePageCustomize registry", () => {
  it("the most recently registered page handler wins; removing it restores the previous one", () => {
    const first = vi.fn();
    const second = vi.fn();
    function A() {
      usePageCustomize({ onOpen: first });
      return null;
    }
    function B() {
      usePageCustomize({ onOpen: second });
      return null;
    }
    const { rerender } = render(
      <>
        <PageHeader title="x" />
        <A />
        <B />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    rerender(
      <>
        <PageHeader title="x" />
        <A />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
