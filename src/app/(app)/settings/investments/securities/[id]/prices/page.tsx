"use client";

/** /settings/investments/securities/[id]/prices — manage price marks of a manual security. */

import { FormPage } from "@/components/templates/form-page";
import { useDisplayCurrency } from "@/components/currency-provider";
import { ManagePricesPanel } from "../../../_components/manage-prices-dialog";
import { RouteNotice } from "../../../_components/form-rows";
import { INVESTMENTS_HOME, symbolLabel, useSecurityLoad, type Security } from "../../../_components/shared";

export default function ManagePricesRoute() {
  const { displayCurrency } = useDisplayCurrency();
  return (
    <FormPage<unknown, Security, unknown, unknown>
      rootTestId="investments-security-prices"
      id="investments-security-prices"
      title="Prices"
      subtitle={(security) => (security ? symbolLabel(security) : undefined)}
      fallbackReturn={INVESTMENTS_HOME}
      form="external"
      width="form"
      padBottom="none"
      header={{ actions: null }}
      useLoad={useSecurityLoad}
      states={{
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
        notFound: { wrapperClassName: "mt-3", node: <RouteNotice>This security no longer exists.</RouteNotice> },
      }}
    >
      {(ctx) =>
        ctx.record ? (
          <ManagePricesPanel
            key={ctx.record.id}
            securityId={ctx.record.id}
            currency={ctx.record.currency || displayCurrency}
            onDone={() => ctx.router.push(ctx.returnTo)}
          />
        ) : null
      }
    </FormPage>
  );
}
