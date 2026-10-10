"use client";

/**
 * Portfolio operations, level 1 (/portfolio/new): an inset grouped list, one row per operation.
 * Each row opens its own level-2 page (/portfolio/new/<slug>, see op-catalog.ts).
 * Legacy `?op=<key>` links are redirected to the level-2 page, keeping every other query param
 * (editId, account, holding ...).
 */

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SectionLabel } from "@/components/mobile";
import { SectionPage } from "@/components/templates/section-page";
import {
  OP_GROUPS,
  OPS,
  isOpKey,
  opHref,
} from "@/components/portfolio/forms/op-catalog";

function PortfolioNewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const legacyOp = params.get("op");
  const redirectKey = isOpKey(legacyOp) ? legacyOp : null;

  useEffect(() => {
    if (!redirectKey) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete("op");
    const qs = rest.toString();
    router.replace(opHref(redirectKey, qs ? `?${qs}` : ""));
  }, [redirectKey, params, router]);

  if (redirectKey) return null;

  return (
    <SectionPage
      id="portfolio-new"
      title="New operation"
      backFallback="/portfolio"
      backLabel="Portfolio"
      width="section"
      center
      minW0={false}
      padBottom="none"
      stack="6"
      className="regular:p-6"
    >

      {OP_GROUPS.map((group) => {
        const ops = OPS.filter((o) => o.group === group.key);
        return (
          <section key={group.key} className="space-y-2">
            <SectionLabel>{group.label}</SectionLabel>
            <div className="divide-y divide-border/50 overflow-hidden rounded-2xl bg-card">
              {ops.map((o) => {
                const Icon = o.icon;
                return (
                  <Link
                    key={o.key}
                    href={opHref(o.key)}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base text-foreground">{o.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.description}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </SectionPage>
  );
}

export default function PortfolioNewPage() {
  return (
    <Suspense fallback={null}>
      <PortfolioNewInner />
    </Suspense>
  );
}
