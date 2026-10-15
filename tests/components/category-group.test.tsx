/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { CategoryGroup } from "@/app/(app)/categories/_components/category-group";

afterEach(cleanup);

function Harness({ onSelect }: { onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <CategoryGroup
      label="Housing"
      panelId="housing-panel"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      header={<button type="button" onClick={onSelect}>Housing row</button>}
    >
      <p>Rent</p>
    </CategoryGroup>
  );
}

describe("CategoryGroup: select the row, expand only from the chevron", () => {
  it("clicking the row body selects and does NOT expand", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Housing row"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Rent")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand Housing" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking the chevron expands and collapses and does NOT select", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Housing" }));
    expect(screen.getByText("Rent")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "Collapse Housing" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("housing-panel");
    fireEvent.click(toggle);
    expect(screen.queryByText("Rent")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
