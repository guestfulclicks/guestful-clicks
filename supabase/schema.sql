-- ─────────────────────────────────────────────────────────────────────────────
-- CANDID Clicks — Complete Database Schema
-- Documentation only — reflects the live Supabase database as of 2026-05-30.
-- Do NOT re-run this against a live database; use the migration files instead.
--
-- Last reconciled against: direct SQL-editor audit + migration history.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── users ─────────────────────────────────────────────────────────────────────
-- Created automatically via handle_new_user trigger on auth.users insert.
-- organiser_type is set during KYC signup step 0.

CREATE TABLE IF NOT EXISTS public.users (
  id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name      text,
  email          text,
  phone          text,
  role           text        NOT NULL DEFAULT 'guest'
                             CHECK (role IN ('host', 'organiser', 'guest', 'admin')),
  organiser_type text        CHECK (organiser_type IN ('event_organiser', 'travel_agent')),
  push_token     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── events ────────────────────────────────────────────────────────────────────
-- Both private host films and public organiser events.
-- reveal_mode: 'during' = live feed, 'after' = auto-unlock, 'custom' = set time.
-- expires_at set by set_event_expiry trigger (30 days private / 15 days public).

CREATE TABLE IF NOT EXISTS public.events (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           text        NOT NULL,
  type            text        NOT NULL CHECK (type IN ('private', 'public')),
  host_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_date      date,
  event_end_time  text,                               -- "HH:MM" or ISO date for travel trips
  reveal_time     timestamptz,
  reveal_mode     text        NOT NULL DEFAULT 'after'
                              CHECK (reveal_mode IN ('during', 'after', 'custom')),
  shot_limit      int         NOT NULL DEFAULT 18,
  aesthetic       text        NOT NULL DEFAULT 'original'
                              CHECK (aesthetic IN ('original', 'film', 'noir')),
  cover_image     text,
  invitation_card text,
  share_code      text        NOT NULL UNIQUE,
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'revealed', 'archived')),
  amount_paid     int         NOT NULL DEFAULT 0,
  payment_id      text,
  city            text,
  state           text,
  country         text        DEFAULT 'IN',
  currency        text        DEFAULT 'INR',
  latitude        decimal(10, 8),
  longitude       decimal(11, 8),
  event_category  text,
  guest_count     int,
  pricing_tier    text,
  expires_at      timestamptz,
  is_deleted      boolean     NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_host_id_idx    ON public.events (host_id);
CREATE INDEX IF NOT EXISTS events_share_code_idx ON public.events (share_code);
CREATE INDEX IF NOT EXISTS events_status_idx     ON public.events (status);
CREATE INDEX IF NOT EXISTS events_date_idx       ON public.events (event_date DESC);
CREATE INDEX IF NOT EXISTS events_expires_at_idx ON public.events (expires_at)
  WHERE expires_at IS NOT NULL AND is_deleted = false;

-- ── participants ──────────────────────────────────────────────────────────────
-- Guests join without creating an account.
-- package_id set when guest used a special package instead of a standard tier.

CREATE TABLE IF NOT EXISTS public.participants (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES public.users(id),
  name         text        NOT NULL,
  qr_token     text        NOT NULL UNIQUE,
  tier         text        NOT NULL DEFAULT 'free',
  shot_limit   int         NOT NULL DEFAULT 18,
  upload_count int         NOT NULL DEFAULT 0,
  shots_used   int         NOT NULL DEFAULT 0,
  amount_paid  int         NOT NULL DEFAULT 0,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  payment_id   text,
  package_id   uuid        REFERENCES public.packages(id),
  push_token   text
);

CREATE INDEX IF NOT EXISTS participants_event_id_idx   ON public.participants (event_id);
CREATE INDEX IF NOT EXISTS participants_qr_token_idx   ON public.participants (qr_token);
CREATE INDEX IF NOT EXISTS participants_package_id_idx ON public.participants (package_id)
  WHERE package_id IS NOT NULL;

-- ── photos ────────────────────────────────────────────────────────────────────
-- is_revealed flips to true on event reveal (batch update or trigger).
-- is_deleted / deleted_at support soft-deletion for admin moderation.

