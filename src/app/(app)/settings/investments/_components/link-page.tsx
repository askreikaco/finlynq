"use client";

/**
 * Shared parts for the two link routes (one config, two URLs):
 *  - accounts/[id]/link     kind "account":  add a security to this account (LinkForm mode "security")
 *  - securities/[id]/link   kind "security": add this security to an account (LinkForm mode "account")
 * Each route page.tsx calls FormPage (chrome, returnTo, states). This file holds the load hooks,
 * the state copy and the form body.
 */

import type { FormPageStates } from "@/components/templates/form-page";
import { LinkForm, type LinkMode } from "./link-form";
import { RouteNotice } from "./form-rows";
import {
  returnHref,
  useInvestmentData,
  type Account,
  type LoadWithMessage,
  type Security,
} from "./shared";

export type LinkKind = "account" | "security";

/** Catalog and accounts, passed to the body as ctx.extra. */
export interface LinkExtra {
  securities: Security[];
  accounts: Account[];
}

const MODE: Record<LinkKind, LinkMode> = { account: "security", security: "account" };
const LOAD_ERROR: Record<LinkKind, string> = {
  account: "Couldn't load this account.",
  security: "Couldn't load this security.",
};
const MISSING: Record<LinkKind, string> = {
  account: "This account no longer exists.",
  security: "This security no longer exists.",
};

function linkLoad<R>(
  data: { securities: Security[] | null; accounts: Account[]; loading: boolean; error: string | null; reload: () => void },
  kind: LinkKind,
  found: R | undefined,
): LoadWithMessage<R, LinkExtra> {
  const extra = { securities: data.securities ?? [], accounts: data.accounts };
  if (!data.securities) {
    return data.loading
      ? { status: "loading", retry: data.reload, extra }
      : { status: "error", retry: data.reload, message: data.error ?? LOAD_ERROR[kind], extra };
  }
  if (!found) return { status: "notFound", retry: data.reload, extra };
  return { status: "ready", record: found, retry: data.reload, extra };
}

/** FormPage load hook for accounts/[id]/link: the account named by the route id. */
export function useAccountLinkLoad(route: { params: Record<string, string | undefined> }): LoadWithMessage<Account, LinkExtra> {
  const data = useInvestmentData();
  const id = Number(route.params.id);
  return linkLoad(data, "account", data.accounts.find((a) => a.id === id));
}

/** FormPage load hook for securities/[id]/link: the security named by the route id. */
export function useSecurityLinkLoad(route: { params: Record<string, string | undefined> }): LoadWithMessage<Security, LinkExtra> {
  const data = useInvestmentData();
  const id = Number(route.params.id);
  return linkLoad(data, "security", data.securities?.find((s) => s.id === id));
}

/** FormPage states for a link route: skeleton, retry notice and missing notice, each in mt-3. */
export function linkStates(kind: LinkKind): FormPageStates {
  return {
    loading: { variant: "cards", rows: 2, wrapperClassName: "mt-3" },
    error: {
      wrapperClassName: "mt-3",
      node: ({ retry, message }) => (
        <RouteNotice>
          {message}{" "}
          <button type="button" className="underline" onClick={retry}>Retry</button>
        </RouteNotice>
      ),
    },
    notFound: { wrapperClassName: "mt-3", node: <RouteNotice>{MISSING[kind]}</RouteNotice> },
  };
}

/** The link form body for a ready record. Cancel and save go to the FormPage returnTo. */
export function LinkFormBody({
  kind,
  record,
  extra,
  returnTo,
  router,
}: {
  kind: LinkKind;
  record: { id: number };
  extra: LinkExtra;
  returnTo: string;
  router: { push: (href: string) => void };
}) {
  return (
    <LinkForm
      mode={MODE[kind]}
      fixedId={record.id}
      securities={extra.securities}
      accounts={extra.accounts}
      onCancel={() => router.push(returnTo)}
      onSaved={(notice) => router.push(returnHref(returnTo, notice))}
    />
  );
}
