// @vitest-environment jsdom
/**
 * The Subscriptions form's "How often" select offers every schedule frequency,
 * including the Daily / Weekdays / Weekend cadences (Repeat phase 2b).
 */
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => (items: unknown[]) => items }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));

import { SubscriptionForm, type SubscriptionDraft } from "@/app/(app)/subscriptions/_components/subscription-form";
import { FREQUENCY_LABELS, SUBSCRIPTION_FREQUENCIES } from "@/lib/subscriptions/schedule";

afterEach(cleanup);

const initial: SubscriptionDraft = {
  name: "", amount: "", currency: "USD", frequency: "monthly", categoryId: "", accountId: "", nextDate: "",
  cancelReminderDate: "", notes: "",
} as SubscriptionDraft;

describe("SubscriptionForm frequency select", () => {
  it("lists every SUBSCRIPTION_FREQUENCIES entry with its label, Daily/Weekdays/Weekend first", () => {
    render(
      <SubscriptionForm mode="create" initial={initial} categories={[]} accounts={[]} onCancel={() => {}} onSaved={() => {}} />,
    );
    fireEvent.click(screen.getByText("Monthly"));
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(SUBSCRIPTION_FREQUENCIES.map((f) => FREQUENCY_LABELS[f]));
    expect(labels.slice(0, 3)).toEqual(["Every day", "Weekdays", "Weekend"]);
  });
});
