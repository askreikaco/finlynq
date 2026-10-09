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
- Default UI font is Geist via `--font-sans: var(--font-geist-sans)` (`globals.css:10-11`). Font selector maps `data-font` values `geist`, `inter`, `ibm-plex-sans`, `atkinson`, `system` to `--font-sans` (`globals.css:161-176`).
- Unlayered `html { font-family: var(--font-sans) }` (`globals.css:180-182`).
- Numerics pinned to Geist Mono: `.tabular-nums, [data-value]` (`globals.css:188-190`). Hero number uses sans (`globals.css:193-195`).
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
| `mobile/page-header.tsx` | `:55` PageHeader, `:159` OverflowMenu, `:26` HEADER_DESKTOP_ONLY, `:33` desktopClasses | Page title + back + primary action; secondary actions in "..." menu below md (`:45-54`) |
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
| QuickAddFAB | `src/components/quick-add-fab.tsx:15` | Fixed bottom-right round button (`:55`; doc `:11-12`); paths from `src/lib/quick-add/flag.ts:15` (`/dashboard`, `/transactions`) |

## 3. Rules

### 3a. Touch targets
- Target size is 44px. `min-h-11` is used for it (25 lines in `src/app` + `src/components`, grep run 2026-10-09). Tailwind v4 spacing 11 = 2.75rem = 44px. UNVERIFIED against built CSS.
- `ui/button.tsx` sizes: default `h-8 max-md:h-11` (`:26`), xs `h-6` (`:27`), sm `h-7 max-md:h-11` (`:28`), lg `h-9 max-md:h-11` (`:29`), icon `size-8 max-md:size-11` (`:30`), icon-xs `size-6` (`:31`, hit area via `max-md:before:-inset-2.5` `:31`), icon-sm `size-7 max-md:size-11` (`:34`), icon-lg `size-9 max-md:size-11` (`:35`).
- `PillButton` is h-9 visually; 44px hit area comes from `after:-inset-y-1` (`mobile/pill-button.tsx:7`). This differs from the `min-h-11` approach elsewhere (see 4).

### 3b. Form controls
- Below md (max-width 767.98px) all `input, textarea, select, [contenteditable="true"]` use `font-size: max(16px, 1em)` (`src/app/globals.css:574-578`). Reason in comment `:567-568` (no iOS auto-zoom).

### 3c. Numerics
- `tabular-nums lining-nums` on `.tabular-nums, td, th, [data-value]` (`globals.css:145-149`), on `.hero-number` (`:308-313`).
- Numbers render Geist Mono on md+ (`globals.css:188-190`); sans below md (`:199-201`).

### 3d. Titles and subtitles (PageHeader)
- Default title classes `text-2xl font-bold` (`mobile/page-header.tsx:61`); default subtitle `text-sm text-muted-foreground mt-1` (`:62`).
- Title base classes on the h1: `text-[28px]/9 font-extrabold tracking-tight max-md:flex ...` (`:95`). Below md the title is 28px/800 (`:31` doc, `:46` doc).
- Subtitle hidden below md: `hidden md:block` (`:118`).
- Secondary header actions carry `HEADER_DESKTOP_ONLY` (`max-md:hidden`, `:26`) and a matching `overflow` entry (`:52-53` doc). Overflow menu renders with `OverflowMenu` (`:151`, `:159`).
- Back link: `backHref` renders BackButton (`:104-113`, `:133-135`). `backLabel` defaults to "Back" (`back-button.tsx:10`).
- `desktopClasses(original)` re-emits original desktop classes with `md:` prefixes (`:33-43`).

### 3e. Adaptive guard (ratchet)
- Test: `tests/design-system-guard.test.ts`. Banned regex `:6`: `/md:hidden|hidden\s+md:|isMobile|window\.innerWidth/gi`.
- Scan roots: `src/app` and `src/components` (`:20-37`). Excluded: `src/components/ui/size-class.ts` and anything under `src/components/mobile/` (`:45-49`).
- Baseline: `tests/fixtures/adaptive-baseline.json` (13 files).
- Tests: no new files (`:76-82`), no count increase (`:84-99`), baseline must drop when usage drops (`:101-116`), no stale entries (`:118-128`), no zero entries (`:130-136`), scan non-empty (`:138-142`).
- Replica run (not vitest): 13 baseline entries match 13 scanned files, 43 total matches, no new/increased/stale entries (2026-10-09 scan, script in scratchpad).
- Note: `max-md:hidden` contains the substring `md:hidden`, so it is counted (see 4 and section 5).
- New code must not use `md:hidden`, `hidden md:`, `isMobile`, `window.innerWidth`.

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
- Whether `--font-geist-sans`, `--font-inter`, `--font-ibm-plex-sans`, `--font-atkinson` are defined (only referenced at `globals.css:11`, `:163`, `:166`, `:169`, `:172`).
- Rendered appearance of any token (no screenshots taken).
