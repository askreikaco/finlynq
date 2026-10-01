/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { navGroups, adminLinks } from "@/components/nav";

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

describe("Admin Links (Collapsible)", () => {
  it("adminLinks array exists and contains admin-related items", () => {
    expect(adminLinks).toBeTruthy();
    expect(Array.isArray(adminLinks)).toBe(true);
    expect(adminLinks.length).toBeGreaterThan(0);
  });

  it("Admin link is the first item in adminLinks", () => {
    const adminItem = adminLinks.find((i) => i.label === "Admin");
    expect(adminItem).toBeTruthy();
    expect(adminLinks[0].href).toBe("/admin");
  });

  it("Admin Inbox item exists and has prod mode", () => {
    const inboxItem = adminLinks.find((i) => i.label === "Admin Inbox");
    expect(inboxItem).toBeTruthy();
    expect(inboxItem?.href).toBe("/admin/inbox");
    expect(inboxItem?.mode).toBe("prod");
  });

  it("Email Oversight item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "Email Oversight");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/email-inbox");
    expect(item?.mode).toBe("prod");
  });

  it("Rate Cache item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "Rate Cache");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/price-cache");
    expect(item?.mode).toBe("prod");
  });

  it("API Log item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "API Log");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/api-log");
    expect(item?.mode).toBe("prod");
  });

  it("Server Health item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "Server Health");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/system");
    expect(item?.mode).toBe("prod");
  });

  it("Diagnostics item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "Diagnostics");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/diagnostics");
    expect(item?.mode).toBe("prod");
  });

  it("Announcements item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "Announcements");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/announcements");
    expect(item?.mode).toBe("prod");
  });

  it("Feedback item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "Feedback");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/feedback");
    expect(item?.mode).toBe("prod");
  });

  it("All admin links have prod mode enabled", () => {
    adminLinks.forEach((item) => {
      expect(item.mode).toBe("prod");
    });
  });

  it("No admin link hrefs start with /feedback (non-admin)", () => {
    adminLinks.forEach((item) => {
      expect(item.href.startsWith("/feedback")).toBe(false);
    });
  });
});

describe("What's New Visibility", () => {
  it("What's New item exists in navGroups", () => {
    const firstGroup = navGroups[0];
    const whatsNewItem = firstGroup?.items.find((i) => i.label === "What's New");
    expect(whatsNewItem).toBeTruthy();
    expect(whatsNewItem?.href).toBe("/whats-new");
    expect(whatsNewItem?.mode).toBe("prod");
  });

  it("What's New item is in the first (top) nav group", () => {
    const firstGroup = navGroups[0];
    expect(firstGroup?.label).toBe(""); // empty label for top group
    const whatsNewItem = firstGroup?.items.find((i) => i.label === "What's New");
    expect(whatsNewItem).toBeTruthy();
  });
});
