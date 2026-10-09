/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ path: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

import { PageFab, PageFabProvider } from "@/components/mobile/page-fab";
import { BulkLinkActionBar } from "@/components/reconcile/bulk-link-action-bar";
import { LensToast } from "@/components/inbox/lens-toast";
import { AnnouncementBanner } from "@/components/announcement-banner";

const fab = () => screen.queryByTestId("page-fab");

function renderWithFab(overlay: React.ReactNode) {
  return render(
    <PageFabProvider>
      {overlay}
      <PageFab />
    </PageFabProvider>,
  );
}

beforeEach(() => {
  nav.path = "/dashboard";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("PageFab hides while bottom overlays are shown", () => {
  it("baseline: the FAB is visible at /dashboard with no overlay", () => {
    renderWithFab(null);
    expect(fab()).not.toBeNull();
  });

  it("BulkLinkActionBar: hidden while rows are selected, visible when none are", () => {
    const common = {
      txSum: 0,
      bankSum: 0,
      currency: "USD",
      busy: false,
      onReconcile: () => {},
      onClear: () => {},
    };
    const { unmount } = renderWithFab(
      <BulkLinkActionBar txCount={1} bankCount={0} {...common} />,
    );
    expect(fab()).toBeNull();
    unmount();
    cleanup();

    renderWithFab(<BulkLinkActionBar txCount={0} bankCount={0} {...common} />);
    expect(fab()).not.toBeNull();
  });

  it("LensToast: hidden while the toast is shown", () => {
    const noop = () => {};
    const { unmount } = renderWithFab(
      <LensToast
        lens="manual"
        accountLabel="Main"
        onSave={noop}
        onKeep={noop}
        onRevert={noop}
      />,
    );
    expect(fab()).toBeNull();
    unmount();
    cleanup();

    renderWithFab(null);
    expect(fab()).not.toBeNull();
  });

  it("AnnouncementBanner: hidden while an item is displayed, visible when none", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: 1,
          title: "Heads up",
          body: "Something happened",
          pinned: true,
          read: false,
          severity: "info",
        },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderWithFab(<AnnouncementBanner />);
    await waitFor(() => expect(screen.getByText("Heads up")).not.toBeNull());
    // The hide effect runs after the banner paints, so wait for the FAB to drop out.
    await waitFor(() => expect(fab()).toBeNull());
    cleanup();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] })),
    );
    renderWithFab(<AnnouncementBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Heads up")).toBeNull());
    expect(fab()).not.toBeNull();
  });
});
