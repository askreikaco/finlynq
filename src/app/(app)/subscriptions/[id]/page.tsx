"use client";

import { useParams } from "next/navigation";
import { DetailPage } from "@/components/templates";
import { SubscriptionDetail } from "../_components/subscription-detail";
import type { Subscription } from "../_components/types";

/** /subscriptions/[id]: the subscription detail page (DetailPage header). The content is SubscriptionDetail, shared with the /subscriptions split-view pane. */
export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DetailPage<Subscription[], Subscription>
      id="subscription-detail"
      title={(s) => s.name ?? "Subscription"}
      placeholderTitle="Subscription"
      backFallback="/subscriptions"
      backLabel="Back to subscriptions"
      load={{
        key: "/api/subscriptions",
        select: (list) => (Array.isArray(list) ? list.find((s) => String(s.id) === id) : undefined),
        notFound: { title: "Subscription not found", message: "This subscription doesn't exist, or it isn't one of yours." },
      }}
      primary={(s) => ({ kind: "edit", label: `Edit subscription ${s.name ?? ""}`, href: `/subscriptions/${s.id}/edit` })}
      sections={() => <SubscriptionDetail id={id} />}
    />
  );
}
