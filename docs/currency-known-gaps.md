# Known Currency Display Gaps

Display components that fall back to hardcoded USD/CAD defaults when currency data missing.

## FIXED: Display Components Now Using displayCurrency Fallback

- ✓ **Mobile amount.tsx**: Now uses `currency?.trim() ? currency : (isLoading ? "USD" : displayCurrency)`
  - Preserves USD first-paint default (FINLYNQ-183)
  - Falls back to user's displayCurrency preference
  - Test: tests/components/amount-displaycurrency.test.tsx (7 tests, 2+ mutations caught)

- ✓ **Reconcile display - transactions-pane.tsx**: Now uses `r.currency?.trim() ? r.currency : displayCurrency`
  - Part of reconcile display group; others follow same pattern

## TO DO: Display Components with Hardcoded Fallbacks

- **Chat page.tsx**: InlineBarChart/InlinePieChart/InlineLineChart fall back to CAD (already receive displayCurrency from parent, skip per coordinator)
- **Sankey chart.tsx**: Falls back to CAD
- **Reconcile display** (4 more files): db-pane, file-pane, bank-pane, investment-op-preview-dialog use `formatCurrency(value, row.currency || "CAD")` - need pattern fix
- **Inbox display** (4 flows): row-card, auto-rule-banner, staged-row-editor, staged-review-surface use `formatCurrency(value, row.currency || "CAD")` - need pattern fix
- **Inbox reconcile dialog defaults**: inbox-to-approve-tab, inbox-to-categorize-tab, inbox-reconcile-tab (form init) use `payload.bankCurrency ?? snap?.currency ?? "CAD"` - need pattern fix
- **Inbox bulk sums**: inbox-reconcile-tab (line 754) uses `let currency = "CAD"` - need pattern fix

## Form/Control Components (Intentional)

- **FX rate-base selector**: USD is FX anchor
- **Holding edit form**: CAD form-state default
- **Data section import**: POST payload default
- **Onboarding/Transaction forms**: USD/CAD form defaults
