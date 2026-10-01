-- Invisible accounts (2026-10-07).
--
-- A per-account flag that hides the account from every metric and total:
-- net worth (current AND history), total assets / liabilities, the reports
-- balance sheet, FX exposure, the financial-health score, the weekly recap,
-- the chat context, the family overview and the MCP / mobile totals. The
-- account stays listed and editable on the Accounts page and keeps its
-- transactions. Independent of `archived`, which deliberately stays in net
-- worth (tests/archived-accounts-stay-in-net-worth.test.ts).
--
-- Pure additive: no DROP; the default keeps every existing account visible.
-- Idempotent: safe to re-run. The runner (deploy.sh / run-migrations.mjs)
-- wraps the file in a transaction with the schema_migrations bookkeeping
-- insert — do NOT add a BEGIN/COMMIT block here.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS invisible BOOLEAN NOT NULL DEFAULT false;
