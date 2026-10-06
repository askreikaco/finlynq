# Known Currency Display Gaps

Display components that fall back to hardcoded USD/CAD defaults when currency data missing.

## Display Components with Hardcoded Fallbacks

- **Mobile amount.tsx**: Falls back to USD
- **Chat page.tsx**: InlineBarChart/InlinePieChart/InlineLineChart fall back to CAD
- **Sankey chart.tsx**: Falls back to CAD
- **Reconcile display** (5 files): db-pane, file-pane, bank-pane, transactions-pane, investment-op-preview-dialog use `formatCurrency(value, row.currency || "CAD")`
- **Inbox display** (4 flows): row-card, auto-rule-banner, staged-row-editor, staged-review-surface use `formatCurrency(value, row.currency || "CAD")`
- **Inbox reconcile dialog defaults**: inbox-to-approve-tab, inbox-to-categorize-tab, inbox-reconcile-tab (form init) use `payload.bankCurrency ?? snap?.currency ?? "CAD"`
- **Inbox bulk sums**: inbox-reconcile-tab (line 754) uses `let currency = "CAD"`

## Form/Control Components (Intentional)

- **FX rate-base selector**: USD is FX anchor
- **Holding edit form**: CAD form-state default
- **Data section import**: POST payload default
- **Onboarding/Transaction forms**: USD/CAD form defaults
