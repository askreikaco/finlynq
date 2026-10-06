# Upstream Merge Ledger: 2026-10-06

Fork catch-up merge of `upstream/main` (finlynq/finlynq) into `custom` (askreikaco/finlynq).
Branch: `upstream-sync/2026-10-06` created from `origin/custom = 1b076ba17ae76e799ab438abdaf4ee8107f7a990`.

## Decision Rule

- **OURS WINS**: Design/UI/architecture conflicts
- **UPSTREAM WINS**: Pure business-logic bug fixes where we have not redesigned

## Merged Commits

| SHA | Subject | Decision | Reason | Files |
|-----|---------|----------|--------|-------|
| e64fc1b8 | docs(changelog): income-statement categoryId + budget currency default; mobile 1.0.19 review fixes | port | Documentation/changelog update on top of our currency fixes | CHANGELOG.md |
| 2a89113d | fix(transactions): keep entered_amount in sync on amount-only updates | take | Our PR #360 merged upstream with follow-up fixes | src/app/api/transactions/route.ts |
| 3885198f | fix(ui): SelectValue shows the item label instead of the raw value | take | Our PR #361, pure UI bug fix in shared component | src/components/ui/select.tsx |
| 245c42d2 | fix(loans): paid-off loans leave Monthly Payments and Active Loans | take | Our PR #362, business logic fix from our contribution | src/lib/loan-status.ts, tests/loan-status.test.ts |
| 15b76c57 | fix(currency): default to ISO minor units so VND/JPY/KRW render without .00 | take | Our PR #358, upstream version with clean imports and fixed duplicate params | mcp-server/tools/goals.ts, src/lib/currency.ts, src/db/schema-pg.ts |
| 05c569fa | fix(goals): measure debt_payoff progress as paid-down debt | take | Our PR #359, business logic fix with corrected test | src/lib/goals-progress.ts, tests/goals-progress-debt-payoff.test.ts |
| c6781a7d | fix(dashboard): label the period the Spending and Available cards actually cover | port | Upstream version uses different UI component (Card vs MetricCard); took our version for design consistency | src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/_components/available-to-spend.tsx |
| 4f88dcfb | Merge PR #358 from askreikaco: fix(currency) | already-ours | Equivalent to our PR #358 merge; conflicts resolved during initial merge conflict resolution |  |
| 735337b8 | Merge PR #359 from askreikaco: fix(goals): measure debt_payoff progress | already-ours | Equivalent to our PR #359 merge; conflicts resolved during initial merge conflict resolution |  |
| 18df8c4e | Merge PR #360 from askreikaco: fix(transactions): keep entered_amount | already-ours | Equivalent to our PR #360 merge; conflicts resolved during initial merge conflict resolution |  |
| 9339b25b | Merge PR #361 from askreikaco: fix(ui): SelectValue shows item label | already-ours | Equivalent to our PR #361 merge; conflicts resolved during initial merge conflict resolution |  |
| 7ee3823e | Merge PR #362 from askreikaco: fix(loans): paid-off loans | already-ours | Equivalent to our PR #362 merge; conflicts resolved during initial merge conflict resolution |  |
| 93ff9ed9 | Merge PR #363 from askreikaco: fix(dashboard): label period | already-ours | Equivalent to our PR #363 merge; conflicts resolved during initial merge conflict resolution |  |
| 5de4e8d0 | fix: follow-ups to contributor PRs #358/#359/#362 | take | Upstream follow-up fixes addressing issues from our contributions | CHANGELOG.md, src/lib/currency.ts, src/lib/goals-progress.ts, src/lib/loan-status.ts, tests/goals-progress-debt-payoff.test.ts, tests/loan-status.test.ts |
| f3aa36e5 | fix(goals): stop new goals defaulting to CAD; show each goal in its own currency | take | Upstream follow-up fix for PR #358 currency handling | CHANGELOG.md, mcp-server/tools/goals.ts, scripts/migrations/20261002_goals_currency_default_usd.sql, scripts/seed-demo.ts, src/app/(app)/goals/page.tsx, src/app/api/goals/route.ts, src/db/schema-pg.ts, src/lib/goals-progress.ts, tests/goal-currency.test.ts |
| 3d9669cc | Merge pull request #364 from finlynq/dev | take | Final dev merge bringing all changes together | CHANGELOG.md |

## Conflict Resolution Summary

- **Conflicts Resolved**: 10 files
  - **Upstream (business logic)**: 6 files taken
    - `mcp-server/tools/goals.ts` - Fixed duplicate currency parameter, cleaned up logic
    - `src/lib/currency.ts` - Upstream version with correct ISO minor units handling + our locale awareness via 3-way merge
    - `src/lib/goals-progress.ts` - Took upstream version, then restored base's injected parameter (Family Wealth viewer path) to fix regression
    - `src/lib/loan-status.ts` - Paid-off loan status handling
    - `tests/goals-progress-debt-payoff.test.ts` - Updated test cases
    - `tests/loan-status.test.ts` - Updated test cases
  
  - **Ours (design/UI with upstream logic ported)**: 4 files taken
    - `src/app/(app)/dashboard/_components/available-to-spend.tsx` - Kept MetricCard design (not motion.div redesign)
    - `src/app/(app)/dashboard/page.tsx` - Kept our insights layout design
    - `src/app/(app)/goals/page.tsx` - Kept our page design, ported upstream per-goal currency behavior (targetAmountDisplay/currentAmountDisplay fields, currency badge, "converted at today's rates" note)
    - `src/app/(app)/loans/page.tsx` - Kept our page design

