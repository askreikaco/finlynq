# Finlynq design system spec

Base: `99e332df` (branch `wave4/w4-4-5-docs`). Written 2026-10-09 (UTC+7 VN).
Every fact cites `file:line` opened at the base sha. Items that were not checked are marked UNVERIFIED.
Line numbers differ from earlier briefs where noted in section 4.

## 1. Tokens

Stack: Tailwind v4 (`package.json:85` `"tailwindcss": "^4"`). There is no `tailwind.config.*` in the repo (checked). All tokens are CSS-first in `src/app/globals.css`.

| Item | Where |
|---|---|
| Entry imports (tailwindcss, tw-animate-css, shadcn) | `src/app/globals.css:1-3` |
| Dark variant | `src/app/globals.css:5` `@custom-variant dark (&:is(.dark *))` |
| `@theme inline` block (color and radius mapping) | `src/app/globals.css:7-51` |
| Radius scale `--radius-sm..4xl` = `calc(var(--radius) * k)` | `src/app/globals.css:44-50` |
| Base radius `--radius: 0.5rem` | `src/app/globals.css:82` |
| Light tokens on `:root` | `src/app/globals.css:57-91` |
| Dark tokens on `.dark` | `src/app/globals.css:93-126` |
| Semantic aliases `--color-pos` (= chart-2), `--color-neg` (= destructive) | `src/app/globals.css:30-31` |
| Chart tokens light / dark | `src/app/globals.css:77-81` / `:113-117` |
| Safe-area vars `--sat --sab --sal --sar` | `src/app/globals.css:542-547` |
| Body reserves safe-area padding | `src/app/globals.css:132-141` |

Light and dark token names (values at the lines given):

| Token | Light | Dark |
|---|---|---|
| background / foreground | `:59` / `:60` | `:95` / `:96` |
| card / popover | `:61` / `:63` | `:97` / `:99` |
| primary (amber, shared by ring and sidebar-primary) | `:65` | `:101` |
| secondary / muted / accent | `:67` / `:69` / `:71` | `:103` / `:105` / `:107` |
| muted-foreground | `:70` | `:106` |
| destructive | `:73` | `:109` |
| border / input | `:74` / `:75` | `:110` / `:111` |
| chart-1..5 | `:77-81` | `:113-117` |
| sidebar-* | `:83-90` | `:118-125` |

Chart meaning (dark comments): chart-1 amber, chart-2 teal (positive), chart-3 coral (negative), chart-4 muted blue, chart-5 muted violet (`globals.css:113-117`).

Font rules:
- Default UI font is the system stack (`--font-stack-sans`, `globals.css`). No web fonts (next/font removed 2026-10-09). Font selector maps `data-font` values `rounded`, `serif`, `mono` to `--font-ui`; default = no attribute.
- Unlayered `html { font-family: var(--font-sans) }` (`globals.css:180-182`).
- Numerics pinned to system mono: `.tabular-nums, [data-value]` (`--font-stack-mono`). Hero number uses `--font-ui`.
- Below md (`width < 48rem`) amounts switch to sans with tabular figures (`globals.css:197-201`). `main .font-mono` is also switched to sans there, with opt-outs for pre/code/kbd/samp, `.break-all`, `.select-all`, `[data-keep-mono]` (`globals.css:202-208`).

Breakpoint: `md` = 48rem (768px). `globals.css:198` and `:225` use the same `width < 48rem` boundary. Form-control rule uses `max-width: 767.98px` (`globals.css:574`).

## 2. Components

### 2a. `src/components/ui/*` (shadcn-style primitives, desktop-first)

