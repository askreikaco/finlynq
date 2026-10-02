/**
 * POST /api/metrics — real-user performance timings (performance plan, Phase 0).
 *
 * Body: { m: [{ r: route, n: metric name, v: value ms|score, g?: rating }] } (≤ 20).
 * Logs one `[rum]` line per metric: durations and route templates only — never
 * amounts, names, ids or query strings. Signed-in users only; 120 metrics/min/user.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NAMES = ["TTFB", "FCP", "LCP", "INP", "CLS", "FID", "Next.js-hydration", "Next.js-route-change-to-render", "Next.js-render"] as const;

const bodySchema = z.object({
  m: z
    .array(
      z.object({
        r: z.string().max(80).regex(/^\/[A-Za-z0-9/_:\-[\]]*$/),
        n: z.enum(NAMES),
        v: z.number().finite().min(0).max(600_000),
        g: z.enum(["good", "needs-improvement", "poor"]).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return new NextResponse(null, { status: 204 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const rl = checkRateLimit(`rum:${auth.context.userId}`, 120, 60_000);
  if (!rl.allowed) return new NextResponse(null, { status: 204 });
  for (const m of parsed.data.m) {
    const v = m.n === "CLS" ? m.v.toFixed(3) : `${Math.round(m.v)}ms`;
    console.info(`[rum] route=${m.r} name=${m.n} value=${v}${m.g ? ` rating=${m.g}` : ""}`);
  }
  return new NextResponse(null, { status: 204 });
}
