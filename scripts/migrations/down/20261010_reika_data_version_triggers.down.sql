-- Rollback script for 20261010_reika_data_version_triggers.sql
-- Removes all triggers created by the migration (idempotent with IF EXISTS).
-- To apply this rollback: source it in psql or pass to pg_restore after a backup.

-- Drop all data version triggers
DROP TRIGGER IF EXISTS reika_accounts_data_version_ins ON accounts;
DROP TRIGGER IF EXISTS reika_accounts_data_version_upd ON accounts;
DROP TRIGGER IF EXISTS reika_accounts_data_version_del ON accounts;

DROP TRIGGER IF EXISTS reika_backfill_runs_data_version_ins ON backfill_runs;
DROP TRIGGER IF EXISTS reika_backfill_runs_data_version_upd ON backfill_runs;
DROP TRIGGER IF EXISTS reika_backfill_runs_data_version_del ON backfill_runs;

DROP TRIGGER IF EXISTS reika_bank_daily_balances_data_version_ins ON bank_daily_balances;
DROP TRIGGER IF EXISTS reika_bank_daily_balances_data_version_upd ON bank_daily_balances;
DROP TRIGGER IF EXISTS reika_bank_daily_balances_data_version_del ON bank_daily_balances;

DROP TRIGGER IF EXISTS reika_bank_transactions_data_version_ins ON bank_transactions;
DROP TRIGGER IF EXISTS reika_bank_transactions_data_version_upd ON bank_transactions;
DROP TRIGGER IF EXISTS reika_bank_transactions_data_version_del ON bank_transactions;

DROP TRIGGER IF EXISTS reika_bank_upload_batches_data_version_ins ON bank_upload_batches;
DROP TRIGGER IF EXISTS reika_bank_upload_batches_data_version_upd ON bank_upload_batches;
DROP TRIGGER IF EXISTS reika_bank_upload_batches_data_version_del ON bank_upload_batches;

DROP TRIGGER IF EXISTS reika_budget_templates_data_version_ins ON budget_templates;
DROP TRIGGER IF EXISTS reika_budget_templates_data_version_upd ON budget_templates;
DROP TRIGGER IF EXISTS reika_budget_templates_data_version_del ON budget_templates;

DROP TRIGGER IF EXISTS reika_budgets_data_version_ins ON budgets;
DROP TRIGGER IF EXISTS reika_budgets_data_version_upd ON budgets;
DROP TRIGGER IF EXISTS reika_budgets_data_version_del ON budgets;

DROP TRIGGER IF EXISTS reika_categories_data_version_ins ON categories;
DROP TRIGGER IF EXISTS reika_categories_data_version_upd ON categories;
DROP TRIGGER IF EXISTS reika_categories_data_version_del ON categories;

DROP TRIGGER IF EXISTS reika_contribution_room_data_version_ins ON contribution_room;
DROP TRIGGER IF EXISTS reika_contribution_room_data_version_upd ON contribution_room;
DROP TRIGGER IF EXISTS reika_contribution_room_data_version_del ON contribution_room;

DROP TRIGGER IF EXISTS reika_custom_security_prices_data_version_ins ON custom_security_prices;
DROP TRIGGER IF EXISTS reika_custom_security_prices_data_version_upd ON custom_security_prices;
DROP TRIGGER IF EXISTS reika_custom_security_prices_data_version_del ON custom_security_prices;

DROP TRIGGER IF EXISTS reika_fx_overrides_data_version_ins ON fx_overrides;
DROP TRIGGER IF EXISTS reika_fx_overrides_data_version_upd ON fx_overrides;
DROP TRIGGER IF EXISTS reika_fx_overrides_data_version_del ON fx_overrides;

DROP TRIGGER IF EXISTS reika_goal_accounts_data_version_ins ON goal_accounts;
DROP TRIGGER IF EXISTS reika_goal_accounts_data_version_upd ON goal_accounts;
DROP TRIGGER IF EXISTS reika_goal_accounts_data_version_del ON goal_accounts;

DROP TRIGGER IF EXISTS reika_goals_data_version_ins ON goals;
DROP TRIGGER IF EXISTS reika_goals_data_version_upd ON goals;
DROP TRIGGER IF EXISTS reika_goals_data_version_del ON goals;

DROP TRIGGER IF EXISTS reika_holding_accounts_data_version_ins ON holding_accounts;
DROP TRIGGER IF EXISTS reika_holding_accounts_data_version_upd ON holding_accounts;
DROP TRIGGER IF EXISTS reika_holding_accounts_data_version_del ON holding_accounts;

DROP TRIGGER IF EXISTS reika_holding_lot_closures_data_version_ins ON holding_lot_closures;
DROP TRIGGER IF EXISTS reika_holding_lot_closures_data_version_upd ON holding_lot_closures;
DROP TRIGGER IF EXISTS reika_holding_lot_closures_data_version_del ON holding_lot_closures;

DROP TRIGGER IF EXISTS reika_holding_lots_data_version_ins ON holding_lots;
DROP TRIGGER IF EXISTS reika_holding_lots_data_version_upd ON holding_lots;
DROP TRIGGER IF EXISTS reika_holding_lots_data_version_del ON holding_lots;

DROP TRIGGER IF EXISTS reika_import_templates_data_version_ins ON import_templates;
DROP TRIGGER IF EXISTS reika_import_templates_data_version_upd ON import_templates;
DROP TRIGGER IF EXISTS reika_import_templates_data_version_del ON import_templates;

DROP TRIGGER IF EXISTS reika_loans_data_version_ins ON loans;
DROP TRIGGER IF EXISTS reika_loans_data_version_upd ON loans;
DROP TRIGGER IF EXISTS reika_loans_data_version_del ON loans;

