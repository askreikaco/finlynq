/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { navGroups } from "@/components/nav";

describe("Navigation", () => {
  it("Loans item has prod mode enabled", () => {
    const wealthGroup = navGroups.find((g) => g.label === "Wealth");
    const loansItem = wealthGroup?.items.find((i) => i.label === "Loans & Debt");
    expect(loansItem).toBeTruthy();
    expect(loansItem?.mode).toBe("prod");
  });

  it("Subscriptions item has prod mode enabled", () => {
    const trackingGroup = navGroups.find((g) => g.label === "Tracking");
    const subscriptionsItem = trackingGroup?.items.find(
      (i) => i.label === "Subscriptions"
    );
    expect(subscriptionsItem).toBeTruthy();
    expect(subscriptionsItem?.mode).toBe("prod");
  });

  it("Calendar item has prod mode enabled", () => {
    const trackingGroup = navGroups.find((g) => g.label === "Tracking");
    const calendarItem = trackingGroup?.items.find((i) => i.label === "Calendar");
    expect(calendarItem).toBeTruthy();
    expect(calendarItem?.mode).toBe("prod");
  });

  it("Chat item remains in dev mode", () => {
    // Chat is not in the main nav groups, it may be elsewhere
    // This test ensures we're not accidentally un-gating Chat
    const chatItem = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.label === "AI Chat");
    if (chatItem) {
      expect(chatItem.mode).toBe("dev");
    }
  });

  it("Tax item remains in dev mode", () => {
    const analysisGroup = navGroups.find((g) => g.label === "Analysis");
    const taxItem = analysisGroup?.items.find((i) => i.label === "Tax");
    expect(taxItem?.mode).toBe("dev");
  });

  it("Scenarios item remains in dev mode if present", () => {
    // Scenarios may be in a different section; check if it exists and is gated
    const allItems = navGroups.flatMap((g) => g.items);
    const scenariosItem = allItems.find((i) => i.label === "Scenarios");
    // Only check if it exists
    if (scenariosItem) {
      expect(scenariosItem.mode).toBe("dev");
    }
  });
});
