"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailPage } from "@/components/templates";
import { GoalDetail } from "../_components/goal-detail";
import type { Goal } from "../_components/goal-form";

/** /goals/[id]: the goal detail page (DetailPage header). The content is GoalDetail, shared with the /goals split-view pane. */
export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DetailPage<Goal[], Goal>
      id="goal-detail"
      title={(g) => g.name}
      placeholderTitle="Goal"
      backFallback="/goals"
      backLabel="Back to goals"
      load={{
        key: "/api/goals",
        select: (list) => (Array.isArray(list) ? list.find((g) => String(g.id) === id) : undefined),
        notFound: { title: "Goal not found", message: "This goal doesn't exist, or it isn't one of yours." },
      }}
      actions={(g) => (
        <Button variant="outline" render={<Link href={`/goals/${g.id}/edit`} />} aria-label={`Edit goal ${g.name}`}>
          <Pencil className="mr-1 h-4 w-4" /> Edit
        </Button>
      )}
      sections={() => <GoalDetail id={id} />}
    />
  );
}
