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
  docW: 896,
  consoleW: 1280,
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
  doc: "max-w-doc",
  console: "max-w-console",
  /** Independent cards on desktop: 1 col phone, 2 at regular, 3 at wide. A full-row card adds col-span-full. */
  grid3: "grid grid-cols-1 items-start gap-6 regular:grid-cols-2 wide:grid-cols-3",
  /** Prose line length for text-heavy doc pages (the prose element only, never the page root). */
  prose: "max-w-prose",
  formPad: "pb-[var(--form-bottom-pad)]",
  formPadMax: "pb-[var(--form-bottom-pad-max)]",
  blurSoft: "blur-soft",
} as const;
