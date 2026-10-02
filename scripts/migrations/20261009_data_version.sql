-- Phase 3 (Server change detection) - Add data_version to users table
ALTER TABLE users ADD COLUMN data_version integer NOT NULL DEFAULT 1;
