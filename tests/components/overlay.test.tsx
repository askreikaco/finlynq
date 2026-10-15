/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { Overlay } from "@/components/ui/overlay";

afterEach(cleanup);

describe("Overlay: one surface, every part a field", () => {
  it("confirm variant: destructive title, message, Cancel + Delete; Delete confirms, Cancel closes", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<Overlay variant="confirm" open onClose={onClose} title="Delete goal" message="This cannot be undone." onConfirm={onConfirm} />);
    const dlg = await screen.findByRole("dialog", { name: "Delete goal" });
    expect(within(dlg).getByText("This cannot be undone.")).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("confirm variant: busy swaps the label, disables both buttons and blocks Escape", async () => {
    const onClose = vi.fn();
    render(<Overlay variant="confirm" open onClose={onClose} title="Delete" busy busyLabel="Deleting…" onConfirm={() => {}} />);
    const dlg = await screen.findByRole("dialog");
    expect((within(dlg).getByRole("button", { name: "Deleting…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dlg).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(dlg, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 20));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("confirm variant: destructive={false} renders a neutral confirm", async () => {
    render(<Overlay variant="confirm" destructive={false} open onClose={() => {}} title="Switch?" confirmLabel="Switch" onConfirm={() => {}} />);
    const dlg = await screen.findByRole("dialog");
    expect(dlg.querySelector("svg.lucide-triangle-alert, svg.lucide-alert-triangle")).toBeNull();
    expect(within(dlg).getByRole("button", { name: "Switch" }).getAttribute("data-variant")).toBe("primary");
  });

  it("form variant: actions render in order, an action without onClick closes, the primary runs its handler", async () => {
    const onClose = vi.fn();
    const save = vi.fn();
    render(
      <Overlay open onClose={onClose} title="Edit rule" actions={[{ label: "Cancel" }, { label: "Save", kind: "primary", onClick: save }]}>
        <input aria-label="Name" />
      </Overlay>,
    );
    const dlg = await screen.findByRole("dialog", { name: "Edit rule" });
    const buttons = within(dlg).getAllByRole("button").map((b) => b.textContent);
    expect(buttons.indexOf("Cancel")).toBeLessThan(buttons.indexOf("Save"));
    fireEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("form variant: onSubmit wraps body and footer in a form so a submit action posts it", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <Overlay open onClose={() => {}} title="Add" onSubmit={onSubmit} actions={[{ label: "Add", kind: "primary", type: "submit" }]}>
        <input aria-label="Name" />
      </Overlay>,
    );
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Add" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("info is an InfoTip next to the title; there is no description paragraph", async () => {
    render(<Overlay open onClose={() => {}} title="Import" info="Explains the import." />);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("button", { name: "About Import" })).toBeTruthy();
    // Screen readers still get the text (sr-only description); sighted users get it in the tip.
    expect(dlg.querySelector('[data-slot="overlay-description"]')?.className).toContain("sr-only");
    expect(dlg.querySelectorAll("p:not(.sr-only)").length).toBe(0);
  });

  it("detail variant: label/value rows in a dl, children below, subtitle under the title", async () => {
    render(
      <Overlay variant="detail" open onClose={() => {}} title="PVS.VN" subtitle="Savings" items={[{ label: "Quantity", value: "300" }]}>
        <button>Edit</button>
      </Overlay>,
    );
    const dlg = await screen.findByRole("dialog", { name: "PVS.VN" });
    expect(within(dlg).getByText("Savings")).toBeTruthy();
    expect(within(dlg).getByText("Quantity").tagName).toBe("DT");
    expect(within(dlg).getByText("300").tagName).toBe("DD");
    expect(dlg.querySelector("[data-slot=detail-list]")).not.toBeNull();
    expect(within(dlg).getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("picker variant: toolbar and headerAction slots render, and the X closes", async () => {
    const onClose = vi.fn();
    render(
      <Overlay variant="picker" open onClose={onClose} title="Pick" toolbar={<input aria-label="Search" />} headerAction={<a href="/x">Settings</a>}>
        <button>Choice</button>
      </Overlay>,
    );
    const dlg = await screen.findByRole("dialog", { name: "Pick" });
    expect(within(dlg).getByLabelText("Search")).toBeTruthy();
    expect(within(dlg).getByRole("link", { name: "Settings" })).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("showClose={false} hides the X; Escape still closes", async () => {
    const onClose = vi.fn();
    render(<Overlay open onClose={onClose} title="T" showClose={false} />);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(dlg, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("presentation: auto is a bottom sheet on phones that becomes a centred dialog; sheet-right is a drawer; confirm is always a dialog", async () => {
    const { rerender } = render(<Overlay open onClose={() => {}} title="A" />);
    let dlg = await screen.findByRole("dialog");
    expect(dlg.getAttribute("data-presentation")).toBe("auto");
    expect(dlg.className).toContain("bottom-[var(--kb-inset,0px)]");
    expect(dlg.className).toContain("regular:-translate-x-1/2");
    rerender(<Overlay open onClose={() => {}} title="A" presentation="sheet-right" />);
    dlg = await screen.findByRole("dialog");
    expect(dlg.className).toContain("inset-y-0");
    expect(dlg.className).toContain("right-0");
    expect(dlg.className).not.toContain("bottom-[var(--kb-inset,0px)]");
    rerender(<Overlay open onClose={() => {}} variant="confirm" title="A" />);
    dlg = await screen.findByRole("dialog");
    expect(dlg.className).toContain("-translate-x-1/2");
    expect(dlg.className).not.toContain("bottom-[var(--kb-inset,0px)]");
  });

  it("size maps to the regular max width and testId lands on the popup", async () => {
    render(<Overlay open onClose={() => {}} title="A" size="2xl" testId="my-overlay" />);
    const dlg = await screen.findByTestId("my-overlay");
    expect(dlg.className).toContain("regular:max-w-3xl");
    expect(dlg.className).not.toContain("regular:max-w-lg");
  });

  it("renders nothing while closed", () => {
    render(<Overlay open={false} onClose={() => {}} title="x" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
