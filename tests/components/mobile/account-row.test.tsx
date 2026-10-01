/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AccountRow } from "@/components/mobile/account-row";

afterEach(cleanup);

describe("AccountRow", () => {
  it("renders account name and balance", () => {
    render(
      <AccountRow
        accountId={1}
        accountName="Checking Account"
        currency="VND"
        balance={1000000}
        displayCurrency="VND"
        type="asset"
      />
    );

    screen.getByText("Checking Account");
    screen.getByText(/1,000,000/);
  });

  it("hides currency for VND accounts", () => {
    render(
      <AccountRow
        accountId={1}
        accountName="VND Account"
        currency="VND"
        balance={1000000}
        displayCurrency="VND"
        type="asset"
      />
    );

    expect(screen.queryByText("VND")).toBeNull();
  });

  it("shows currency for non-VND accounts", () => {
    render(
      <AccountRow
        accountId={1}
        accountName="USD Account"
        currency="USD"
        balance={1000}
        displayCurrency="VND"
        type="asset"
      />
    );

    screen.getByText("USD");
  });

  it("shows archived badge when archived", () => {
    render(
      <AccountRow
        accountId={1}
        accountName="Old Account"
        currency="VND"
        balance={0}
        displayCurrency="VND"
        type="asset"
        archived={true}
      />
    );

    screen.getByText("Archived");
  });

  it("shows converted balance when currencies differ", () => {
    render(
      <AccountRow
        accountId={1}
        accountName="USD Account"
        currency="USD"
        balance={1000}
        convertedBalance={25000000}
        displayCurrency="VND"
        type="asset"
      />
    );

    // Should show both balances
    screen.getByText(/1,000/);
    // The converted balance might be formatted as "VND 25000000" or similar
    const elements = screen.getAllByText(/25.{0,5}000{0,5}000/);
    expect(elements.length).toBeGreaterThan(0);
  });

  it("has proper link to account detail", () => {
    const { container } = render(
      <AccountRow
        accountId={123}
        accountName="Test Account"
        currency="VND"
        balance={1000000}
        displayCurrency="VND"
        type="asset"
      />
    );

    const link = container.querySelector('a[href="/accounts/123"]');
    expect(link).toBeTruthy();
  });
});
