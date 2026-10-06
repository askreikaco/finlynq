-- Per-user data versioning via statement-level triggers
--
-- Adds triggers to bump users.data_version on EVERY write to user-owned tables.
-- Each trigger is STATEMENT-level (not ROW) with transition tables, so a bulk
-- insert of 1000 rows bumps the version once per affected user, not 1000 times.
--
-- This migration is idempotent (DROP TRIGGER IF EXISTS before CREATE TRIGGER).
-- To rollback: see scripts/migrations/down/20261010_reika_data_version_triggers.down.sql

-- Plpgsql function that bumps data_version for affected users.
-- Called by statement-level triggers with NEW TABLE or OLD TABLE.
CREATE OR REPLACE FUNCTION reika_bump_data_version()
RETURNS TRIGGER AS $$
DECLARE
  v_rows_table text;
BEGIN
  -- Determine which transition table to use based on the trigger operation
  CASE TG_OP
    WHEN 'INSERT' THEN v_rows_table := 'new_rows';
    WHEN 'DELETE' THEN v_rows_table := 'old_rows';
    WHEN 'UPDATE' THEN v_rows_table := 'new_rows'; -- Use new_rows for UPDATE
  END CASE;

  -- Execute dynamic SQL to bump versions for affected users
  EXECUTE format(
    'UPDATE users SET data_version = data_version + 1 WHERE id IN '
    '  (SELECT DISTINCT user_id FROM %I)',
    v_rows_table
  );

  RETURN NULL; -- STATEMENT-level triggers return NULL
END;
$$ LANGUAGE plpgsql;

-- Create statement-level triggers for each user-owned data table.
-- Each table gets three triggers (_ins, _upd, _del) for INSERT/UPDATE/DELETE.
-- DROP TRIGGER IF EXISTS before CREATE ensures idempotency.

