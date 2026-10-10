"use client";

/**
 * Shared shell for the two link routes (one config, two URLs):
 *  - accounts/[id]/link     kind "account":  add a security to this account (LinkForm mode "security")
 *  - securities/[id]/link   kind "security": add this security to an account (LinkForm mode "account")
 * Route files only pick the kind. Suspense, returnTo and the page chrome live here.
 */

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { PageSkeleton } from "@/components/page-skeleton";
import { useReturnTo } from "@/lib/forms/use-return-to";
import { TW } from "@/lib/design/tokens";
import { LinkForm, type LinkMode } from "./link-form";
import { RouteNotice } from "./form-rows";
import { INVESTMENTS_HOME, returnHref, symbolLabel, useInvestmentData } from "./shared";

export type LinkKind = "account" | "security";

const CONFIG: Record<LinkKind, { testId: string; title: string; loadError: string; missing: string; mode: LinkMode }> = {
  account: {
    testId: "investments-account-link",
    title: "Add a security",
    loadError: "Couldn't load this account.",
    missing: "This account no longer exists.",
    mode: "security",
  },
  security: {
    testId: "investments-security-link",
    title: "Add to an account",
    loadError: "Couldn't load this security.",
    missing: "This security no longer exists.",
    mode: "account",
  },
};

function LinkBody({ kind }: { kind: LinkKind }) {
  const cfg = CONFIG[kind];
  const router = useRouter();
  const back = useReturnTo(INVESTMENTS_HOME);
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { securities, accounts, loading, error, reload } = useInvestmentData();
  const account = kind === "account" ? accounts.find((a) => a.id === id) : undefined;
  const security = kind === "security" ? securities?.find((s) => s.id === id) : undefined;
  const found = kind === "account" ? account : security;
  const subtitle = kind === "account" ? account?.name : security && symbolLabel(security);

  let body: React.ReactNode;
  if (!securities) {
    body = loading ? (
      <PageSkeleton variant="cards" rows={2} />
    ) : (
      <RouteNotice>
        {error ?? cfg.loadError}{" "}
        <button type="button" className="underline" onClick={reload}>Retry</button>
      </RouteNotice>
    );
  } else if (!found) {
    body = <RouteNotice>{cfg.missing}</RouteNotice>;
  } else {
    body = (
      <LinkForm
        mode={cfg.mode}
        fixedId={found.id}
        securities={securities}
        accounts={accounts}
        onCancel={() => router.push(back)}
        onSaved={(notice) => router.push(returnHref(back, notice))}
      />
    );
  }

  return (
    <div data-testid={cfg.testId} className={`mx-auto w-full ${TW.form}`}>
      <PageHeader
        title={cfg.title}
        subtitle={subtitle}
        backHref={back}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className="mt-3">{body}</div>
    </div>
  );
}

export function LinkRoute({ kind }: { kind: LinkKind }) {
  return (
    <Suspense fallback={null}>
      <LinkBody kind={kind} />
    </Suspense>
  );
}