| File | Export (file:line) | Purpose (from export only) |
|---|---|---|
| `ui/accordion.tsx` | `:97` | Accordion, AccordionItem |
| `ui/alert.tsx` | `:60` | Alert, AlertTitle, AlertDescription |
| `ui/badge.tsx` | `:52` | Badge, badgeVariants |
| `ui/button.tsx` | `:61` (cva `:8-43`, sizes `:24-36`) | Button; touch sizes via `max-md:h-11` / `max-md:size-11` |
| `ui/card.tsx` | `:95` | Card family |
| `ui/checkbox.tsx` | `:6`, `:31` | Checkbox |
| `ui/column-filter.tsx` | `:46`, `:55` | ColumnFilterPopover |
| `ui/combobox.tsx` | `:51`, `:274`, `:399` | Combobox types and exports |
| `ui/confirm-dialog.tsx` | `:29`, `:49` | ConfirmDialog |
| `ui/data-table.tsx` | `:57`, `:94`, `:153`, `:414` | DataTable, DataTableColumn, compareValues |
| `ui/dialog.tsx` | `:146` | Dialog family |
| `ui/dropdown-menu.tsx` | `:255` | DropdownMenu family (used by OverflowMenu, page-header.tsx:8-13) |
| `ui/group-combobox.tsx` | `:16` | GroupCombobox |
| `ui/input.tsx` | `:20` | Input |
| `ui/label.tsx` | `:20` | Label |
| `ui/lazy-view.tsx` | `:37` | LazyView |
| `ui/pagination.tsx` | `:33`, `:67` | Pagination, getPageNumbers |
| `ui/progress.tsx` | `:77` | Progress |
| `ui/select.tsx` | `:226` | Select family |
| `ui/separator.tsx` | `:25` | Separator |
| `ui/sheet.tsx` | `:126` | Sheet family |
| `ui/size-class.ts` | `:11` `sizeClassFor(width)`, `:22` `useSizeClass(ref)` | compact <640, regular 640-1024, wide >1024 (`:8-9` doc) |
| `ui/switch.tsx` | `:29` | Switch |
| `ui/table.tsx` | `:107` | Table family |
| `ui/tabs.tsx` | `:82` | Tabs family |

### 2b. `src/components/mobile/*` (native-style layer, below md)

Barrel: `src/components/mobile/index.ts:1-14`.

| File | Export (file:line) | Purpose |
|---|---|---|
| `mobile/page-header.tsx` | PageHeader, OverflowMenu, HEADER_SECONDARY (alias HEADER_DESKTOP_ONLY) | One header for all sizes (see 3d); secondary actions in "..." menu below regular |
| `mobile/back-button.tsx` | `:8` BackButton | 44px back link (`min-h-11 min-w-11`, `:23`) |
| `mobile/pill-button.tsx` | `:12` PillButton | Header pill; visual h-9 with 44px hit area via `after:-inset-y-1` (`:6-7`) |
| `mobile/list-row.tsx` | `:41` ListRow, `:13` ListRowProps | Native list row, min-h 56px (`:37-39` doc) |
| `mobile/section-card.tsx` | `:6` SectionCard | Card with optional uppercase label (`:5` doc) |
| `mobile/section-label.tsx` | `:5` SectionLabel | 12/700 uppercase muted label (`:4` doc) |
| `mobile/stat-tile.tsx` | `:6` StatTile | Compact stat replacing tall icon cards below md (`:5` doc) |
| `mobile/amount.tsx` | `:34` Amount, `:17` amountToneClass | Money amount, tabular, sign color (`:16`, `:25-26` doc) |
| `mobile/metric-grid.tsx` | `:14` MetricGrid | Grid of metrics |
| `mobile/net-worth-hero.tsx` | `:10` NetWorthHero | Hero total block |
| `mobile/account-row.tsx` | `:18` AccountRow | Account list row |
| `mobile/holding-row.tsx` | `:10` HoldingRow | Holding list row |
| `mobile/detail-sheet.tsx` | `:6` DetailItem, `:15` DetailSheet | Sheet listing every field a row omits |
| `mobile/customize-dashboard-sheet.tsx` | `:11` DashboardCard, `:23` CustomizeDashboardSheet | Dashboard card picker sheet |

Excluded from the adaptive guard scan (see 3e).

### 2c. Shells, states, navigation

| Component | Where | Purpose |
|---|---|---|
| Nav (desktop sidebar) | `src/components/nav.tsx:145` (sidebar `:289-296`, `hidden md:flex`) | Desktop-only sidebar; links via `renderLink` (`:246`) |
| MobileBottomBar | `src/components/nav.tsx:423` (`<nav>` `:426`) | Below-md bar; classes `md:hidden fixed ... mobile-glass-bar` |
| `.mobile-glass-bar` css | `src/app/globals.css:280-289` | Opaque `--sidebar` fallback (no backdrop-filter / color-mix / reduced transparency) |
| SettingsShell | `src/components/settings-shell.tsx:98` | Settings layout; mobile pill row `md:hidden` (`:105-109`) |
| AccountShell | `src/components/account-shell.tsx:32` | Account layout; renders PageHeader "Account" (`:51`) |
| ErrorState | `src/components/error-state.tsx:12` | role=alert block with optional "Try again" (`min-h-11`, `:32`) |
| EmptyState | `src/components/empty-state.tsx:19` | Icon, title, description, optional action |
| PageSkeleton | `src/components/page-skeleton.tsx:10` (`variant` type `:6-7`) | Shimmer skeleton, variants table / cards / list |
| PageFab | `src/components/mobile/page-fab.tsx` | Per-page FAB (mobile only, `md:hidden`); mounted once in `(app)/layout.tsx`; action from `fab-registry.ts` `FAB_ROUTES` |

