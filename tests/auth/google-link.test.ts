/**
 * Tests for Google identity linking decision logic.
 */

import { describe, it, expect } from "vitest";
import { decideGoogleLink } from "@/lib/auth/google-link";

describe("decideGoogleLink", () => {
  const userId1 = "user-1";
  const userId2 = "user-2";

  it("should return session_mismatch when sessionUserId is null", () => {
    const result = decideGoogleLink({
      sessionUserId: null,
      stateUid: userId1,
      existingIdentityUserId: null,
    });
    expect(result).toBe("session_mismatch");
  });

  it("should return session_mismatch when sessionUserId does not match stateUid", () => {
    const result = decideGoogleLink({
      sessionUserId: userId1,
      stateUid: userId2,
      existingIdentityUserId: null,
    });
    expect(result).toBe("session_mismatch");
  });

  it("should return session_mismatch when stateUid is undefined", () => {
    const result = decideGoogleLink({
      sessionUserId: userId1,
      stateUid: undefined,
      existingIdentityUserId: null,
    });
    expect(result).toBe("session_mismatch");
  });

  it("should return already_linked_other when identity exists for different user", () => {
    const result = decideGoogleLink({
      sessionUserId: userId1,
      stateUid: userId1,
      existingIdentityUserId: userId2,
    });
    expect(result).toBe("already_linked_other");
  });

  it("should return already_linked_self when identity exists for same user", () => {
    const result = decideGoogleLink({
      sessionUserId: userId1,
      stateUid: userId1,
      existingIdentityUserId: userId1,
    });
    expect(result).toBe("already_linked_self");
  });

  it("should return link when session matches and no existing identity", () => {
    const result = decideGoogleLink({
      sessionUserId: userId1,
      stateUid: userId1,
      existingIdentityUserId: null,
    });
    expect(result).toBe("link");
  });

  it("should return session_mismatch when sessionUserId is null and existingIdentityUserId is set", () => {
    const result = decideGoogleLink({
      sessionUserId: null,
      stateUid: userId1,
      existingIdentityUserId: userId2,
    });
    expect(result).toBe("session_mismatch");
  });
});
