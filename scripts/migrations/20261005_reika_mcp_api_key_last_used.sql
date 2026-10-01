-- MCP API key last-used tracking (FINLYNQ-nnn).
-- Additive, NON-destructive: a nullable TIMESTAMPTZ on users,
-- bumped on each successful MCP request authenticated via API key
-- (the hasApiKey path in src/app/api/mcp/route.ts), throttled DB-side
-- (UPDATE only when stale > 1 hour) so it is NOT a write per request.
-- Drives the /settings/integrations visibility: API-key-only users now
-- count as "connected" so the guide card hides; the new "Show setup guide"
-- link reappears for re-access.

ALTER TABLE users ADD COLUMN IF NOT EXISTS mcp_api_key_last_used_at TIMESTAMPTZ;
