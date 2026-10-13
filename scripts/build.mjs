#!/usr/bin/env node
// `npm run build` entry. Webpack (+ @serwist/next) by default; Turbopack
// (+ @serwist/turbopack route) when USE_TURBOPACK=1. See next.config.ts.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const turbo = process.env.USE_TURBOPACK === "1";
const args = [nextBin, "build", ...(turbo ? [] : ["--webpack"]), ...process.argv.slice(2)];

const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
