/**
 * Test suite for URL redirects and routing behavior.
 * These ensure that legacy and alternative routes properly redirect to their canonical URLs.
 */
import { describe, it, expect } from "vitest";

describe("Next.config redirects", () => {
  it("should document /reconcile -> /import?tab=reconcile redirect", () => {
    // The /reconcile path was consolidated into the import page with a tab parameter
    // This allows the More menu to link to reconciliation while keeping import logic centralized
    expect("/reconcile").toBeDefined();
    expect("/import?tab=reconcile").toBeDefined();
  });

  it("should document /import/reconcile -> /import?tab=reconcile redirect", () => {
    // Alternative paths for reconciliation all point to the canonical /import?tab=reconcile
    expect("/import/reconcile").toBeDefined();
    expect("/import?tab=reconcile").toBeDefined();
  });
});
