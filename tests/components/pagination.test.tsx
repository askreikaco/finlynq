/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Pagination } from "@/components/ui/pagination";

describe("Pagination", () => {
  it("renders pagination with page summary", () => {
    const { getByText } = render(
      <Pagination page={0} limit={10} total={100} onPageChange={() => {}} />
    );
    expect(getByText(/Showing 1–10 of 100/)).toBeTruthy();
  });

  it("renders prev/next buttons always visible", () => {
    const { getByLabelText } = render(
      <Pagination page={0} limit={10} total={100} onPageChange={() => {}} />
    );
    expect(getByLabelText("Previous page")).toBeTruthy();
    expect(getByLabelText("Next page")).toBeTruthy();
  });

  it("page number buttons have hidden sm:inline-flex classes for responsive behavior", () => {
    const { getByLabelText } = render(
      <Pagination page={0} limit={10} total={50} onPageChange={() => {}} />
    );
    // Page 1 button should have the responsive hiding classes
    const pageButton = getByLabelText("Page 1");
    expect(pageButton.className).toContain("hidden");
    expect(pageButton.className).toContain("sm:inline-flex");
  });

  it("disables prev button on first page", () => {
    const { getByLabelText } = render(
      <Pagination page={0} limit={10} total={100} onPageChange={() => {}} />
    );
    const prevButton = getByLabelText("Previous page") as HTMLButtonElement;
    expect(prevButton.disabled).toBe(true);
  });

  it("disables next button on last page", () => {
    const { getByLabelText } = render(
      <Pagination page={9} limit={10} total={100} onPageChange={() => {}} />
    );
    const nextButton = getByLabelText("Next page") as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);
  });

  it("shows label suffix when provided", () => {
    const { getByText } = render(
      <Pagination
        page={0}
        limit={10}
        total={100}
        onPageChange={() => {}}
        label="transactions"
      />
    );
    expect(getByText(/Showing 1–10 of 100 transactions/)).toBeTruthy();
  });
});
