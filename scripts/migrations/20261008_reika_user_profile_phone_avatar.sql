-- Add phone and avatar_url columns to users table
--
-- Phone: up to 32 characters, optional, for user profile / verification
-- Avatar URL: data URI for avatar image, optional, stored as base64 JPEG/PNG
--
-- Both columns use IF NOT EXISTS to be safe on re-runs; schema-pg.ts and
-- app code expect these columns to exist.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
