"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailPage } from "@/components/templates";
import { LoanDetail } from "../_components/loan-detail";
import type { Loan } from "../_components/loan-types";

/** /loans/[id]: the loan detail page (DetailPage header). The content is LoanDetail, shared with the /loans split-view pane. */
export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DetailPage<Loan[], Loan>
      id="loan-detail"
      title={(l) => l.name}
      placeholderTitle="Loan"
      backFallback="/loans"
      backLabel="Back to loans"
      load={{
        key: "/api/loans",
        select: (list) => (Array.isArray(list) ? list.find((l) => String(l.id) === id) : undefined),
        notFound: { title: "Loan not found", message: "This loan doesn't exist, or it isn't one of yours." },
      }}
      actions={(l) => (
        <Button variant="outline" render={<Link href={`/loans/${l.id}/edit`} />} aria-label={`Edit loan ${l.name}`}>
          <Pencil className="mr-1 h-4 w-4" /> Edit
        </Button>
      )}
      sections={() => <LoanDetail id={id} />}
    />
  );
}
