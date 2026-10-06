-- Rollback for 20261010_reika_data_version_triggers.sql
--
-- Removes all reika_% triggers and the reika_bump_data_version() function.
-- After applying this down migration, also manually run:
--   DELETE FROM schema_migrations WHERE version = '20261010_reika_data_version_triggers';

-- Drop the function (cascades to triggers)
DROP FUNCTION IF EXISTS reika_bump_data_version() CASCADE;

-- Verify cleanup (should return 0)
-- SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'reika_%';
-- SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'reika_%';
