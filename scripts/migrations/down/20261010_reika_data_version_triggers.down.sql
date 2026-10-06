-- Rollback for 20261010_reika_data_version_triggers.sql
--
-- Removes all reika_% triggers and the reika_bump_data_version() function.
-- The CASCADE clause ensures all dependent triggers are automatically dropped.
--
-- MANUAL CLEANUP (after migration):
-- DELETE FROM schema_migrations WHERE version = '20261010_reika_data_version_triggers';
--
-- Verify cleanup:
-- SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'reika_%';  -- should return 0
-- SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'reika_%';   -- should return 0

-- Drop the function with CASCADE to automatically drop all dependent triggers
-- This removes the reika_bump_data_version() function and all 132 triggers created by the migration
DROP FUNCTION IF EXISTS reika_bump_data_version() CASCADE;
