#!/usr/bin/env node
/**
 * Pixel-compare two screenshot directories (output of e2e/visual/size-classes.spec.ts).
 *
 *   node scripts/visual-diff.mjs <baseDir> <candidateDir> [--max-ratio=0] [--channel-tol=0] [--json]
 *
 * Prints one line per PNG name present in either directory: changed-pixel ratio (pixels whose RGBA
 * differs by more than --channel-tol on any channel, over total pixels). Exit 1 when any file is
 * missing on one side, has different dimensions, or exceeds --max-ratio. Default --max-ratio=0 means
 * pixel-identical.
 *
 * Decoding uses pngjs when it resolves from node_modules (it is a transitive dependency, not declared
 * in package.json). Without it the script falls back to a byte-for-byte comparison and reports
 * ratio 0 or 1 with mode "bytes".
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const json = args.includes("--json");
const positional = args.filter((a) => !a.startsWith("--"));
const [baseDir, candDir] = positional;
const maxRatio = Number(flag("max-ratio", "0"));
const tol = Number(flag("channel-tol", "0"));

if (!baseDir || !candDir) {
  console.error("usage: node scripts/visual-diff.mjs <baseDir> <candidateDir> [--max-ratio=0] [--channel-tol=0] [--json]");
  process.exit(2);
}
for (const d of [baseDir, candDir]) {
  if (!existsSync(d)) {
    console.error(`not a directory: ${d}`);
    process.exit(2);
  }
}

let PNG = null;
try {
  const req = createRequire(path.join(process.cwd(), "package.json"));
  PNG = req("pngjs").PNG;
} catch {
  PNG = null;
}

const pngNames = (dir) => new Set(readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")));
const names = [...new Set([...pngNames(baseDir), ...pngNames(candDir)])].sort();

function compare(a, b) {
  if (!PNG) {
    const same = a.equals(b);
    return { mode: "bytes", ratio: same ? 0 : 1, changed: same ? 0 : 1, total: 1 };
  }
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) {
    return { mode: "pixels", ratio: 1, changed: null, total: null, note: `size ${A.width}x${A.height} vs ${B.width}x${B.height}` };
  }
  let changed = 0;
  const n = A.width * A.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (
      Math.abs(A.data[o] - B.data[o]) > tol ||
      Math.abs(A.data[o + 1] - B.data[o + 1]) > tol ||
      Math.abs(A.data[o + 2] - B.data[o + 2]) > tol ||
      Math.abs(A.data[o + 3] - B.data[o + 3]) > tol
    ) changed++;
  }
  return { mode: "pixels", ratio: changed / n, changed, total: n };
}

const rows = [];
let failed = 0;
for (const name of names) {
  const inBase = existsSync(path.join(baseDir, name));
  const inCand = existsSync(path.join(candDir, name));
  if (!inBase || !inCand) {
    rows.push({ name, status: "MISSING", side: inBase ? "candidate" : "baseline", ratio: null });
    failed++;
    continue;
  }
  const r = compare(readFileSync(path.join(baseDir, name)), readFileSync(path.join(candDir, name)));
  const bad = r.ratio > maxRatio;
  if (bad) failed++;
  rows.push({ name, status: bad ? "CHANGED" : "OK", ...r });
}

if (json) {
  console.log(JSON.stringify({ baseDir, candDir, maxRatio, tol, mode: PNG ? "pixels" : "bytes", files: rows, failed }, null, 2));
} else {
  for (const r of rows) {
    if (r.status === "MISSING") {
      console.log(`MISSING   ${r.name}  (absent from ${r.side})`);
    } else {
      const pct = (r.ratio * 100).toFixed(4);
      const extra = r.note ? `  ${r.note}` : r.changed !== null && r.total ? `  ${r.changed}/${r.total}` : "";
      console.log(`${r.status.padEnd(9)} ${r.name}  ratio=${pct}%${extra}`);
    }
  }
  console.log(`--- ${names.length} files, ${failed} failing (max-ratio=${maxRatio}, mode=${PNG ? "pixels" : "bytes"})`);
}
process.exit(failed ? 1 : 0);