## 3. Rules

### 3a. Touch targets
- Target size is 44px. `min-h-11` is used for it (25 lines in `src/app` + `src/components`, grep run 2026-10-09). Tailwind v4 spacing 11 = 2.75rem = 44px. UNVERIFIED against built CSS.
- Touch sizes are pointer-based (G2-14e), not viewport: `ui/button.tsx` default/sm/lg `h-8 pointer-coarse:h-11`, icon sizes `size-8 pointer-coarse:size-11`, xs/icon-xs keep the 44px hit area via `pointer-coarse:before:-inset-2.5`. Compact density: `dense:pointer-fine:h-7`. `pointer-coarse` is 44px on every coarse device (iPad included). Input/Select/Combobox use the same pattern (`pointer-coarse:h-11`, text `text-base regular:pointer-fine:text-sm`).
- Caller overrides on primitives must use the base's modifier (`regular:pointer-fine:*`, `pointer-coarse:*`). A plain `md:`/`max-md:` override does not merge with the base. Guard: `tests/components/ui-caller-overrides.test.ts` (G2-15).
- `PillButton` is h-9 visually; 44px hit area comes from `after:-inset-y-1` (`mobile/pill-button.tsx:7`). This differs from the `min-h-11` approach elsewhere (see 4).

### 3b. Form controls
- Below md (max-width 767.98px) all `input, textarea, select, [contenteditable="true"]` use `font-size: max(16px, 1em)` (`src/app/globals.css:574-578`). Reason in comment `:567-568` (no iOS auto-zoom).

### 3c. Numerics
- `tabular-nums lining-nums` on `.tabular-nums, td, th, [data-value]` (`globals.css:145-149`), on `.hero-number` (`:308-313`).
- Numbers render system mono on md+; UI font below md.

### 3d. Titles, subtitles, actions (PageHeader, G2-07)
- One component, phone design as base. Below regular (640px) = `max-regular:` classes; regular+ = base/`regular:` classes. `mobile/page-header.tsx` has no `md:` tokens.
- Title: below regular `text-base font-semibold` (`PHONE_BAR_TITLE`); regular+ `text-3xl/9 font-extrabold` (`HEADER_TITLE_CLASS`). 28/800 has no system size, so text-3xl is used (owner D4).
- Subtitle: visible at every size. Below regular a truncated `text-xs` line; regular+ `text-sm` (`HEADER_SUBTITLE_CLASS`).
- `titleClassName` / `subtitleClassName`: `@deprecated` no-ops, still accepted and ignored. `desktopClasses()` removed.
- Secondary actions: `HEADER_SECONDARY` = `max-regular:hidden`; below regular they go to the `overflow` menu. `HEADER_DESKTOP_ONLY` is an alias of the same value.
- Primary action: icon-only 44px circle below regular (`phone-icon-action`, globals.css `width < 40rem`); label visible from regular.
- Bar: sticky at every size (D5). Glass only below regular; opaque `regular:bg-background/90` from regular. `className` / `actionsClassName` stay caller-owned at every size.
- Back link: `backHref` renders BackButton at every size. `backLabel` defaults to "Back" (`back-button.tsx`).
- Overflow trigger: `regular:hidden`.

### 3e. Adaptive guard (ratchet)
- Test: `tests/design-system-guard.test.ts`. Banned regex (`tests/helpers/adaptive-scan.ts` `BANNED_PATTERN`): `md:hidden|hidden md:|hidden max-md:|isMobile|window.innerWidth|matchMedia|useMediaQuery`.
- Scan roots: `src/app` and `src/components`. Excluded: `src/components/ui/size-class.ts`, `src/components/mobile/`.
- Baseline `tests/fixtures/adaptive-baseline.json` (13 files, banned patterns). Rules: no new files, no count increase, must lower when usage drops, no stale or zero entries.
- Breakpoint ratchet `tests/fixtures/breakpoint-baseline.json` (G2-15: 1 file, 2 tokens; the only hits are `sm:`/`lg:` object keys in `ui/button.tsx`). Token regex `BREAKPOINT_PATTERN`: `sm|md|lg|xl|2xl` with optional `max-`, not preceded by word char, `@`, `.` or `-`. Container tokens (`@md:`) and `CLAUDE.md:` are not counted.
- Caller overrides on primitives: `tests/components/ui-caller-overrides.test.ts` (G2-15). AST scan of className on Input/Select/SelectTrigger/Combobox/GroupCombobox/Button/TabsList/TabsTrigger. No viewport variant without a pointer modifier, except the 5-entry `EXCEPTIONS` list (width/display only). No viewport size/text override without a pointer modifier.
- Size-class wrapper ratchet: `tests/fixtures/size-class-wrapper-baseline.json`.
- New code must not use `md:hidden`, `hidden md:`, `isMobile`, `window.innerWidth`. Use `regular:`, `wide:`, `max-regular:`.
- `max-md:hidden` contains `md:hidden` and is counted (see 4 and section 5).

