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

  it("Calendar is a view of Subscriptions (upstream merge), Categories is in prod", () => {
    const items = navGroups.flatMap((g) => g.items);
    expect(items.find((i) => i.href === "/calendar")).toBeUndefined();
    expect(items.find((i) => i.href === "/subscriptions")?.mode).toBe("prod");
    expect(items.find((i) => i.href === "/categories")?.mode).toBe("prod");
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

  it("Environment item exists with activePrefixes", () => {
    const item = adminLinks.find((i) => i.label === "Environment");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/env");
    expect(item?.mode).toBe("prod");
    expect(item?.activePrefixes).toContain("/admin/system");
    expect(item?.activePrefixes).toContain("/admin/diagnostics");
    expect(item?.activePrefixes).toContain("/admin/api-log");
    expect(item?.activePrefixes).toContain("/admin/price-cache");
    expect(item?.activePrefixes).toContain("/admin/integrations");
  });

  it("Announcements item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "Announcements");
    expect(item).toBeTruthy();
    expect(item?.href).toBe("/admin/announcements");
    expect(item?.mode).toBe("prod");
  });

  it("User feedback item exists and has prod mode", () => {
    const item = adminLinks.find((i) => i.label === "User feedback");
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
  it("What's new item exists in navGroups", () => {
    const firstGroup = navGroups[0];
    const whatsNewItem = firstGroup?.items.find((i) => i.label === "What's new");
    expect(whatsNewItem).toBeTruthy();
    expect(whatsNewItem?.href).toBe("/whats-new");
    expect(whatsNewItem?.mode).toBe("prod");
  });

  it("What's new item is in the first (top) nav group", () => {
    const firstGroup = navGroups[0];
    expect(firstGroup?.label).toBe(""); // empty label for top group
    const whatsNewItem = firstGroup?.items.find((i) => i.label === "What's new");
    expect(whatsNewItem).toBeTruthy();
  });

  it("should have correct nav groups in expected order", () => {
    const groupLabels = navGroups.map((g) => g.label);
    expect(groupLabels).toEqual(["", "Tracking", "Wealth", "Analysis", "Planning"]);
  });

  it("should have correct items in Top group with correct hrefs in order", () => {
    const topGroup = navGroups.find((g) => g.label === "");
    const hrefs = topGroup?.items.map((i) => i.href) ?? [];
    expect(hrefs).toEqual(["/dashboard", "/whats-new", "/chat"]);
  });

  it("should have correct items in Tracking group with correct hrefs in order", () => {
    const trackingGroup = navGroups.find((g) => g.label === "Tracking");
    const hrefs = trackingGroup?.items.map((i) => i.href) ?? [];
    expect(hrefs).toEqual(["/transactions", "/budgets", "/goals", "/subscriptions"]);
  });

  it("should have correct items in Wealth group with correct hrefs in order", () => {
    const wealthGroup = navGroups.find((g) => g.label === "Wealth");
    const hrefs = wealthGroup?.items.map((i) => i.href) ?? [];
    expect(hrefs).toEqual(["/accounts", "/portfolio", "/loans", "/family"]);
  });

  it("should have correct items in Analysis group with correct hrefs in order", () => {
    const analysisGroup = navGroups.find((g) => g.label === "Analysis");
    const hrefs = analysisGroup?.items.map((i) => i.href) ?? [];
    expect(hrefs).toEqual(["/reports", "/categories", "/tax"]);
  });

  it("should have correct items in Planning group with correct hrefs in order", () => {
    const planningGroup = navGroups.find((g) => g.label === "Planning");
    const hrefs = planningGroup?.items.map((i) => i.href) ?? [];
    expect(hrefs).toEqual(["/scenarios", "/fire"]);
  });
});
