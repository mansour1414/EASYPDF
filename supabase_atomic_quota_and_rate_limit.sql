-- ============================================================================
-- NEW MIGRATION (security/reliability fix, Aug 2026) — run this in the
-- Supabase SQL editor, AFTER the three *_rls_lockdown.sql migrations.
--
-- WHY: server.ts previously enforced the daily AI quota (3/day free,
-- unlimited Pro) and the daily upload quota using a classic
-- READ -> CHECK -> INCREMENT -> WRITE pattern in application code:
--
--   const profile = await getOrSyncUserProfile(userId);       // READ
--   if (profile.plan === 'free' && profile.ai_count_today >= 3) block; // CHECK
--   const newCount = profile.ai_count_today + 1;               // INCREMENT (in JS)
--   await updateUserCounters(userId, ..., newCount);           // WRITE
--
-- This is NOT atomic. If a user fires several concurrent requests (e.g. a
-- few parallel fetch() calls from devtools/a script), every request can
-- READ the same "count = 2" before any of them WRITEs "count = 3" back,
-- so all of them pass the CHECK and the free daily limit is silently
-- exceeded. The same race applies independently to the upload quota.
--
-- FIX: move the whole READ-CHECK-INCREMENT-WRITE sequence into a single
-- PostgreSQL function that takes a row lock (`SELECT ... FOR UPDATE`) on
-- the user's row before reading the counter. Concurrent calls for the
-- SAME user are then serialized by Postgres itself — the second call
-- physically waits for the first transaction to commit before it can even
-- read the counter, so it always sees the up-to-date, already-incremented
-- value. Calls for DIFFERENT users are unaffected and run fully in
-- parallel (the lock is per-row, not table-wide).
--
-- This migration also adds a small generic distributed rate-limiter
-- function (`check_rate_limit`), reusing this same project's Supabase
-- database instead of introducing a new external service (Redis, etc.) —
-- see the "Rate limiting" section of the chat report for why this was
-- chosen over in-memory express-rate-limit, which does not work
-- correctly across multiple concurrent Vercel serverless instances.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PART 1: Atomic daily quota increment (AI quota + upload quota)
-- ----------------------------------------------------------------------------

-- Requires: public.users has columns
--   ai_count_today integer, uploads_count_today integer,
--   last_usage_reset_date date (or text 'YYYY-MM-DD' — cast handled below)
-- These already exist and are already used by the current (non-atomic)
-- server.ts code, so no column changes are needed.

