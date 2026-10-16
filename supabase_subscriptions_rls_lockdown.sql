-- ============================================================================
-- CRITICAL SECURITY MIGRATION — run this in the Supabase SQL editor.
-- Found during the Aug 2026 full-project security audit.
--
-- WHY THIS MATTERS:
-- calculateEntitlementForUser() in server.ts grants a user the 'pro' plan if
-- EITHER users.admin_granted_pro = true OR they have a row in
-- public.subscriptions with status IN ('active', 'trialing'):
--
--   const { data: subs } = await supabase.from('subscriptions')
--     .select('status').eq('user_id', userId);
--   hasActiveStripeSub = subs.some(s => s.status === 'active' || s.status === 'trialing');
--
-- supabase_users_rls_lockdown.sql already locks down public.users so a
-- browser session can't UPDATE its own `plan`/`admin_granted_pro` field.
-- BUT public.subscriptions was created (supabase_phase3_2_migration.sql)
-- WITHOUT Row Level Security ever being enabled on it. If RLS is off, a
-- signed-in user's browser session can — using nothing but the public anon
-- key and their own JWT — run:
--
--   supabase.from('subscriptions').insert({
--     user_id: myOwnId,
--     status: 'active',
--     stripe_subscription_id: 'fake-' + Date.now()
--   })
--
-- ...and immediately become a Pro user for free, completely bypassing
-- Stripe — even with the users-table lockdown correctly in place. This
-- migration closes that gap the same way:
--   1. Users may SELECT only their own subscription rows (so an "My
--      Subscription" account page can still work client-side, if one
--      exists or is added later).
--   2. Users may NOT INSERT, UPDATE, or DELETE subscription rows at all.
--      Every write must come from the backend's Stripe webhook handler
--      (/api/stripe/webhook in server.ts), which uses the Supabase SERVICE
--      ROLE key and therefore bypasses RLS entirely.
--
-- After running this, verify in the Supabase dashboard (Authentication >
-- Policies) that public.subscriptions shows exactly one SELECT policy and
-- no INSERT/UPDATE/DELETE policy.
-- ============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;

-- 1. Users can only see their own subscription row(s).
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 2. No client-side INSERT/UPDATE/DELETE at all. Subscription rows are only
--    ever written by the backend's Stripe webhook handler using the service
--    role key (which bypasses RLS), never by a user's own browser session.
--    Simply not creating INSERT/UPDATE/DELETE policies is sufficient with
--    RLS enabled — no additional statement needed.

-- Sanity check: confirm no other write policy is silently granting access.
-- Run this after applying the migration:
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.subscriptions'::regclass;
-- You should ONLY see a policy with polcmd = 'r' (SELECT). Nothing with
-- polcmd = 'a' (INSERT), 'w' (UPDATE), 'd' (DELETE), or '*' (ALL).
