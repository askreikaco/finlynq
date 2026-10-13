import { describe, it, expect, afterEach } from "vitest";
import { GET } from "@/app/api/version/route";

describe("GET /api/version", () => {
  const prev = process.env.NEXT_PUBLIC_APP_BUILD;
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_BUILD;
    else process.env.NEXT_PUBLIC_APP_BUILD = prev;
  });

  it("returns the build id uncached", async () => {
    process.env.NEXT_PUBLIC_APP_BUILD = "b42";
    const res = GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ build: "b42" });
  });

  it("returns null when no build id is set", async () => {
    delete process.env.NEXT_PUBLIC_APP_BUILD;
    expect(await GET().json()).toEqual({ build: null });
  });
});
