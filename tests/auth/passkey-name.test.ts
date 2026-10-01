import { describe, it, expect } from "vitest";
import {
  deviceBrowserFromUserAgent as ua,
  providerFromAaguid,
  uniquePasskeyName,
  generatePasskeyName,
  AAGUID_PROVIDERS,
} from "@/lib/auth/passkey-name";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadSafari: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

describe("deviceBrowserFromUserAgent", () => {
  it.each([
    ["iphoneSafari", "iPhone · Safari"],
    ["ipadSafari", "iPad · Safari"],
    ["macChrome", "Mac · Chrome"],
    ["macSafari", "Mac · Safari"],
    ["macFirefox", "Mac · Firefox"],
    ["winEdge", "Windows · Edge"],
    ["winChrome", "Windows · Chrome"],
    ["androidChrome", "Android · Chrome"],
  ] as const)("%s -> %s", (k, want) => expect(ua(UA[k])).toBe(want));

  it("unknown / missing -> null", () => {
    expect(ua("curl/8.0")).toBeNull();
    expect(ua("")).toBeNull();
    expect(ua(null)).toBeNull();
  });
});

describe("AAGUID map", () => {
  it("has ~15+ well-formed entries", () => {
    const keys = Object.keys(AAGUID_PROVIDERS);
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
  it("hits (case-insensitive) and misses", () => {
    expect(providerFromAaguid("FBFC3007-154E-4ECC-8C0B-6E020557D7BD")).toBe("iCloud Keychain");
    expect(providerFromAaguid("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4")).toBe("Google Password Manager");
    expect(providerFromAaguid("bada5566-a7aa-401f-bd96-45619a55120d")).toBe("1Password");
    expect(providerFromAaguid("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(providerFromAaguid(null)).toBeNull();
  });
});

describe("generatePasskeyName", () => {
  it("AAGUID beats UA; UA beats fallback; fallback is Passkey", () => {
    const aaguid = "fbfc3007-154e-4ecc-8c0b-6e020557d7bd";
    expect(generatePasskeyName({ aaguid, userAgent: UA.winEdge, existingLabels: [] })).toBe("iCloud Keychain");
    expect(generatePasskeyName({ aaguid: "00000000-0000-0000-0000-000000000000", userAgent: UA.winEdge, existingLabels: [] })).toBe("Windows · Edge");
    expect(generatePasskeyName({ userAgent: "weird", existingLabels: [] })).toBe("Passkey");
  });
  it("suffixes duplicates (2), (3), case-insensitive, null labels ignored", () => {
    expect(uniquePasskeyName("Mac · Chrome", [null, "Other"])).toBe("Mac · Chrome");
    expect(uniquePasskeyName("Mac · Chrome", ["Mac · Chrome"])).toBe("Mac · Chrome (2)");
    expect(uniquePasskeyName("Mac · Chrome", ["mac · chrome", "Mac · Chrome (2)"])).toBe("Mac · Chrome (3)");
  });
  it("never exceeds 60 chars", () => {
    const long = "x".repeat(60);
    const out = uniquePasskeyName(long, [long]);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith(" (2)")).toBe(true);
  });
});
