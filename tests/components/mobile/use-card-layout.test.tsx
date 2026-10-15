/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { PageHeader } from "@/components/mobile/page-header";
import { CardLayoutEditor } from "@/components/mobile/card-layout-editor";
import { useCardLayout } from "@/components/mobile/use-card-layout";
import { usePageCustomize } from "@/components/mobile/page-customize";
import type { PageCard } from "@/lib/card-layout";

vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/adaptive/use-back-target", () => ({ useBackTarget: () => null }));

const CARDS: PageCard[] = [
  { id: "hero", title: "Hero" },
  { id: "list", title: "List" },
  { id: "extra", title: "Extra", defaultVisible: false },
];

/** Stub settings API: one stored layout per endpoint. */
let stored: { order: string[]; hidden: string[] } | null;
let calls: { url: string; method: string; body?: unknown }[];

beforeEach(() => {
  stored = null;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "PUT") {
        stored = JSON.parse(String(init!.body));
        return { ok: true, json: async () => stored };
      }
      return { ok: true, json: async () => stored ?? {} };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A page with cards: the hook drives the rendered cards, the registry drives the header button. */
function CardsPage() {
  const { layout, save, reset } = useCardLayout("testpage", CARDS);
  const [open, setOpen] = useState(false);
  usePageCustomize({ onOpen: () => setOpen(true) });
  const shown = layout.order.filter((id) => !layout.hidden.includes(id));
  return (
    <div>
      <PageHeader title="Test page" />
      {shown.map((id) => (
        <section key={id} data-testid={`card-${id}`}>{id}</section>
      ))}
      <CardLayoutEditor open={open} onClose={() => setOpen(false)} cards={CARDS} layout={layout} onSave={save} onReset={reset} />
    </div>
  );
}

const renderedIds = () => Array.from(document.querySelectorAll("[data-testid^='card-']")).map((el) => el.getAttribute("data-testid")!.slice(5));

describe("useCardLayout + CardLayoutEditor + header Customize", () => {
  it("renders the default layout (defaultVisible:false cards hidden) and the Customize button", async () => {
    render(<CardsPage />);
    await waitFor(() => expect(renderedIds()).toEqual(["hero", "list"]));
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
    expect(calls[0].url).toBe("/api/settings/card-layout?page=testpage");
  });

  it("hide, show and reorder in the sheet persist and re-render the page's cards", async () => {
    render(<CardsPage />);
    await waitFor(() => expect(renderedIds()).toEqual(["hero", "list"]));

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Customize cards" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("switch", { name: "Extra" })); // show
    fireEvent.click(within(dlg).getByRole("switch", { name: "List" })); // hide
    fireEvent.click(within(dlg).getByRole("button", { name: "Move Hero down" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(stored).not.toBeNull());
    expect(stored).toEqual({ order: ["list", "hero", "extra"], hidden: ["list"] });
    expect(calls.find((c) => c.method === "PUT")?.url).toBe("/api/settings/card-layout?page=testpage");
    await waitFor(() => expect(renderedIds()).toEqual(["hero", "extra"]));
  });

  it("the saved layout is loaded again on the next visit (persistence)", async () => {
    stored = { order: ["extra", "list", "hero"], hidden: [] };
    const first = render(<CardsPage />);
    await waitFor(() => expect(renderedIds()).toEqual(["extra", "list", "hero"]));
    first.unmount();
    render(<CardsPage />);
    await waitFor(() => expect(renderedIds()).toEqual(["extra", "list", "hero"]));
  });

  it("Reset to default PUTs the default layout and restores the default cards", async () => {
    stored = { order: ["extra", "list", "hero"], hidden: ["hero"] };
    render(<CardsPage />);
    await waitFor(() => expect(renderedIds()).toEqual(["extra", "list"]));
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Customize cards" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(stored).toEqual({ order: ["hero", "list", "extra"], hidden: ["extra"] }));
    await waitFor(() => expect(renderedIds()).toEqual(["hero", "list"]));
  });

  it("a page can give its own endpoint (the dashboard keeps its legacy storage)", async () => {
    function Legacy() {
      const { layout } = useCardLayout("dashboard", CARDS, { endpoint: "/api/settings/dashboard-layout" });
      return <div data-testid="n">{layout.order.join(",")}</div>;
    }
    render(<Legacy />);
    await waitFor(() => expect(calls[0]?.url).toBe("/api/settings/dashboard-layout"));
  });
});
