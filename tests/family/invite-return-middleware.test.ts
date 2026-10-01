import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

// Auth gating is client-side (UnlockGate); middleware must NOT server-redirect the invite link
// (that would lose the token before any client JS can stash it) and must send no Referer.
describe("middleware: /family/accept invite link", () => {
  const token = "ab".repeat(32);
  for (const p of [`/family/accept?token=${token}`, `/family?token=${token}`]) {
    it(`passes ${p.split("?")[0]} through without redirect, with no-referrer and no token in headers`, () => {
      const res = middleware(new NextRequest(new URL(p, "http://localhost:3000")));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(JSON.stringify([...res.headers.entries()])).not.toContain(token);
    });
  }
});
