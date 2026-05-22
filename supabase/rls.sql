-- ─────────────────────────────────────────────────────────────────────────────
-- Guestful Clicks — Row Level Security (RLS) Policies
-- Run after schema.sql. Script is idempotent: policies are dropped and recreated.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enable RLS on every table ─────────────────────────────────────────────────
alter table public.users          enable row level security;
alter table public.events         enable row level security;
alter table public.participants   enable row level security;
alter table public.photos         enable row level security;
alter table public.payouts        enable row level security;
alter table public.pricing_config enable row level security;

-- ── Admin helper ──────────────────────────────────────────────────────────────
-- Used in policies to grant unrestricted access to admin users.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.users where id = auth.uid()),
    false
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────────────────────
-- The join page (guest/join.tsx) reads host names without auth, so all rows
-- must be publicly readable.

drop policy if exists "users_select_public"  on public.users;
drop policy if exists "users_insert_own"     on public.users;
drop policy if exists "users_update_own"     on public.users;
drop policy if exists "users_admin_all"      on public.users;

create policy "users_select_public" on public.users
  for select using (true);

create policy "users_insert_own" on public.users
  for insert to authenticated
  with check (id = auth.uid());

create policy "users_update_own" on public.users
  for update to authenticated
  using (id = auth.uid());

create policy "users_admin_all" on public.users
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- events
-- ─────────────────────────────────────────────────────────────────────────────
-- Must be publicly readable so the guest join page and gallery page can work
-- without auth. share_code lookup and status checks rely on anon SELECT.

drop policy if exists "events_select_public" on public.events;
drop policy if exists "events_insert_own"    on public.events;
drop policy if exists "events_update_own"    on public.events;
drop policy if exists "events_delete_own"    on public.events;
drop policy if exists "events_admin_all"     on public.events;

create policy "events_select_public" on public.events
  for select using (true);

create policy "events_insert_own" on public.events
  for insert to authenticated
  with check (host_id = auth.uid());

create policy "events_update_own" on public.events
  for update to authenticated
  using (host_id = auth.uid());

create policy "events_delete_own" on public.events
  for delete to authenticated
  using (host_id = auth.uid());

create policy "events_admin_all" on public.events
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- participants
-- ─────────────────────────────────────────────────────────────────────────────
-- Guests join without creating an account, so INSERT must be open to anon.
-- SELECT/UPDATE are also open because the only "credential" is the UUID stored
-- on the device (qr_token / participant id) — this is acceptable for an event
-- photo app where the data (names, shot counts) is not sensitive.

drop policy if exists "participants_select_all"  on public.participants;
drop policy if exists "participants_insert_any"  on public.participants;
drop policy if exists "participants_update_any"  on public.participants;
drop policy if exists "participants_delete_any"  on public.participants;

create policy "participants_select_all" on public.participants
  for select using (true);

create policy "participants_insert_any" on public.participants
  for insert with check (true);

create policy "participants_update_any" on public.participants
  for update using (true);

create policy "participants_delete_any" on public.participants
  for delete using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- photos
-- ─────────────────────────────────────────────────────────────────────────────
-- Photos are stored in a public Supabase storage bucket, so the URLs are already
-- publicly accessible. The DB rows are equally open: SELECT/INSERT/DELETE are
-- unrestricted. Only UPDATE (flipping is_revealed) is restricted to the event
-- host to prevent participants from self-revealing their own photos early.

drop policy if exists "photos_select_all"      on public.photos;
drop policy if exists "photos_insert_any"      on public.photos;
drop policy if exists "photos_update_by_host"  on public.photos;
drop policy if exists "photos_delete_any"      on public.photos;
drop policy if exists "photos_admin_all"       on public.photos;

create policy "photos_select_all" on public.photos
  for select using (true);

create policy "photos_insert_any" on public.photos
  for insert with check (true);

-- Only the event host (or admin) can flip is_revealed.
create policy "photos_update_by_host" on public.photos
  for update to authenticated
  using (
    exists (
      select 1 from public.events
      where id = photos.event_id
        and host_id = auth.uid()
    )
    or is_admin()
  );

create policy "photos_delete_any" on public.photos
  for delete using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- payouts
-- ─────────────────────────────────────────────────────────────────────────────
-- Only the owning organiser can see their payouts. INSERT is allowed for the
-- authenticated organiser (created at event-creation time in pricing.tsx).
-- UPDATE is admin-only (admin dashboard marks payouts scheduled/paid).

drop policy if exists "payouts_select_own"    on public.payouts;
drop policy if exists "payouts_insert_own"    on public.payouts;
drop policy if exists "payouts_update_admin"  on public.payouts;
drop policy if exists "payouts_admin_all"     on public.payouts;

create policy "payouts_select_own" on public.payouts
  for select to authenticated
  using (organiser_id = auth.uid() or is_admin());

create policy "payouts_insert_own" on public.payouts
  for insert to authenticated
  with check (organiser_id = auth.uid() or is_admin());

create policy "payouts_update_admin" on public.payouts
  for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy "payouts_admin_all" on public.payouts
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- pricing_config
-- ─────────────────────────────────────────────────────────────────────────────
-- Public read so the paywall screen can fetch tiers without auth.
-- Only admin can modify.

drop policy if exists "pricing_select_public" on public.pricing_config;
drop policy if exists "pricing_admin_all"     on public.pricing_config;

create policy "pricing_select_public" on public.pricing_config
  for select using (true);

create policy "pricing_admin_all" on public.pricing_config
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket policies  (run in Supabase dashboard → Storage → Policies)
-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket: event-photos (public)
--
-- Policy 1 — Public read
--   Allowed operations: SELECT
--   Policy:             true
--
-- Policy 2 — Anyone can upload
--   Allowed operations: INSERT
--   Policy:             true
--
-- Policy 3 — Anyone can delete own photo
--   Allowed operations: DELETE
--   Policy:             true
--
-- The app builds the storage path as {event_id}/{participant_id}/{ts}_{i}.jpg
-- so accidental overwrites across events/participants are structurally impossible.