DROP TRIGGER IF EXISTS reika_notifications_data_version_ins ON notifications;
DROP TRIGGER IF EXISTS reika_notifications_data_version_upd ON notifications;
DROP TRIGGER IF EXISTS reika_notifications_data_version_del ON notifications;

DROP TRIGGER IF EXISTS reika_portfolio_holdings_data_version_ins ON portfolio_holdings;
DROP TRIGGER IF EXISTS reika_portfolio_holdings_data_version_upd ON portfolio_holdings;
DROP TRIGGER IF EXISTS reika_portfolio_holdings_data_version_del ON portfolio_holdings;

DROP TRIGGER IF EXISTS reika_portfolio_legacy_realized_gain_snapshot_data_version_ins ON portfolio_legacy_realized_gain_snapshot;
DROP TRIGGER IF EXISTS reika_portfolio_legacy_realized_gain_snapshot_data_version_upd ON portfolio_legacy_realized_gain_snapshot;
DROP TRIGGER IF EXISTS reika_portfolio_legacy_realized_gain_snapshot_data_version_del ON portfolio_legacy_realized_gain_snapshot;

DROP TRIGGER IF EXISTS reika_portfolio_snapshots_data_version_ins ON portfolio_snapshots;
DROP TRIGGER IF EXISTS reika_portfolio_snapshots_data_version_upd ON portfolio_snapshots;
DROP TRIGGER IF EXISTS reika_portfolio_snapshots_data_version_del ON portfolio_snapshots;

DROP TRIGGER IF EXISTS reika_recurring_transactions_data_version_ins ON recurring_transactions;
DROP TRIGGER IF EXISTS reika_recurring_transactions_data_version_upd ON recurring_transactions;
DROP TRIGGER IF EXISTS reika_recurring_transactions_data_version_del ON recurring_transactions;

DROP TRIGGER IF EXISTS reika_securities_data_version_ins ON securities;
DROP TRIGGER IF EXISTS reika_securities_data_version_upd ON securities;
DROP TRIGGER IF EXISTS reika_securities_data_version_del ON securities;

DROP TRIGGER IF EXISTS reika_settings_data_version_ins ON settings;
DROP TRIGGER IF EXISTS reika_settings_data_version_upd ON settings;
DROP TRIGGER IF EXISTS reika_settings_data_version_del ON settings;

DROP TRIGGER IF EXISTS reika_simplefin_pending_transactions_data_version_ins ON simplefin_pending_transactions;
DROP TRIGGER IF EXISTS reika_simplefin_pending_transactions_data_version_upd ON simplefin_pending_transactions;
DROP TRIGGER IF EXISTS reika_simplefin_pending_transactions_data_version_del ON simplefin_pending_transactions;

DROP TRIGGER IF EXISTS reika_snapshots_data_version_ins ON snapshots;
DROP TRIGGER IF EXISTS reika_snapshots_data_version_upd ON snapshots;
DROP TRIGGER IF EXISTS reika_snapshots_data_version_del ON snapshots;

DROP TRIGGER IF EXISTS reika_staged_imports_data_version_ins ON staged_imports;
DROP TRIGGER IF EXISTS reika_staged_imports_data_version_upd ON staged_imports;
DROP TRIGGER IF EXISTS reika_staged_imports_data_version_del ON staged_imports;

DROP TRIGGER IF EXISTS reika_staged_transactions_data_version_ins ON staged_transactions;
DROP TRIGGER IF EXISTS reika_staged_transactions_data_version_upd ON staged_transactions;
DROP TRIGGER IF EXISTS reika_staged_transactions_data_version_del ON staged_transactions;

DROP TRIGGER IF EXISTS reika_subscriptions_data_version_ins ON subscriptions;
DROP TRIGGER IF EXISTS reika_subscriptions_data_version_upd ON subscriptions;
DROP TRIGGER IF EXISTS reika_subscriptions_data_version_del ON subscriptions;

DROP TRIGGER IF EXISTS reika_target_allocations_data_version_ins ON target_allocations;
DROP TRIGGER IF EXISTS reika_target_allocations_data_version_upd ON target_allocations;
DROP TRIGGER IF EXISTS reika_target_allocations_data_version_del ON target_allocations;

DROP TRIGGER IF EXISTS reika_transaction_bank_links_data_version_ins ON transaction_bank_links;
DROP TRIGGER IF EXISTS reika_transaction_bank_links_data_version_upd ON transaction_bank_links;
DROP TRIGGER IF EXISTS reika_transaction_bank_links_data_version_del ON transaction_bank_links;

DROP TRIGGER IF EXISTS reika_transaction_reconciliation_flags_data_version_ins ON transaction_reconciliation_flags;
DROP TRIGGER IF EXISTS reika_transaction_reconciliation_flags_data_version_upd ON transaction_reconciliation_flags;
DROP TRIGGER IF EXISTS reika_transaction_reconciliation_flags_data_version_del ON transaction_reconciliation_flags;

DROP TRIGGER IF EXISTS reika_transaction_rules_data_version_ins ON transaction_rules;
DROP TRIGGER IF EXISTS reika_transaction_rules_data_version_upd ON transaction_rules;
DROP TRIGGER IF EXISTS reika_transaction_rules_data_version_del ON transaction_rules;

DROP TRIGGER IF EXISTS reika_transactions_data_version_ins ON transactions;
DROP TRIGGER IF EXISTS reika_transactions_data_version_upd ON transactions;
DROP TRIGGER IF EXISTS reika_transactions_data_version_del ON transactions;

-- Drop the trigger function (only if no other triggers use it)
DROP FUNCTION IF EXISTS reika_bump_data_version() CASCADE;
