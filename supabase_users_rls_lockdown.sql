-- ============================================================================
-- CRITICAL SECURITY MIGRATION — run this in the Supabase SQL editor.
--
-- WHY: src/components/AuthModal.tsx signs users up directly from the browser
-- using the public anon key (supabase.auth.signUp + supabase.from('users').upsert).
-- That means any logged-in user's browser session can call
-- supabase.from('users').update(...) on their OWN row using nothing but the
-- public anon key + their own JWT — subject only to whatever RLS policies
-- exist on public.users.
--
-- If public.users does not already have RLS enabled with a strict policy,
-- ANY signed-in user could open devtools and run something like:
--
--   supabase.from('users').update({ plan: 'pro', is_admin: true }).eq('id', myId)
--
-- ...and grant themselves Pro or Admin access for free, completely bypassing
-- Stripe. This migration locks that down:
--   1. Users may SELECT only their own row.
--   2. Users may INSERT only their own row, and only with safe defaults
--      (plan='free', admin_granted_pro=false, is_admin=false, role<>'admin')
--      — this is what AuthModal.tsx's self-provisioning upsert on signup needs.
--   3. Users may NOT UPDATE their own row at all from the client. All plan
--      changes, admin grants, and quota resets must go through the backend
--      (server.ts), which uses the Supabase SERVICE ROLE key and therefore
--      bypasses RLS entirely — exactly like /api/admin/update-plan already does.
--
-- Run this once against your project, then verify in the Supabase dashboard
-- (Authentication > Policies) that these are the only policies active on
-- public.users.
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Remove any pre-existing, possibly-too-permissive policies with these names
-- before recreating them, so this script is safe to re-run.
DROP POLICY IF EXISTS "Users can view own row" ON public.users;
DROP POLICY IF EXISTS "Users can insert own row with safe defaults" ON public.users;
DROP POLICY IF EXISTS "Block client-side updates to users" ON public.users;

-- 1. Users can only see their own row.
CREATE POLICY "Users can view own row"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- 2. Users can create their own row on signup, but ONLY with safe defaults —
--    they cannot self-grant Pro/admin at insert time either.
--
-- NOTE (audit, Aug 2026): this check previously constrained plan,
-- admin_granted_pro, and is_admin to safe defaults, but NOT a `role`
-- column — even though server.ts's requireAdmin middleware treats
-- `role === 'admin'` as fully equivalent to `is_admin === true` (see
-- `userRow.is_admin === true || userRow.role === 'admin'`). The app's own
-- signup flow (AuthModal.tsx) never sets `role` at all, but WITH CHECK
-- only constrains columns it explicitly mentions — if this column exists
-- on your live table, nothing stopped a crafted raw insert (anon key + a
-- user's own JWT, e.g. from devtools) from satisfying every other check
-- while sneaking in `role: 'admin'` and instantly gaining full admin
-- access, completely bypassing this entire lockdown.
--
-- Whether `role` actually exists on public.users can't be confirmed from
-- this codebase (its CREATE TABLE isn't version-controlled here, same
-- situation as public.uploaded_files) — server.ts's own TypeScript casts
-- it `as any` wherever it's read, suggesting it may not be a guaranteed
-- column. Adding a static `coalesce(role, 'user') <> 'admin'` check would
-- throw "column role does not exist" and abort this whole migration on a
-- table that lacks it. Built dynamically below instead: the constraint is
-- only added to the policy if the column is actually present, so this
-- migration is safe to run either way. If `role` gets added to the
-- schema LATER, re-run this migration to pick up the constraint.
DO $$
DECLARE
  role_check TEXT := '';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
  ) THEN
    role_check := ' AND coalesce(role, ''user'') <> ''admin''';
  END IF;

  EXECUTE format(
    'CREATE POLICY "Users can insert own row with safe defaults" ON public.users '
    || 'FOR INSERT WITH CHECK ('
    || 'auth.uid() = id '
    || 'AND coalesce(plan, ''free'') = ''free'' '
    || 'AND coalesce(admin_granted_pro, false) = false '
    || 'AND coalesce(is_admin, false) = false'
    || '%s)',
    role_check
  );
END $$;

-- 3. No client-side UPDATE at all. Plan changes, admin flags, and usage
--    counters are only ever written by the backend using the service role
--    key (which bypasses RLS), never by a user's own browser session.
--    (Simply not creating an UPDATE policy is sufficient with RLS enabled,
--    but we also explicitly document/enforce it here for clarity.)
-- No CREATE POLICY ... FOR UPDATE statement — this is intentional.

-- Sanity check: confirm no other UPDATE policy is silently granting access.
-- Run this after applying the migration:
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.users'::regclass;
-- You should NOT see any policy with polcmd = 'w' (UPDATE) or polcmd = '*' (ALL).
