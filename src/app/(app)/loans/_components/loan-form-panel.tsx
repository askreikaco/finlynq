"use client";

/**
 * LoanFormPanel: THE loan create / edit form. /loans/new and /loans/[id]/edit render it as a page; the /loans split view
 * renders it `embedded` in the pane. One component (FormPage + LoanForm), so fields, validation, requests and the delete
 * confirm are the same code in both. `embedded` only changes chrome (see FormPage).
 */
import { FormPage, type FormPageEmbedded } from "@/components/templates";
import { useDisplayCurrency } from "@/components/currency-provider";
import { LoanForm } from "./loan-form";
import type { LoanAccount } from "./loan-types";
import { useLoanEditLoad } from "./use-loan-edit-load";
import { useLoanNewLoad } from "./use-loan-new-load";

const LOANS_FALLBACK = "/loans";
const NO_ACCOUNTS: LoanAccount[] = [];

export interface LoanFormPanelProps {
  mode: "create" | "edit";
  /** Pane only: the loan id (the routes read it from the URL). */
  id?: string;
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

function toEmbedded(p: LoanFormPanelProps): FormPageEmbedded | undefined {
  return p.embedded ? { id: p.id, onSaved: p.onSaved, onCancel: p.onCancel, onDeleted: p.onDeleted } : undefined;
}

function CreateLoan(props: LoanFormPanelProps) {
  const { displayCurrency } = useDisplayCurrency();
  // Back / Cancel / success go to returnTo (same-app path only), else the loans list.
  return (
    <FormPage
      id="loan-new"
      entity="loan"
      embedded={toEmbedded(props)}
      title="New loan"
      fallbackReturn={LOANS_FALLBACK}
      form="external"
      useLoad={useLoanNewLoad}
      header={{ actions: null }}
    >
      {(ctx) => (
        <LoanForm
          mode="create"
          defaultCurrency={displayCurrency}
          accounts={ctx.extra ?? NO_ACCOUNTS}
          onCancel={ctx.cancel}
          onSaved={ctx.finish}
        />
      )}
    </FormPage>
  );
}

function EditLoan(props: LoanFormPanelProps) {
  return (
    <FormPage
      id="loan-edit"
      entity="loan"
      rootTestId="loan-edit-root"
      embedded={toEmbedded(props)}
      title="Edit loan"
      fallbackReturn={LOANS_FALLBACK}
      form="external"
      useLoad={useLoanEditLoad}
      states={{
        loading: { chrome: false, variant: "list", rows: 3 },
        error: { chrome: false, title: "Couldn't load loan", message: "We couldn't load this loan. Please try again.", retry: "refresh" },
        notFound: { chrome: false, kind: "error", title: "Loan not found", message: "This loan doesn't exist or was deleted.", retry: "returnTo" },
      }}
      delete={{
        label: "Delete loan",
        confirmTitle: "Delete loan",
        confirmLabel: "Delete loan",
        describe: (loan) => <>Are you sure you want to delete <strong>{loan.name}</strong>? This cannot be undone.</>,
        request: (loan) => fetch(`/api/loans?id=${loan.id}`, { method: "DELETE" }),
        after: LOANS_FALLBACK,
        errorStyle: "inline",
        keepOpenOnError: false,
        errorMessage: "Couldn't delete the loan",
      }}
    >
      {(ctx) =>
        ctx.record ? (
          <LoanForm
            key={ctx.record.id}
            mode="edit"
            loan={ctx.record}
            defaultCurrency={ctx.record.currency}
            accounts={ctx.extra ?? NO_ACCOUNTS}
            onCancel={ctx.cancel}
            onSaved={ctx.finish}
          />
        ) : null
      }
    </FormPage>
  );
}

export function LoanFormPanel(props: LoanFormPanelProps) {
  return props.mode === "edit" ? <EditLoan {...props} /> : <CreateLoan {...props} />;
}