CREATE TABLE IF NOT EXISTS public.photos (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id       uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  participant_id uuid        NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  url            text        NOT NULL,
  is_revealed    boolean     NOT NULL DEFAULT false,
  is_deleted     boolean     NOT NULL DEFAULT false,
  deleted_at     timestamptz,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photos_event_id_idx       ON public.photos (event_id);
CREATE INDEX IF NOT EXISTS photos_participant_id_idx ON public.photos (participant_id);
CREATE INDEX IF NOT EXISTS photos_revealed_idx       ON public.photos (event_id)
  WHERE is_revealed = true AND is_deleted = false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FINANCIAL TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── payouts ───────────────────────────────────────────────────────────────────
-- Created by calculate_payout() trigger when an event is revealed.
-- total_collected / organiser_share updated by update_payout_amount trigger.

CREATE TABLE IF NOT EXISTS public.payouts (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         uuid        NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  organiser_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  total_collected  int         NOT NULL DEFAULT 0,
  organiser_share  int         NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'scheduled', 'paid', 'failed')),
  scheduled_date   date,
  paid_at          timestamptz,
  upi_id           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_organiser_id_idx ON public.payouts (organiser_id);
CREATE INDEX IF NOT EXISTS payouts_status_idx       ON public.payouts (status);

-- ── pricing_config ────────────────────────────────────────────────────────────
-- One row per country. Queried by paywall-screen for participant tiers.
-- Admin panel also stores richer JSON config in admin_settings.

