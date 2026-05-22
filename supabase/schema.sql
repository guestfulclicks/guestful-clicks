-- ─────────────────────────────────────────────────────────────────────────────
-- Guestful Clicks — Database Schema
-- Run this once against your Supabase project (SQL editor or migration tool).
-- Tables are created in dependency order; the script is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── users ─────────────────────────────────────────────────────────────────────
-- One row per auth.user, created automatically by the handle_new_user trigger.
-- role distinguishes hosts (private events), organisers (public events), and admin.

create table if not exists public.users (
  id          uuid        primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  role        text        not null default 'guest'
                          check (role in ('host', 'organiser', 'guest', 'admin')),
  push_token  text,                              -- Expo push notification token
  created_at  timestamptz not null default now()
);

-- ── events ────────────────────────────────────────────────────────────────────
-- Both private host films and public organiser events live here.
-- type='private' → host paid a flat fee; shot_limit applies to all guests.
-- type='public'  → organiser paid; participants pay per-tier for their shot_limit.

create table if not exists public.events (
  id              uuid        primary key default uuid_generate_v4(),
  title           text        not null,
  type            text        not null check (type in ('private', 'public')),
  host_id         uuid        not null references public.users (id) on delete cascade,
  date            date,
  reveal_time     timestamptz,
  event_end_time  timestamptz,
  shot_limit      int         not null default 18,
  aesthetic       text        not null default 'original'
                              check (aesthetic in ('original', 'film', 'noir')),
  status          text        not null default 'active'
                              check (status in ('active', 'revealed', 'archived')),
  share_code      text        not null unique,
  invitation_card text,                          -- Supabase storage public URL
  guest_count     int,
  pricing_tier    text,                          -- flat-fee tier slug for private events
  event_category  text,
  payment_id      text,                          -- Razorpay payment_id from host/organiser
  created_at      timestamptz not null default now()
);

create index if not exists events_host_id_idx    on public.events (host_id);
create index if not exists events_share_code_idx on public.events (share_code);
create index if not exists events_status_idx     on public.events (status);
create index if not exists events_date_idx       on public.events (date desc);

-- ── participants ──────────────────────────────────────────────────────────────
-- Every person who joined an event, regardless of whether they paid.
-- Free guests (private events) have tier='free' and amount_paid=0.
-- Paid participants (public events) have tier='publicXXX' and amount_paid>0.

create table if not exists public.participants (
  id           uuid        primary key default uuid_generate_v4(),
  event_id     uuid        not null references public.events (id) on delete cascade,
  name         text        not null,
  qr_token     uuid        not null unique default uuid_generate_v4(),
  tier         text        not null default 'free'
                           check (tier in ('free', 'public99', 'public199', 'public299', 'public499')),
  amount_paid  int         not null default 0,   -- INR; 0 for free/private guests
  shot_limit   int         not null default 18,  -- per-participant shot allowance
  upload_count int         not null default 0,   -- photos successfully uploaded
  shots_used   int         not null default 0,   -- shots taken (may exceed uploads)
  joined_at    timestamptz not null default now(),
  payment_id   text,                              -- Razorpay payment_id for paid tiers
  push_token   text                               -- Expo push token saved on join
);

create index if not exists participants_event_id_idx  on public.participants (event_id);
create index if not exists participants_qr_token_idx  on public.participants (qr_token);
create index if not exists participants_joined_at_idx on public.participants (joined_at desc);

-- ── photos ────────────────────────────────────────────────────────────────────
-- Each row is one photo uploaded by a participant.
-- is_revealed flips to true when the event status becomes 'revealed'.

create table if not exists public.photos (
  id             uuid        primary key default uuid_generate_v4(),
  event_id       uuid        not null references public.events (id) on delete cascade,
  participant_id uuid        not null references public.participants (id) on delete cascade,
  url            text        not null,            -- Supabase storage public URL
  is_revealed    boolean     not null default false,
  uploaded_at    timestamptz not null default now()
);

create index if not exists photos_event_id_idx         on public.photos (event_id);
create index if not exists photos_participant_id_idx   on public.photos (participant_id);
create index if not exists photos_event_revealed_idx   on public.photos (event_id) where is_revealed = true;

-- ── payouts ───────────────────────────────────────────────────────────────────
-- One payout record per public event, created when the organiser creates the event.
-- amount starts at 0 and is updated by the on_participant_paid trigger.
-- scheduled_date is set by the admin 36–50 days after the event date.

create table if not exists public.payouts (
  id             uuid        primary key default uuid_generate_v4(),
  event_id       uuid        not null unique references public.events (id) on delete cascade,
  organiser_id   uuid        not null references public.users (id) on delete cascade,
  amount         int         not null default 0,  -- organiser's 25% share in ₹
  status         text        not null default 'pending'
                             check (status in ('pending', 'scheduled', 'paid', 'failed')),
  scheduled_date date,
  created_at     timestamptz not null default now()
);

create index if not exists payouts_organiser_id_idx on public.payouts (organiser_id);
create index if not exists payouts_status_idx       on public.payouts (status);

-- ── pricing_config ────────────────────────────────────────────────────────────
-- Per-country tier configuration for public participant pricing.
-- The app falls back to static constants (PUBLIC_PARTICIPANT_PRICING) if empty.

create table if not exists public.pricing_config (
  id          uuid    primary key default uuid_generate_v4(),
  country     text    not null default 'IN',
  shots       int     not null,
  price       int     not null,                  -- INR
  description text    not null default '',
  is_popular  boolean not null default false,
  sort_order  int     not null default 0,
  unique (country, shots)
);

-- Seed India tiers (mirrors PUBLIC_PARTICIPANT_PRICING in shared/constants.ts)
insert into public.pricing_config (country, shots, price, description, is_popular, sort_order)
values
  ('IN', 10,  99,  'Share your 10 best moments',    false, 1),
  ('IN', 15, 199,  'More shots, more memories',      false, 2),
  ('IN', 25, 299,  'For the serious photographer',   true,  3),
  ('IN', 46, 499,  'The complete experience',         false, 4)
on conflict (country, shots) do nothing;

-- ── handle_new_user trigger ───────────────────────────────────────────────────
-- Creates a public.users row whenever someone signs up via Supabase Auth.
-- Google OAuth sets full_name in raw_user_meta_data; email is always present.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Storage bucket (manual step) ──────────────────────────────────────────────
-- Create via Supabase Dashboard → Storage → New bucket:
--   Name:   event-photos
--   Public: true   (photos served via public CDN URL)
--
-- Storage path convention used by the app:
--   {event_id}/{participant_id}/{unix_ms}_{index}.jpg
