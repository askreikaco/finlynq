/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";

let locale = "en-CA";
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({ locale }) }));
vi.mock("@/components/ui/input", () => ({ Input: (p: any) => <input {...p} /> }));

import { AmountInput } from "@/components/amount-input";
import { setActiveDisplayLocale } from "@/lib/locale";
import { formatLocaleQty } from "./_qty";

function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (<><AmountInput data-testid="in" step="0.01" value={v} onValueChange={setV} /><span data-testid="out">{v}</span></>);
}
afterEach(() => { cleanup(); locale = "en-CA"; setActiveDisplayLocale("en-CA"); });

describe("AmountInput", () => {
  it("en: native number input, canonical passthrough", () => {
    render(<Harness />);
    const el = screen.getByTestId("in") as HTMLInputElement;
    expect(el.type).toBe("number");
    fireEvent.change(el, { target: { value: "1234.5" } });
    expect(screen.getByTestId("out").textContent).toBe("1234.5");
  });
  it("vi: text input, '1.234.567' and '1,5' emit canonical strings", () => {
    locale = "vi-VN";
    render(<Harness />);
    const el = screen.getByTestId("in") as HTMLInputElement;
    expect(el.type).toBe("text");
    fireEvent.change(el, { target: { value: "1.234.567" } });
    expect(screen.getByTestId("out").textContent).toBe("1234567");
    fireEvent.change(el, { target: { value: "1,5" } });
    expect(screen.getByTestId("out").textContent).toBe("1.5");
    expect(el.value).toBe("1,5");
  });
  it("vi: canonical initial value displays with decimal comma; numeric value accepted", () => {
    locale = "vi-VN";
    render(<AmountInput data-testid="in" value={12.5} onValueChange={() => {}} />);
    expect((screen.getByTestId("in") as HTMLInputElement).value).toBe("12,5");
  });
});

describe("quantity formatting", () => {
  it("en unchanged, vi comma", () => {
    expect(formatLocaleQty(1234.5)).toBe((1234.5).toLocaleString("en-US", { maximumFractionDigits: 4 }));
    expect(formatLocaleQty(1234567)).toBe("1,234,567");
    setActiveDisplayLocale("vi-VN");
    expect(formatLocaleQty(1234.5)).toBe("1.234,5");
  });
});