CREATE TABLE IF NOT EXISTS public.pricing_config (
  id                        uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code              text        NOT NULL UNIQUE DEFAULT 'IN',
  currency_symbol           text        NOT NULL DEFAULT '₹',
  currency_code             text        NOT NULL DEFAULT 'INR',
  tier_1_shots              int         NOT NULL DEFAULT 10,
  tier_1_price              int         NOT NULL DEFAULT 99,
  tier_2_shots              int         NOT NULL DEFAULT 15,
  tier_2_price              int         NOT NULL DEFAULT 199,
  tier_3_shots              int         NOT NULL DEFAULT 25,
  tier_3_price              int         NOT NULL DEFAULT 299,
  tier_4_shots              int         NOT NULL DEFAULT 46,
  tier_4_price              int         NOT NULL DEFAULT 499,
  private_upto_25           int         NOT NULL DEFAULT 299,
  private_upto_75           int         NOT NULL DEFAULT 599,
  private_upto_150          int         NOT NULL DEFAULT 999,
  private_upto_300          int         NOT NULL DEFAULT 1799,
  private_above_300         int         NOT NULL DEFAULT 2999,
  organiser_per_event       int         NOT NULL DEFAULT 2499,
  organiser_monthly         int         NOT NULL DEFAULT 5999,
  revenue_share_percent     int         NOT NULL DEFAULT 25,
  private_shot_limit        int         NOT NULL DEFAULT 18,
  public_reveal_delay_hours int         NOT NULL DEFAULT 2,
  host_shot_limit           int         NOT NULL DEFAULT 50,
  organiser_shot_limit      int         NOT NULL DEFAULT 50,
  travel_agent_event_fee    int         NOT NULL DEFAULT 2499,
  is_active                 boolean     NOT NULL DEFAULT true,
  updated_by                text,
  updated_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pricing_config (country_code) VALUES ('IN')
ON CONFLICT (country_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADMIN TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── admin_settings ────────────────────────────────────────────────────────────
-- Key/value store for server-side config. Values are text (cast as needed).
-- Known keys:
--   private_gallery_retention_days = '30'
--   public_gallery_retention_days  = '15'
--   host_shot_limit                = '50'
--   expiry_warning_days            = '3'
--   organiser_disclaimer           = full text string
--   payout_disclaimer              = full text string
--   platform_settings              = JSON string
--   pricing_config                 = JSON pricing blob for India
--   pricing_config_XX              = JSON pricing blob per country
--   pricing_change_history         = JSON array of change entries

CREATE TABLE IF NOT EXISTS public.admin_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO public.admin_settings (key, value) VALUES
  ('private_gallery_retention_days', '30'),
  ('public_gallery_retention_days',  '15'),
  ('host_shot_limit',                '50'),
  ('expiry_warning_days',            '3')
ON CONFLICT (key) DO NOTHING;

-- ── admin_permissions ─────────────────────────────────────────────────────────
-- Maps an admin user to their role and a permissions JSONB blob.

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  admin_role  text        NOT NULL DEFAULT 'support_admin'
                          CHECK (admin_role IN (
                            'super_admin', 'finance_admin', 'support_admin',
                            'analytics_admin', 'content_admin'
                          )),
  permissions jsonb       NOT NULL DEFAULT '{}',
  created_by  uuid        REFERENCES public.users(id),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── admin_notifications ───────────────────────────────────────────────────────
-- In-app notifications in the admin panel bell.
-- score: optional urgency score used for ordering / filtering.

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         text        NOT NULL,
  organiser_id uuid        REFERENCES public.users(id),
  message      text        NOT NULL,
  score        int,
  is_read      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notif_is_read_idx ON public.admin_notifications (is_read);
CREATE INDEX IF NOT EXISTS admin_notif_created_idx ON public.admin_notifications (created_at DESC);

-- ── admin_activity_log ────────────────────────────────────────────────────────
-- Immutable audit trail of every admin action.

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id    uuid        NOT NULL REFERENCES public.users(id),
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb       NOT NULL DEFAULT '{}',
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_admin_id_idx ON public.admin_activity_log (admin_id);
CREATE INDEX IF NOT EXISTS activity_log_created_idx  ON public.admin_activity_log (created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ORGANISER KYC
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── organiser_kyc ─────────────────────────────────────────────────────────────
-- Full KYC submission for event organisers and travel agents.

CREATE TABLE IF NOT EXISTS public.organiser_kyc (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  -- Identity
  full_name        text        NOT NULL,
  business_name    text,
  pan_number       text,
  gst_number       text,
  -- Aadhaar (last 4 digits only for verification)
  aadhaar_last4    text,
  -- Bank / payout
  upi_id           text,
  bank_name        text,
  account_number   text,
  ifsc_code        text,
  -- Contact person
  contact_name     text,
  contact_phone    text,
  contact_email    text,
  -- Organiser type
  organiser_type   text        CHECK (organiser_type IN ('event_organiser', 'travel_agent')),
  -- Travel agent specific
  agency_name      text,
  iata_code        text,
  trip_type        text        CHECK (trip_type IN ('domestic', 'international', 'both')),
  avg_group_size   int,
  -- Review lifecycle
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  rejection_reason text,
  notes            text,
  country_code     text        DEFAULT 'IN',
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid        REFERENCES public.users(id),
  updated_at       timestamptz
);

CREATE INDEX IF NOT EXISTS kyc_user_id_idx ON public.organiser_kyc (user_id);
CREATE INDEX IF NOT EXISTS kyc_status_idx  ON public.organiser_kyc (status);

-- ── kyc_verification_log ──────────────────────────────────────────────────────
-- Automated verification results (PAN/Aadhaar/UPI checks).

CREATE TABLE IF NOT EXISTS public.kyc_verification_log (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  kyc_id              uuid        NOT NULL REFERENCES public.organiser_kyc(id) ON DELETE CASCADE,
  organiser_id        uuid        REFERENCES public.users(id),
  verification_type   text        NOT NULL,           -- 'pan' | 'aadhaar' | 'upi' | 'bank'
  status              text        NOT NULL,           -- 'passed' | 'failed' | 'pending'
  input_data          jsonb,
  result_data         jsonb,
  confidence_score    decimal(5, 2),
  flags               jsonb,
  error_message       text,
  processing_time_ms  int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kyc_log_kyc_id_idx ON public.kyc_verification_log (kyc_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PACKAGES & TRAVEL
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── packages ──────────────────────────────────────────────────────────────────
-- Shot packages available as alternatives to standard tiers.
-- price_per_person: per-guest or per-traveller price (integer, in rupees).
-- NOTE: column was incorrectly created as boolean in the original live schema;
--       fixed to integer via ALTER COLUMN on 2026-05-30.

CREATE TABLE IF NOT EXISTS public.packages (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             text        NOT NULL,
  description      text,
  shots            int         NOT NULL,
  price            int         NOT NULL,              -- total / base price
  price_per_person int         NOT NULL,              -- per-guest price (integer)
  country_code     text        NOT NULL DEFAULT 'IN',
  event_type       text        NOT NULL DEFAULT 'travel'
                               CHECK (event_type IN ('private', 'public', 'travel', 'both')),
  user_type        text        CHECK (user_type IN ('host', 'organiser', 'travel_agent')),
  valid_from       date,
  valid_to         date,
  is_active        boolean     NOT NULL DEFAULT true,
  is_featured      boolean     NOT NULL DEFAULT false,
  max_participants int,
  created_by       uuid        REFERENCES public.users(id),
  sort_order       int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packages_country_type_idx ON public.packages (country_code, event_type)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS packages_valid_from_idx   ON public.packages (valid_from)
  WHERE valid_from IS NOT NULL;

-- Seeded India travel packages (price = price_per_person):
--   Essential  10 shots ₹149
--   Explorer   20 shots ₹249  (is_featured = true)
--   Journey    35 shots ₹399
--   Grand Tour 50 shots ₹599

-- ── travel_bookings ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.travel_bookings (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  agent_id         uuid        NOT NULL REFERENCES public.users(id),
  package_id       uuid        NOT NULL REFERENCES public.packages(id),
  total_travellers int         NOT NULL,
  price_per_person int         NOT NULL,
  total_paid       int         NOT NULL,
  payment_id       text,
  slots_remaining  int         NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travel_bookings_event_id_idx ON public.travel_bookings (event_id);
CREATE INDEX IF NOT EXISTS travel_bookings_agent_id_idx ON public.travel_bookings (agent_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- GUEST EXPERIENCE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── personal_memories ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.personal_memories (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  participant_id   uuid        NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  photo_ids        uuid[]      NOT NULL DEFAULT '{}',
  hidden_photo_ids uuid[]      NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, participant_id)
);

-- ── photo_deletions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.photo_deletions (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_id        uuid        NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  deleted_by      text        NOT NULL,
  deleted_by_role text        NOT NULL DEFAULT 'admin',
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── notification_log ──────────────────────────────────────────────────────────
-- Admin push-notification campaigns.
-- audience_type: 'all' | 'hosts' | 'organisers' | 'guests' | 'custom'
-- status: 'sent' | 'scheduled' | 'failed'

CREATE TABLE IF NOT EXISTS public.notification_log (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            text        NOT NULL,
  message          text        NOT NULL,
  audience_type    text        NOT NULL DEFAULT 'all',
  audience_filter  jsonb,
  recipients_count int         NOT NULL DEFAULT 0,
  success_count    int         NOT NULL DEFAULT 0,
  failed_count     int         NOT NULL DEFAULT 0,
  sent_by          uuid        REFERENCES public.users(id),
  scheduled_for    timestamptz,
  sent_at          timestamptz,
  status           text        NOT NULL DEFAULT 'sent'
                               CHECK (status IN ('sent', 'scheduled', 'failed')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_log_status_idx  ON public.notification_log (status);
CREATE INDEX IF NOT EXISTS notif_log_sent_at_idx ON public.notification_log (sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTENT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── invitation_templates ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invitation_templates (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         text        NOT NULL,
  image_url     text        NOT NULL,
  thumbnail_url text,
  country_codes text[],
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    int         NOT NULL DEFAULT 0,
  uploaded_by   uuid        REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── event_categories ──────────────────────────────────────────────────────────
-- Queried by event-type.tsx as: SELECT name, icon FROM event_categories
-- NOTE: column is 'name' — NOT 'key' or 'title' (fixed in event-type.tsx).

CREATE TABLE IF NOT EXISTS public.event_categories (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text        NOT NULL UNIQUE,
  icon          text        NOT NULL DEFAULT '🎉',
  event_type    text        NOT NULL DEFAULT 'both'
                            CHECK (event_type IN ('private', 'public', 'both')),
  country_codes text[],
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seeded with 15 India categories (wedding, birthday, bachelor, trip, offsite,
-- celebration, sports, music, cultural, corporate, college, public + 3 more)

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. handle_new_user ────────────────────────────────────────────────────────
-- Auto-creates public.users row on auth.users insert (Google/email sign-up).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. set_event_expiry ───────────────────────────────────────────────────────
-- Sets events.expires_at on INSERT/UPDATE.
-- Private: 30 days from event_date. Public: 15 days from event_date.
-- Values read from admin_settings for live configurability.

CREATE OR REPLACE FUNCTION public.set_event_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  retention_days integer;
BEGIN
  IF NEW.type = 'public' THEN
    SELECT value::integer INTO retention_days FROM public.admin_settings
      WHERE key = 'public_gallery_retention_days';
    IF retention_days IS NULL THEN retention_days := 15; END IF;
  ELSE
    SELECT value::integer INTO retention_days FROM public.admin_settings
      WHERE key = 'private_gallery_retention_days';
    IF retention_days IS NULL THEN retention_days := 30; END IF;
  END IF;
  NEW.expires_at := COALESCE(NEW.event_date::timestamptz, now())
                    + (retention_days || ' days')::interval;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_event_expiry_trigger'
      AND tgrelid = 'public.events'::regclass
  ) THEN
    CREATE TRIGGER set_event_expiry_trigger
      BEFORE INSERT OR UPDATE ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.set_event_expiry();
  END IF;
END; $$;

-- ── 3. generate_share_code ────────────────────────────────────────────────────
-- Generates a unique 8-character uppercase alphanumeric share code.

CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars  text    := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code   text    := '';
  i      integer;
BEGIN
  FOR i IN 1..8 LOOP
    code := code || substr(chars, floor(random() * 36 + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- ── 4. generate_qr_token ──────────────────────────────────────────────────────
-- Generates a 32-character lowercase hex token for participant identification.

CREATE OR REPLACE FUNCTION public.generate_qr_token()
RETURNS text LANGUAGE sql AS $$
  SELECT lower(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))::text;
$$;

-- ── 5. update_payout_amount ───────────────────────────────────────────────────
-- After each paid participant INSERT, recalculates the organiser's 25% share.

CREATE OR REPLACE FUNCTION public.update_payout_amount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total   int;
  v_share   int;
BEGIN
  IF NEW.amount_paid <= 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(amount_paid), 0) INTO v_total
    FROM public.participants WHERE event_id = NEW.event_id;
  v_share := FLOOR(v_total * 25.0 / 100.0)::int;
  UPDATE public.payouts
    SET total_collected = v_total, organiser_share = v_share
    WHERE event_id = NEW.event_id AND status IN ('pending', 'scheduled');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_participant_paid_update_payout ON public.participants;
CREATE TRIGGER on_participant_paid_update_payout
  AFTER INSERT ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.update_payout_amount();

-- ── 6. calculate_payout ───────────────────────────────────────────────────────
-- Creates (or updates) the payout row when an event is revealed.
-- Fires via on_event_revealed trigger.

CREATE OR REPLACE FUNCTION public.calculate_payout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total   int;
  v_share   int;
BEGIN
  IF NEW.status = 'revealed' AND OLD.status != 'revealed' THEN
    SELECT COALESCE(SUM(amount_paid), 0) INTO v_total
      FROM public.participants WHERE event_id = NEW.id;
    v_share := FLOOR(v_total * 25.0 / 100.0)::int;
    INSERT INTO public.payouts (event_id, organiser_id, total_collected, organiser_share)
      VALUES (NEW.id, NEW.host_id, v_total, v_share)
      ON CONFLICT (event_id) DO UPDATE
        SET total_collected = EXCLUDED.total_collected,
            organiser_share  = EXCLUDED.organiser_share;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_event_revealed ON public.events;
CREATE TRIGGER on_event_revealed
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.calculate_payout();

-- ── 7. auto_reveal_photos ─────────────────────────────────────────────────────
-- Flips is_revealed = true on photos when event.reveal_time is passed.
-- Called by a scheduled job or the app's autoUnlockAfterEvent().

CREATE OR REPLACE FUNCTION public.auto_reveal_photos()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.photos p
    SET is_revealed = true
    FROM public.events e
    WHERE e.id = p.event_id
      AND e.status = 'active'
      AND e.reveal_time <= now()
      AND e.reveal_mode = 'after'
      AND p.is_revealed = false
      AND p.is_deleted = false;

  UPDATE public.events
    SET status = 'revealed'
    WHERE status = 'active'
      AND reveal_time <= now()
      AND reveal_mode = 'after';
END;
$$;

-- ── 8. auto_expire_events ─────────────────────────────────────────────────────
-- Archives events whose expires_at has passed.

CREATE OR REPLACE FUNCTION public.auto_expire_events()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.events
    SET status = 'archived'
    WHERE status IN ('active', 'revealed')
      AND expires_at IS NOT NULL
      AND expires_at < now()
      AND is_deleted = false;
END;
$$;

-- ── 9. send_expiry_warnings ───────────────────────────────────────────────────
-- Creates admin_notifications for events expiring within expiry_warning_days.

CREATE OR REPLACE FUNCTION public.send_expiry_warnings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  warning_days int;
BEGIN
  SELECT value::int INTO warning_days FROM public.admin_settings
    WHERE key = 'expiry_warning_days';
  IF warning_days IS NULL THEN warning_days := 3; END IF;

  INSERT INTO public.admin_notifications (type, message, organiser_id)
  SELECT
    'event_expiring',
    'Event "' || e.title || '" expires in ' || warning_days || ' days.',
    e.host_id
  FROM public.events e
  WHERE e.status IN ('active', 'revealed')
    AND e.expires_at BETWEEN now() AND now() + (warning_days || ' days')::interval
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_notifications n
      WHERE n.type = 'event_expiring'
        AND n.organiser_id = e.host_id
        AND n.created_at > now() - interval '1 day'
    );
END;
$$;

-- ── 10. update_kyc_timestamp ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_kyc_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kyc_updated_at ON public.organiser_kyc;
CREATE TRIGGER kyc_updated_at
  BEFORE UPDATE ON public.organiser_kyc
  FOR EACH ROW EXECUTE FUNCTION public.update_kyc_timestamp();

-- ── 11. check_kyc_duplicates ──────────────────────────────────────────────────
-- Raises an exception if PAN, Aadhaar (last4), or UPI is already registered
-- under a different user_id.

CREATE OR REPLACE FUNCTION public.check_kyc_duplicates()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pan_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organiser_kyc
    WHERE pan_number = NEW.pan_number AND user_id != NEW.user_id
  ) THEN
    RAISE EXCEPTION 'PAN number already registered';
  END IF;

  IF NEW.upi_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organiser_kyc
    WHERE upi_id = NEW.upi_id AND user_id != NEW.user_id
  ) THEN
    RAISE EXCEPTION 'UPI ID already registered';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kyc_check_duplicates ON public.organiser_kyc;
CREATE TRIGGER kyc_check_duplicates
  BEFORE INSERT OR UPDATE ON public.organiser_kyc
  FOR EACH ROW EXECUTE FUNCTION public.check_kyc_duplicates();

-- ── is_admin helper ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.users WHERE id = auth.uid()), false);
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.storage_analytics AS
SELECT
  COUNT(*) FILTER (WHERE p.is_deleted = false)                                     AS total_photos,
  COUNT(*) FILTER (WHERE p.is_deleted = false) * 2                                 AS total_storage_mb,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'public')               AS public_photos,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'public') * 2           AS public_storage_mb,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'private')              AS private_photos,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'private') * 2          AS private_storage_mb,
  COUNT(DISTINCT CASE WHEN e.type = 'public'                   THEN e.id END)      AS public_events,
  COUNT(DISTINCT CASE WHEN e.type = 'private'                  THEN e.id END)      AS private_events,
  COUNT(DISTINCT CASE WHEN e.status IN ('archived', 'deleted') THEN e.id END)      AS archived_events,
  ROUND((COUNT(*) FILTER (WHERE p.is_deleted = false) * 2.0 / 1024 * 0.023)::numeric, 2)
                                                                                   AS estimated_cost_usd
FROM public.photos p
JOIN public.events e ON e.id = p.event_id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS  (configured in Supabase Dashboard → Storage)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- event-photos        PRIVATE   — app signs URLs for each participant session
-- kyc-documents       PRIVATE   — admin-only access
-- invitation-templates PUBLIC   — publicly readable card images
--
-- event-photos path convention:  {event_id}/{participant_id}/{unix_ms}_{index}.jpg
-- ─────────────────────────────────────────────────────────────────────────────
