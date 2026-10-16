-- Create stripe_events table for persistent webhook idempotency
CREATE TABLE IF NOT EXISTS public.stripe_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_created_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row-Level Security
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Add last_event_created_at column to public.subscriptions if not present
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'subscriptions' 
          AND column_name = 'last_event_created_at'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN last_event_created_at TIMESTAMPTZ;
    END IF;
END $$;