### 3f. Size classes (G2-01)
- Variants `regular:` (`@media (width >= 40rem)`) and `wide:` (`@media (width > 64rem)`) in `globals.css`. Thresholds mirror `sizeClassFor()` (`ui/size-class.ts`: compact <640, regular 640-1024, wide >1024).
- Viewport based by design: `container-type` applies layout containment, so a size container on `<main>` or the shell would become the containing block for `position:fixed` descendants (tab bar, page FAB, banners, toasts). Do not add `@container/app` or `container-type` to the shell or main.
- JS-only cases: `AppSizeClassProvider` / `useAppSizeClass()` (`components/adaptive/size-class-context.tsx`) measure `documentElement.clientWidth` (viewport, layout effect + ResizeObserver on `<html>`), same thresholds as CSS.
- Known gap: `clientWidth` excludes a classic (non-overlay) scrollbar while `@media` includes it, so on desktops with classic scrollbars JS and CSS can differ by the scrollbar width near 640 and 1024px.
- Pinned by `tests/components/adaptive/size-class-css.test.ts`.

### 3g. App tabs (G2-04)
- `AppTabs` (`components/nav.tsx`): one tab list (registry mobileBar tabs + More), two layouts.
- Below 640px: floating glass bar, `regular:hidden`. From 640px: fixed left rail `hidden regular:flex`, width `5rem + --sal`, icon over label (`mobile-tab-label`), active = `mobile-glass-pill`.
- Bar hidden on full-screen entry routes (`isTabBarHidden`); the rail is never hidden.
- No groups, collapse toggle, admin group or account switcher. Admin entries are reached from More (`surfaces` include `more`).
- One unread dot on More (announcements + feedback unread), both layouts.
- Shell (`(app)/layout.tsx` main): `regular:pb-0 regular:pl-[calc(5rem+var(--sal))]`.

## 4. Inconsistencies

Each item was re-checked at the base sha. Counts come from grep runs on `src/app` + `src/components` on 2026-10-09.

1. Hard-coded rose palette in ErrorState, not the destructive token. `src/components/error-state.tsx:24` `bg-rose-100 dark:bg-rose-950/40`, `:25` `text-rose-500`. The destructive token exists at `src/app/globals.css:73` (light) and `:109` (dark). (Earlier brief cited lines 21-22; actual lines are 24-25.)

2. Title class variants (`titleClassName=`, 77 occurrences in total). Distribution (uniq count):
   - `text-2xl font-bold tracking-tight`: 24
   - `text-sm text-muted-foreground mt-0.5` (subtitle-style classes passed as titleClassName): 14
   - `text-2xl font-semibold`: 8
   - `text-sm text-muted-foreground mt-1` (subtitle-style classes passed as titleClassName): 6
   - `text-sm text-muted-foreground` (subtitle-style classes passed as titleClassName): 4
   - `text-2xl font-semibold tracking-tight`: 4
   - `text-xl font-semibold tracking-tight`: 3, at `src/app/(app)/transactions/audit/page.tsx:111`, `src/app/(app)/import/pending/_components/reconcile-header.tsx:70`, `src/app/(app)/dashboard/page.tsx:540`
   - `text-2xl sm:text-3xl font-bold`: 3, at `family/share/page.tsx:16`, `family/page.tsx:31`, `family/accept/page.tsx:13`
   - `text-2xl font-bold`: 3
   - `text-2xl font-bold text-foreground`: 2
   - `text-[13px] text-muted-foreground mt-0.5`: 1 (`dashboard/page.tsx:541` is a subtitleClassName; the titleClassName copy is a separate line)
   - `text-3xl font-bold text-zinc-900 dark:text-zinc-50`: 1, `src/app/(app)/api-docs/page.tsx:567` (zinc palette, not the amber token system)
   - `text-3xl font-bold mb-2 flex items-center gap-2`, `text-2xl font-bold truncate`, `text-2xl font-bold flex items-center gap-2`: 1 each
   - `mt-1 text-sm text-muted-foreground`: 1
   Note: `src/app/releases/[version]/page.tsx:110` also has `text-xl font-semibold tracking-tight` but it is a plain h2, not PageHeader, so it is excluded from the count of 3.

