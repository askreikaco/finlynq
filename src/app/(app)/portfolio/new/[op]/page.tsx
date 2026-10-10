/**
 * Level-2 portfolio operation (/portfolio/new/<slug>). One static page per OPS slug; any other
 * slug is a 404 (dynamicParams = false). The form lives in OpRoute (components/portfolio/forms).
 */

import { OPS } from "@/components/portfolio/forms/op-catalog";
import { OpRoute } from "@/components/portfolio/forms/op-route";

export const dynamicParams = false;

export function generateStaticParams() {
  return OPS.map((o) => ({ op: o.slug }));
}

export default async function PortfolioNewOpPage({
  params,
}: {
  params: Promise<{ op: string }>;
}) {
  const { op } = await params;
  return <OpRoute slug={op} />;
}
