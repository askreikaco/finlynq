# Known Currency Display Gaps

Display components that fall back to hardcoded USD/CAD defaults when currency data missing.

## FIXED: Display Components Now Using displayCurrency Fallback

- ✓ **Mobile amount.tsx**: Now uses `currency?.trim() ? currency : displayCurrency`
  - Falls back to user's displayCurrency preference
  - Test: tests/components/amount-displaycurrency.test.tsx (7 tests with VND, CAD, whitespace edge cases)

- ✓ **Reconcile display - transactions-pane.tsx**: Now uses `r.currency?.trim() ? r.currency : displayCurrency`
  - TransactionsPane render test with real CurrencyProvider validates behavior

## Display Components with Hardcoded Fallbacks (TO DO)

- **Reconcile display** (4 files): db-pane, file-pane, bank-pane, investment-op-preview-dialog
- **Inbox display**: row-card, auto-rule-banner, staged-row-editor, staged-review-surface (lines 864, 946), active-currencies-section
- **Inbox reconcile dialog**: inbox-to-approve-tab, inbox-to-categorize-tab, inbox-reconcile-tab
- **API docs**, **Weekly recap**
- **Chat page.tsx**: InlineBarChart/InlinePieChart/InlineLineChart (skip per WP1)
- **Sankey chart.tsx**: Falls back to CAD

All use pattern `|| "CAD"` or similar hardcoded defaults requiring fix to `?.trim() ? currency : displayCurrency`.

## Form/Control Components (Intentional)

- **FX rate-base selector**: USD is FX anchor
- **Holding edit form**: CAD form-state default
- **Data section import**: POST payload default
- **Onboarding/Transaction forms**: USD/CAD form defaults
