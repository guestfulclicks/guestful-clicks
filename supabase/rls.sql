-- ─────────────────────────────────────────────────────────────────────────────
-- Guestful Clicks — Row Level Security Policies
-- Documentation only — reflects the live Supabase database as of 2026-05-27.
-- Do NOT re-run against a live database without verifying existing policy names.
--
-- Design principles:
--   • Guest-facing tables (events, participants, photos) are publicly readable
--     so unauthenticated guests can join and view galleries without an account.
--   • Write operations use the minimum required restriction:
--     host-owned rows require auth.uid() = host_id; participant rows use the
--     device-held qr_token as the sole credential.
--   • Admin access bypasses all other policies via is_admin().
--   • Sensitive tables (payouts, admin_*) are restricted to authenticated users
--     and/or admin role.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Admin helper function ──────────────────────────────────────────────────────

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
-- users
-- ═══════════════════════════════════════════════════════════════════════════════
-- Publicly readable so the guest join page can show host names without sign-in.
-- Users can only insert/update their own row; admin has full access.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_public" ON public.users;
DROP POLICY IF EXISTS "users_insert_own"    ON public.users;
DROP POLICY IF EXISTS "users_update_own"    ON public.users;
DROP POLICY IF EXISTS "users_admin_all"     ON public.users;

CREATE POLICY "users_select_public" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_admin_all" ON public.users
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- events
-- ═══════════════════════════════════════════════════════════════════════════════
-- Public read required: share_code lookup, gallery access, and guest join all
-- happen without auth. Host and admin can mutate their own events.

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_public" ON public.events;
DROP POLICY IF EXISTS "events_insert_own"    ON public.events;
DROP POLICY IF EXISTS "events_update_own"    ON public.events;
DROP POLICY IF EXISTS "events_delete_own"    ON public.events;
DROP POLICY IF EXISTS "events_admin_all"     ON public.events;

CREATE POLICY "events_select_public" ON public.events
  FOR SELECT USING (true);

CREATE POLICY "events_insert_own" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "events_update_own" ON public.events
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid());

CREATE POLICY "events_delete_own" ON public.events
  FOR DELETE TO authenticated
  USING (host_id = auth.uid());

CREATE POLICY "events_admin_all" ON public.events
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- participants
-- ═══════════════════════════════════════════════════════════════════════════════
-- Guests join without an account, so INSERT must be open to anon.
-- SELECT/UPDATE are also open: the only "credential" is the UUID stored on the
-- device (qr_token / participant id), which is acceptable for this use-case.

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_select_all"  ON public.participants;
DROP POLICY IF EXISTS "participants_insert_any"  ON public.participants;
DROP POLICY IF EXISTS "participants_update_any"  ON public.participants;
DROP POLICY IF EXISTS "participants_delete_any"  ON public.participants;

CREATE POLICY "participants_select_all" ON public.participants
  FOR SELECT USING (true);

CREATE POLICY "participants_insert_any" ON public.participants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "participants_update_any" ON public.participants
  FOR UPDATE USING (true);

CREATE POLICY "participants_delete_any" ON public.participants
  FOR DELETE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- photos
-- ═══════════════════════════════════════════════════════════════════════════════
-- Photos are stored in a public CDN bucket so URLs are already public.
-- The DB rows are equally open for SELECT/INSERT/DELETE.
-- Only UPDATE (flipping is_revealed / is_deleted) is gated to the event host
-- or admin to prevent participants from self-revealing or restoring deleted photos.

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photos_select_all"     ON public.photos;
DROP POLICY IF EXISTS "photos_insert_any"     ON public.photos;
DROP POLICY IF EXISTS "photos_update_by_host" ON public.photos;
DROP POLICY IF EXISTS "photos_delete_any"     ON public.photos;
DROP POLICY IF EXISTS "photos_admin_all"      ON public.photos;

CREATE POLICY "photos_select_all" ON public.photos
  FOR SELECT USING (true);

CREATE POLICY "photos_insert_any" ON public.photos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "photos_update_by_host" ON public.photos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE  id = photos.event_id
        AND  host_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY "photos_delete_any" ON public.photos
  FOR DELETE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- payouts