-- accounts
DO $$ BEGIN
  IF to_regclass('accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_accounts_data_version_ins ON accounts;
    CREATE TRIGGER reika_accounts_data_version_ins AFTER INSERT ON accounts
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_accounts_data_version_upd ON accounts;
    CREATE TRIGGER reika_accounts_data_version_upd AFTER UPDATE ON accounts
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_accounts_data_version_del ON accounts;
    CREATE TRIGGER reika_accounts_data_version_del AFTER DELETE ON accounts
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- backfill_runs
DO $$ BEGIN
  IF to_regclass('backfill_runs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_backfill_runs_data_version_ins ON backfill_runs;
    CREATE TRIGGER reika_backfill_runs_data_version_ins AFTER INSERT ON backfill_runs
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_backfill_runs_data_version_upd ON backfill_runs;
    CREATE TRIGGER reika_backfill_runs_data_version_upd AFTER UPDATE ON backfill_runs
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_backfill_runs_data_version_del ON backfill_runs;
    CREATE TRIGGER reika_backfill_runs_data_version_del AFTER DELETE ON backfill_runs
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- bank_daily_balances
DO $$ BEGIN
  IF to_regclass('bank_daily_balances') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_bank_daily_balances_data_version_ins ON bank_daily_balances;
    CREATE TRIGGER reika_bank_daily_balances_data_version_ins AFTER INSERT ON bank_daily_balances
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_bank_daily_balances_data_version_upd ON bank_daily_balances;
    CREATE TRIGGER reika_bank_daily_balances_data_version_upd AFTER UPDATE ON bank_daily_balances
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_bank_daily_balances_data_version_del ON bank_daily_balances;
    CREATE TRIGGER reika_bank_daily_balances_data_version_del AFTER DELETE ON bank_daily_balances
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- bank_transactions
DO $$ BEGIN
  IF to_regclass('bank_transactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_bank_transactions_data_version_ins ON bank_transactions;
    CREATE TRIGGER reika_bank_transactions_data_version_ins AFTER INSERT ON bank_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_bank_transactions_data_version_upd ON bank_transactions;
    CREATE TRIGGER reika_bank_transactions_data_version_upd AFTER UPDATE ON bank_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_bank_transactions_data_version_del ON bank_transactions;
    CREATE TRIGGER reika_bank_transactions_data_version_del AFTER DELETE ON bank_transactions
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- bank_upload_batches
DO $$ BEGIN
  IF to_regclass('bank_upload_batches') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_bank_upload_batches_data_version_ins ON bank_upload_batches;
    CREATE TRIGGER reika_bank_upload_batches_data_version_ins AFTER INSERT ON bank_upload_batches
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_bank_upload_batches_data_version_upd ON bank_upload_batches;
    CREATE TRIGGER reika_bank_upload_batches_data_version_upd AFTER UPDATE ON bank_upload_batches
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_bank_upload_batches_data_version_del ON bank_upload_batches;
    CREATE TRIGGER reika_bank_upload_batches_data_version_del AFTER DELETE ON bank_upload_batches
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- budget_templates
DO $$ BEGIN
  IF to_regclass('budget_templates') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_budget_templates_data_version_ins ON budget_templates;
    CREATE TRIGGER reika_budget_templates_data_version_ins AFTER INSERT ON budget_templates
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_budget_templates_data_version_upd ON budget_templates;
    CREATE TRIGGER reika_budget_templates_data_version_upd AFTER UPDATE ON budget_templates
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_budget_templates_data_version_del ON budget_templates;
    CREATE TRIGGER reika_budget_templates_data_version_del AFTER DELETE ON budget_templates
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- budgets
DO $$ BEGIN
  IF to_regclass('budgets') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_budgets_data_version_ins ON budgets;
    CREATE TRIGGER reika_budgets_data_version_ins AFTER INSERT ON budgets
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_budgets_data_version_upd ON budgets;
    CREATE TRIGGER reika_budgets_data_version_upd AFTER UPDATE ON budgets
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_budgets_data_version_del ON budgets;
    CREATE TRIGGER reika_budgets_data_version_del AFTER DELETE ON budgets
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- categories
DO $$ BEGIN
  IF to_regclass('categories') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_categories_data_version_ins ON categories;
    CREATE TRIGGER reika_categories_data_version_ins AFTER INSERT ON categories
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_categories_data_version_upd ON categories;
    CREATE TRIGGER reika_categories_data_version_upd AFTER UPDATE ON categories
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_categories_data_version_del ON categories;
    CREATE TRIGGER reika_categories_data_version_del AFTER DELETE ON categories
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- contribution_room
DO $$ BEGIN
  IF to_regclass('contribution_room') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_contribution_room_data_version_ins ON contribution_room;
    CREATE TRIGGER reika_contribution_room_data_version_ins AFTER INSERT ON contribution_room
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_contribution_room_data_version_upd ON contribution_room;
    CREATE TRIGGER reika_contribution_room_data_version_upd AFTER UPDATE ON contribution_room
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_contribution_room_data_version_del ON contribution_room;
    CREATE TRIGGER reika_contribution_room_data_version_del AFTER DELETE ON contribution_room
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- custom_security_prices
DO $$ BEGIN
  IF to_regclass('custom_security_prices') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_custom_security_prices_data_version_ins ON custom_security_prices;
    CREATE TRIGGER reika_custom_security_prices_data_version_ins AFTER INSERT ON custom_security_prices
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_custom_security_prices_data_version_upd ON custom_security_prices;
    CREATE TRIGGER reika_custom_security_prices_data_version_upd AFTER UPDATE ON custom_security_prices
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_custom_security_prices_data_version_del ON custom_security_prices;
    CREATE TRIGGER reika_custom_security_prices_data_version_del AFTER DELETE ON custom_security_prices
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- fx_overrides
DO $$ BEGIN
  IF to_regclass('fx_overrides') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_fx_overrides_data_version_ins ON fx_overrides;
    CREATE TRIGGER reika_fx_overrides_data_version_ins AFTER INSERT ON fx_overrides
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_fx_overrides_data_version_upd ON fx_overrides;
    CREATE TRIGGER reika_fx_overrides_data_version_upd AFTER UPDATE ON fx_overrides
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_fx_overrides_data_version_del ON fx_overrides;
    CREATE TRIGGER reika_fx_overrides_data_version_del AFTER DELETE ON fx_overrides
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- goal_accounts
DO $$ BEGIN
  IF to_regclass('goal_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_goal_accounts_data_version_ins ON goal_accounts;
    CREATE TRIGGER reika_goal_accounts_data_version_ins AFTER INSERT ON goal_accounts
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_goal_accounts_data_version_upd ON goal_accounts;
    CREATE TRIGGER reika_goal_accounts_data_version_upd AFTER UPDATE ON goal_accounts
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_goal_accounts_data_version_del ON goal_accounts;
    CREATE TRIGGER reika_goal_accounts_data_version_del AFTER DELETE ON goal_accounts
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- goals
DO $$ BEGIN
  IF to_regclass('goals') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_goals_data_version_ins ON goals;
    CREATE TRIGGER reika_goals_data_version_ins AFTER INSERT ON goals
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_goals_data_version_upd ON goals;
    CREATE TRIGGER reika_goals_data_version_upd AFTER UPDATE ON goals
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_goals_data_version_del ON goals;
    CREATE TRIGGER reika_goals_data_version_del AFTER DELETE ON goals
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- holding_accounts
DO $$ BEGIN
  IF to_regclass('holding_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_holding_accounts_data_version_ins ON holding_accounts;
    CREATE TRIGGER reika_holding_accounts_data_version_ins AFTER INSERT ON holding_accounts
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_holding_accounts_data_version_upd ON holding_accounts;
    CREATE TRIGGER reika_holding_accounts_data_version_upd AFTER UPDATE ON holding_accounts
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_holding_accounts_data_version_del ON holding_accounts;
    CREATE TRIGGER reika_holding_accounts_data_version_del AFTER DELETE ON holding_accounts
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- holding_lot_closures
DO $$ BEGIN
  IF to_regclass('holding_lot_closures') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_holding_lot_closures_data_version_ins ON holding_lot_closures;
    CREATE TRIGGER reika_holding_lot_closures_data_version_ins AFTER INSERT ON holding_lot_closures
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_holding_lot_closures_data_version_upd ON holding_lot_closures;
    CREATE TRIGGER reika_holding_lot_closures_data_version_upd AFTER UPDATE ON holding_lot_closures
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_holding_lot_closures_data_version_del ON holding_lot_closures;
    CREATE TRIGGER reika_holding_lot_closures_data_version_del AFTER DELETE ON holding_lot_closures
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- holding_lots
DO $$ BEGIN
  IF to_regclass('holding_lots') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_holding_lots_data_version_ins ON holding_lots;
    CREATE TRIGGER reika_holding_lots_data_version_ins AFTER INSERT ON holding_lots
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_holding_lots_data_version_upd ON holding_lots;
    CREATE TRIGGER reika_holding_lots_data_version_upd AFTER UPDATE ON holding_lots
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_holding_lots_data_version_del ON holding_lots;
    CREATE TRIGGER reika_holding_lots_data_version_del AFTER DELETE ON holding_lots
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- import_templates
DO $$ BEGIN
  IF to_regclass('import_templates') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_import_templates_data_version_ins ON import_templates;
    CREATE TRIGGER reika_import_templates_data_version_ins AFTER INSERT ON import_templates
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_import_templates_data_version_upd ON import_templates;
    CREATE TRIGGER reika_import_templates_data_version_upd AFTER UPDATE ON import_templates
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_import_templates_data_version_del ON import_templates;
    CREATE TRIGGER reika_import_templates_data_version_del AFTER DELETE ON import_templates
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- loans
DO $$ BEGIN
  IF to_regclass('loans') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_loans_data_version_ins ON loans;
    CREATE TRIGGER reika_loans_data_version_ins AFTER INSERT ON loans
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_loans_data_version_upd ON loans;
    CREATE TRIGGER reika_loans_data_version_upd AFTER UPDATE ON loans
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_loans_data_version_del ON loans;
    CREATE TRIGGER reika_loans_data_version_del AFTER DELETE ON loans
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- notifications
DO $$ BEGIN
  IF to_regclass('notifications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_notifications_data_version_ins ON notifications;
    CREATE TRIGGER reika_notifications_data_version_ins AFTER INSERT ON notifications
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_notifications_data_version_upd ON notifications;
    CREATE TRIGGER reika_notifications_data_version_upd AFTER UPDATE ON notifications
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_notifications_data_version_del ON notifications;
    CREATE TRIGGER reika_notifications_data_version_del AFTER DELETE ON notifications
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- portfolio_holdings
DO $$ BEGIN
  IF to_regclass('portfolio_holdings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_portfolio_holdings_data_version_ins ON portfolio_holdings;
    CREATE TRIGGER reika_portfolio_holdings_data_version_ins AFTER INSERT ON portfolio_holdings
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_portfolio_holdings_data_version_upd ON portfolio_holdings;
    CREATE TRIGGER reika_portfolio_holdings_data_version_upd AFTER UPDATE ON portfolio_holdings
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_portfolio_holdings_data_version_del ON portfolio_holdings;
    CREATE TRIGGER reika_portfolio_holdings_data_version_del AFTER DELETE ON portfolio_holdings
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- portfolio_legacy_realized_gain_snapshot
DO $$ BEGIN
  IF to_regclass('portfolio_legacy_realized_gain_snapshot') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_portfolio_legacy_realized_gain_snapshot_data_version_ins ON portfolio_legacy_realized_gain_snapshot;
    CREATE TRIGGER reika_portfolio_legacy_realized_gain_snapshot_data_version_ins AFTER INSERT ON portfolio_legacy_realized_gain_snapshot
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_portfolio_legacy_realized_gain_snapshot_data_version_upd ON portfolio_legacy_realized_gain_snapshot;
    CREATE TRIGGER reika_portfolio_legacy_realized_gain_snapshot_data_version_upd AFTER UPDATE ON portfolio_legacy_realized_gain_snapshot
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_portfolio_legacy_realized_gain_snapshot_data_version_del ON portfolio_legacy_realized_gain_snapshot;
    CREATE TRIGGER reika_portfolio_legacy_realized_gain_snapshot_data_version_del AFTER DELETE ON portfolio_legacy_realized_gain_snapshot
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- portfolio_snapshots
DO $$ BEGIN
  IF to_regclass('portfolio_snapshots') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_portfolio_snapshots_data_version_ins ON portfolio_snapshots;
    CREATE TRIGGER reika_portfolio_snapshots_data_version_ins AFTER INSERT ON portfolio_snapshots
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_portfolio_snapshots_data_version_upd ON portfolio_snapshots;
    CREATE TRIGGER reika_portfolio_snapshots_data_version_upd AFTER UPDATE ON portfolio_snapshots
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_portfolio_snapshots_data_version_del ON portfolio_snapshots;
    CREATE TRIGGER reika_portfolio_snapshots_data_version_del AFTER DELETE ON portfolio_snapshots
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- recurring_transactions
DO $$ BEGIN
  IF to_regclass('recurring_transactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_recurring_transactions_data_version_ins ON recurring_transactions;
    CREATE TRIGGER reika_recurring_transactions_data_version_ins AFTER INSERT ON recurring_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_recurring_transactions_data_version_upd ON recurring_transactions;
    CREATE TRIGGER reika_recurring_transactions_data_version_upd AFTER UPDATE ON recurring_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_recurring_transactions_data_version_del ON recurring_transactions;
    CREATE TRIGGER reika_recurring_transactions_data_version_del AFTER DELETE ON recurring_transactions
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- securities
DO $$ BEGIN
  IF to_regclass('securities') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_securities_data_version_ins ON securities;
    CREATE TRIGGER reika_securities_data_version_ins AFTER INSERT ON securities
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_securities_data_version_upd ON securities;
    CREATE TRIGGER reika_securities_data_version_upd AFTER UPDATE ON securities
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_securities_data_version_del ON securities;
    CREATE TRIGGER reika_securities_data_version_del AFTER DELETE ON securities
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- settings
DO $$ BEGIN
  IF to_regclass('settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_settings_data_version_ins ON settings;
    CREATE TRIGGER reika_settings_data_version_ins AFTER INSERT ON settings
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_settings_data_version_upd ON settings;
    CREATE TRIGGER reika_settings_data_version_upd AFTER UPDATE ON settings
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_settings_data_version_del ON settings;
    CREATE TRIGGER reika_settings_data_version_del AFTER DELETE ON settings
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- simplefin_pending_transactions
DO $$ BEGIN
  IF to_regclass('simplefin_pending_transactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_simplefin_pending_transactions_data_version_ins ON simplefin_pending_transactions;
    CREATE TRIGGER reika_simplefin_pending_transactions_data_version_ins AFTER INSERT ON simplefin_pending_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_simplefin_pending_transactions_data_version_upd ON simplefin_pending_transactions;
    CREATE TRIGGER reika_simplefin_pending_transactions_data_version_upd AFTER UPDATE ON simplefin_pending_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_simplefin_pending_transactions_data_version_del ON simplefin_pending_transactions;
    CREATE TRIGGER reika_simplefin_pending_transactions_data_version_del AFTER DELETE ON simplefin_pending_transactions
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- snapshots
DO $$ BEGIN
  IF to_regclass('snapshots') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_snapshots_data_version_ins ON snapshots;
    CREATE TRIGGER reika_snapshots_data_version_ins AFTER INSERT ON snapshots
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_snapshots_data_version_upd ON snapshots;
    CREATE TRIGGER reika_snapshots_data_version_upd AFTER UPDATE ON snapshots
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_snapshots_data_version_del ON snapshots;
    CREATE TRIGGER reika_snapshots_data_version_del AFTER DELETE ON snapshots
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- staged_imports
DO $$ BEGIN
  IF to_regclass('staged_imports') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_staged_imports_data_version_ins ON staged_imports;
    CREATE TRIGGER reika_staged_imports_data_version_ins AFTER INSERT ON staged_imports
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_staged_imports_data_version_upd ON staged_imports;
    CREATE TRIGGER reika_staged_imports_data_version_upd AFTER UPDATE ON staged_imports
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_staged_imports_data_version_del ON staged_imports;
    CREATE TRIGGER reika_staged_imports_data_version_del AFTER DELETE ON staged_imports
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- staged_transactions
DO $$ BEGIN
  IF to_regclass('staged_transactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_staged_transactions_data_version_ins ON staged_transactions;
    CREATE TRIGGER reika_staged_transactions_data_version_ins AFTER INSERT ON staged_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_staged_transactions_data_version_upd ON staged_transactions;
    CREATE TRIGGER reika_staged_transactions_data_version_upd AFTER UPDATE ON staged_transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_staged_transactions_data_version_del ON staged_transactions;
    CREATE TRIGGER reika_staged_transactions_data_version_del AFTER DELETE ON staged_transactions
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- subscriptions
DO $$ BEGIN
  IF to_regclass('subscriptions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_subscriptions_data_version_ins ON subscriptions;
    CREATE TRIGGER reika_subscriptions_data_version_ins AFTER INSERT ON subscriptions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_subscriptions_data_version_upd ON subscriptions;
    CREATE TRIGGER reika_subscriptions_data_version_upd AFTER UPDATE ON subscriptions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_subscriptions_data_version_del ON subscriptions;
    CREATE TRIGGER reika_subscriptions_data_version_del AFTER DELETE ON subscriptions
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- target_allocations
DO $$ BEGIN
  IF to_regclass('target_allocations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_target_allocations_data_version_ins ON target_allocations;
    CREATE TRIGGER reika_target_allocations_data_version_ins AFTER INSERT ON target_allocations
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_target_allocations_data_version_upd ON target_allocations;
    CREATE TRIGGER reika_target_allocations_data_version_upd AFTER UPDATE ON target_allocations
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_target_allocations_data_version_del ON target_allocations;
    CREATE TRIGGER reika_target_allocations_data_version_del AFTER DELETE ON target_allocations
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- transaction_bank_links
DO $$ BEGIN
  IF to_regclass('transaction_bank_links') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_transaction_bank_links_data_version_ins ON transaction_bank_links;
    CREATE TRIGGER reika_transaction_bank_links_data_version_ins AFTER INSERT ON transaction_bank_links
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transaction_bank_links_data_version_upd ON transaction_bank_links;
    CREATE TRIGGER reika_transaction_bank_links_data_version_upd AFTER UPDATE ON transaction_bank_links
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transaction_bank_links_data_version_del ON transaction_bank_links;
    CREATE TRIGGER reika_transaction_bank_links_data_version_del AFTER DELETE ON transaction_bank_links
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- transaction_reconciliation_flags
DO $$ BEGIN
  IF to_regclass('transaction_reconciliation_flags') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_transaction_reconciliation_flags_data_version_ins ON transaction_reconciliation_flags;
    CREATE TRIGGER reika_transaction_reconciliation_flags_data_version_ins AFTER INSERT ON transaction_reconciliation_flags
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transaction_reconciliation_flags_data_version_upd ON transaction_reconciliation_flags;
    CREATE TRIGGER reika_transaction_reconciliation_flags_data_version_upd AFTER UPDATE ON transaction_reconciliation_flags
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transaction_reconciliation_flags_data_version_del ON transaction_reconciliation_flags;
    CREATE TRIGGER reika_transaction_reconciliation_flags_data_version_del AFTER DELETE ON transaction_reconciliation_flags
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- transaction_rules
DO $$ BEGIN
  IF to_regclass('transaction_rules') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_transaction_rules_data_version_ins ON transaction_rules;
    CREATE TRIGGER reika_transaction_rules_data_version_ins AFTER INSERT ON transaction_rules
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transaction_rules_data_version_upd ON transaction_rules;
    CREATE TRIGGER reika_transaction_rules_data_version_upd AFTER UPDATE ON transaction_rules
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transaction_rules_data_version_del ON transaction_rules;
    CREATE TRIGGER reika_transaction_rules_data_version_del AFTER DELETE ON transaction_rules
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;

-- transactions
DO $$ BEGIN
  IF to_regclass('transactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS reika_transactions_data_version_ins ON transactions;
    CREATE TRIGGER reika_transactions_data_version_ins AFTER INSERT ON transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transactions_data_version_upd ON transactions;
    CREATE TRIGGER reika_transactions_data_version_upd AFTER UPDATE ON transactions
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS reika_transactions_data_version_del ON transactions;
    CREATE TRIGGER reika_transactions_data_version_del AFTER DELETE ON transactions
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;
