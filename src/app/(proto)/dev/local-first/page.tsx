import { notFound } from "next/navigation";
import { isLocalFirstDevEnabled } from "@/lib/local-first/flag";
import { LocalFirstDevPanel } from "@/lib/local-first/dev/panel";

// Read the flag per request, never at build time.
export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default function LocalFirstDevPage() {
  if (!isLocalFirstDevEnabled()) notFound();
  return <LocalFirstDevPanel />;
}
