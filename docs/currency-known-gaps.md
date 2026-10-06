# Known Currency Display Gaps

Display components that fall back to hardcoded USD/CAD defaults. Follow-up work items for currency provider integration.

## Display Components with Hardcoded Fallbacks

- **Mobile amount.tsx**: Falls back to USD when currency prop missing
- **Chat page.tsx**: InlineBarChart/InlinePieChart/InlineLineChart fall back to CAD
- **Sankey chart.tsx**: Falls back to CAD when currency prop missing
- **Reconcile/Inbox display**: row-card, auto-rule-banner, staged-row-editor, staged-review-surface, inbox tabs bulk sums (all use `formatCurrency(value, row.currency || "CAD")`)

## Form/Control Components (Intentional Hardcodes)

- **FX rate-base selector** (fx-overrides-section.tsx): USD is FX anchor, not display
- **Holding edit form** (holding-edit-form.tsx): CAD is form-state default
- **Data section import** (data-section.tsx): POST payload default (data layer)
- **Onboarding/Transaction forms**: USD/CAD form-only defaults

## Library/API Literals

- Provider USD first paint before session loads
- lib/api literals in form initialization
