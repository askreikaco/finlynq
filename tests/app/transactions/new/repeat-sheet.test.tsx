/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => React.createElement("a", { href, ...rest }, children),
}));

import { RepeatPill, RepeatSheet, SeriesBadge, REPEAT_SPLIT_DISABLED_TITLE } from "@/components/transactions/entry/repeat-sheet";
import type { Series } from "@/lib/transactions/series";

beforeEach(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(cleanup);

function mount(over: Partial<React.ComponentProps<typeof RepeatSheet>> = {}) {
  const onApply = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <RepeatSheet
      open
      onOpenChange={onOpenChange}
      value={null}
      onApply={onApply}
      startDate="2027-01-10"
      amount={500}
      currency="USD"
      {...over}
    />,
  );
  return { onApply, onOpenChange };
}
const done = () => fireEvent.click(screen.getByRole("button", { name: "Done" }));

describe("RepeatSheet: segmented control", () => {
  it("opens on Repeat with the grouped list, and switches to Installment", () => {
    mount();
    expect(screen.getByRole("radio", { name: "Repeat" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Never" })).toBeTruthy();
    for (const l of ["Weekly", "Every 2 weeks", "Every 4 weeks", "Monthly", "Last day of month", "Every 2 months", "Every 3 months", "Every 6 months", "Annually"]) {
      expect(screen.getByRole("button", { name: l })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    expect(screen.getByRole("radio", { name: "Installment" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button", { name: "Weekly" })).toBeNull();
    expect(screen.getByRole("button", { name: "Decrease months" })).toBeTruthy();
  });

  it("opens on Installment when the current choice is an installment plan", () => {
    mount({ value: { kind: "installment", count: 9, mode: "each" } });
    expect(screen.getByRole("radio", { name: "Installment" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("installment-count-value").textContent).toBe("9");
    expect(screen.getByRole("radio", { name: "Each payment = amount" }).getAttribute("aria-checked")).toBe("true");
  });

  it("arrow keys move the segmented selection", () => {
    mount();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Repeat" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Installment" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("RepeatSheet: Repeat panel maps each row to its API frequency", () => {
  const CASES: Array<[string, string]> = [
    ["Weekly", "weekly"],
    ["Every 2 weeks", "biweekly"],
    ["Every 4 weeks", "every4weeks"],
    ["Monthly", "monthly"],
    ["Last day of month", "monthly_eom"],
    ["Every 2 months", "bimonthly"],
    ["Every 3 months", "quarterly"],
    ["Every 6 months", "semiannual"],
    ["Annually", "annual"],
  ];
  it.each(CASES)("%s -> %s (forever)", (label, frequency) => {
    const { onApply, onOpenChange } = mount();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-current")).toBe("true");
    done();
    expect(onApply).toHaveBeenCalledWith({ kind: "repeat", frequency, end: { type: "forever" } });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Until date applies the picked date (default one year out)", () => {
    const { onApply } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    fireEvent.click(screen.getByRole("radio", { name: "Until date" }));
    const input = screen.getByLabelText("End date") as HTMLInputElement;
    expect(input.value).toBe("2028-01-10");
    fireEvent.change(input, { target: { value: "2027-12-31" } });
    done();
    expect(onApply).toHaveBeenCalledWith({ kind: "repeat", frequency: "monthly", end: { type: "until", date: "2027-12-31" } });
  });

  it("Until date on or before the first payment blocks Done and explains", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    fireEvent.click(screen.getByRole("radio", { name: "Until date" }));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2027-01-10" } });
    expect((screen.getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Pick a date after the first payment")).toBeTruthy();
  });

  it("After N times: stepper 2..120, applies the count", () => {
    const { onApply } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Weekly" }));
    fireEvent.click(screen.getByRole("radio", { name: "After N times" }));
    const value = () => Number(screen.getByTestId("repeat-count-value").textContent);
    expect(value()).toBe(12);
    const dec = screen.getByRole("button", { name: "Decrease times" }) as HTMLButtonElement;
    const inc = screen.getByRole("button", { name: "Increase times" }) as HTMLButtonElement;
    for (let i = 0; i < 20; i++) fireEvent.click(dec);
    expect(value()).toBe(2);
    expect(dec.disabled).toBe(true);
    for (let i = 0; i < 200; i++) fireEvent.click(inc);
    expect(value()).toBe(120);
    expect(inc.disabled).toBe(true);
    fireEvent.click(dec);
    done();
    expect(onApply).toHaveBeenCalledWith({ kind: "repeat", frequency: "weekly", end: { type: "count", count: 119 } });
  });

  it("the End section appears only once a frequency is picked", () => {
    mount();
    expect(screen.queryByRole("radiogroup", { name: "Repeat end" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Annually" }));
    expect(screen.getByRole("radiogroup", { name: "Repeat end" })).toBeTruthy();
  });

  it("Done with nothing chosen applies Never (null)", () => {
    const { onApply } = mount();
    done();
    expect(onApply).toHaveBeenCalledWith(null);
  });
});

describe("RepeatSheet: Never clears", () => {
  const current: Series = { kind: "repeat", frequency: "monthly", end: { type: "forever" } };
  it("the Never row clears and closes at once", () => {
    const { onApply, onOpenChange } = mount({ value: current });
    expect(screen.getByRole("button", { name: "Monthly" }).getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Never" }));
    expect(onApply).toHaveBeenCalledWith(null);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("the Installment panel has its own Never", () => {
    const { onApply } = mount({ value: { kind: "installment", count: 6, mode: "split" } });
    fireEvent.click(screen.getByRole("button", { name: "Never" }));
    expect(onApply).toHaveBeenCalledWith(null);
  });
  it("re-opens seeded from the current repeat (count end)", () => {
    mount({ value: { kind: "repeat", frequency: "biweekly", end: { type: "count", count: 7 } } });
    expect(screen.getByRole("radio", { name: "After N times" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("repeat-count-value").textContent).toBe("7");
  });
});

describe("RepeatSheet: Installment panel", () => {
  const open = (over: Partial<React.ComponentProps<typeof RepeatSheet>> = {}) => {
    const r = mount(over);
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    return r;
  };
  it("months stepper is bounded 2..60 and starts at 6", () => {
    open();
    const value = () => Number(screen.getByTestId("installment-count-value").textContent);
    const dec = screen.getByRole("button", { name: "Decrease months" }) as HTMLButtonElement;
    const inc = screen.getByRole("button", { name: "Increase months" }) as HTMLButtonElement;
    expect(value()).toBe(6);
    for (let i = 0; i < 10; i++) fireEvent.click(dec);
    expect(value()).toBe(2);
    expect(dec.disabled).toBe(true);
    for (let i = 0; i < 100; i++) fireEvent.click(inc);
    expect(value()).toBe(60);
    expect(inc.disabled).toBe(true);
  });

  it("live preview: split with a remainder shows the last payment apart", () => {
    open();
    expect(screen.getByTestId("installment-preview").textContent).toBe("5 × $83.33, last $83.35, 10 Jan – 10 Jun 2027");
  });

  it("live preview follows the stepper and the mode", () => {
    open({ amount: 600 });
    expect(screen.getByTestId("installment-preview").textContent).toBe("6 × $100.00, 10 Jan – 10 Jun 2027");
    fireEvent.click(screen.getByRole("button", { name: "Increase months" }));
    expect(screen.getByTestId("installment-preview").textContent).toBe("6 × $85.71, last $85.74, 10 Jan – 10 Jul 2027");
    fireEvent.click(screen.getByRole("radio", { name: "Each payment = amount" }));
    expect(screen.getByTestId("installment-preview").textContent).toBe("7 × $600.00, 10 Jan – 10 Jul 2027");
  });

  it("asks for an amount when it is empty", () => {
    open({ amount: 0 });
    expect(screen.getByTestId("installment-preview").textContent).toMatch(/Enter an amount/);
  });

  it("Done applies count and mode", () => {
    const { onApply } = open();
    fireEvent.click(screen.getByRole("button", { name: "Increase months" }));
    fireEvent.click(screen.getByRole("radio", { name: "Each payment = amount" }));
    done();
    expect(onApply).toHaveBeenCalledWith({ kind: "installment", count: 7, mode: "each" });
  });
});

describe("RepeatSheet: a11y names", () => {
  it("names the dialog, the groups and the close button", () => {
    mount();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Repeat" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Series type" })).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" })).toBeTruthy();
  });
});

describe("RepeatPill", () => {
  it("is labelled Repeat when empty and carries the summary once set", () => {
    const onClick = vi.fn();
    const { rerender } = render(<RepeatPill series={null} onClick={onClick} />);
    const pill = screen.getByRole("button", { name: "Repeat" });
    expect(pill.textContent).toBe("Repeat");
    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<RepeatPill series={{ kind: "repeat", frequency: "monthly", end: { type: "forever" } }} onClick={onClick} />);
    expect(screen.getByRole("button", { name: "Repeat: Monthly" }).textContent).toBe("Monthly");
    rerender(<RepeatPill series={{ kind: "installment", count: 6, mode: "split" }} onClick={onClick} />);
    expect(screen.getByRole("button", { name: "Repeat: 6 installments" })).toBeTruthy();
  });
  it("is disabled with the explanation as its title", () => {
    const onClick = vi.fn();
    render(<RepeatPill series={null} disabled disabledTitle={REPEAT_SPLIT_DISABLED_TITLE} onClick={onClick} />);
    const pill = screen.getByRole("button", { name: "Repeat" }) as HTMLButtonElement;
    expect(pill.disabled).toBe(true);
    expect(pill.title).toMatch(/splits/);
    fireEvent.click(pill);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("is a 44px target", () => {
    render(<RepeatPill series={null} onClick={() => {}} />);
    expect(screen.getByTestId("txnew-repeat-pill").className).toContain("min-h-11");
  });
});

describe("SeriesBadge (edit mode, read-only)", () => {
  it("shows Installment n/total as plain text", () => {
    render(<SeriesBadge hasInstallment hasSubscription={false} installmentSeq={2} installmentCount={6} />);
    const b = screen.getByTestId("txnew-series-badge");
    expect(b.textContent).toBe("Installment 2/6");
    expect(b.tagName).toBe("SPAN");
  });
  it("falls back to n without the total", () => {
    render(<SeriesBadge hasInstallment hasSubscription={false} installmentSeq={3} />);
    expect(screen.getByTestId("txnew-series-badge").textContent).toBe("Installment 3");
  });
  it("Repeating links to /subscriptions", () => {
    render(<SeriesBadge hasInstallment={false} hasSubscription />);
    const link = screen.getByRole("link", { name: "Repeating: open subscriptions" });
    expect(link.getAttribute("href")).toBe("/subscriptions");
    expect(link.textContent).toBe("Repeating");
  });
});