CREATE OR REPLACE FUNCTION public.increment_daily_quota(
  p_user_id uuid,
  p_counter_type text,   -- must be 'ai' or 'upload'
  p_free_limit integer,  -- e.g. 3
  p_is_pro boolean       -- computed server-side (Stripe subscription / admin_granted_pro), NEVER client-controlled
)
RETURNS TABLE (
  allowed boolean,
  ai_count_today integer,
  uploads_count_today integer,
  reset_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_row public.users%ROWTYPE;
  v_current_count integer;
BEGIN
  IF p_counter_type NOT IN ('ai', 'upload') THEN
    RAISE EXCEPTION 'increment_daily_quota: invalid p_counter_type %', p_counter_type;
  END IF;

  -- Row-level lock: any concurrent call for the SAME p_user_id blocks here
  -- until this transaction commits. This is what makes the whole
  -- read-check-increment sequence below atomic per user.
  SELECT * INTO v_row FROM public.users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'increment_daily_quota: user % not found', p_user_id;
  END IF;

  -- Daily reset (same behavior as the previous verifyAndResetDailyLimits /
  -- getOrSyncUserProfile logic: both counters reset together on a new day).
  IF v_row.last_usage_reset_date IS DISTINCT FROM v_today THEN
    UPDATE public.users
    SET ai_count_today = 0,
        uploads_count_today = 0,
        last_usage_reset_date = v_today
    WHERE id = p_user_id
    RETURNING * INTO v_row;
  END IF;

  IF p_counter_type = 'ai' THEN
    v_current_count := v_row.ai_count_today;
  ELSE
    v_current_count := v_row.uploads_count_today;
  END IF;

  -- Pro users are unlimited; free users are blocked once they've hit the
  -- limit. Blocked requests do NOT increment anything (fail-safe: a
  -- request that will be rejected must never consume quota).
  IF (NOT p_is_pro) AND v_current_count >= p_free_limit THEN
    RETURN QUERY SELECT false, v_row.ai_count_today, v_row.uploads_count_today, v_row.last_usage_reset_date;
    RETURN;
  END IF;

  IF p_counter_type = 'ai' THEN
    UPDATE public.users SET ai_count_today = ai_count_today + 1 WHERE id = p_user_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.users SET uploads_count_today = uploads_count_today + 1 WHERE id = p_user_id
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY SELECT true, v_row.ai_count_today, v_row.uploads_count_today, v_row.last_usage_reset_date;
END;
$$;

-- Lock this function down: only the backend (using the SERVICE ROLE key,
-- which always runs as the 'service_role' Postgres role regardless of
-- table-level RLS) may call it. A signed-in user's own anon-key session
-- must NOT be able to call this directly — among other things, p_is_pro
-- is supplied by the CALLER, so letting an arbitrary client call this
-- function would let them simply pass p_is_pro = true and bypass the
-- quota entirely.
REVOKE ALL ON FUNCTION public.increment_daily_quota(uuid, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_daily_quota(uuid, text, integer, boolean) TO service_role;


-- ----------------------------------------------------------------------------
-- PART 2: Generic distributed rate limiter (reuses this Supabase project;
-- no Redis / external service introduced)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket_key    text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0
);

-- RLS enabled with NO policies at all: this means NO row is visible or
-- writable to any client using the anon/authenticated key, from any
-- direction. The table is only ever touched through the SECURITY DEFINER
-- function below (which runs with the privileges of the function owner,
-- bypassing RLS) or directly by the backend's service-role key.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS TABLE (
  allowed boolean,
  current_count integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.rate_limits%ROWTYPE;
BEGIN
  INSERT INTO public.rate_limits (bucket_key, window_start, request_count)
  VALUES (p_key, v_now, 0)
  ON CONFLICT (bucket_key) DO NOTHING;

  -- Row-level lock serializes concurrent requests sharing the same key
  -- (same user id or same IP, depending on how server.ts builds the key).
  SELECT * INTO v_row FROM public.rate_limits WHERE bucket_key = p_key FOR UPDATE;

  -- Window expired: start a fresh window.
  IF v_row.window_start <= v_now - make_interval(secs => p_window_seconds) THEN
    UPDATE public.rate_limits
    SET window_start = v_now, request_count = 1
    WHERE bucket_key = p_key
    RETURNING * INTO v_row;

    RETURN QUERY SELECT true, v_row.request_count, 0;
    RETURN;
  END IF;

  IF v_row.request_count >= p_max_requests THEN
    RETURN QUERY SELECT
      false,
      v_row.request_count,
      GREATEST(0, p_window_seconds - EXTRACT(EPOCH FROM (v_now - v_row.window_start))::integer);
    RETURN;
  END IF;

  UPDATE public.rate_limits
  SET request_count = request_count + 1
  WHERE bucket_key = p_key
  RETURNING * INTO v_row;

  RETURN QUERY SELECT true, v_row.request_count, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- Optional but recommended: periodically clean up old rows so this table
-- doesn't grow forever (one row per distinct rate-limit key ever seen).
-- Safe to run manually / on a schedule (e.g. Supabase's pg_cron, or just
-- run it by hand occasionally) — NOT required for correctness, only for
-- housekeeping.
--   DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';


-- ----------------------------------------------------------------------------
-- Sanity checks to run after applying this migration
-- ----------------------------------------------------------------------------
--   select proname, prosecdef from pg_proc
--   where proname in ('increment_daily_quota', 'check_rate_limit');
--   -- prosecdef should be TRUE for both (confirms SECURITY DEFINER is active)
--
--   select grantee, privilege_type from information_schema.role_routine_grants
--   where routine_name in ('increment_daily_quota', 'check_rate_limit');
--   -- should show ONLY service_role with EXECUTE, nothing for anon/authenticated
