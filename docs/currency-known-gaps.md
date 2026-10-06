# Known Currency Display Gaps

This document tracks display components that still fall back to hardcoded USD/CAD defaults when no currency prop is provided. These are follow-up work items for currency provider integration.

## Display Components with Hardcoded Fallbacks

- **Mobile amount.tsx**: Falls back to USD when currency prop missing
- **Chat page.tsx**: Three inline chart components (InlineBarChart, InlinePieChart, InlineLineChart) fall back to CAD
- **Sankey chart.tsx**: Falls back to CAD when currency prop missing

## Form/Control Components (Intentional Hardcodes)

- **FX rate-base selector** (fx-overrides-section.tsx): USD is the FX anchor, not a display fallback
- **Holding edit form** (holding-edit-form.tsx): CAD is the initial form-state default, not a display path
- **Reconcile surfaces**: CAD defaults are data-layer row defaults, not display decisions

## Library/API Literals

- Provider USD first paint before session loads
- lib/api literals in form initialization
- ~20 additional display-path literals across components

See projects/finlynq/currency-followups.md for the full tracking list.
