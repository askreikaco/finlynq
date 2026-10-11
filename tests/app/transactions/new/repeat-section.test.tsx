/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => React.createElement("a", { href, ...rest }, children),
}));

import { RepeatSection, SeriesBadge, REPEAT_SPLIT_DISABLED_TITLE } from "@/components/transactions/entry/repeat-section";
import type { Series } from "@/lib/transactions/series";

afterEach(cleanup);

/** Mounts the section and returns a getter for the latest reported { series, invalid }. */
function mount(over: Partial<React.ComponentProps<typeof RepeatSection>> = {}) {
  const onChange = vi.fn();
  render(<RepeatSection startDate="2027-01-10" amount={500} currency="USD" onChange={onChange} {...over} />);
  const last = () => {
    const c = onChange.mock.calls[onChange.mock.calls.length - 1];
    return { series: c[0] as Series | null, invalid: c[1] as boolean };
  };
  return { onChange, last };
}
const toggle = () => screen.getByRole("switch", { name: "Repeat" });
const turnOn = () => fireEvent.click(toggle());

describe("RepeatSection: toggle", () => {
  it("is off and collapsed by default: no series, no options", () => {
    const { last } = mount();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("txnew-repeat").getAttribute("data-state")).toBe("closed");
    expect(screen.queryByRole("radiogroup", { name: "Series type" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Monthly" })).toBeNull();
    expect(last()).toEqual({ series: null, invalid: false });
  });

  it("turning on expands and defaults to Monthly (forever), with a summary", () => {
    const { last } = mount();
    turnOn();
    expect(screen.getByTestId("txnew-repeat").getAttribute("data-state")).toBe("open");
    expect(screen.getByRole("button", { name: "Monthly" }).getAttribute("aria-current")).toBe("true");
    expect(last().series).toEqual({ kind: "repeat", frequency: "monthly", end: { type: "forever" } });
    expect(screen.getByTestId("txnew-repeat-summary").textContent).toBe("Monthly");
  });

  it("turning off collapses and clears the series", () => {
    const { last } = mount();
    turnOn();
    turnOn();
    expect(screen.queryByRole("button", { name: "Monthly" })).toBeNull();
    expect(last()).toEqual({ series: null, invalid: false });
  });

  it("is disabled with the explanation as its title while splits are on", () => {
    mount({ disabled: true, disabledTitle: REPEAT_SPLIT_DISABLED_TITLE });
    expect(toggle().getAttribute("aria-disabled") ?? (toggle() as HTMLButtonElement).disabled?.toString()).toBeTruthy();
    expect(toggle().getAttribute("title")).toMatch(/splits/);
  });
});

describe("RepeatSection: segmented control", () => {
  it("opens on Repeat with ONE flat list (no No-repeat row), and switches to Installment", () => {
    mount();
    turnOn();
    expect(screen.getByRole("radio", { name: "Repeat" }).getAttribute("aria-checked")).toBe("true");
    for (const l of ["Daily", "Weekly", "Monthly", "Quarterly", "Annually", "Custom"]) {
      expect(screen.getByRole("button", { name: l })).toBeTruthy();
    }
    for (const l of ["No repeat", "Weekdays", "Weekend", "Every 4 weeks", "Every 2 months", "Last day of month", "Every 2 weeks", "Every 6 months"]) {
      expect(screen.queryByRole("button", { name: l })).toBeNull();
    }
    fireEvent.click(screen.getByRole("radio", { name: "Installment" }));
    expect(screen.getByRole("radio", { name: "Installment" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button", { name: "Weekly" })).toBeNull();
    expect(screen.getByRole("button", { name: "Decrease months" })).toBeTruthy();
  });

  it("arrow keys move the segmented selection", () => {
    mount();
    turnOn();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Repeat" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Installment" }).getAttribute("aria-checked")).toBe("true");
  });

  it("lists Daily .. Custom in order", () => {
    mount();
    turnOn();
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const order = ["Daily", "Weekly", "Monthly", "Quarterly", "Annually", "Custom"].map((l) => names.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
});

describe("RepeatSection: Custom (every N days)", () => {
  const pickCustom = () => fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  const input = () => screen.getByTestId("repeat-interval-days") as HTMLInputElement;

  it("is hidden until Custom is chosen, then defaults to 2 with a numeric keypad", () => {
    mount();
    turnOn();
    expect(screen.queryByTestId("repeat-interval-days")).toBeNull();
    pickCustom();
    expect(input().value).toBe("2");
    expect(input().getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByLabelText("Every")).toBe(input());
    expect(screen.getByText("days")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.queryByTestId("repeat-interval-days")).toBeNull();
  });

  it("reports { every_n_days, intervalDays }", () => {
    const { last } = mount();
    turnOn();
    pickCustom();
    expect(screen.getByRole("radiogroup", { name: "Repeat end" })).toBeTruthy();
    fireEvent.change(input(), { target: { value: "10" } });
    expect(last().series).toEqual({ kind: "repeat", frequency: "every_n_days", intervalDays: 10, end: { type: "forever" } });
    expect(screen.getByTestId("txnew-repeat-summary").textContent).toBe("Every 10 days");
  });

  it("strips non-digits and reports invalid (null series) on empty, 0 and > 365", () => {
    const { last } = mount();
    turnOn();
    pickCustom();
    fireEvent.change(input(), { target: { value: "1a2" } });
    expect(input().value).toBe("12");
    expect(last().invalid).toBe(false);
    for (const bad of ["", "0", "366"]) {
      fireEvent.change(input(), { target: { value: bad } });
      expect(last()).toEqual({ series: null, invalid: true });
      expect(screen.getByText("Enter a whole number from 1 to 365")).toBeTruthy();
    }
    fireEvent.change(input(), { target: { value: "365" } });
    expect(last().invalid).toBe(false);
    expect(last().series).toEqual(expect.objectContaining({ frequency: "every_n_days", intervalDays: 365 }));
  });
});

describe("RepeatSection: each row maps to its API frequency", () => {
  const CASES: Array<[string, string]> = [
    ["Daily", "daily"],
    ["Weekly", "weekly"],
    ["Monthly", "monthly"],
    ["Quarterly", "quarterly"],
    ["Annually", "annual"],
  ];
  it.each(CASES)("%s -> %s (forever)", (label, frequency) => {
    const { last } = mount();
    turnOn();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-current")).toBe("true");
    expect(last().series).toEqual({ kind: "repeat", frequency, end: { type: "forever" } });
  });

  it("End options are Never / After N times / On date, Never selected", () => {
    mount();
    turnOn();
    const end = screen.getByRole("radiogroup", { name: "Repeat end" });
    expect(Array.from(end.querySelectorAll('[role="radio"]')).map((e) => e.textContent)).toEqual(["Never", "After N times", "On date"]);
    expect(screen.getByRole("radio", { name: "Never" }).getAttribute("aria-checked")).toBe("true");
  });

  it("On date reports the picked date (default one year out)", () => {
    const { last } = mount();
    turnOn();
    fireEvent.click(screen.getByRole("radio", { name: "On date" }));
    const input = screen.getByLabelText("End date") as HTMLInputElement;
    expect(input.value).toBe("2028-01-10");
    fireEvent.change(input, { target: { value: "2027-12-31" } });
    expect(last().series).toEqual({ kind: "repeat", frequency: "monthly", end: { type: "until", date: "2027-12-31" } });
    expect(screen.getByTestId("txnew-repeat-summary").textContent).toBe("Monthly until 31 Dec 2027");
  });

  it("On date on or before the first payment is invalid and explains", () => {
    const { last } = mount();
    turnOn();
    fireEvent.click(screen.getByRole("radio", { name: "On date" }));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2027-01-10" } });
    expect(last()).toEqual({ series: null, invalid: true });
    expect(screen.getByText("Pick a date after the first payment")).toBeTruthy();
  });

  it("After N times: stepper 2..120, reports the count", () => {
    const { last } = mount();
    turnOn();
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
    expect(last().series).toEqual({ kind: "repeat", frequency: "weekly", end: { type: "count", count: 119 } });
    expect(screen.getByTestId("txnew-repeat-summary").textContent).toBe("Weekly · 119×");
  });
});

describe("RepeatSection: Installment mode", () => {
  const open = (over: Partial<React.ComponentProps<typeof RepeatSection>> = {}) => {
    const r = mount(over);
    turnOn();
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

  it("reports count and mode; the toggle off clears it", () => {
    const { last } = open();
    expect(last().series).toEqual({ kind: "installment", count: 6, mode: "split" });
    fireEvent.click(screen.getByRole("button", { name: "Increase months" }));
    fireEvent.click(screen.getByRole("radio", { name: "Each payment = amount" }));
    expect(last().series).toEqual({ kind: "installment", count: 7, mode: "each" });
    turnOn();
    expect(last().series).toBeNull();
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
