// G2-14f: viewport breakpoint codemod for the non-(app) pages and components.
// Static scan only (no render). Viewport tokens map to regular: (>=640px) and
// max-regular: (<640px); the banned adaptive patterns must not appear either.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import {
  BANNED_PATTERN,
  BREAKPOINT_PATTERN,
  SOURCE_EXTS,
  countMatches,
  listSourceFiles,
} from "../helpers/adaptive-scan";

// Folders owned by G2-14f: auth, cloud, mcp-guide, roadmap, and the other
// public (non-app-shell) pages. All are clean after this codemod.
const ROOT = process.cwd();
const G214F_DIRS = [
  "src/app/auth",
  "src/app/cloud",
  "src/app/mcp-guide",
  "src/app/roadmap",
  "src/app/about",
  "src/app/blog",
  "src/app/glossary",
  "src/app/privacy",
  "src/app/terms",
  "src/app/vs",
  "src/app/register",
  "src/app/releases",
  "src/app/self-hosted",
  "src/app/try-demo",
  "src/app/try-demo2",
  "src/app/oauth",
  "src/app/account-deletion",
  "src/components/auth",
  "src/components/cloud",
  "src/components/mcp-guide",
];

// Explicit exceptions: file -> { count, reason }. Empty: nothing in these
// folders may keep a viewport token or a banned pattern.
const BREAKPOINT_EXCEPTIONS: Record<string, { count: number; reason: string }> = {};
const BANNED_EXCEPTIONS: Record<string, { count: number; reason: string }> = {};

function scanFolders(pattern: RegExp): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of listSourceFiles(ROOT, G214F_DIRS, SOURCE_EXTS)) {
    const n = countMatches(fs.readFileSync(`${ROOT}/${f}`, "utf-8"), pattern);
    if (n > 0) out[f] = n;
  }
  return out;
}

function applyExceptions(
  found: Record<string, number>,
  exceptions: Record<string, { count: number; reason: string }>
): Record<string, number> {
  const rest: Record<string, number> = {};
  for (const [f, n] of Object.entries(found)) {
    const ex = exceptions[f];
    if (ex && ex.count === n) continue;
    rest[f] = n;
  }
  return rest;
}

describe("codemod-14f: non-(app) folders carry no viewport breakpoint tokens", () => {
  it("scans a real file set (not vacuous)", () => {
    expect(listSourceFiles(ROOT, G214F_DIRS, SOURCE_EXTS).length).toBeGreaterThan(10);
  });

  it("no sm:/md:/lg:/xl:/2xl:/max-md:/max-sm: tokens beyond listed exceptions", () => {
    const found = scanFolders(BREAKPOINT_PATTERN);
    expect(applyExceptions(found, BREAKPOINT_EXCEPTIONS)).toEqual({});
  });

  it("no banned adaptive patterns (md:hidden, hidden md:, isMobile, ...) beyond listed exceptions", () => {
    const found = scanFolders(BANNED_PATTERN);
    expect(applyExceptions(found, BANNED_EXCEPTIONS)).toEqual({});
  });

  it("listed exceptions still match real hits (no stale exception)", () => {
    const bp = scanFolders(BREAKPOINT_PATTERN);
    const bn = scanFolders(BANNED_PATTERN);
    for (const [f, ex] of Object.entries(BREAKPOINT_EXCEPTIONS)) {
      expect(bp[f], `stale breakpoint exception ${f}: ${ex.reason}`).toBe(ex.count);
    }
    for (const [f, ex] of Object.entries(BANNED_EXCEPTIONS)) {
      expect(bn[f], `stale banned exception ${f}: ${ex.reason}`).toBe(ex.count);
    }
  });

  it("auth pages keep the phone-only classes as max-regular (below 640px)", () => {
    for (const f of ["src/app/auth/forgot-password/page.tsx", "src/app/auth/reset-password/page.tsx"]) {
      const src = fs.readFileSync(`${ROOT}/${f}`, "utf-8");
      expect(src, f).toContain("max-regular:");
      expect(src, f).not.toMatch(/(?<![\w-])max-md:/);
    }
  });
});
