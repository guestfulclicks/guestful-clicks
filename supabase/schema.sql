-- ─────────────────────────────────────────────────────────────────────────────
-- Guestful Clicks — Complete Database Schema
-- Documentation only — reflects the live Supabase database as of 2026-05-27.
-- Do NOT re-run this against a live database; use the migration files instead.
--
-- Dependency order: extensions → core tables → admin tables → feature tables
--   → functions & triggers → views
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── users ─────────────────────────────────────────────────────────────────────
-- One row per auth.users entry, created by the handle_new_user trigger.
-- role distinguishes hosts (private events), organisers (public events), admin.
-- organiser_type is set during KYC: 'event_organiser' or 'travel_agent'.

CREATE TABLE IF NOT EXISTS public.users (
  id             uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name      text,
  email          text,
  phone          text,
  role           text        NOT NULL DEFAULT 'guest'
                             CHECK (role IN ('host', 'organiser', 'guest', 'admin')),
  organiser_type text        CHECK (organiser_type IN ('event_organiser', 'travel_agent')),
  push_token     text,                                -- Expo push notification token
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── events ────────────────────────────────────────────────────────────────────
-- Both private host films and public organiser events live here.
-- type='private' → host paid flat fee; shot_limit is shared among guests.
-- type='public'  → organiser paid; participants pay per-tier for their own limit.
-- reveal_mode: 'during' streams photos live, 'after' auto-unlocks at event end,
--              'custom' lets host pick an exact reveal timestamp.

CREATE TABLE IF NOT EXISTS public.events (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           text        NOT NULL,
  type            text        NOT NULL CHECK (type IN ('private', 'public')),
  host_id         uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  event_date      date,
  event_end_time  text,                               -- "HH:MM" (24-h) for regular; ISO date for travel trips
  reveal_time     timestamptz,
  reveal_mode     text        NOT NULL DEFAULT 'after'
                              CHECK (reveal_mode IN ('during', 'after', 'custom')),
  shot_limit      int         NOT NULL DEFAULT 18,
  aesthetic       text        NOT NULL DEFAULT 'original'
                              CHECK (aesthetic IN ('original', 'film', 'noir')),
  cover_image     text,                               -- storage URL
  invitation_card text,                               -- storage URL
  share_code      text        NOT NULL UNIQUE,
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'revealed', 'archived')),
  amount_paid     int         NOT NULL DEFAULT 0,     -- host/organiser fee in lowest currency unit
  payment_id      text,                               -- Razorpay payment_id
  city            text,
  state           text,
  country         text        DEFAULT 'IN',
  currency        text        DEFAULT 'INR',
  latitude        numeric(9, 6),
  longitude       numeric(9, 6),
  event_category  text,
  guest_count     int,
  pricing_tier    text,                               -- flat-fee tier slug for private events
  expires_at      timestamptz,                        -- set by set_event_expiry trigger
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_host_id_idx    ON public.events (host_id);
CREATE INDEX IF NOT EXISTS events_share_code_idx ON public.events (share_code);
CREATE INDEX IF NOT EXISTS events_status_idx     ON public.events (status);
CREATE INDEX IF NOT EXISTS events_date_idx       ON public.events (event_date DESC);
CREATE INDEX IF NOT EXISTS events_expires_at_idx ON public.events (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── participants ──────────────────────────────────────────────────────────────
-- Every person who joined an event, regardless of payment.
-- Free guests (private events): tier='free', amount_paid=0.
-- Paid guests (public events): tier='publicXXX' or 'pkg_XXXXXXXX', amount_paid>0.
-- package_id is set when guest joined via a special package (not a standard tier).

CREATE TABLE IF NOT EXISTS public.participants (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     uuid        NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES public.users (id),               -- nullable; guests don't sign in
  name         text        NOT NULL,
  qr_token     text        NOT NULL UNIQUE,                            -- device-held credential
  tier         text        NOT NULL DEFAULT 'free',                    -- 'free' | 'publicXXX' | 'pkg_XXXXXXXX'
  shot_limit   int         NOT NULL DEFAULT 18,
  upload_count int         NOT NULL DEFAULT 0,
  shots_used   int         NOT NULL DEFAULT 0,
  amount_paid  int         NOT NULL DEFAULT 0,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  payment_id   text,                                                   -- Razorpay payment_id for paid tiers
  package_id   uuid        REFERENCES public.packages (id),           -- special package used, if any
  push_token   text                                                    -- Expo push token saved on join
);

CREATE INDEX IF NOT EXISTS participants_event_id_idx   ON public.participants (event_id);
CREATE INDEX IF NOT EXISTS participants_qr_token_idx   ON public.participants (qr_token);
CREATE INDEX IF NOT EXISTS participants_joined_at_idx  ON public.participants (joined_at DESC);
CREATE INDEX IF NOT EXISTS participants_package_id_idx ON public.participants (package_id)
  WHERE package_id IS NOT NULL;

-- ── photos ────────────────────────────────────────────────────────────────────
-- One row per uploaded photo.
-- is_revealed flips to true on event reveal (batch update by host or trigger).
-- is_deleted / deleted_at support soft-deletion for admin moderation.

CREATE TABLE IF NOT EXISTS public.photos (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id       uuid        NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  participant_id uuid        NOT NULL REFERENCES public.participants (id) ON DELETE CASCADE,
  url            text        NOT NULL,
  is_revealed    boolean     NOT NULL DEFAULT false,
  is_deleted     boolean     NOT NULL DEFAULT false,
  deleted_at     timestamptz,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photos_event_id_idx       ON public.photos (event_id);
CREATE INDEX IF NOT EXISTS photos_participant_id_idx ON public.photos (participant_id);
CREATE INDEX IF NOT EXISTS photos_event_revealed_idx ON public.photos (event_id)
  WHERE is_revealed = true AND is_deleted = false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FINANCIAL TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── payouts ───────────────────────────────────────────────────────────────────
-- One row per public event. total_collected grows as participants pay.
-- organiser_share is updated by the update_payout_amount trigger (25% of total).
-- Admin sets scheduled_date between day 36-50 after event date.

CREATE TABLE IF NOT EXISTS public.payouts (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         uuid        NOT NULL UNIQUE REFERENCES public.events (id) ON DELETE CASCADE,
  organiser_id     uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  total_collected  int         NOT NULL DEFAULT 0,   -- total participant revenue in ₹
  organiser_share  int         NOT NULL DEFAULT 0,   -- 25% share in ₹
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'scheduled', 'paid', 'failed')),
  scheduled_date   date,
  paid_at          timestamptz,
  upi_id           text,                              -- UPI address for bank transfer
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_organiser_id_idx ON public.payouts (organiser_id);
CREATE INDEX IF NOT EXISTS payouts_status_idx       ON public.payouts (status);

-- ── pricing_config ────────────────────────────────────────────────────────────
-- One row per country — complete pricing table for that market.
-- The app reads this for participant tiers and host/organiser prices.
-- The admin panel in admin_settings stores JSON blobs for richer config;
-- this table is the normalised, queryable representation.

CREATE TABLE IF NOT EXISTS public.pricing_config (
  id                          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code                text        NOT NULL UNIQUE DEFAULT 'IN',
  currency_symbol             text        NOT NULL DEFAULT '₹',
  currency_code               text        NOT NULL DEFAULT 'INR',
  -- Public participant shot tiers
  tier_1_shots                int         NOT NULL DEFAULT 10,
  tier_1_price                int         NOT NULL DEFAULT 99,
  tier_2_shots                int         NOT NULL DEFAULT 15,
  tier_2_price                int         NOT NULL DEFAULT 199,
  tier_3_shots                int         NOT NULL DEFAULT 25,
  tier_3_price                int         NOT NULL DEFAULT 299,
  tier_4_shots                int         NOT NULL DEFAULT 46,
  tier_4_price                int         NOT NULL DEFAULT 499,
  -- Private host flat-fee tiers (price in currency units)
  private_upto_25             int         NOT NULL DEFAULT 299,
  private_upto_75             int         NOT NULL DEFAULT 599,
  private_upto_150            int         NOT NULL DEFAULT 999,
  private_upto_300            int         NOT NULL DEFAULT 1799,
  private_above_300           int         NOT NULL DEFAULT 2999,
  -- Organiser plans
  organiser_per_event         int         NOT NULL DEFAULT 2499,
  organiser_monthly           int         NOT NULL DEFAULT 5999,
  -- Revenue share
  revenue_share_percent       int         NOT NULL DEFAULT 25,
  -- Shot limits
  private_shot_limit          int         NOT NULL DEFAULT 18,   -- per guest on private events
  host_shot_limit             int         NOT NULL DEFAULT 50,   -- event creator upload cap
  organiser_shot_limit        int         NOT NULL DEFAULT 18,   -- organiser default
  public_reveal_delay_hours   int         NOT NULL DEFAULT 2,    -- auto-reveal offset after event end
  -- Travel agent
  travel_agent_event_fee      int         NOT NULL DEFAULT 0,
  is_active                   boolean     NOT NULL DEFAULT true,
  updated_by                  text,
  updated_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Seed India row
INSERT INTO public.pricing_config (country_code) VALUES ('IN')
ON CONFLICT (country_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADMIN TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── admin_settings ────────────────────────────────────────────────────────────
-- Generic key/value store for server-side configuration.
-- Keys include: 'pricing_config', 'pricing_config_XX', 'pricing_change_history',
--               'private_gallery_retention_days', 'public_gallery_retention_days',
--               'host_shot_limit'.
-- Values are stored as JSONB to support both scalars and structured objects.

CREATE TABLE IF NOT EXISTS public.admin_settings (
  key   text  PRIMARY KEY,
  value jsonb NOT NULL
);

-- Seed retention defaults
INSERT INTO public.admin_settings (key, value) VALUES
  ('private_gallery_retention_days', '30'),
  ('public_gallery_retention_days',  '15'),
  ('host_shot_limit',                '50')
ON CONFLICT (key) DO NOTHING;

-- ── admin_permissions ─────────────────────────────────────────────────────────
-- Maps a user (admin) to their role and a permissions JSONB blob.
-- role: super_admin | finance_admin | support_admin | analytics_admin | content_admin

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL UNIQUE REFERENCES public.users (id) ON DELETE CASCADE,
  admin_role  text        NOT NULL DEFAULT 'support_admin'
                          CHECK (admin_role IN (
                            'super_admin', 'finance_admin', 'support_admin',
                            'analytics_admin', 'content_admin'
                          )),
  permissions jsonb       NOT NULL DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

CREATE INDEX IF NOT EXISTS admin_permissions_user_id_idx ON public.admin_permissions (user_id);

-- ── admin_notifications ───────────────────────────────────────────────────────
-- In-app notifications shown in the admin panel bell icon.
-- type: 'kyc_flagged' | 'kyc_approved' | 'kyc_rejected' |
--        'payout_requested' | 'fraud_alert' | 'new_organiser'

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         text        NOT NULL,
  message      text        NOT NULL,
  is_read      boolean     NOT NULL DEFAULT false,
  organiser_id uuid        REFERENCES public.users (id),   -- nullable; not all notifs relate to an organiser
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notif_is_read_idx  ON public.admin_notifications (is_read);
CREATE INDEX IF NOT EXISTS admin_notif_created_idx  ON public.admin_notifications (created_at DESC);

-- ── admin_activity_log ────────────────────────────────────────────────────────
-- Immutable audit trail of every admin action.
-- Queried by the Activity Log modal in admin-layout.tsx.

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id    uuid        NOT NULL REFERENCES public.users (id),
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb       NOT NULL DEFAULT '{}',
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_admin_id_idx  ON public.admin_activity_log (admin_id);
CREATE INDEX IF NOT EXISTS activity_log_created_idx   ON public.admin_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_action_idx    ON public.admin_activity_log (action);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ORGANISER KYC
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── organiser_kyc ─────────────────────────────────────────────────────────────
-- KYC submission for event organisers and travel agents.
-- organiser_type: 'event_organiser' or 'travel_agent' (set on submission).
-- Travel agent fields (agency_name, iata_code, trip_type, avg_group_size) are
-- only populated when organiser_type = 'travel_agent'.

CREATE TABLE IF NOT EXISTS public.organiser_kyc (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid        NOT NULL UNIQUE REFERENCES public.users (id) ON DELETE CASCADE,
  -- Common identity fields
  full_name        text        NOT NULL,
  business_name    text,
  pan_number       text,
  gst_number       text,
  -- Bank / payout details
  upi_id           text,
  bank_name        text,
  account_number   text,
  ifsc_code        text,
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
  reviewed_by      uuid        REFERENCES public.users (id)
);

CREATE INDEX IF NOT EXISTS kyc_user_id_idx  ON public.organiser_kyc (user_id);
CREATE INDEX IF NOT EXISTS kyc_status_idx   ON public.organiser_kyc (status);

-- ── kyc_verification_log ──────────────────────────────────────────────────────
-- Audit trail for each KYC status transition (approve / reject / flag / note).

CREATE TABLE IF NOT EXISTS public.kyc_verification_log (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  kyc_id       uuid        NOT NULL REFERENCES public.organiser_kyc (id) ON DELETE CASCADE,
  action       text        NOT NULL,                  -- 'approved' | 'rejected' | 'flagged' | 'note_added'
  performed_by uuid        NOT NULL REFERENCES public.users (id),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kyc_log_kyc_id_idx ON public.kyc_verification_log (kyc_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PACKAGES & TRAVEL
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── packages ──────────────────────────────────────────────────────────────────
-- Shot packages available as an alternative to standard tiers.
-- Used by travel agents (event_type='travel'), hosts (event_type='private'),
-- and organisers (event_type='public'). user_type=NULL means available to all.
-- valid_from / valid_to bound seasonal or festive packages.

CREATE TABLE IF NOT EXISTS public.packages (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             text        NOT NULL,
  description      text,
  shots            int         NOT NULL,
  price            int,                               -- legacy / total event price (if applicable)
  price_per_person int         NOT NULL,              -- per-traveller / per-guest price
  country_code     text        NOT NULL DEFAULT 'IN',
  event_type       text        NOT NULL DEFAULT 'travel'
                               CHECK (event_type IN ('private', 'public', 'travel', 'both')),
  user_type        text        CHECK (user_type IN ('host', 'organiser', 'travel_agent')),
  valid_from       date,                              -- NULL = always active
  valid_to         date,                              -- NULL = never expires
  is_active        boolean     NOT NULL DEFAULT true,
  is_featured      boolean     NOT NULL DEFAULT false,
  max_participants int,                               -- NULL = unlimited
  sort_order       int         NOT NULL DEFAULT 0,
  created_by       uuid        REFERENCES public.users (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packages_country_type_idx ON public.packages (country_code, event_type)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS packages_valid_from_idx   ON public.packages (valid_from)
  WHERE valid_from IS NOT NULL;

-- Seed default India travel packages
INSERT INTO public.packages (name, shots, price_per_person, description, is_featured, event_type, country_code, sort_order)
VALUES
  ('Essential', 10, 149, 'Perfect for short excursions and day trips.',         false, 'travel', 'IN', 1),
  ('Explorer',  20, 249, 'Great for weekend getaways and short tours.',          true,  'travel', 'IN', 2),
  ('Journey',   35, 399, 'For multi-day trips with rich memories to capture.',  false, 'travel', 'IN', 3),
  ('Grand Tour',50, 599, 'Full experience for extended travel adventures.',      false, 'travel', 'IN', 4)
ON CONFLICT DO NOTHING;

-- ── travel_bookings ───────────────────────────────────────────────────────────
-- One row per travel agent trip creation. Tracks package usage and slot fill.
-- slots_remaining decreases as participants join; slots_used is the complement.

CREATE TABLE IF NOT EXISTS public.travel_bookings (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         uuid        NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  agent_id         uuid        NOT NULL REFERENCES public.users (id),
  package_id       uuid        NOT NULL REFERENCES public.packages (id),
  total_travellers int         NOT NULL,
  price_per_person int         NOT NULL,
  total_paid       int         NOT NULL,
  payment_id       text,
  slots_used       int         NOT NULL DEFAULT 0,
  slots_remaining  int         NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travel_bookings_event_id_idx  ON public.travel_bookings (event_id);
CREATE INDEX IF NOT EXISTS travel_bookings_agent_id_idx  ON public.travel_bookings (agent_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- GUEST EXPERIENCE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── personal_memories ────────────────────────────────────────────────────────
-- Per-participant curated selection of gallery photos.
-- photo_ids: photos the participant has hearted / added to their reel.
-- hidden_photo_ids: photos the participant has hidden from their view.

CREATE TABLE IF NOT EXISTS public.personal_memories (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        uuid        NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  participant_id  uuid        NOT NULL REFERENCES public.participants (id) ON DELETE CASCADE,
  photo_ids       uuid[]      NOT NULL DEFAULT '{}',
  hidden_photo_ids uuid[]     NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, participant_id)
);

CREATE INDEX IF NOT EXISTS memories_participant_id_idx ON public.personal_memories (participant_id);

-- ── photo_deletions ───────────────────────────────────────────────────────────
-- Audit log for photo moderation actions (admin or host deleting a photo).

CREATE TABLE IF NOT EXISTS public.photo_deletions (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_id       uuid        NOT NULL REFERENCES public.photos (id) ON DELETE CASCADE,
  deleted_by     text        NOT NULL,                -- user id or 'system'
  deleted_by_role text       NOT NULL DEFAULT 'admin',-- 'admin' | 'host' | 'system'
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── notification_log ──────────────────────────────────────────────────────────
-- Records every push notification dispatched.
-- type: 'reveal_reminder' | 'gallery_live' | 'new_photo' | 'payment_confirm'

CREATE TABLE IF NOT EXISTS public.notification_log (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id uuid        REFERENCES public.participants (id) ON DELETE SET NULL,
  event_id       uuid        REFERENCES public.events (id) ON DELETE SET NULL,
  type           text        NOT NULL,
  status         text        NOT NULL DEFAULT 'sent'
                             CHECK (status IN ('sent', 'failed', 'delivered')),
  sent_at        timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_log_event_id_idx ON public.notification_log (event_id);
CREATE INDEX IF NOT EXISTS notif_log_sent_at_idx  ON public.notification_log (sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTENT / TEMPLATE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── invitation_templates ──────────────────────────────────────────────────────
-- Pre-designed invitation card images selectable during event creation.
-- country_codes limits which countries see each template (NULL = global).

CREATE TABLE IF NOT EXISTS public.invitation_templates (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         text        NOT NULL,
  image_url     text        NOT NULL,
  thumbnail_url text,
  country_codes text[],                               -- NULL = available everywhere
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    int         NOT NULL DEFAULT 0,
  uploaded_by   uuid        REFERENCES public.users (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_active_idx ON public.invitation_templates (is_active, sort_order);

-- ── event_categories ──────────────────────────────────────────────────────────
-- Dropdown options shown on the event-type selection screen.
-- event_type: 'private' (host only) | 'public' (organiser only) | 'both'
-- country_codes: array of ISO-2 codes; NULL = all countries.

CREATE TABLE IF NOT EXISTS public.event_categories (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  key           text        NOT NULL UNIQUE,          -- slug, e.g. 'wedding', 'sports'
  icon          text        NOT NULL DEFAULT '🎉',
  title         text        NOT NULL,
  event_type    text        NOT NULL DEFAULT 'both'
                            CHECK (event_type IN ('private', 'public', 'both')),
  country_codes text[],                               -- NULL = global
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed default categories
INSERT INTO public.event_categories (key, icon, title, event_type, sort_order) VALUES
  ('wedding',     '💒', 'Wedding & Reception',          'private', 1),
  ('birthday',    '🎂', 'Birthday & Reunion',            'private', 2),
  ('bachelor',    '💍', 'Bachelor · Bachelorette',       'private', 3),
  ('trip',        '✈️', 'Group Trip & Retreat',          'private', 4),
  ('offsite',     '🏢', 'Team Offsite',                  'private', 5),
  ('celebration', '🎉', 'Other Celebration',             'private', 6),
  ('sports',      '🏏', 'Sports Event',                  'public',  7),
  ('music',       '🎵', 'Music Festival & Concert',      'public',  8),
  ('cultural',    '🎪', 'Cultural Festival',             'public',  9),
  ('corporate',   '🏢', 'Corporate Event',               'public', 10),
  ('college',     '🎓', 'College & School Event',        'public', 11),
  ('publicother', '📢', 'Other Public Event',            'public', 12)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── handle_new_user ───────────────────────────────────────────────────────────
-- Fires after every Supabase Auth sign-up. Inserts a public.users row.
-- Google OAuth sets full_name via raw_user_meta_data.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      ''
    ),
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

-- ── set_event_expiry ──────────────────────────────────────────────────────────
-- Sets events.expires_at based on event type and admin_settings retention values.
-- Private events retain for 30 days; public/organiser events for 15 days.
-- Reads from admin_settings keys:
--   'private_gallery_retention_days' (default 30)
--   'public_gallery_retention_days'  (default 15)

CREATE OR REPLACE FUNCTION public.set_event_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  retention_days integer;
BEGIN
  IF NEW.type = 'public' THEN
    SELECT value::integer INTO retention_days
    FROM public.admin_settings
    WHERE key = 'public_gallery_retention_days';
    IF retention_days IS NULL THEN retention_days := 15; END IF;
  ELSE
    SELECT value::integer INTO retention_days
    FROM public.admin_settings
    WHERE key = 'private_gallery_retention_days';
    IF retention_days IS NULL THEN retention_days := 30; END IF;
  END IF;

  NEW.expires_at := COALESCE(
    CASE
      WHEN NEW.event_date IS NOT NULL
        THEN NEW.event_date::timestamptz
      ELSE current_timestamp
    END,
    current_timestamp
  ) + (retention_days || ' days')::interval;

  RETURN NEW;
END;
$$;

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

-- ── update_payout_amount ──────────────────────────────────────────────────────
-- After each paid participant INSERT, recalculates the organiser's 25% share
-- and updates the payouts row for that event.

CREATE OR REPLACE FUNCTION public.update_payout_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue   int;
  v_organiser_share int;
BEGIN
  IF NEW.amount_paid <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount_paid), 0)
  INTO   v_total_revenue
  FROM   public.participants
  WHERE  event_id = NEW.event_id;

  v_organiser_share := FLOOR(v_total_revenue * 25.0 / 100.0)::int;

  UPDATE public.payouts
  SET    total_collected = v_total_revenue,
         organiser_share = v_organiser_share
  WHERE  event_id = NEW.event_id
    AND  status   IN ('pending', 'scheduled');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_participant_paid_update_payout ON public.participants;
CREATE TRIGGER on_participant_paid_update_payout
  AFTER INSERT ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.update_payout_amount();

-- ── is_admin helper ───────────────────────────────────────────────────────────
-- Convenience function used in RLS policies.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── storage_analytics ────────────────────────────────────────────────────────
-- Estimates storage usage and cost across all events and photo types.
-- Assumes ~2 MB per photo (adjust constant if actual average differs).

CREATE OR REPLACE VIEW public.storage_analytics AS
SELECT
  COUNT(*) FILTER (WHERE p.is_deleted = false)                                           AS total_photos,
  (COUNT(*) FILTER (WHERE p.is_deleted = false) * 2)                                     AS total_storage_mb,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'public')                     AS public_photos,
  (COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'public') * 2)               AS public_storage_mb,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'private')                    AS private_photos,
  (COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'private') * 2)              AS private_storage_mb,
  COUNT(DISTINCT CASE WHEN e.type = 'public'                    THEN e.id END)           AS public_events,
  COUNT(DISTINCT CASE WHEN e.type = 'private'                   THEN e.id END)           AS private_events,
  COUNT(DISTINCT CASE WHEN e.status IN ('archived', 'deleted')  THEN e.id END)           AS archived_events,
  ROUND(
    (COUNT(*) FILTER (WHERE p.is_deleted = false) * 2.0 / 1024 * 0.023)::numeric, 2
  )                                                                                       AS estimated_cost_usd
FROM public.photos p
JOIN public.events e ON e.id = p.event_id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET  (manual step — run in Supabase Dashboard → Storage)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Bucket: event-photos
--   Public: true
--   File size limit: 10 MB
--
-- Storage path convention used by the app:
--   {event_id}/{participant_id}/{unix_ms}_{index}.jpg
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTES ON COLUMN NAMING
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- events.event_date      — the app always uses 'event_date'; the original schema
--                          used 'date' which was renamed in a post-launch migration.
-- events.event_end_time  — stored as text "HH:MM" for regular events, or an ISO
--                          date string "YYYY-MM-DD" for travel trips.
-- payouts.total_collected / organiser_share — renamed from 'amount' in the
--                          original schema; the update_payout_amount trigger was
--                          updated to write both columns.
-- participants.qr_token  — originally uuid type; changed to text to support
--                          uuidv4 strings generated client-side without casting.
-- ─────────────────────────────────────────────────────────────────────────────
