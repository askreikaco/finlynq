/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { CardLayoutEditor } from "@/components/mobile/card-layout-editor";
import type { PageCard } from "@/lib/card-layout";

afterEach(cleanup);

const CARDS: PageCard[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Beta" },
  { id: "c", title: "Gamma", defaultVisible: false },
];

function setup(over: Partial<React.ComponentProps<typeof CardLayoutEditor>> = {}) {
  const onSave = vi.fn(async () => {});
  const onReset = vi.fn(async () => {});
  const onOpenChange = vi.fn();
  render(
    <CardLayoutEditor
      open
      onClose={() => onOpenChange(false)}
      title="Customize accounts"
      cards={CARDS}
      layout={{ order: ["a", "b", "c"], hidden: ["c"] }}
      onSave={onSave}
      onReset={onReset}
      {...over}
    />,
  );
  return { onSave, onReset, onOpenChange };
}

describe("CardLayoutEditor", () => {
  it("shows the page title and one row per card, switch on = visible", () => {
    setup();
    expect(screen.getByText("Customize accounts")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Alpha" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Gamma" }).getAttribute("aria-checked")).toBe("false");
  });

  it("Save sends the order and hidden set, then closes", async () => {
    const { onSave, onOpenChange } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Gamma" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Beta up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ order: ["b", "a", "c"], hidden: [] }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("the first card cannot move up and the last cannot move down", () => {
    setup();
    expect((screen.getByRole("button", { name: "Move Alpha up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Gamma down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("cards not listed keep their saved state (hidden ids and position are not lost on save)", async () => {
    const { onSave } = setup({
      cards: [CARDS[0], CARDS[1]],
      layout: { order: ["a", "c", "b"], hidden: ["c"] },
    });
    expect(within(document.querySelector("[data-slot=customize-list]") as HTMLElement).queryByText("Gamma")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = (onSave.mock.calls[0] as unknown as [{ order: string[]; hidden: string[] }])[0];
    expect(saved.hidden).toEqual(["c"]);
    expect(saved.order).toEqual(["a", "c", "b"]);
  });

  it("Reset to default calls onReset", async () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
  });

  it("a failed save shows an alert and keeps the sheet open", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("down");
    });
    const { onOpenChange } = setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
