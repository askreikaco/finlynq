/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setPref = vi.fn(async () => true);
let state = { pref: "auto", locale: "en-CA", setPref };
vi.mock("@/components/language-provider", () => ({ useLanguage: () => state }));
let cur = { displayCurrency: "USD", isLoading: false };
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => cur }));
import { LanguageCard, languageExample } from "@/components/settings/language-card";

afterEach(() => { cleanup(); state = { pref: "auto", locale: "en-CA", setPref }; cur = { displayCurrency: "USD", isLoading: false }; });

describe("LanguageCard", () => {
  it("lists auto + every language and shows an en example", async () => {
    render(<LanguageCard />);
    await userEvent.setup().click(screen.getByRole("combobox"));
    expect((await screen.findAllByRole("option")).map((e) => e.textContent)).toEqual([
      "Auto", "English", "Tiếng Việt", "日本語",
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