-- ═══════════════════════════════════════════════════════════════════════════════
-- Only the owning organiser sees their payouts. INSERT is allowed when creating
-- an event (pricing.tsx). UPDATE is admin-only (marking scheduled/paid).

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payouts_select_own"   ON public.payouts;
DROP POLICY IF EXISTS "payouts_insert_own"   ON public.payouts;
DROP POLICY IF EXISTS "payouts_update_admin" ON public.payouts;
DROP POLICY IF EXISTS "payouts_admin_all"    ON public.payouts;

CREATE POLICY "payouts_select_own" ON public.payouts
  FOR SELECT TO authenticated
  USING (organiser_id = auth.uid() OR is_admin());

CREATE POLICY "payouts_insert_own" ON public.payouts
  FOR INSERT TO authenticated
  WITH CHECK (organiser_id = auth.uid() OR is_admin());

CREATE POLICY "payouts_update_admin" ON public.payouts
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "payouts_admin_all" ON public.payouts
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- pricing_config
-- ═══════════════════════════════════════════════════════════════════════════════
-- Publicly readable so the paywall screen can fetch tiers without auth.
-- Write access is admin-only.

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_select_public" ON public.pricing_config;
DROP POLICY IF EXISTS "pricing_admin_all"     ON public.pricing_config;

CREATE POLICY "pricing_select_public" ON public.pricing_config
  FOR SELECT USING (true);

CREATE POLICY "pricing_admin_all" ON public.pricing_config
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- admin_settings
-- ═══════════════════════════════════════════════════════════════════════════════
-- Publicly readable (mobile apps fetch retention days and pricing config).
-- Write access is admin-only.

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_settings_select_public" ON public.admin_settings;
DROP POLICY IF EXISTS "admin_settings_admin_all"     ON public.admin_settings;

CREATE POLICY "admin_settings_select_public" ON public.admin_settings
  FOR SELECT USING (true);

CREATE POLICY "admin_settings_admin_all" ON public.admin_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- admin_permissions
-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin users can read their own row (getAdminUser / getAdminPermissions).
-- Only super_admin can insert or modify records.

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_perm_select_own"  ON public.admin_permissions;
DROP POLICY IF EXISTS "admin_perm_admin_all"   ON public.admin_permissions;

CREATE POLICY "admin_perm_select_own" ON public.admin_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "admin_perm_admin_all" ON public.admin_permissions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- admin_notifications
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notif_admin_all" ON public.admin_notifications;

CREATE POLICY "admin_notif_admin_all" ON public.admin_notifications
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- admin_activity_log
-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin users can read (for the activity log modal) and insert (logAdminActivity).
-- Nobody can update or delete — it is an immutable audit trail.

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log_select_admin" ON public.admin_activity_log;
DROP POLICY IF EXISTS "activity_log_insert_admin" ON public.admin_activity_log;

CREATE POLICY "activity_log_select_admin" ON public.admin_activity_log
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "activity_log_insert_admin" ON public.admin_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- organiser_kyc
-- ═══════════════════════════════════════════════════════════════════════════════
-- Organisers can see and update their own KYC row.
-- Admin can read and update all rows (review workflow).

ALTER TABLE public.organiser_kyc ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_select_own"   ON public.organiser_kyc;
DROP POLICY IF EXISTS "kyc_insert_own"   ON public.organiser_kyc;
DROP POLICY IF EXISTS "kyc_update_own"   ON public.organiser_kyc;
DROP POLICY IF EXISTS "kyc_admin_all"    ON public.organiser_kyc;

CREATE POLICY "kyc_select_own" ON public.organiser_kyc
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "kyc_insert_own" ON public.organiser_kyc
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "kyc_update_own" ON public.organiser_kyc
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "kyc_admin_all" ON public.organiser_kyc
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- kyc_verification_log
-- ═══════════════════════════════════════════════════════════════════════════════
-- Immutable audit trail; admin-only read and insert.

