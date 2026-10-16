-- ============================================================================
-- SECURITY MIGRATION — run this in the Supabase SQL editor.
-- Found during the Aug 2026 full-project security audit.
--
-- WHY: Unlike public.users and public.subscriptions, this repository does
-- not contain the original CREATE TABLE statement for public.uploaded_files
-- (it must have been created directly in the Supabase dashboard / Table
-- Editor at some point). That means its current RLS state can't be verified
-- from the codebase — this migration is written defensively, on the
-- assumption RLS may not be enabled on it yet. If it's already correctly
-- locked down, running this again is safe (it drops old policies by name
-- before recreating them).
--
-- server.ts writes rows to this table (with the service role key, which
-- bypasses RLS) from /api/pdf/upload and /api/pdf/edit-text, and reads from
-- it in the /uploads/:filename ownership check and the admin file listing.
-- No legitimate flow requires a user's own browser session to read or write
-- this table directly with the anon key.
--
-- This migration:
--   1. Users may SELECT only their own file records (file_url values are
--      short-lived Supabase Storage signed URLs, but the row itself
--      shouldn't be enumerable by other users regardless).
--   2. No client-side INSERT/UPDATE/DELETE — all writes happen through the
--      backend using the service role key.
-- ============================================================================

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own uploaded files" ON public.uploaded_files;

CREATE POLICY "Users can view own uploaded files"
  ON public.uploaded_files
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy is created intentionally — all writes go
-- through server.ts using the Supabase SERVICE ROLE key.

-- Sanity check after applying:
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.uploaded_files'::regclass;
-- Expect exactly one policy with polcmd = 'r' (SELECT).
