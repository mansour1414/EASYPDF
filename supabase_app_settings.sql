-- ============================================================================
-- PHASE 2 HARDENING MIGRATION — app_settings table for production-persistent
-- admin settings (payment-method visibility today; extensible key/value store
-- for future settings).
--
-- WHY: /api/admin/payment-methods previously persisted ONLY to
-- db_fallback.json. On Vercel that file lives under /tmp — ephemeral AND
-- per-instance — so admin toggles silently reverted and were inconsistent
-- across concurrent function instances.
--
-- !! MANUAL STEP — NOT EXECUTED AUTOMATICALLY !!
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor).
-- It is idempotent (safe to re-run) and non-destructive: it creates ONE new
-- table and touches nothing else. No existing tables, rows, or policies are
-- modified or dropped.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- RLS enabled with NO policies: no anon/authenticated browser session can
-- read or write any row. The table is only ever accessed by the backend
-- using SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS), exactly like the
-- other backend-only tables in this project (rate_limits, stripe_events).
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- EXPLICIT PRIVILEGES (production incident fix):
-- RLS bypass is NOT the same as table privileges. On projects where Supabase
-- default privileges were altered/tightened, tables created via the SQL editor
-- receive NO automatic grants, so even service_role gets:
--     'permission denied for table app_settings'
-- Grant the backend role exactly what /api/admin/payment-methods needs
-- (SELECT for reads, INSERT+UPDATE for the upsert) and nothing more, and
-- defensively revoke the browser roles. All statements are idempotent.
REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT  SELECT ON public.app_settings TO service_role;
GRANT  INSERT, UPDATE ON public.app_settings TO service_role;

-- Sanity checks after applying:
--   select polname from pg_policy where polrelid = 'public.app_settings'::regclass;
--   -- Expect ZERO rows (no policies = fully locked to client keys).
--
--   select grantee, privilege_type from information_schema.role_table_privileges
--    where table_name = 'app_settings';
--   -- Expect ONLY service_role rows (SELECT / INSERT / UPDATE).
