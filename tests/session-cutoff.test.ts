import { describe, it, expect } from "vitest";
import { isSessionRevokedByCutoff, replacementIat } from "@/lib/auth/session-cutoff";

describe("session cutoff (iat <= floor(cutoff_s) rejected)", () => {
  const cutoff = new Date("2026-10-01T10:00:05.900Z");
  const s = Math.floor(cutoff.getTime() / 1000);
  it("no cutoff -> allowed", () => expect(isSessionRevokedByCutoff(s - 100, null)).toBe(false));
  it("iat before cutoff second -> revoked", () => expect(isSessionRevokedByCutoff(s - 1, cutoff)).toBe(true));
  it("iat == cutoff second (same-second token) -> revoked", () => expect(isSessionRevokedByCutoff(s, cutoff)).toBe(true));
  it("iat after cutoff second -> allowed", () => expect(isSessionRevokedByCutoff(s + 1, cutoff)).toBe(false));
  it("missing/NaN iat with a cutoff -> revoked", () => {
    expect(isSessionRevokedByCutoff(undefined, cutoff)).toBe(true);
    expect(isSessionRevokedByCutoff(NaN, cutoff)).toBe(true);
  });
  it("replacement session iat survives its own cutoff", () => {
    expect(isSessionRevokedByCutoff(replacementIat(cutoff), cutoff)).toBe(false);
  });
});
