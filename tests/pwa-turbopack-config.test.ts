import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

type Rule = { source: string; destination?: string; headers?: { key: string; value: string }[] };

async function loadConfig(turbo: boolean) {
  vi.resetModules();
  if (turbo) vi.stubEnv("USE_TURBOPACK", "1");
  else vi.stubEnv("USE_TURBOPACK", "");
  vi.stubEnv("NODE_ENV", "production");
  const mod = await import("../next.config");
  let cfg: any = mod.default;
  if (typeof cfg === "function") cfg = await cfg("phase-production-build", { defaultConfig: {} });
  return cfg;
}

const flatRewrites = (r: any): Rule[] =>
  Array.isArray(r) ? r : [...(r.beforeFiles ?? []), ...(r.afterFiles ?? []), ...(r.fallback ?? [])];

afterEach(() => vi.unstubAllEnvs());

describe("next.config: /sw.js stays the public worker URL", () => {
  it("turbopack mode rewrites /sw.js (and the map) to the serwist route BEFORE static files", async () => {
    const cfg = await loadConfig(true);
    const r = await cfg.rewrites();
    expect(r.beforeFiles).toEqual(
      expect.arrayContaining([
        { source: "/sw.js", destination: "/serwist/sw.js" },
        { source: "/sw.js.map", destination: "/serwist/sw.js.map" },
      ]),
    );
    // manifest rewrite is kept
    expect(flatRewrites(r)).toEqual(
      expect.arrayContaining([{ source: "/manifest.json", destination: "/manifest.webmanifest" }]),
    );
  });

  it("webpack mode (default) adds no /sw.js rewrite and keeps the manifest rewrite", async () => {
    const cfg = await loadConfig(false);
    const rules = flatRewrites(await cfg.rewrites());
    expect(rules.find((x) => x.source.startsWith("/sw.js"))).toBeUndefined();
    expect(rules).toEqual(
      expect.arrayContaining([{ source: "/manifest.json", destination: "/manifest.webmanifest" }]),
    );
  });

  it.each([true, false])("worker headers apply to /sw.js and /serwist/sw.js (turbopack=%s)", async (turbo) => {
    const cfg = await loadConfig(turbo);
    const hs: Rule[] = await cfg.headers();
    for (const src of ["/sw.js", "/serwist/sw.js"]) {
      const h = hs.find((x) => x.source === src)!;
      expect(h, src).toBeTruthy();
      const m = Object.fromEntries(h.headers!.map((k) => [k.key, k.value]));
      expect(m["Content-Type"]).toBe("application/javascript; charset=utf-8");
      expect(m["Cache-Control"]).toBe("no-cache, no-store, must-revalidate");
      expect(m["Service-Worker-Allowed"]).toBe("/");
    }
  });

  it("type check stays on by default (ignoreBuildErrors only when SKIP_NEXT_TYPECHECK=1)", async () => {
    vi.stubEnv("SKIP_NEXT_TYPECHECK", "");
    expect((await loadConfig(true)).typescript.ignoreBuildErrors).toBe(false);
    expect((await loadConfig(false)).typescript.ignoreBuildErrors).toBe(false);
  });
});

describe("turbopack build wiring (static)", () => {
  it("pwa-register keeps registering /sw.js", () => {
    const s = read("src/components/pwa-register.tsx");
    expect(s).toContain('container.register("/sw.js"');
    expect(s).not.toContain("/serwist/sw.js");
  });

  it("middleware sets worker headers for both worker URLs and does not redirect them", () => {
    const s = read("src/middleware.ts");
    expect(s).toMatch(/pathname === "\/sw\.js" \|\| pathname === "\/serwist\/sw\.js"/);
    expect(s).toContain('response.headers.set("Service-Worker-Allowed", "/")');
  });

  it("serwist route is static, closed param set, and inert unless USE_TURBOPACK=1", () => {
    const s = read("src/app/serwist/[path]/route.ts");
    expect(s).toContain('export const dynamic = "force-static"');
    expect(s).toContain("export const dynamicParams = false");
    expect(s).toContain('process.env.USE_TURBOPACK === "1"');
    expect(s).toContain('swSrc: "src/app/sw.ts"');
  });

  it("build script passes --webpack unless USE_TURBOPACK=1; package.json uses it with the prebuild generator", () => {
    const s = read("scripts/build.mjs");
    expect(s).toContain('process.env.USE_TURBOPACK === "1"');
    expect(s).toContain('"--webpack"');
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.build).toBe("node scripts/build.mjs");
    expect(pkg.scripts.prebuild).toContain("generate-mcp-tool-catalog");
    expect(pkg.dependencies["@serwist/next"]).toBeTruthy();
    expect(pkg.dependencies["@serwist/turbopack"]).toBeTruthy();
    expect(pkg.dependencies.esbuild).toBeTruthy();
  });

  it("Dockerfile sets only USE_TURBOPACK=1 and does not skip the type check", () => {
    const d = read("Dockerfile");
    expect(d).toMatch(/^ENV USE_TURBOPACK=1$/m);
    expect(d).not.toContain("SKIP_NEXT_TYPECHECK");
    expect(d).toContain("npm run build");
  });
});