- **Fixed Tests**: 
  - `tests/mcp/goals-currency.test.ts` - Updated currency validation test to accept "usd" as valid (uppercased to "USD") per upstream's regex relaxation

- **Clean Merges**: CHANGELOG.md, scripts/seed-demo.ts, src/app/api/goals/route.ts, src/app/api/transactions/route.ts, src/components/ui/select.tsx, src/db/schema-pg.ts

## New Files from Upstream

- `scripts/migrations/20261002_goals_currency_default_usd.sql` - Migration to fix goal currency defaults
- `tests/goal-currency.test.ts` - New test for goal currency handling

## Migration Analysis

**Migration Date Collision (Non-Issue)**:
- Upstream added: `20261002_goals_currency_default_usd.sql`
- Existing migrations with 20261002 prefix: `20261002_reika_family_shares.sql`, `20261002_reika_recovery_wraps.sql`
- Migration variant: `20261002b_reika_family_invites.sql`

**Analysis**:
- Migration runner (scripts/run-migrations.mjs) sorts by filename lexicographically
- Execution order: goals_currency_default_usd → reika_family_shares → reika_recovery_wraps → reika_family_invites
- **Safety**: SAFE. The upstream migration only executes `ALTER TABLE goals ALTER COLUMN currency SET DEFAULT 'USD'` and does not depend on other migrations in this batch
- **Existing data**: SAFE. Migration explicitly does NOT rewrite existing rows; only affects new inserts
- **DB schema safety**: SAFE on databases with goals in non-USD currency; the default change does not alter existing goal currency values
- **Migration tracking**: By filename in schema_migrations ledger, so no duplicates; lexicographic ordering is consistent

**Conclusion**: No action required. Same-date prefixes are acceptable because migrations are tracked by full filename and execution is deterministic via lexicographic sort.

## Test Verification (All Pass)

- tests/mcp/goals-currency.test.ts: **Test Files 1 passed (1), Tests 6 passed (6)**
- tests/goals-progress-debt-payoff.test.ts: **Test Files 1 passed (1), Tests 6 passed (6)**
- tests/currency.test.ts: **Test Files 1 passed (1), Tests 30 passed (30)**
- tests/goal-currency.test.ts: **Test Files 1 passed (1), Tests 10 passed (10)**
- tests/loan-status.test.ts: **Test Files 1 passed (1), Tests 3 passed (3)**
- tests/family/family-overview-cards.test.ts: **Test Files 1 passed (1), Tests 23 passed (23)**
- tests/mcp/manage-transactions-update-entered-amount.test.ts: **Test Files 1 passed (1), Tests 2 passed (2)**

**Total: 80 tests passed across 7 files**

Type checking: No new errors in src/lib/goals-progress.ts or src/app/(app)/goals/page.tsx. Only pre-existing errors in next.config.ts (serwist @serwist/next missing) and src/app/sw.ts (known)

## Merge Verification

**src/lib/currency.ts** - Proper 3-way merge:
- Upstream's ISO minor units fix and memoization (currencyDecimals Map) preserved
- Our locale awareness (getDisplayLocale) maintained throughout
- All our exports (formatDateTimeLocal, fxPreviewText) restored

**src/lib/goals-progress.ts** - Restored critical regression fix:
- Took upstream version then restored base's injected parameter (4th argument)
- Restored 5 usage points: holdingsByAccount guard, cashByAccount guard, getFx conditional, valueInAccountCcy conditional
- Fixes TypeScript error TS2554 in builders.ts:419 ("Expected 3 arguments, but got 4")

**UI/Design files** - Merged by porting upstream business logic into our custom designs:
- **Goals page**: Ported per-goal currency behavior from f3aa36e5
  - Added targetAmountDisplay/currentAmountDisplay field definitions
  - Updated totalTarget/totalCurrent to use display currency versions with fallbacks
  - Added hasForeignGoal check and "converted at today's rates" notes
  - Added per-goal currency badge when differs from displayCurrency
  - Added `|| displayCurrency` fallback to all per-goal amount formatting (remaining, monthlyNeeded)
- **Dashboard/Loans**: Period labels and paid-off loan exclusion already present in our versions

**tests/mcp/goals-currency.test.ts** - Updated for upstream's currency validation relaxation:
- Added test for "usd" acceptance and uppercasing to "USD"
- Changed "schema rejects malformed" to test genuinely invalid codes ("US", "U$D")
