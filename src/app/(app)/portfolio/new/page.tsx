"use client";

/**
 * Portfolio operations, level 1 (/portfolio/new): an inset grouped list, one row per operation.
 * Each row opens its own level-2 page (/portfolio/new/<slug>, see op-catalog.ts).
 * Legacy `?op=<key>` links are redirected to the level-2 page, keeping every other query param
 * (editId, account, holding ...).
 */

import { Suspense, useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { SectionCard } from "@/components/mobile/section-card";
import { ListRow } from "@/components/mobile/list-row";
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
      back={{ href: "/portfolio", label: "Investment" }}
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
          <SectionCard key={group.key} list label={group.label} icon={Layers} tone="indigo">
            {ops.map((o) => (
              <ListRow key={o.key} href={opHref(o.key)} icon={o.icon} tile="primary" title={o.title} subtitle={o.description} />
            ))}
          </SectionCard>
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
