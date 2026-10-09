# Page inventory: src/app/(app)

Base `99e332df` (branch `wave4/w4-4-5-docs`). Generated 2026-10-09 (UTC+7 VN). Scope: every `page.tsx` under `src/app/(app)`. Source-only; no rendering was run, no screenshots.

## Counts

| check | value |
|---|---|
| `find "src/app/(app)" -name page.tsx \| sort \| wc -l` | 100 |
| table rows below (route rows) | 100 |
| pages with own `<PageHeader` in page.tsx | 66 |
| pages with PageHeader only via an imported module or alias | 12 |
| pages with header from a layout only | 3 |
| pages with no PageHeader found | 7 |
| pages with ErrorState (direct or via imports) | 10 |
| pages with PageSkeleton (direct or via imports) | 11 |
| pages that re-export another page module | 7 |

Pages with ErrorState: `/accounts/[id]`, `/accounts`, `/budgets`, `/categories/[id]`, `/categories`, `/dashboard`, `/goals`, `/loans`, `/settings/investments`, `/subscriptions`.

Pages with PageSkeleton: `/budgets`, `/categories/[id]`, `/categories`, `/goals`, `/reports`, `/settings/investments`, `/subscriptions`.

## Method

- Layouts: `src/app/(app)/layout.tsx` (all pages), `settings/layout.tsx` (SettingsShell), `account/layout.tsx` (AccountShell), `admin/(env)/layout.tsx` (EnvLayout). Layout header sources: `src/components/account-shell.tsx:51` (PageHeader), `src/app/(app)/admin/(env)/layout.tsx:53` (PageHeader). `src/components/settings-shell.tsx` renders no PageHeader.
- `direct`: match inside the page.tsx file. `via import`: match in a module reached by relative or `@/` imports, depth up to 3, from the page. Depth-3 closure is an upper bound, not a render trace.
- `alias`: page.tsx is `export { default } from "..."` of another page, so the rendered header is the target's. Targets are listed in the notes column.
- `backLabel`/`backHref` columns only count matches in the page file itself.
- Rows cover all 69 files; no page was skipped.

## Table

