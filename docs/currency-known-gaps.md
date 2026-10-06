# Known Currency Display Gaps

Display components that fall back to hardcoded USD/CAD defaults when currency data missing.

## FIXED: Display Components Now Using displayCurrency Fallback

- ✓ **Mobile amount.tsx**: Now uses `currency?.trim() ? currency : displayCurrency`
  - Falls back to user's displayCurrency preference
  - Test: tests/components/amount-displaycurrency.test.tsx (12 tests: explicit currency, empty/whitespace fallback, VND, CAD, EUR/VND discrimination, size/tone/showSign)

- ✓ **Reconcile display - transactions-pane.tsx**: Now uses `r.currency?.trim() ? r.currency : displayCurrency`
  - Falls back to user's displayCurrency preference instead of hardcoded CAD
  - Test: tests/components/TransactionsPane.test.tsx (5 tests: explicit currency, empty string fallback, whitespace fallback, never CAD, CAD displayCurrency)

## Display Components with Hardcoded Fallbacks (TO DO)

Remaining display fallbacks using `||` and `??` patterns:

- **src/components/import/reconcile/db-pane.tsx**: lines 267, 280, 296 (3 occurrences)
- **src/components/import/reconcile/file-pane.tsx**: lines 288, 300 (2 occurrences)
- **src/components/reconcile/bank-pane.tsx**: line 268
- **src/components/reconcile/investment-op-preview-dialog.tsx**: line 65
- **src/components/inbox/auto-rule-banner.tsx**: line 129
- **src/components/inbox/row-card.tsx**: lines 199, 212
- **src/components/staging/staged-row-editor.tsx**: line 301
- **src/components/import/staged-review-surface.tsx**: lines 864, 946
- **src/components/inbox/inbox-reconcile-tab.tsx**: line 668
- **src/components/inbox/inbox-to-approve-tab.tsx**: line 500
- **src/components/inbox/inbox-to-categorize-tab.tsx**: line 451
- **src/components/sankey-chart.tsx**: line 39 (default parameter)
- **src/app/(app)/chat/page.tsx**: lines 84, 147, 182 (skip per WP1)

All require fix to `?.trim() ? currency : displayCurrency` pattern. Form defaults (`currency: "CAD"` in state, default parameters) are intentional and out of scope.

## Form/Control Components (Intentional)

- **FX rate-base selector**: USD is FX anchor
- **Holding edit form**: CAD form-state default
- **Data section import**: POST payload default
- **Onboarding/Transaction forms**: USD/CAD form defaults
