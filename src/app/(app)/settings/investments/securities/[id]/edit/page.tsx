"use client";

/** /settings/investments/securities/[id]/edit — edit name, ticker, asset type, pricing. */

import { FormPage } from "@/components/templates/form-page";
import { EditSecurityForm } from "../../../_components/edit-security-form";
import { RouteNotice } from "../../../_components/form-rows";
import { INVESTMENTS_HOME, returnHref, useSecurityLoad, type Security } from "../../../_components/shared";

export default function EditSecurityRoute() {
  return (
    <FormPage<unknown, Security, unknown, unknown>
      rootTestId="investments-security-edit"
      id="investments-security-edit"
      title="Edit security"
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
          <EditSecurityForm
            key={ctx.record.id}
            security={ctx.record}
            onCancel={() => ctx.router.push(ctx.returnTo)}
            onSaved={(notice) => ctx.router.push(returnHref(ctx.returnTo, notice))}
          />
        ) : null
      }
    </FormPage>
  );
}
