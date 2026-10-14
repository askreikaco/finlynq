/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTip } from "@/components/ui/info-tip";

afterEach(() => cleanup());

describe("InfoTip", () => {
  it("is a focusable button with an aria-label", () => {
    render(<InfoTip text="Help text" label="About currency" />);
    const btn = screen.getByRole("button", { name: "About currency" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
    expect(screen.queryByText("Help text")).toBeNull();
  });

  it("defaults the aria-label", () => {
    render(<InfoTip text="x" />);
    expect(screen.getByRole("button", { name: "More info" })).toBeTruthy();
  });

  it("opens on click/tap and closes on a second click", async () => {
    const user = userEvent.setup();
    render(<InfoTip text="Help text" />);
    const btn = screen.getByRole("button", { name: "More info" });
    await user.click(btn);
    expect(await screen.findByText("Help text")).toBeTruthy();
    await user.click(btn);
    expect(screen.queryByText("Help text")).toBeNull();
  });

  it("opens on keyboard focus and closes on blur", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoTip text="Help text" />
        <button type="button">other</button>
      </div>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More info" }));
    expect(await screen.findByText("Help text")).toBeTruthy();
    await user.tab();
    expect(screen.queryByText("Help text")).toBeNull();
  });
});
