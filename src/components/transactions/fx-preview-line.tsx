"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import type { FxPreview } from "@/lib/hooks/use-fx-preview";

/** One-line FX preview under an amount field. Renders nothing while idle. */
export function FxPreviewLine({ preview, className }: { preview: FxPreview; className?: string }) {
  if (preview.state === "idle") return null;
  return (
    <div className={className ?? "text-xs text-muted-foreground"}>
      {preview.state === "loading" && <span>Loading…</span>}
      {preview.state === "ok" && (
        <span>
          Account:{" "}
          <span className="font-mono font-medium text-foreground">
            {formatCurrency(preview.converted, preview.to)}
          </span>
          <span className="ml-1.5 opacity-70">
            (rate {preview.rate} · {preview.source} · {preview.date})
          </span>
        </span>
      )}
      {preview.state === "needs-override" && (
        <span className="text-warning">
          Rate not available —{" "}
          <Link href="/settings/general" className="underline hover:no-underline">
            add an override
          </Link>
          .
        </span>
      )}
      {preview.state === "error" && <span className="text-destructive">{preview.message}</span>}
    </div>
  );
}
