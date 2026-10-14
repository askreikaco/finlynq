"use client";

/** Client twin of src/app/(app)/portfolio/new/[op]/page.tsx (async server page; dynamicParams=false -> 404 for unknown slugs). */
import { useParams, notFound } from "next/navigation";
import { OPS } from "@/components/portfolio/forms/op-catalog";
import { OpRoute } from "@/components/portfolio/forms/op-route";

export default function PortfolioNewOpPage() {
  const { op = "" } = useParams<{ op: string }>();
  if (!OPS.some((o) => o.slug === op)) notFound();
  return <OpRoute slug={op} />;
}