| route | file | layout chain | header (PageHeader) | loading (PageSkeleton) | error (ErrorState) | notes |
|---|---|---|---|---|---|---|
| `/account/info` | `src/app/(app)/account/info/page.tsx` | app > account/layout.tsx (AccountShell) | no (layout only: account-shell.tsx:51) | no | no | AccountShell header (account-shell.tsx:51) |
| `/account` | `src/app/(app)/account/page.tsx` | app > account/layout.tsx (AccountShell) | no (layout only: account-shell.tsx:51) | no | no | AccountShell header (account-shell.tsx:51) |
| `/account/security` | `src/app/(app)/account/security/page.tsx` | app > account/layout.tsx (AccountShell) | no (layout only: account-shell.tsx:51) | no | no | AccountShell header (account-shell.tsx:51) |
| `/accounts/[id]` | `src/app/(app)/accounts/[id]/page.tsx` | app | yes (page.tsx:526) | no | yes (page.tsx:470) | - |
| `/accounts/groups` | `src/app/(app)/accounts/groups/page.tsx` | app | yes (page.tsx:56) | no | yes (page.tsx:63) | list body: _components/manage-groups-panel.tsx |
| `/accounts` | `src/app/(app)/accounts/page.tsx` | app | yes (page.tsx:377) | no | yes (page.tsx:351) | - |
| `/accounts/new` | `src/app/(app)/accounts/new/page.tsx` | app | yes (page.tsx:56) | no | no | - |
| `/accounts/[id]/edit` | `src/app/(app)/accounts/[id]/edit/page.tsx` | app | yes (page.tsx) | no | no | edit form: _components/account-form.tsx |
| `/admin/(env)/api-log` | `src/app/(app)/admin/(env)/api-log/page.tsx` | app > admin/(env)/layout.tsx (EnvLayout) | yes (page.tsx:192); + layout PageHeader (admin/(env)/layout.tsx:53) | no | no | stacked under layout PageHeader (admin/(env)/layout.tsx:53) |
| `/admin/(env)/diagnostics` | `src/app/(app)/admin/(env)/diagnostics/page.tsx` | app > admin/(env)/layout.tsx (EnvLayout) | yes (page.tsx:215); + layout PageHeader (admin/(env)/layout.tsx:53) | no | no | stacked under layout PageHeader (admin/(env)/layout.tsx:53) |
| `/admin/(env)/integrations` | `src/app/(app)/admin/(env)/integrations/page.tsx` | app > admin/(env)/layout.tsx (EnvLayout) | yes (page.tsx:247); + layout PageHeader (admin/(env)/layout.tsx:53) | no | no | stacked under layout PageHeader (admin/(env)/layout.tsx:53) |
| `/admin/(env)/price-cache` | `src/app/(app)/admin/(env)/price-cache/page.tsx` | app > admin/(env)/layout.tsx (EnvLayout) | yes (page.tsx:293); + layout PageHeader (admin/(env)/layout.tsx:53) | no | no | stacked under layout PageHeader (admin/(env)/layout.tsx:53) |
| `/admin/(env)/system` | `src/app/(app)/admin/(env)/system/page.tsx` | app > admin/(env)/layout.tsx (EnvLayout) | yes (page.tsx:415); + layout PageHeader (admin/(env)/layout.tsx:53) | no | no | stacked under layout PageHeader (admin/(env)/layout.tsx:53) |
| `/admin/announcements` | `src/app/(app)/admin/announcements/page.tsx` | app | yes (page.tsx:153) | no | no | - |
| `/admin/email-inbox` | `src/app/(app)/admin/email-inbox/page.tsx` | app | yes (page.tsx:148) | no | no | - |
| `/admin/env` | `src/app/(app)/admin/env/page.tsx` | app | no (layout only: admin/(env)/layout.tsx:53) | no | no | - |
| `/admin/feedback` | `src/app/(app)/admin/feedback/page.tsx` | app | yes (page.tsx:389) | no | no | - |
| `/admin/inbox` | `src/app/(app)/admin/inbox/page.tsx` | app | yes (page.tsx:250) | no | no | - |
| `/admin/instance` | `src/app/(app)/admin/instance/page.tsx` | app | yes (page.tsx:131) | no | no | - |
| `/admin` | `src/app/(app)/admin/page.tsx` | app | yes (page.tsx:655) | no | no | - |
| `/api-docs` | `src/app/(app)/api-docs/page.tsx` | app | yes (page.tsx:567) | no | no | titleClassName text-3xl font-bold text-zinc-900 dark:text-zinc-50 |
| `/budgets` | `src/app/(app)/budgets/page.tsx` | app | yes (page.tsx:235) | yes (page.tsx:221) | yes (page.tsx:220) | - |
| `/budgets/move-money` | `src/app/(app)/budgets/move-money/page.tsx` | app | yes (page.tsx:21) | no | no | - |
| `/budgets/new` | `src/app/(app)/budgets/new/page.tsx` | app | yes (page.tsx:22) | no | no | - |
| `/budgets/templates/apply` | `src/app/(app)/budgets/templates/apply/page.tsx` | app | yes (page.tsx:21) | no | no | - |
| `/budgets/templates/new` | `src/app/(app)/budgets/templates/new/page.tsx` | app | yes (page.tsx:36) | no | yes (page.tsx:45) | - |
| `/categories/[id]` | `src/app/(app)/categories/[id]/page.tsx` | app | yes (page.tsx:167); backHref + backLabel | yes (page.tsx:76) | yes (page.tsx:144) | - |
| `/categories/[id]/edit` | `src/app/(app)/categories/[id]/edit/page.tsx` | app | no | no | no | - |
| `/categories/new` | `src/app/(app)/categories/new/page.tsx` | app | no | no | no | - |
| `/settings/rules/[id]/edit` | `src/app/(app)/settings/rules/[id]/edit/page.tsx` | app | no | no | no | - |
| `/settings/rules/new` | `src/app/(app)/settings/rules/new/page.tsx` | app | no | no | no | - |
| `/categories` | `src/app/(app)/categories/page.tsx` | app | no | via import (categories/_page-content.tsx:58) | via import (categories/_page-content.tsx:139) | ErrorState/PageSkeleton from categories/_page-content.tsx (reachable); no PageHeader in depth-3 imports |
| `/chat` | `src/app/(app)/chat/page.tsx` | app | no | no | no | UNVERIFIED: no header in depth-3 imports |
| `/connect` | `src/app/(app)/connect/page.tsx` | app | via import (settings/integrations/page.tsx:76) | no | no | re-exports `/settings/integrations/page` (page source); renders SettingsShell and imports ../settings/integrations/page |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | app | yes (page.tsx:537) | no | yes (page.tsx:174) | subtitleClassName text-[13px] (:541); titleClassName text-xl font-semibold tracking-tight (:540) |
| `/dev/gallery` | `src/app/(app)/dev/gallery/page.tsx` | app | yes (page.tsx:45) | no | no | - |
| `/family/accept` | `src/app/(app)/family/accept/page.tsx` | app | yes (page.tsx:13) | no | no | titleClassName text-2xl sm:text-3xl font-bold |
| `/family` | `src/app/(app)/family/page.tsx` | app | yes (page.tsx:28) | no | no | titleClassName text-2xl sm:text-3xl font-bold |
| `/family/share` | `src/app/(app)/family/share/page.tsx` | app | yes (page.tsx:13); backHref + backLabel | no | no | titleClassName text-2xl sm:text-3xl font-bold |
| `/feedback` | `src/app/(app)/feedback/page.tsx` | app | yes (page.tsx:350) | no | no | - |
| `/fire` | `src/app/(app)/fire/page.tsx` | app | yes (page.tsx:204) | no | no | - |
| `/goals` | `src/app/(app)/goals/page.tsx` | app | yes (page.tsx:95) | yes (page.tsx:91) | yes (page.tsx:90) | - |
| `/goals/[id]/edit` | `src/app/(app)/goals/[id]/edit/page.tsx` | app | yes (page.tsx:75) | yes (page.tsx:71) | yes (page.tsx:70) | - |
| `/goals/new` | `src/app/(app)/goals/new/page.tsx` | app | yes (page.tsx:45) | no | no | - |
| `/import` | `src/app/(app)/import/page.tsx` | app | yes (page.tsx:324) | no | no | - |
| `/import/pending` | `src/app/(app)/import/pending/page.tsx` | app | via import (import/pending/_components/staged-list-view.tsx:103) | no | no | header from import/pending/_components/reconcile-header.tsx:66 (reachable) |
| `/loans` | `src/app/(app)/loans/page.tsx` | app | yes | no | yes | - |
| `/loans/new` | `src/app/(app)/loans/new/page.tsx` | app | yes | no | no | form: _components/loan-form.tsx |
| `/loans/[id]/edit` | `src/app/(app)/loans/[id]/edit/page.tsx` | app | yes | yes | yes | form: _components/loan-form.tsx; delete in overflow |
| `/manage-accounts` | `src/app/(app)/manage-accounts/page.tsx` | app | no | no | no | UNVERIFIED: no header/error/skeleton in depth-3 imports |
| `/more` | `src/app/(app)/more/page.tsx` | app | no | no | no | UNVERIFIED: no header in depth-3 imports |
| `/portfolio/dividends` | `src/app/(app)/portfolio/dividends/page.tsx` | app | yes (page.tsx:141) | no | no | - |
| `/portfolio/new` | `src/app/(app)/portfolio/new/page.tsx` | app | yes (page.tsx:40) | no | no | - |
| `/portfolio/new/buy` | `src/app/(app)/portfolio/new/buy/page.tsx` | app | no | no | no | - |
| `/portfolio/new/sell` | `src/app/(app)/portfolio/new/sell/page.tsx` | app | no | no | no | - |
| `/portfolio/new/swap` | `src/app/(app)/portfolio/new/swap/page.tsx` | app | no | no | no | - |
| `/portfolio/new/in-kind-transfer` | `src/app/(app)/portfolio/new/in-kind-transfer/page.tsx` | app | no | no | no | - |
| `/portfolio/new/income-expense` | `src/app/(app)/portfolio/new/income-expense/page.tsx` | app | no | no | no | - |
| `/portfolio/new/fx-conversion` | `src/app/(app)/portfolio/new/fx-conversion/page.tsx` | app | no | no | no | - |
| `/portfolio/new/deposit` | `src/app/(app)/portfolio/new/deposit/page.tsx` | app | no | no | no | - |
| `/portfolio/new/withdrawal` | `src/app/(app)/portfolio/new/withdrawal/page.tsx` | app | no | no | no | - |
| `/portfolio` | `src/app/(app)/portfolio/page.tsx` | app | yes (page.tsx:230) | no | no | - |
| `/portfolio/realized-gains` | `src/app/(app)/portfolio/realized-gains/page.tsx` | app | yes (page.tsx:322) | no | no | - |
| `/reports` | `src/app/(app)/reports/page.tsx` | app | yes (page.tsx:347) | yes (page.tsx:341) | no | - |
| `/scenarios` | `src/app/(app)/scenarios/page.tsx` | app | yes (page.tsx:523) | no | no | - |
| `/settings/about` | `src/app/(app)/settings/about/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:13) | no | no | - |
| `/settings/account` | `src/app/(app)/settings/account/page.tsx` | app > settings/layout.tsx (SettingsShell) | no (layout only: account-shell.tsx:51) | no | no | AccountShell header (account-shell.tsx:51) |
| `/settings/backfill/[runId]` | `src/app/(app)/settings/backfill/[runId]/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:303) | no | no | - |
| `/settings/backfill` | `src/app/(app)/settings/backfill/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:115) | no | no | - |
| `/settings/bank-feeds` | `src/app/(app)/settings/bank-feeds/page.tsx` | app > settings/layout.tsx (SettingsShell) | via import (settings/integrations/page.tsx:76) | no | no | re-exports `/settings/integrations/page` (page source) |
| `/settings/categorization` | `src/app/(app)/settings/categorization/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:131) | no | no | - |
| `/settings/data` | `src/app/(app)/settings/data/page.tsx` | app > settings/layout.tsx (SettingsShell) | via import (settings/developer/page.tsx:62) | no | no | re-exports `/settings/developer/page` (page source) |
| `/settings/developer` | `src/app/(app)/settings/developer/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:62) | no | no | - |
| `/settings/display` | `src/app/(app)/settings/display/page.tsx` | app > settings/layout.tsx (SettingsShell) | via import (settings/general/page.tsx:102) | no | no | re-exports `/settings/general/page` (page source) |
| `/settings/dropdown-order` | `src/app/(app)/settings/dropdown-order/page.tsx` | app > settings/layout.tsx (SettingsShell) | via import (settings/general/page.tsx:102) | no | no | re-exports `/settings/general/page` (page source) |
| `/settings/general` | `src/app/(app)/settings/general/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:102) | no | no | - |
| `/settings/holding-accounts` | `src/app/(app)/settings/holding-accounts/page.tsx` | app > settings/layout.tsx (SettingsShell) | no | no | no | UNVERIFIED: 1-file closure, no header |
| `/settings/import` | `src/app/(app)/settings/import/page.tsx` | app > settings/layout.tsx (SettingsShell) | via import (settings/reconciliation/page.tsx:136) | no | no | re-exports `/settings/reconciliation/page` (page source) |
| `/settings/import/reconcile-visibility` | `src/app/(app)/settings/import/reconcile-visibility/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:20); backHref + backLabel | no | no | in SELF_BACK_PATHS (src/components/settings-shell.tsx:79) |
| `/settings/integrations` | `src/app/(app)/settings/integrations/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:76) | no | no | - |
| `/settings/investments` | `src/app/(app)/settings/investments/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:358) | yes (page.tsx:309) | yes (page.tsx:316) | - |
| `/settings/investments/securities/new` | `src/app/(app)/settings/investments/securities/new/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:18) | no | no | form: _components/add-security-form.tsx |
| `/settings/investments/securities/[id]/edit` | `src/app/(app)/settings/investments/securities/[id]/edit/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:48) | yes (page.tsx:26) | no | form: _components/edit-security-form.tsx |
| `/settings/investments/securities/[id]/link` | `src/app/(app)/settings/investments/securities/[id]/link/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:50) | yes (page.tsx:26) | no | form: _components/link-form.tsx |
| `/settings/investments/securities/[id]/prices` | `src/app/(app)/settings/investments/securities/[id]/prices/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:48) | yes (page.tsx:26) | no | panel: _components/manage-prices-dialog.tsx |
| `/settings/investments/accounts/[id]/link` | `src/app/(app)/settings/investments/accounts/[id]/link/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:50) | yes (page.tsx:26) | no | form: _components/link-form.tsx |
| `/settings/investments/cash-sleeves/new` | `src/app/(app)/settings/investments/cash-sleeves/new/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:23) | no | no | form: src/components/portfolio/cash-sleeve-form.tsx |
| `/settings` | `src/app/(app)/settings/page.tsx` | app > settings/layout.tsx (SettingsShell) | via import (components/settings-hub.tsx:42) | no | no | - |
| `/settings/reconciliation` | `src/app/(app)/settings/reconciliation/page.tsx` | app > settings/layout.tsx (SettingsShell) | yes (page.tsx:136) | no | no | - |
| `/settings/rules` | `src/app/(app)/settings/rules/page.tsx` | app > settings/layout.tsx (SettingsShell) | via import (settings/reconciliation/page.tsx:136) | no | no | re-exports `/settings/reconciliation/page` (page source) |
| `/settings/securities` | `src/app/(app)/settings/securities/page.tsx` | app > settings/layout.tsx (SettingsShell) | no | no | no | UNVERIFIED: 1-file closure, no header |
| `/subscriptions` | `src/app/(app)/subscriptions/page.tsx` | app | yes | yes | yes | - |
| `/subscriptions/new` | `src/app/(app)/subscriptions/new/page.tsx` | app | yes | no | no | form: _components/subscription-form.tsx |
| `/subscriptions/[id]/edit` | `src/app/(app)/subscriptions/[id]/edit/page.tsx` | app | yes | yes | yes | form: _components/subscription-form.tsx; delete in overflow |
| `/tax` | `src/app/(app)/tax/page.tsx` | app | yes (page.tsx:65) | no | no | - |
| `/transactions/audit` | `src/app/(app)/transactions/audit/page.tsx` | app | yes (page.tsx:111); backHref + backLabel | no | no | titleClassName text-xl font-semibold tracking-tight |
| `/transactions/new` | `src/app/(app)/transactions/new/page.tsx` | app | no | no | no | UNVERIFIED: no header in depth-3 imports |
| `/transactions/[id]/edit` | `src/app/(app)/transactions/[id]/edit/page.tsx` | app | yes (_components/transaction-edit-form.tsx PageHeader) | no | no | full-page Edit transaction; hidden FAB + tab bar |
| `/transactions/transfer/[linkId]/edit` | `src/app/(app)/transactions/transfer/[linkId]/edit/page.tsx` | app | yes (_components/transaction-edit-form.tsx PageHeader) | no | no | full-page Edit transfer; hidden FAB + tab bar |
| `/transactions/[id]/split` | `src/app/(app)/transactions/[id]/split/page.tsx` | app | yes (_components/transaction-split-form.tsx PageHeader) | no | no | full-page Split transaction (replaces split-dialog.tsx); hidden FAB + tab bar |
| `/transactions` | `src/app/(app)/transactions/page.tsx` | app | via import (transactions/_components/transactions-workspace.tsx:698) | no | no | header from transactions/_components/transactions-workspace.tsx:698 (reachable) |
| `/transactions/search` | `src/app/(app)/transactions/search/page.tsx` | app | yes (page.tsx:158) | no | no | - |
| `/whats-new` | `src/app/(app)/whats-new/page.tsx` | app | yes (page.tsx:56) | no | no | - |

## Raw grep evidence (run 2026-10-09 in the worktree)

### `<PageHeader\b`: 55 lines in 51 files

```
  admin/email-inbox/page.tsx:148:            <PageHeader title="Email Oversight" titleClassName="text-2xl font-bold tracking-tight" />
  admin/feedback/page.tsx:389:        <PageHeader title="User feedback" titleClassName="text-2xl font-semibold tracking-tight" />
  admin/page.tsx:655:        <PageHeader title="Admin" titleClassName="text-2xl font-bold tracking-tight" />
  admin/instance/page.tsx:131:      <PageHeader title="Instance config" titleClassName="text-2xl font-bold text-foreground" />
  admin/(env)/api-log/page.tsx:192:            <PageHeader title="API Log" titleClassName="text-2xl font-bold tracking-tight" />
  admin/(env)/integrations/page.tsx:247:      <PageHeader title={<><Plug className="w-8 h-8" />
  admin/(env)/system/page.tsx:415:            <PageHeader title="System" titleClassName="text-2xl font-bold tracking-tight" />
  admin/(env)/price-cache/page.tsx:293:            <PageHeader title="Rate Cache" titleClassName="text-2xl font-bold tracking-tight" />
  admin/(env)/layout.tsx:53:      <PageHeader title="Environment" titleClassName="text-2xl font-bold text-foreground" />
  admin/(env)/diagnostics/page.tsx:215:            <PageHeader title="Diagnostics" titleClassName="text-2xl font-bold tracking-tight" />
  admin/announcements/page.tsx:153:        <PageHeader title="Announcements" titleClassName="text-2xl font-semibold tracking-tight" />
  admin/inbox/page.tsx:250:        <PageHeader
  fire/page.tsx:204:        <PageHeader title={<><Flame className="h-6 w-6 text-orange-500" /> FIRE Calculator</>} titleClassName="text-2xl font-bold flex items-center gap-2" />
  loans/page.tsx:414:      <PageHeader
  goals/page.tsx:383:      <PageHeader
  transactions/_components/transactions-workspace.tsx:698:          <PageHeader
  transactions/audit/page.tsx:111:          <PageHeader title="Currency Review" titleClassName="text-xl font-semibold tracking-tight" backHref="/transactions" backLabel="Back to Transactions" />
  transactions/search/page.tsx:158:      <PageHeader
  whats-new/page.tsx:56:        <PageHeader title="What's new" titleClassName="text-2xl font-semibold tracking-tight" />
  feedback/page.tsx:350:        <PageHeader
  dev/gallery/page.tsx:45:          <PageHeader
  categories/[id]/page.tsx:167:          <PageHeader title={category.name ?? "Category"} titleClassName="text-2xl font-bold truncate" backHref={categoriesBackHref} backLabel="Categories" />
  tax/page.tsx:65:        <PageHeader title="Tax" titleClassName="text-2xl font-bold tracking-tight" />
  tax/page.tsx:88:      <PageHeader
  portfolio/new/page.tsx:159:        <PageHeader
  portfolio/page.tsx:230:      <PageHeader
  portfolio/realized-gains/page.tsx:322:        <PageHeader
  portfolio/dividends/page.tsx:141:        <PageHeader
  scenarios/page.tsx:523:      <PageHeader
  settings/developer/page.tsx:62:      <PageHeader
  settings/reconciliation/page.tsx:136:      <PageHeader
  settings/categorization/page.tsx:131:      <PageHeader
  settings/backfill/[runId]/page.tsx:303:        <PageHeader
  settings/backfill/page.tsx:115:      <PageHeader
  settings/general/page.tsx:102:      <PageHeader
  settings/integrations/page.tsx:76:      <PageHeader
  settings/import/reconcile-visibility/page.tsx:20:        <PageHeader title="Reconcile dropdown visibility" titleClassName="text-2xl font-bold tracking-tight" backHref="/settings/import" backLabel="Import settings" />
  settings/about/page.tsx:13:      <PageHeader title="About" titleClassName="text-2xl font-bold tracking-tight" />
  settings/investments/page.tsx:788:        <PageHeader
  api-docs/page.tsx:567:          <PageHeader title="API Docs" titleClassName="text-3xl font-bold text-zinc-900 dark:text-zinc-50" />
  family/share/page.tsx:13:      <PageHeader
  family/page.tsx:28:      <PageHeader
  family/accept/page.tsx:13:      <PageHeader title={FAMILY_STRINGS.page_title} titleClassName="text-2xl sm:text-3xl font-bold" />
  import/page.tsx:324:        <PageHeader title="Import" titleClassName="text-2xl font-semibold" />
  import/page.tsx:335:        <PageHeader title="Import" titleClassName="text-2xl font-semibold" />
  import/page.tsx:349:      <PageHeader
  import/pending/_components/reconcile-header.tsx:66:          <PageHeader title={detail
  import/pending/_components/staged-list-view.tsx:103:          <PageHeader
  budgets/page.tsx:414:      <PageHeader
  reports/page.tsx:347:      <PageHeader
  accounts/[id]/page.tsx:526:      <PageHeader
  accounts/page.tsx:416:        <PageHeader
  accounts/page.tsx:436:      <PageHeader
  dashboard/page.tsx:537:        <PageHeader
  subscriptions/page.tsx:335:      <PageHeader
```

### `<ErrorState\b`: 11 lines in 10 files

```
  loans/page.tsx:410:  if (loadError) return <ErrorState title="Couldn't load loans" message="We couldn't load your loans. Please try again." onRetry={() => { setLoading(true); load(); }} />;
  goals/page.tsx:379:  if (loadError) return <ErrorState title="Couldn't load goals" message="We couldn't load your goals. Please try again." onRetry={() => { setLoading(true); load(); }} />;
  categories/_page-content.tsx:139:    return <ErrorState title="Couldn't load categories" message="Please try again." onRetry={load} />;
  categories/[id]/page.tsx:144:    return <ErrorState title="Category not found" message="This category doesn't exist or isn't yours." />;
  categories/[id]/page.tsx:147:    return <ErrorState title="Couldn't load this category" message="Please try again." onRetry={load} />;
  settings/investments/page.tsx:746:        <ErrorState title="Couldn't load investments" message={error} onRetry={load} />
  budgets/page.tsx:409:  if (loadError) return <ErrorState title="Couldn't load budgets" message="We couldn't load your budgets. Please try again." onRetry={() => { setLoading(true); loadData(); }} />;
  accounts/[id]/page.tsx:470:      <ErrorState
  accounts/page.tsx:410:    return <ErrorState title="Couldn't load accounts" message="We had trouble loading your account data." onRetry={loadAccounts} />;
  dashboard/page.tsx:174:  if (loadError && !data) return <ErrorState onRetry={() => { setLoadError(false); setReloadKey((k) => k + 1); }} />;
  subscriptions/page.tsx:322:      <ErrorState
```

### `<PageSkeleton\b`: 11 lines in 7 files

```
  goals/page.tsx:378:  if (loading) return <PageSkeleton variant="cards" rows={3} />;
  categories/_page-content.tsx:58:      <Suspense fallback={<PageSkeleton variant="list" rows={6} />}>
  categories/_page-content.tsx:81:          <Suspense fallback={<PageSkeleton variant="list" rows={6} />}>
  categories/_page-content.tsx:137:  if (loading && !data) return <PageSkeleton variant="list" rows={6} />;
  categories/[id]/page.tsx:76:    <Suspense fallback={<PageSkeleton variant="list" rows={4} />}>
  categories/[id]/page.tsx:142:  if (loading && !data) return <PageSkeleton variant="list" rows={4} />;
  settings/investments/page.tsx:739:        <PageSkeleton variant="cards" rows={4} />
  budgets/page.tsx:408:  if (loading) return <PageSkeleton variant="list" rows={5} />;
  reports/page.tsx:341:    return <PageSkeleton variant="cards" rows={6} />;
  subscriptions/page.tsx:107:    <Suspense fallback={<PageSkeleton variant="list" rows={5} />}>
  subscriptions/page.tsx:319:  if (loading) return <PageSkeleton variant="list" rows={5} />;
```

### `backLabel=`: 4 lines in 4 files

```
  transactions/audit/page.tsx:111:          <PageHeader title="Currency Review" titleClassName="text-xl font-semibold tracking-tight" backHref="/transactions" backLabel="Back to Transactions" />
  categories/[id]/page.tsx:167:          <PageHeader title={category.name ?? "Category"} titleClassName="text-2xl font-bold truncate" backHref={categoriesBackHref} backLabel="Categories" />
  settings/import/reconcile-visibility/page.tsx:20:        <PageHeader title="Reconcile dropdown visibility" titleClassName="text-2xl font-bold tracking-tight" backHref="/settings/import" backLabel="Import settings" />
  family/share/page.tsx:20:        backLabel={FAMILY_STRINGS.share_back}
```

## Pages with NO ErrorState

Count: 59 of 69. No `<ErrorState` in the page file or in its import closure to depth 3.

- `/account/info`  `src/app/(app)/account/info/page.tsx`
- `/account`  `src/app/(app)/account/page.tsx`
- `/account/security`  `src/app/(app)/account/security/page.tsx`
- `/admin/(env)/api-log`  `src/app/(app)/admin/(env)/api-log/page.tsx`
- `/admin/(env)/diagnostics`  `src/app/(app)/admin/(env)/diagnostics/page.tsx`
- `/admin/(env)/integrations`  `src/app/(app)/admin/(env)/integrations/page.tsx`
- `/admin/(env)/price-cache`  `src/app/(app)/admin/(env)/price-cache/page.tsx`
- `/admin/(env)/system`  `src/app/(app)/admin/(env)/system/page.tsx`
- `/admin/announcements`  `src/app/(app)/admin/announcements/page.tsx`
- `/admin/email-inbox`  `src/app/(app)/admin/email-inbox/page.tsx`
- `/admin/env`  `src/app/(app)/admin/env/page.tsx`
- `/admin/feedback`  `src/app/(app)/admin/feedback/page.tsx`
- `/admin/inbox`  `src/app/(app)/admin/inbox/page.tsx`
- `/admin/instance`  `src/app/(app)/admin/instance/page.tsx`
- `/admin`  `src/app/(app)/admin/page.tsx`
- `/api-docs`  `src/app/(app)/api-docs/page.tsx`
- `/chat`  `src/app/(app)/chat/page.tsx`
- `/connect`  `src/app/(app)/connect/page.tsx`
- `/dev/gallery`  `src/app/(app)/dev/gallery/page.tsx`
- `/family/accept`  `src/app/(app)/family/accept/page.tsx`
- `/family`  `src/app/(app)/family/page.tsx`
- `/family/share`  `src/app/(app)/family/share/page.tsx`
- `/feedback`  `src/app/(app)/feedback/page.tsx`
- `/fire`  `src/app/(app)/fire/page.tsx`
- `/import`  `src/app/(app)/import/page.tsx`
- `/import/pending`  `src/app/(app)/import/pending/page.tsx`
- `/manage-accounts`  `src/app/(app)/manage-accounts/page.tsx`
- `/more`  `src/app/(app)/more/page.tsx`
- `/portfolio/dividends`  `src/app/(app)/portfolio/dividends/page.tsx`
- `/portfolio/new`  `src/app/(app)/portfolio/new/page.tsx`
- `/portfolio/new/buy`  `src/app/(app)/portfolio/new/buy/page.tsx`
- `/portfolio/new/sell`  `src/app/(app)/portfolio/new/sell/page.tsx`
- `/portfolio/new/swap`  `src/app/(app)/portfolio/new/swap/page.tsx`
- `/portfolio/new/in-kind-transfer`  `src/app/(app)/portfolio/new/in-kind-transfer/page.tsx`
- `/portfolio/new/income-expense`  `src/app/(app)/portfolio/new/income-expense/page.tsx`
- `/portfolio/new/fx-conversion`  `src/app/(app)/portfolio/new/fx-conversion/page.tsx`
- `/portfolio/new/deposit`  `src/app/(app)/portfolio/new/deposit/page.tsx`
- `/portfolio/new/withdrawal`  `src/app/(app)/portfolio/new/withdrawal/page.tsx`
- `/portfolio`  `src/app/(app)/portfolio/page.tsx`
- `/portfolio/realized-gains`  `src/app/(app)/portfolio/realized-gains/page.tsx`
- `/reports`  `src/app/(app)/reports/page.tsx`
- `/scenarios`  `src/app/(app)/scenarios/page.tsx`
- `/settings/about`  `src/app/(app)/settings/about/page.tsx`
- `/settings/account`  `src/app/(app)/settings/account/page.tsx`
- `/settings/backfill/[runId]`  `src/app/(app)/settings/backfill/[runId]/page.tsx`
- `/settings/backfill`  `src/app/(app)/settings/backfill/page.tsx`
- `/settings/bank-feeds`  `src/app/(app)/settings/bank-feeds/page.tsx`
- `/settings/categorization`  `src/app/(app)/settings/categorization/page.tsx`
- `/settings/data`  `src/app/(app)/settings/data/page.tsx`
- `/settings/developer`  `src/app/(app)/settings/developer/page.tsx`
- `/settings/display`  `src/app/(app)/settings/display/page.tsx`
- `/settings/dropdown-order`  `src/app/(app)/settings/dropdown-order/page.tsx`
- `/settings/general`  `src/app/(app)/settings/general/page.tsx`
- `/settings/holding-accounts`  `src/app/(app)/settings/holding-accounts/page.tsx`
- `/settings/import`  `src/app/(app)/settings/import/page.tsx`
- `/settings/import/reconcile-visibility`  `src/app/(app)/settings/import/reconcile-visibility/page.tsx`
- `/settings/integrations`  `src/app/(app)/settings/integrations/page.tsx`
- `/settings`  `src/app/(app)/settings/page.tsx`
- `/settings/reconciliation`  `src/app/(app)/settings/reconciliation/page.tsx`
- `/settings/rules`  `src/app/(app)/settings/rules/page.tsx`
- `/settings/securities`  `src/app/(app)/settings/securities/page.tsx`
- `/tax`  `src/app/(app)/tax/page.tsx`
- `/transactions/audit`  `src/app/(app)/transactions/audit/page.tsx`
- `/transactions/new`  `src/app/(app)/transactions/new/page.tsx`
- `/transactions`  `src/app/(app)/transactions/page.tsx`
- `/transactions/search`  `src/app/(app)/transactions/search/page.tsx`
- `/whats-new`  `src/app/(app)/whats-new/page.tsx`

## W6 update (2026-10-09, tip 9b731f5)
Files under src/app/(app) + src/components containing `<ErrorState`: 18. Added since this inventory: /transactions, /reports, /portfolio, /portfolio/dividends, /portfolio/realized-gains, /tax (W4/W5), /whats-new, /account/info (W6-04). Remaining pages without ErrorState fetch only on user action, are admin-only, re-export another page, or share one error state with a save form (see the W6 plan, Definition of done, ErrorState rule).
