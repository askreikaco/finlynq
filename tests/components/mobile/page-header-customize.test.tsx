/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHeader } from "@/components/mobile/page-header";
import { usePageCustomize } from "@/components/mobile/page-customize";

vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/adaptive/use-back-target", () => ({ useBackTarget: () => null }));

afterEach(cleanup);

function CardsPage({ onOpen }: { onOpen: () => void }) {
  usePageCustomize({ onOpen });
  return <PageHeader title="Accounts" overflow={[{ label: "Show archived", onSelect: () => {} }]} actions={<button>Add</button>} />;
}

describe("PageHeader: Customize cards is a More item, never a bar button", () => {
  it("has no Customize / gear button in the bar", () => {
    render(<CardsPage onOpen={() => {}} />);
    expect(screen.queryByRole("button", { name: "Customize" })).toBeNull();
    expect(document.querySelector('[data-slot="customize-trigger"]')).toBeNull();
  });

  it("More lists the page's items then Customize cards, and Customize cards calls the page handler", async () => {
    const onOpen = vi.fn();
    render(<CardsPage onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Show archived", "Customize cards"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Customize cards" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a Customize-only page still gets a More button", () => {
    function Only() {
      usePageCustomize({ onOpen: () => {} });
      return <PageHeader title="Only" />;
    }
    render(<Only />);
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
  });

  it("a page that registers nothing has no Customize item", async () => {
    render(<PageHeader title="Import" overflow={[{ label: "Help", onSelect: () => {} }]} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect((await screen.findAllByRole("menuitem")).map((i) => i.textContent)).toEqual(["Help"]);
  });

  it("the registration goes away when the page unmounts", () => {
    const { rerender } = render(<CardsPage onOpen={() => {}} />);
    rerender(<PageHeader title="x" />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});

describe("usePageCustomize registry", () => {
  it("the most recently registered handler wins; removing it restores the previous one", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const A = () => { usePageCustomize({ onOpen: first }); return null; };
    const B = () => { usePageCustomize({ onOpen: second }); return null; };
    const { rerender } = render(<><PageHeader title="x" /><A /><B /></>);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Customize cards" }));
    expect(second).toHaveBeenCalledTimes(1);
    rerender(<><PageHeader title="x" /><A /></>);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Customize cards" }));
    expect(first).toHaveBeenCalledTimes(1);
  });
});
