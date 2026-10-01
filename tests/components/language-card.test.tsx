/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const setPref = vi.fn(async () => true);
let state = { pref: "auto", locale: "en-CA", setPref };
vi.mock("@/components/language-provider", () => ({ useLanguage: () => state }));
let cur = { displayCurrency: "USD", isLoading: false };
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => cur }));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <span data-testid="sel">{children}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-testid="opt" data-v={value}>{children}</div>,
}));
vi.mock("lucide-react", () => ({ Languages: () => null }));

import { LanguageCard, languageExample } from "@/components/settings/language-card";

afterEach(() => { cleanup(); state = { pref: "auto", locale: "en-CA", setPref }; cur = { displayCurrency: "USD", isLoading: false }; });

describe("LanguageCard", () => {
  it("lists auto + every language and shows an en example", () => {
    render(<LanguageCard />);
    expect(screen.getAllByTestId("opt").map((e) => e.textContent)).toEqual([
      "Auto (from display currency)", "English", "Tiếng Việt", "日本語",
    ]);
    expect(screen.getByTestId("language-example").textContent).toContain("1,234,567.89");
    expect(screen.getByTestId("language-example").textContent).toContain("01/10/2026");
  });
  it("auto + VND display currency previews vi", () => {
    cur = { displayCurrency: "VND", isLoading: false };
    render(<LanguageCard />);
    expect(screen.getByTestId("language-example").textContent).toContain("1.234.567,89");
  });
  it("examples per pref", () => {
    expect(languageExample("vi", "USD", null).number).toBe("1.234.567,89");
    expect(languageExample("ja", "VND", null).date).toContain("2026/10/01");
    expect(languageExample("en", "VND", null).number).toBe("1,234,567.89");
    expect(languageExample("auto", null, "vi-VN").number).toBe("1.234.567,89");
  });
});
