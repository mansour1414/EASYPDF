-- Phase 3.2 Security Remediation Migration
-- Multi-Subscription Isolation + Crash-Safe Webhook Idempotency + Admin Pro Separation

-- 1. Users Table: Add admin_granted_pro column
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'users' 
          AND column_name = 'admin_granted_pro'
    ) THEN
        ALTER TABLE public.users ADD COLUMN admin_granted_pro BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- 2. Subscriptions Table: Ensure stripe_subscription_id is UNIQUE and user_id is indexed
DO $$ 
BEGIN 
    -- Drop old unique constraint on user_id if present
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'subscriptions'
          AND constraint_name = 'subscriptions_user_id_key'
    ) THEN
        ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_user_id_key;
    END IF;
END $$;

-- NOTE (audit, Aug 2026): the DELETE cleanup below used to run
-- UNCONDITIONALLY every time this script was executed, even on repeat
-- runs after the UNIQUE constraint was already successfully added. Unlike
-- every other statement in this file (each guarded by an existence
-- check so it's safe to re-run), this meant re-running the migration
-- later — e.g. to pick up an unrelated later change in this same file —
-- would silently delete ANY new NULL-stripe_subscription_id or duplicate
-- rows that had appeared since, with no warning and no chance to inspect
-- them first. server.ts's updateSubscriptionRecord() never writes a row
-- without a stripe_subscription_id (it's guarded by `if (supabase &&
-- subId)`), so in the normal case there's nothing to clean up after the
-- first run — but on a database with older/manually-inserted rows this
-- was a live data-loss trap. Now gated the same way as the rest of this
-- file: only runs the one time it's actually needed, before the
-- constraint exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'subscriptions'
          AND constraint_name = 'subscriptions_stripe_subscription_id_key'
    ) THEN
        -- Before deleting anything, inspect what would be removed. If any
        -- of these represent a real subscription (e.g. legacy data from
        -- before this app's current insert pattern), back up the row
        -- manually before proceeding — this operation is irreversible:
        --   SELECT * FROM public.subscriptions WHERE stripe_subscription_id IS NULL;
        --   SELECT s1.* FROM public.subscriptions s1 JOIN public.subscriptions s2
        --     ON s1.stripe_subscription_id = s2.stripe_subscription_id
        --     WHERE s1.created_at < s2.created_at;
        DELETE FROM public.subscriptions WHERE stripe_subscription_id IS NULL;

        DELETE FROM public.subscriptions s1
        USING public.subscriptions s2
        WHERE s1.stripe_subscription_id = s2.stripe_subscription_id
          AND s1.created_at < s2.created_at;
    END IF;
END $$;

-- Add UNIQUE constraint on stripe_subscription_id if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'subscriptions'
          AND constraint_name = 'subscriptions_stripe_subscription_id_key'
    ) THEN
        ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
    END IF;
END $$;

-- Ensure updated_at column exists on subscriptions
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON public.subscriptions(stripe_subscription_id);

-- 3. Stripe Events Table: Add lease-based idempotency columns
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stripe_events' AND column_name = 'claimed_at'
    ) THEN
        ALTER TABLE public.stripe_events ADD COLUMN claimed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stripe_events' AND column_name = 'lease_expires_at'
    ) THEN
        ALTER TABLE public.stripe_events ADD COLUMN lease_expires_at TIMESTAMPTZ;
    END IF;
END $$;
