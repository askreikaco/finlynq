"use client";

/**
 * Which accordion section of a settings parent page is open, and scrolling it
 * into view. Old folded URLs render the parent in place (no redirect); the
 * pathname seeds the open section, then ?tab= / #hash / ?provider= refine it.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export interface OpenSectionConfig {
  /** Old-path prefix -> section value opened by default on that path. */
  byPath: Array<{ prefix: string; section: string }>;
  /** Section values accepted from ?tab= / #hash. */
  valid: string[];
  /** Legacy ?tab= values mapped to a section (e.g. connect -> migrate). */
  alias?: Record<string, string>;
  /** Section opened when ?provider=<known> is present. */
  providerSection?: string;
}

const PROVIDERS = ["wealthposition", "moneypro", "generic-csv"];

export function sectionFromPath(pathname: string, cfg: OpenSectionConfig): string | null {
  for (const { prefix, section } of cfg.byPath) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return section;
  }
  return null;
}

/** Pure: section requested by the query string / hash, or null. */
export function sectionFromUrl(search: string, hash: string, cfg: OpenSectionConfig): string | null {
  const params = new URLSearchParams(search);
  const p = params.get("provider");
  if (cfg.providerSection && p && PROVIDERS.includes(p)) return cfg.providerSection;
  const raw = params.get("tab") ?? hash.replace(/^#/, "");
  if (!raw) return null;
  const mapped = cfg.alias?.[raw] ?? raw;
  return cfg.valid.includes(mapped) ? mapped : null;
}

export function useOpenSection(cfg: OpenSectionConfig): [string | null, (v: string | null) => void] {
  const pathname = usePathname();
  const fromPath = sectionFromPath(pathname ?? "", cfg);
  const [open, setOpen] = useState<string | null>(fromPath);
  const [scrollTo, setScrollTo] = useState<string | null>(fromPath);
  const cfgRef = useRef(cfg);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  // URL refinement (client only): ?tab=, #hash, ?provider=.
  useEffect(() => {
    const s = sectionFromUrl(window.location.search, window.location.hash, cfgRef.current);
    if (s) {
      setOpen(s);
      setScrollTo(s);
    }
  }, [pathname]);

  // Scroll the opened section's item into view once its panel has mounted.
  useEffect(() => {
    if (!scrollTo) return;
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(scrollTo);
      const item = el?.closest('[data-slot="accordion-item"]') ?? el;
      item?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      setScrollTo(null);
    });
    return () => cancelAnimationFrame(id);
  }, [scrollTo, open]);

  return [open, setOpen];
}