3. Subtitle class variants (`subtitleClassName=`, 26 occurrences): `text-sm text-muted-foreground mt-0.5` 14, `text-sm text-muted-foreground mt-1` 6, `text-sm text-muted-foreground` 4, `text-[13px] text-muted-foreground mt-0.5` 1 (`dashboard/page.tsx:541`), `mt-1 text-sm text-muted-foreground` 1. The PageHeader default is `mt-1` (`mobile/page-header.tsx:62`), while AccountShell uses `mt-0.5` (`account-shell.tsx:57`).

4. Legacy hue-265 palette in globals.css vs the amber token system. Header comment says "warm amber accent" and "no drop shadows" (`src/app/globals.css:53-55`). The file still uses hue 265 blue in: dot grid `:217,:221`; ambient glow `:257`; glass `:273`; shimmer `:332-344`; card hover shadow `:366`; gradient border `:380`; glow card `:401-415`; mouse glow `:459`; glow ring `:474,:477`; tooltip `:488,:495`; scrollbar `:515-525`; selection `:533,:536`. Drop shadows also remain: `:277`, `:359-361`, `:490-500`.

5. Arbitrary text sizes. `text-[Npx]` appears on 443 lines in 121 files under `src/app` + `src/components` (grep `text-\[[0-9.]+px\]`). Example: `dashboard/page.tsx:541` `text-[13px]`; `mobile/page-header.tsx:95` `text-[28px]/9`.

6. Native `alert()` for errors, not the Dialog/Alert primitives: `src/app/(app)/transactions/_components/transactions-workspace.tsx:564` and `:583`.

7. Touch target approach differs. PillButton is `h-9` (`mobile/pill-button.tsx:7`) with a pseudo-element hit area. Everywhere else the rule is `min-h-11` (25 lines) or `max-md:h-11` in `ui/button.tsx`.

8. Admin env pages render two PageHeaders. `src/app/(app)/admin/(env)/layout.tsx:53` renders PageHeader "Environment"; the child pages (for example `admin/(env)/api-log/page.tsx:192`) render their own PageHeader. Verified from source; the rendered result is UNVERIFIED.

9. Checked and NOT an inconsistency: `nav.tsx:261` and `nav.tsx:367` use `size-9` (36px). Both are inside the sidebar that is `hidden md:flex` (`nav.tsx:291-296`). They are called only from sidebar code (`renderLink` callers at `:329`, `:340`, `:389`; admin link inside the sidebar block). Desktop-only, so excluded from the touch-target list.

10. Guard regex counts `max-md:hidden`. Confirmed by the replica scan: `src/app/(app)/transactions/_components/transactions-workspace.tsx:729` and `:859`, `portfolio/page.tsx:262`, `:272`, `:303` are counted. Whether that is intended is UNVERIFIED (guard comment does not say).

## 5. UNVERIFIED items
- Tailwind v4 spacing values (`min-h-11` = 44px) against built CSS.
- Rendered result of stacked admin PageHeaders (section 4 item 8).
- Whether `max-md:hidden` counting in the guard is intended (section 4 item 10).
- Vitest run of `tests/design-system-guard.test.ts`: NOT run. The worktree has no `node_modules` and `npm install`/`npm ci` is out of scope for this task. The replica scan in 3e is the substitute.
- Resolved 2026-10-09: web fonts removed; system stacks only.
- Rendered appearance of any token (no screenshots taken).
- TODO PWA icons: `src/app/manifest.ts` `any` and `maskable` entries both point to the same unpadded `public/icons/icon-192.png` and `icon-512.png`. A padded maskable asset (logo inside central 80% safe zone) is needed; until then Android masks may crop the logo. Do not point maskable at a non-existent file.

## 6. W6 update (2026-10-09, tip 9b731f5)
- Section 4 item 1 (ErrorState rose): fixed in W5-9. Item 8 (stacked admin env headers): fixed in W6-02 (layout header removed; child pages own the title).
- New tokens --pos/--warning/--info (globals.css :root and .dark; @theme --color-pos/--color-warning/--color-info). Palette scan: files=0 hits=0.
- animate-pulse occurrences left (activity indicators only): 5.
- Out of scope, unchanged: text-[Npx] arbitrary sizes, native confirm(), text-white/bg-white, `hidden md:*` adaptive baseline (9 files / 31).
