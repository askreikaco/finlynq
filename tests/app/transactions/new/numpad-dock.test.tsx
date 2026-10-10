/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  NumpadDock,
  type NumpadDockProps,
} from "@/app/(app)/transactions/new/_components/numpad-dock";

const tap = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

/** Stateful screen with two amount fields. Keypresses on the dock's own buttons update `values`. */
function Screen({ decimals = 2 }: { decimals?: number }) {
  const [active, setActive] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  return (
    <>
      <output data-testid="values">{JSON.stringify(values)}</output>
      <button type="button" onClick={() => setActive("r2")}>Focus row 2</button>
      <button type="button" onClick={() => setActive("r3")}>Focus row 3</button>
      <button type="button" onClick={() => setActive(null)}>Close dock</button>
      <NumpadDock
        activeId={active}
        activeValue={active ? (values[active] ?? "") : ""}
        onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
        onDone={() => setActive(null)}
        decimals={decimals}
      />
    </>
  );
}

const values = () => JSON.parse(screen.getByTestId("values").textContent ?? "{}") as Record<string, string>;

function renderDock(over: Partial<NumpadDockProps> = {}) {
  const props: NumpadDockProps = {
    activeId: "r2",
    activeValue: "",
    onChange: vi.fn(),
    onDone: vi.fn(),
    decimals: 2,
    ...over,
  };
  const utils = render(<NumpadDock {...props} />);
  return { ...utils, props };
}

afterEach(() => {
  cleanup();
});

describe("NumpadDock", () => {
  it("renders the Numpad for the active field and writes to that field's id", () => {
    const { props } = renderDock({ activeId: "r2", activeValue: "700" });
    expect(screen.getByRole("group", { name: "Amount keypad" })).toBeTruthy();
    tap("1");
    expect(props.onChange).toHaveBeenCalledWith("r2", "7001");
  });

  it("switching the active field commits the pending expression to the previous field first", () => {
    render(<Screen />);
    tap("Focus row 2");
    tap("4");
    tap("5");
    tap("Plus");
    tap("1");
    tap("2");
    expect(values()).toEqual({ r2: "45+12" });

    tap("Focus row 3");

    // "45+12" is evaluated and saved to row 2; row 3 is untouched.
    expect(values()).toEqual({ r2: "57" });

    // The dock now targets row 3.
    tap("9");
    expect(values()).toEqual({ r2: "57", r3: "9" });
  });

  it("closing the dock (no active field) also commits a pending expression to the last field", () => {
    render(<Screen />);
    tap("Focus row 2");
    tap("2");
    tap("Plus");
    tap("3");
    tap("Close dock");
    expect(values()).toEqual({ r2: "5" });
    expect(screen.queryByRole("group", { name: "Amount keypad" })).toBeNull();
  });

  it("renders nothing when no field is active", () => {
    const { container } = renderDock({ activeId: null });
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("group", { name: "Amount keypad" })).toBeNull();
    expect(screen.queryByTestId("numpad-dock")).toBeNull();
  });

  it("renders nothing when visible is false", () => {
    const { container } = renderDock({ visible: false });
    expect(container.firstChild).toBeNull();
  });

  it("is pointer-coarse only, with the safe-area bottom offset, and merges className", () => {
    renderDock({ className: "extra-test-class" });
    const dock = screen.getByTestId("numpad-dock");
    expect(dock.className).toContain("pointer-coarse:block");
    expect(dock.className).toContain("hidden");
    expect(dock.className).toContain("bottom-[var(--sab,0px)]");
    expect(dock.className).toContain("extra-test-class");
  });

  it("rounds an evaluated expression to the currency decimals (0 for VND/JPY)", () => {
    const { props } = renderDock({ activeId: "r2", activeValue: "1+0.5", decimals: 0 });
    tap("Done");
    expect(props.onChange).toHaveBeenCalledWith("r2", "2");
  });

  it("does not round typed input, so a decimal typed at 0 decimals is kept", () => {
    render(<Screen decimals={0} />);
    tap("Focus row 2");
    tap("1");
    tap("Decimal point");
    tap("5");
    expect(values()).toEqual({ r2: "1.5" });
  });

  it("does not round when Delete removes the trailing operator from a pending expression", () => {
    const { props } = renderDock({ activeId: "r2", activeValue: "4.5+", decimals: 0 });
    tap("Delete last digit");
    expect(props.onChange).toHaveBeenCalledWith("r2", "4.5");
  });
});
