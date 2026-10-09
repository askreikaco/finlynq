/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Numpad } from "@/app/(app)/transactions/new/_components/numpad";

function Harness({ initial = "", onConfirm }: { initial?: string; onConfirm: () => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <output data-testid="value">{value}</output>
      <Numpad value={value} onChange={setValue} onConfirm={onConfirm} />
    </>
  );
}

const shown = () => screen.getByTestId("value").textContent;
const key = (name: string) => screen.getByRole("button", { name });
const tap = (name: string) => fireEvent.click(key(name));

let onConfirm: () => void;

beforeEach(() => {
  onConfirm = vi.fn<() => void>();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Numpad layout and labels", () => {
  it("renders a 4x4 keypad in the spec order inside an Amount keypad group", () => {
    render(<Harness onConfirm={onConfirm} />);
    const group = screen.getByRole("group", { name: "Amount keypad" });
    const labels = Array.from(group.querySelectorAll("button")).map(
      (b) => b.getAttribute("aria-label") ?? b.textContent,
    );
    expect(labels).toEqual([
      "7", "8", "9", "Delete last digit",
      "4", "5", "6", "Plus",
      "1", "2", "3", "Minus",
      "Three zeros", "0", "Decimal point", "Done",
    ]);
  });

  it("uses the 4-column grid with the spec gap", () => {
    render(<Harness onConfirm={onConfirm} />);
    const group = screen.getByRole("group", { name: "Amount keypad" });
    expect(group.className).toContain("grid-cols-4");
    expect(group.className).toContain("gap-1.5");
  });

  it("shows Done (not =) while the expression has no operator", () => {
    render(<Harness initial="700" onConfirm={onConfirm} />);
    expect(key("Done").textContent).toBe("Done");
  });
});

describe("Numpad key sequences", () => {
  it("builds digits, the three-zero key and one decimal point per number", () => {
    render(<Harness onConfirm={onConfirm} />);
    tap("1");
    tap("Three zeros");
    tap("0");
    tap("Decimal point");
    tap("5");
    tap("Decimal point"); // second dot in the same segment is ignored
    tap("2");
    expect(shown()).toBe("10000.52");
  });

  it("ignores a leading plus and allows a leading minus", () => {
    render(<Harness onConfirm={onConfirm} />);
    tap("Plus");
    expect(shown()).toBe("");
    tap("Minus");
    expect(shown()).toBe("-");
  });

  it("replaces a trailing operator instead of stacking two", () => {
    render(<Harness initial="5" onConfirm={onConfirm} />);
    tap("Plus");
    tap("Plus");
    expect(shown()).toBe("5+");
    tap("Minus");
    expect(shown()).toBe("5-");
  });

  it("allows a new decimal point after an operator", () => {
    render(<Harness initial="1.5+" onConfirm={onConfirm} />);
    tap("2");
    tap("Decimal point");
    tap("5");
    expect(shown()).toBe("1.5+2.5");
  });

  it("deletes one character per tap", () => {
    render(<Harness initial="123" onConfirm={onConfirm} />);
    tap("Delete last digit");
    expect(shown()).toBe("12");
    tap("Delete last digit");
    tap("Delete last digit");
    tap("Delete last digit"); // no-op on empty
    expect(shown()).toBe("");
  });
});

describe("Numpad Done and = behaviour", () => {
  it("shows = while the expression has an operator; Done evaluates and stays open", () => {
    render(<Harness onConfirm={onConfirm} />);
    tap("1");
    tap("0");
    tap("0");
    tap("Plus");
    tap("5");
    tap("0");
    expect(key("Done").textContent).toBe("=");
    tap("Done");
    expect(shown()).toBe("150");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(key("Done").textContent).toBe("Done");
  });

  it("a second Done closes the keypad", () => {
    render(<Harness onConfirm={onConfirm} />);
    tap("1");
    tap("Minus");
    tap("2");
    tap("Done");
    expect(shown()).toBe("-1");
    expect(onConfirm).not.toHaveBeenCalled();
    tap("Done");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Done with a trailing operator evaluates to the left operand", () => {
    render(<Harness initial="100+" onConfirm={onConfirm} />);
    tap("Done");
    expect(shown()).toBe("100");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Done with no operator closes without changing the value", () => {
    render(<Harness initial="700" onConfirm={onConfirm} />);
    tap("Done");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(shown()).toBe("700");
  });

  it("keeps a malformed expression as typed (no silent truncation)", () => {
    const onChange = vi.fn();
    render(<Numpad value="7/0" onChange={onChange} onConfirm={onConfirm} />);
    tap("Done");
    expect(onChange).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("commits a pending expression when the keypad unmounts (closed by another route)", () => {
    const onChange = vi.fn();
    const { unmount } = render(<Numpad value="100+50" onChange={onChange} onConfirm={onConfirm} />);
    unmount();
    expect(onChange).toHaveBeenCalledWith("150");
  });
});

describe("Numpad long-press and Escape", () => {
  it("long-pressing the delete key clears the amount and does not also delete one digit", () => {
    vi.useFakeTimers();
    render(<Harness initial="1234" onConfirm={onConfirm} />);
    const del = key("Delete last digit");
    fireEvent.pointerDown(del);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(shown()).toBe("");
    fireEvent.pointerUp(del);
    fireEvent.click(del);
    expect(shown()).toBe("");
  });

  it("a short press still deletes one digit", () => {
    vi.useFakeTimers();
    render(<Harness initial="1234" onConfirm={onConfirm} />);
    const del = key("Delete last digit");
    fireEvent.pointerDown(del);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerUp(del);
    fireEvent.click(del);
    expect(shown()).toBe("123");
  });

  it("releasing before 500ms cancels the long press", () => {
    vi.useFakeTimers();
    render(<Harness initial="1234" onConfirm={onConfirm} />);
    const del = key("Delete last digit");
    fireEvent.pointerDown(del);
    fireEvent.pointerLeave(del);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shown()).toBe("1234");
  });

  it("Escape closes the keypad and commits a pending expression", () => {
    render(<Harness initial="100+50" onConfirm={onConfirm} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(shown()).toBe("150");
  });
});

describe("Numpad icon-only aria-labels", () => {
  it("names every icon-only or symbol key", () => {
    render(<Harness onConfirm={onConfirm} />);
    for (const name of ["Delete last digit", "Plus", "Minus", "Decimal point", "Three zeros", "Done"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });
});
