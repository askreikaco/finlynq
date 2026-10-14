/**
 * Vite config for the client-rendered Finlynq SPA (src/spa). Same source tree as the Next app: next/* imports
 * are aliased to shims, the route table comes from the src/app/(app) file convention. NO type check here
 * (run `npx tsc --noEmit` separately). Output: dist-web/ (index.html + hashed assets + sw.js + version.json),
 * served under /web/ (base). Dev: `npm run dev:web` (proxies /api to the Next server, PORT or 3010).
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { matchPath } from "react-router";
import { build as esbuild } from "esbuild";
import { SPA_ROUTES, spaRoutePatterns } from "./src/spa/routes.config";

const repo = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(repo, "src");
const shims = path.join(src, "spa/shims");
const BASE = "/web/";

function gitSha(): string {
  if (process.env.VITE_BUILD) return process.env.VITE_BUILD;
  try {
    return execSync("git rev-parse --short=9 HEAD", { cwd: repo, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return String(Date.now());
  }
}
const BUILD = gitSha();
const patterns = spaRoutePatterns();
const isSpaPath = (p: string) => patterns.some((pat) => matchPath({ path: pat, end: true }, p));

/** `GET /more` (document request for a SPA route) -> /web/index.html, like the nginx try_files rule. Dev + preview only. */
function spaFallback(): Plugin {
  const mw = (req: { url?: string; method?: string; headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && String(req.headers.accept ?? "").includes("text/html") && isSpaPath(pathname)) req.url = `${BASE}index.html`;
    if (pathname === "/sw.js") req.url = `${BASE}sw.js`; // prod serves it at /sw.js (nginx), same here
    next();
  };
  return {
    name: "spa-fallback",
    configureServer: (s) => void s.middlewares.use(mw as never),
    configurePreviewServer: (s) => void s.middlewares.use(mw as never),
  };
}

/** After the bundle is written: version.json, routes.json, and the service worker (esbuild, precache manifest injected). */
function spaRelease(): Plugin {
  let outDir = "";
  return {
    name: "spa-release",
    apply: "build",
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    async writeBundle() {
      const builtAt = new Date().toISOString();
      // Precache = app shell (entry graph) + the chunks of the enabled routes only, not all 92 pages.
      // Everything else under /assets/ is cached on first use (CacheFirst in sw.ts).
      type MEntry = { file: string; css?: string[]; assets?: string[]; imports?: string[] };
      const vm = JSON.parse(readFileSync(path.join(outDir, ".vite/manifest.json"), "utf8")) as Record<string, MEntry>;
      const routeOf = (key: string) =>
        "/" + key.replace(/^\.\.\/app\/\(app\)\//, "").replace(/^pages\//, "").replace(/\.tsx$/, "").replace(/\/?(page|layout)$/, "").split("/").filter((x) => x && !/^\(.*\)$/.test(x)).join("/");
      const enabled = new Set(SPA_ROUTES);
      const roots = ["index.html"];
      for (const key of Object.keys(vm)) {
        const isOverride = key.startsWith("pages/");
        const isPage = key.endsWith("/page.tsx");
        const isLayout = key.endsWith("/layout.tsx");
        if (!isOverride && !isPage && !isLayout) continue;
        const r = routeOf(key);
        if ((isOverride || isPage) && enabled.has(r)) roots.push(key);
        if (isLayout && [...enabled].some((e) => e === r || e.startsWith(r === "/" ? "/" : r + "/"))) roots.push(key);
      }
      const keep = new Set<string>(["index.html", "theme-init.js"]);
      const seen = new Set<string>();
      const visit = (key: string) => {
        if (seen.has(key) || !vm[key]) return;
        seen.add(key);
        const e = vm[key];
        keep.add(e.file);
        e.css?.forEach((f) => keep.add(f));
        e.assets?.forEach((f) => keep.add(f));
        e.imports?.forEach(visit);
      };
      roots.forEach(visit);
      const files = [...keep];
      const manifest = files.map((f) => ({
        url: BASE + f,
        // hashed build output is immutable (url is the revision); html + public files carry a content hash
        revision: f.startsWith("assets/") ? null : createHash("md5").update(readFileSync(path.join(outDir, f))).digest("hex").slice(0, 12),
      }));
      writeFileSync(path.join(outDir, "version.json"), JSON.stringify({ build: BUILD, builtAt }));
      writeFileSync(path.join(outDir, "routes.json"), JSON.stringify({ build: BUILD, patterns }));
      rmSync(path.join(outDir, ".vite"), { recursive: true, force: true });
      await esbuild({
        entryPoints: [path.join(src, "spa/sw.ts")],
        outfile: path.join(outDir, "sw.js"),
        bundle: true,
        minify: true,
        format: "iife",
        target: "es2020",
        define: {
          __SW_MANIFEST__: JSON.stringify(manifest),
          __SPA_PATTERNS__: JSON.stringify(patterns),
          __BUILD__: JSON.stringify(BUILD),
          __BASE__: JSON.stringify(BASE),
          "process.env.NODE_ENV": '"production"',
        },
        logLevel: "warning",
      });
    },
  };
}

const apiTarget = `http://localhost:${process.env.PORT ?? 3010}`;
/** Everything the Next server keeps serving (API, PWA manifest/icons). Host header is kept so the CSRF Origin gate sees a same-origin POST. */
const proxy: Record<string, string | ProxyOptions> = Object.fromEntries(
  ["/api", "/manifest.webmanifest", "/icons", "/splash", "/favicon.svg", "/apple-touch-icon.png"].map((p) => [p, { target: apiTarget, changeOrigin: false }]),
);

export default defineConfig({
  root: path.join(src, "spa"),
  base: BASE,
  publicDir: path.join(src, "spa/public"),
  cacheDir: path.join(repo, "node_modules/.vite-web"),
  plugins: [
    react(process.env.SPA_REACT_COMPILER === "1" ? { babel: { plugins: ["babel-plugin-react-compiler"] } } : undefined),
    spaFallback(),
    spaRelease(),
  ],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: path.join(shims, "next-link.tsx") },
      { find: /^next\/navigation$/, replacement: path.join(shims, "next-navigation.ts") },
      { find: /^next\/image$/, replacement: path.join(shims, "next-image.tsx") },
      { find: /^next\/dynamic$/, replacement: path.join(shims, "next-dynamic.tsx") },
      { find: /^next\/script$/, replacement: path.join(shims, "next-script.tsx") },
      { find: /^next\/font(\/.*)?$/, replacement: path.join(shims, "next-font.ts") },
      { find: /^next\/headers$/, replacement: path.join(shims, "next-headers.ts") },
      { find: /^@\//, replacement: src + "/" },
    ],
  },
  define: {
    "import.meta.env.VITE_BUILD": JSON.stringify(BUILD),
    // Same names the Next build inlines (process.env.NEXT_PUBLIC_*); anything else read in shared code is undefined in the browser.
    "process.env.NEXT_PUBLIC_APP_BUILD": JSON.stringify(BUILD),
    "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(process.env.NEXT_PUBLIC_SITE_URL),
    "process.env": "{}",
  },
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
  build: {
    outDir: path.join(repo, "dist-web"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    reportCompressedSize: false,
    manifest: true,
    chunkSizeWarningLimit: 1500,
  },
});