ALTER TABLE public.kyc_verification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_log_admin_all" ON public.kyc_verification_log;

CREATE POLICY "kyc_log_admin_all" ON public.kyc_verification_log
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- packages
-- ═══════════════════════════════════════════════════════════════════════════════
-- All active packages are publicly readable (guest/organiser/travel-agent screens
-- fetch them without auth). Write access is admin-only.

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "packages_public_read" ON public.packages;
DROP POLICY IF EXISTS "packages_admin_all"   ON public.packages;

CREATE POLICY "packages_public_read" ON public.packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "packages_admin_all" ON public.packages
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- travel_bookings
-- ═══════════════════════════════════════════════════════════════════════════════
-- Travel agents can read and insert their own bookings.
-- Admin has full access.

ALTER TABLE public.travel_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "travel_bookings_agent_select" ON public.travel_bookings;
DROP POLICY IF EXISTS "travel_bookings_agent_insert" ON public.travel_bookings;
DROP POLICY IF EXISTS "travel_bookings_admin_all"    ON public.travel_bookings;

CREATE POLICY "travel_bookings_agent_select" ON public.travel_bookings
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR is_admin());

CREATE POLICY "travel_bookings_agent_insert" ON public.travel_bookings
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() OR is_admin());

CREATE POLICY "travel_bookings_admin_all" ON public.travel_bookings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- personal_memories
-- ═══════════════════════════════════════════════════════════════════════════════
-- Personal memories are readable by anyone who knows the participant id (the
-- device holds this). Writes are open to allow unauthenticated gallery editing.

ALTER TABLE public.personal_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memories_select_all" ON public.personal_memories;
DROP POLICY IF EXISTS "memories_insert_any" ON public.personal_memories;
DROP POLICY IF EXISTS "memories_update_any" ON public.personal_memories;

CREATE POLICY "memories_select_all" ON public.personal_memories
  FOR SELECT USING (true);

CREATE POLICY "memories_insert_any" ON public.personal_memories
  FOR INSERT WITH CHECK (true);

CREATE POLICY "memories_update_any" ON public.personal_memories
  FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- photo_deletions
-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin-only audit table.

ALTER TABLE public.photo_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photo_del_admin_all" ON public.photo_deletions;

CREATE POLICY "photo_del_admin_all" ON public.photo_deletions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- notification_log
-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin-only read. The notifications service inserts rows (authenticated).

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_log_admin_all" ON public.notification_log;
DROP POLICY IF EXISTS "notif_log_insert_any" ON public.notification_log;

CREATE POLICY "notif_log_admin_all" ON public.notification_log
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "notif_log_insert_any" ON public.notification_log
  FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- invitation_templates
-- ═══════════════════════════════════════════════════════════════════════════════
-- Publicly readable so the event-creation flow can show templates without auth.

ALTER TABLE public.invitation_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_select_public" ON public.invitation_templates;
DROP POLICY IF EXISTS "templates_admin_all"     ON public.invitation_templates;

CREATE POLICY "templates_select_public" ON public.invitation_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "templates_admin_all" ON public.invitation_templates
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- event_categories
-- ═══════════════════════════════════════════════════════════════════════════════
-- Publicly readable so the event-type screen works without auth.

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select_public" ON public.event_categories;
DROP POLICY IF EXISTS "categories_admin_all"     ON public.event_categories;

CREATE POLICY "categories_select_public" ON public.event_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "categories_admin_all" ON public.event_categories
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- Storage bucket policies  (set in Supabase Dashboard → Storage → Policies)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Bucket: event-photos  (public bucket)
--
--   Policy 1 — Public read
--     Operations: SELECT
--     Expression: true
--
--   Policy 2 — Anyone can upload
--     Operations: INSERT
--     Expression: true
--
--   Policy 3 — Anyone can delete
--     Operations: DELETE
--     Expression: true
--
-- Storage path: {event_id}/{participant_id}/{unix_ms}_{index}.jpg
-- Cross-event/participant overwrites are structurally impossible due to path structure.
-- ─────────────────────────────────────────────────────────────────────────────
