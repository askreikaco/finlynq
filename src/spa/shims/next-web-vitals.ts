import { useEffect, useRef } from "react";

type Metric = { name: string; value: number; rating?: string };
const rate = (v: number, good: number, poor: number) => (v <= good ? "good" : v <= poor ? "needs-improvement" : "poor");

/**
 * next/web-vitals replacement (next's copy of the web-vitals lib is a webpack/ncc bundle that reads __dirname).
 * Reports FCP, LCP, CLS, TTFB through PerformanceObserver; LCP/CLS are reported when the page is hidden.
 */
export function useReportWebVitals(report: (m: Metric) => void): void {
  const cb = useRef(report);
  cb.current = report;
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const send = (name: string, value: number, good: number, poor: number) => cb.current({ name, value, rating: rate(value, good, poor) });
    const obs: PerformanceObserver[] = [];
    const observe = (type: string, fn: (entries: PerformanceEntryList) => void) => {
      try {
        const o = new PerformanceObserver((l) => fn(l.getEntries()));
        o.observe({ type, buffered: true });
        obs.push(o);
      } catch {
        // entry type unsupported
      }
    };
    let lcp = 0;
    let cls = 0;
    observe("paint", (es) => es.forEach((e) => e.name === "first-contentful-paint" && send("FCP", e.startTime, 1800, 3000)));
    observe("largest-contentful-paint", (es) => es.forEach((e) => (lcp = e.startTime)));
    observe("layout-shift", (es) =>
      es.forEach((e) => {
        const ls = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!ls.hadRecentInput) cls += ls.value;
      }),
    );
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) send("TTFB", nav.responseStart, 800, 1800);
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (lcp) send("LCP", lcp, 2500, 4000);
      send("CLS", cls, 0.1, 0.25);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      obs.forEach((o) => o.disconnect());
    };
  }, []);
}
