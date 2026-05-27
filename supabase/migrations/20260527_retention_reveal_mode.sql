-- ── 1. admin_settings table (key/value store for server-side config) ─────────
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Seed retention values
INSERT INTO public.admin_settings (key, value)
VALUES
  ('private_gallery_retention_days', '30'),
  ('public_gallery_retention_days',  '15'),
  ('host_shot_limit',                '50')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── 2. Update existing admin_settings rows (idempotent) ───────────────────────
UPDATE public.admin_settings SET value = '30' WHERE key = 'private_gallery_retention_days';
UPDATE public.admin_settings SET value = '15' WHERE key = 'public_gallery_retention_days';

-- ── 3. set_event_expiry trigger function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_event_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  retention_days integer;
BEGIN
  IF new.type = 'public' THEN
    SELECT value::integer INTO retention_days
    FROM public.admin_settings
    WHERE key = 'public_gallery_retention_days';
    IF retention_days IS NULL THEN
      retention_days := 15;
    END IF;
  ELSE
    SELECT value::integer INTO retention_days
    FROM public.admin_settings
    WHERE key = 'private_gallery_retention_days';
    IF retention_days IS NULL THEN
      retention_days := 30;
    END IF;
  END IF;
  new.expires_at := COALESCE(new.event_date, current_date) +
                    (retention_days || ' days')::interval;
  RETURN new;
END;
$$;

-- ── 4. reveal_mode column on events ──────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reveal_mode text
  DEFAULT 'after'
  CHECK (reveal_mode IN ('during', 'after', 'custom'));

-- ── 5. organiser_type column on users ────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organiser_type text
  CHECK (organiser_type IN ('event_organiser', 'travel_agent'));

-- ── 6. organiser_type + travel agent columns on organiser_kyc ────────────────
ALTER TABLE public.organiser_kyc
  ADD COLUMN IF NOT EXISTS organiser_type  text
    CHECK (organiser_type IN ('event_organiser', 'travel_agent')),
  ADD COLUMN IF NOT EXISTS agency_name     text,
  ADD COLUMN IF NOT EXISTS iata_code       text,
  ADD COLUMN IF NOT EXISTS trip_type       text
    CHECK (trip_type IN ('domestic', 'international', 'both')),
  ADD COLUMN IF NOT EXISTS avg_group_size  integer;

-- ── 7. attach set_event_expiry trigger if not already present ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_event_expiry_trigger'
      AND tgrelid = 'public.events'::regclass
  ) THEN
    CREATE TRIGGER set_event_expiry_trigger
      BEFORE INSERT OR UPDATE ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.set_event_expiry();
  END IF;
END;
$$;
