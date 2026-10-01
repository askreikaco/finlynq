/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { CustomizeDashboardSheet } from "@/components/mobile";
import { DASHBOARD_CARDS, DEFAULT_CARD_ORDER, defaultLayout } from "@/lib/dashboard-layout";

afterEach(cleanup);

const titles = (el: HTMLElement) => within(el).getAllByRole("listitem").map((li) => li.getAttribute("data-card-id"));

function setup(over: Partial<React.ComponentProps<typeof CustomizeDashboardSheet>> = {}) {
  const onSave = vi.fn(async () => {});
  const onReset = vi.fn(async () => {});
  const onOpenChange = vi.fn();
  render(
    <CustomizeDashboardSheet open onOpenChange={onOpenChange} layout={defaultLayout()} onSave={onSave} onReset={onReset} {...over} />,
  );
  return { onSave, onReset, onOpenChange, list: () => screen.getByRole("dialog").querySelector("[data-slot=customize-list]") as HTMLElement };
}

describe("CustomizeDashboardSheet", () => {
  it("lists every card (switch on = visible) with 44px up/down buttons", () => {
    const { list } = setup({ layout: { order: [...DEFAULT_CARD_ORDER], hidden: ["insights"] } });
    expect(titles(list())).toEqual([...DEFAULT_CARD_ORDER]);
    for (const c of DASHBOARD_CARDS) {
      const sw = screen.getByRole("switch", { name: c.title });
      expect(sw.getAttribute("aria-checked")).toBe(c.id === "insights" ? "false" : "true");
    }
    const up = screen.getByRole("button", { name: "Move Key metrics up" });
    expect(up.className).toContain("size-11");
    expect(screen.getByRole("button", { name: "Move Key metrics down" }).className).toContain("size-11");
  });

  it("ends of the list can't move further", () => {
    setup();
    expect((screen.getByRole("button", { name: "Move Getting started tips up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Insights down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("toggle + reorder, then Save passes the new {order, hidden} and closes", async () => {
    const { onSave, onOpenChange, list } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Key metrics" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Weekly recap up" })); // above Action center
    fireEvent.click(screen.getByRole("button", { name: "Move Net worth down" })); // below Financial health
    const order = titles(list());
    expect(order.indexOf("weekly-recap")).toBeLessThan(order.indexOf("action-center"));
    expect(order.indexOf("health-score")).toBeLessThan(order.indexOf("net-worth"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = (onSave.mock.calls[0] as unknown as [{ order: string[]; hidden: string[] }])[0];
    expect(saved.hidden).toEqual(["key-metrics"]);
    expect(saved.order).toEqual(order);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("toggling a card back on removes it from hidden", async () => {
    const { onSave } = setup({ layout: { order: [...DEFAULT_CARD_ORDER], hidden: ["insights"] } });
    fireEvent.click(screen.getByRole("switch", { name: "Insights" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0] as unknown as [{ hidden: string[] }])[0].hidden).toEqual([]);
  });

  it("Reset to default calls onReset (not onSave) and closes", async () => {
    const { onSave, onReset, onOpenChange } = setup({ layout: { order: [...DEFAULT_CARD_ORDER].reverse(), hidden: ["insights"] } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("a failed save keeps the sheet open and shows an error", async () => {
    const onSave = vi.fn(async () => { throw new Error("nope"); });
    const { onOpenChange } = setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("availableIds hides unlisted (dev-only) cards but a save keeps their saved state", async () => {
    const avail = DASHBOARD_CARDS.filter((c) => !c.devOnly).map((c) => c.id);
    const { onSave, list } = setup({ availableIds: avail, layout: { order: [...DEFAULT_CARD_ORDER], hidden: ["insights"] } });
    expect(titles(list())).toEqual(avail);
    expect(screen.queryByRole("switch", { name: "Insights" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = (onSave.mock.calls[0] as unknown as [{ order: string[]; hidden: string[] }])[0];
    expect(saved.hidden).toEqual(["insights"]);
    expect(saved.order).toHaveLength(DEFAULT_CARD_ORDER.length);
  });
});
