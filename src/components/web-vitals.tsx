"use client";

/**
 * Real-user timings → /api/metrics (performance plan, Phase 0). Batches Web Vitals
 * and Next.js route-change timings and sends them when the page is hidden or the
 * batch is full. Routes are reduced to templates (ids → :id), no query strings.
 */
import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";

type M = { r: string; n: string; v: number; g?: string };
const queue: M[] = [];

export function routeTemplate(path: string): string {
  return (
    path
      .split("?")[0]
      .split("/")
      .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f-]{16,}$/i.test(seg) ? ":id" : seg))
      .join("/")
      .slice(0, 80) || "/"
  );
}

function flush(): void {
  if (queue.length === 0) return;
  const m = queue.splice(0, 20);
  try {
    void fetch("/api/metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ m }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") return;
    queue.push({
      r: routeTemplate(window.location.pathname),
      n: metric.name,
      v: metric.value,
      ...("rating" in metric && metric.rating ? { g: metric.rating as string } : {}),
    });
    if (queue.length >= 20) flush();
  });
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  return null;
}
