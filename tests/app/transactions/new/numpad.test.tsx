/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Numpad, NUMPAD_HEIGHT_PX } from "@/components/transactions/entry/numpad";
import { CURRENCY_CHIP_ROW_PX } from "@/components/transactions/entry/numpad-dock";

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
  it("renders a 4-column, 5-row keypad in the reference order inside an Amount keypad group", () => {
    render(<Harness onConfirm={onConfirm} />);
    const group = screen.getByRole("group", { name: "Amount keypad" });
    const buttons = Array.from(group.querySelectorAll("button"));
    const labels = buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(labels).toEqual([
      "Plus", "Minus", "Multiply", "Divide",
      "7", "8", "9", "Equals",
      "4", "5", "6", "Decimal point",
      "1", "2", "3", "Delete last digit",
      "Two zeros", "0", "Three zeros", "Done",
    ]);
    expect(buttons).toHaveLength(20);
  });

  it("uses the 4-column grid with the spec gap", () => {
    render(<Harness onConfirm={onConfirm} />);
    const group = screen.getByRole("group", { name: "Amount keypad" });
    expect(group.className).toContain("grid-cols-4");
    expect(group.className).toContain("gap-1.5");
  });

  it("keeps every key 44px high so five rows give the reserved height", () => {
    render(<Harness onConfirm={onConfirm} />);
    const group = screen.getByRole("group", { name: "Amount keypad" });
    for (const b of Array.from(group.querySelectorAll("button"))) {
      expect(b.className).toContain("h-11");
    }
    // 5 rows x 44 + 4 gaps x 6 + pt-1.5 (6) + pb-2 (8) + 1px border
    expect(NUMPAD_HEIGHT_PX).toBe(5 * 44 + 4 * 6 + 6 + 8 + 1);
    expect(NUMPAD_HEIGHT_PX).toBe(259);
  });

  it("the page reserves the keypad height and the chip-row height literally (Tailwind needs literals)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/transactions/entry/transaction-entry-screen.tsx"),
      "utf8",
    );
    expect(src).toContain(`pointer-coarse:pb-[${NUMPAD_HEIGHT_PX}px]`);
    expect(src).toContain(`pointer-coarse:pb-[${NUMPAD_HEIGHT_PX + CURRENCY_CHIP_ROW_PX}px]`);
    expect(src).not.toContain("pb-[209px]");
  });

  it("shows OK (not Done or =) on the confirm key, and = on the equals key", () => {
    render(<Harness initial="700" onConfirm={onConfirm} />);
    expect(key("Done").textContent).toBe("OK");
    expect(key("Equals").textContent).toBe("=");
    cleanup();
    render(<Harness initial="7+" onConfirm={onConfirm} />);
    expect(key("Done").textContent).toBe("OK");
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

  it("the two-zero key adds two zeros", () => {
    render(<Harness initial="1" onConfirm={onConfirm} />);
    tap("Two zeros");
    expect(shown()).toBe("100");
  });

  it("respects the max input length for multi-character keys", () => {
    render(<Harness initial={"1".repeat(31)} onConfirm={onConfirm} />);
    tap("Three zeros");
    expect(shown()).toBe("1".repeat(31));
    tap("Two zeros");
    expect(shown()).toBe("1".repeat(31));
  });

  it("ignores a leading plus, multiply and divide, and allows a leading minus", () => {
    render(<Harness onConfirm={onConfirm} />);
    tap("Plus");
    tap("Multiply");
    tap("Divide");
    expect(shown()).toBe("");
    tap("Minus");
    expect(shown()).toBe("-");
    tap("Multiply");
    expect(shown()).toBe("-");
  });

  it("replaces a trailing operator instead of stacking two", () => {
    render(<Harness initial="5" onConfirm={onConfirm} />);
    tap("Plus");
    tap("Plus");
    expect(shown()).toBe("5+");
    tap("Minus");
    expect(shown()).toBe("5-");
    tap("Multiply");
    expect(shown()).toBe("5*");
    tap("Divide");
    expect(shown()).toBe("5/");
  });

  it("stores multiply and divide as * and / in the field value", () => {
    render(<Harness initial="12" onConfirm={onConfirm} />);
    tap("Multiply");
    tap("3");
    expect(shown()).toBe("12*3");
    cleanup();
    render(<Harness initial="100" onConfirm={onConfirm} />);
    tap("Divide");
    tap("8");
    expect(shown()).toBe("100/8");
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

describe("Numpad arithmetic, = and OK", () => {
  it("12 x 3 = 36 with = , and the pad stays open", () => {
    render(<Harness onConfirm={onConfirm} />);
    tap("1");
    tap("2");
    tap("Multiply");
    tap("3");
    tap("Equals");
    expect(shown()).toBe("36");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("100 / 8 = 12.5", () => {
    render(<Harness initial="100" onConfirm={onConfirm} />);
    tap("Divide");
    tap("8");
    tap("Equals");
    expect(shown()).toBe("12.5");
  });

  it("2 + 3 x 4 = 14 (multiplication binds first)", () => {
    render(<Harness onConfirm={onConfirm} />);
    tap("2");
    tap("Plus");
    tap("3");
    tap("Multiply");
    tap("4");
    tap("Equals");
    expect(shown()).toBe("14");
  });

  it("division by zero leaves the expression as typed", () => {
    render(<Harness initial="7" onConfirm={onConfirm} />);
    tap("Divide");
    tap("0");
    tap("Equals");
    expect(shown()).toBe("7/0");
    tap("Done");
    expect(shown()).toBe("7/0");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("= with nothing pending is a no-op", () => {
    render(<Harness initial="700" onConfirm={onConfirm} />);
    tap("Equals");
    expect(shown()).toBe("700");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("= on a trailing operator evaluates the left operand and keeps the pad open", () => {
    render(<Harness initial="100+" onConfirm={onConfirm} />);
    tap("Equals");
    expect(shown()).toBe("100");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("OK evaluates a pending expression, then closes because nothing is left pending", () => {
    render(<Harness initial="12" onConfirm={onConfirm} />);
    tap("Multiply");
    tap("3");
    tap("Done");
    expect(shown()).toBe("36");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("OK with a malformed pending expression keeps the pad open and the text as typed", () => {
    const onChange = vi.fn();
    render(<Numpad value="7/0" onChange={onChange} onConfirm={onConfirm} />);
    tap("Done");
    expect(onChange).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("OK with nothing pending closes without changing the value", () => {
    render(<Harness initial="700" onConfirm={onConfirm} />);
    tap("Done");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(shown()).toBe("700");
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
    for (const name of [
      "Delete last digit", "Plus", "Minus", "Multiply", "Divide", "Equals",
      "Decimal point", "Two zeros", "Three zeros", "Done",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });
});
