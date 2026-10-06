/**
 * Test suite for URL redirects and routing behavior.
 * These ensure that legacy and alternative routes properly redirect to their canonical URLs.
 */
import { describe, it, expect } from "vitest";

describe("Next.config redirects", () => {
  it("should have /reconcile and /import/reconcile redirects to /import?tab=reconcile", async () => {
    const cfg = (await import("../next.config")).default;
    const redirects = await cfg.redirects!();

    const reconcileRedirect = redirects.find((r: { source: string; destination: string; permanent?: boolean }) => r.source === "/reconcile");
    expect(reconcileRedirect).toBeDefined();
    expect(reconcileRedirect?.destination).toBe("/import?tab=reconcile");
    expect(reconcileRedirect?.permanent).toBe(false);

    const importReconcileRedirect = redirects.find((r: { source: string; destination: string; permanent?: boolean }) => r.source === "/import/reconcile");
    expect(importReconcileRedirect).toBeDefined();
    expect(importReconcileRedirect?.destination).toBe("/import?tab=reconcile");
    expect(importReconcileRedirect?.permanent).toBe(false);
  });

  it("should preserve other existing redirects", async () => {
    const cfg = (await import("../next.config")).default;
    const redirects = await cfg.redirects!();

    // Verify the redirects array contains expected sources
    const sources = redirects.map((r: { source: string; destination: string; permanent?: boolean }) => r.source);
    expect(sources).toContain("/reconcile");
    expect(sources).toContain("/import/reconcile");

    // Verify no duplicate sources
    const uniqueSources = new Set(sources);
    expect(sources.length).toBe(uniqueSources.size);

    // All redirects should have required fields
    for (const redirect of redirects) {
      expect(redirect.source).toBeDefined();
      expect(redirect.destination).toBeDefined();
      expect(redirect.permanent).toBeDefined();
    }
  });
});
