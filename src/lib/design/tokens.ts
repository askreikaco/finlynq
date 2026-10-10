// Design tokens: TS mirror of the CSS source of truth in src/app/globals.css (spec 2.1).
// Numbers are px (1rem = 16px). tests/design/tokens-parity.test.ts parses globals.css and
// asserts every value here matches. Chrome code uses TW.* or var(--*), never literals.

export const TOKENS = {
  hitMin: 44,
  barCtlH: 44,
  phoneHeaderH: 60,
  tabBarH: 64,
  tabBarInset: 16,
  tabBarRadius: 28,
  tabLabelSize: 10,
  row: 44,
  rowTall: 48,
  rowLabelW: 112,
  rowLabelNarrowW: 96,
  groupRadius: 14.4,
  formW: 576,
  sectionW: 672,
  reportW: 768,
} as const;

export const TW = {
  row: "min-h-row",
  rowTall: "min-h-row-tall",
  rowLabel: "w-row-label",
  rowLabelNarrow: "w-row-label-narrow",
  group: "rounded-group",
  form: "max-w-form",
  section: "max-w-section",
  report: "max-w-report",
  formPad: "pb-[var(--form-bottom-pad)]",
} as const;
