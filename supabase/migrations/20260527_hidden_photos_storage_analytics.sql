-- ── 1. Add hidden_photo_ids to personal_memories ────────────────────────────
ALTER TABLE personal_memories
  ADD COLUMN IF NOT EXISTS hidden_photo_ids uuid[] NOT NULL DEFAULT '{}';

-- ── 2. Create storage_analytics view ─────────────────────────────────────────
-- Estimates 2 MB per photo (adjust if you know actual average)
CREATE OR REPLACE VIEW storage_analytics AS
SELECT
  COUNT(*) FILTER (WHERE p.is_deleted = false)                                           AS total_photos,
  (COUNT(*) FILTER (WHERE p.is_deleted = false) * 2)                                     AS total_storage_mb,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'public')                     AS public_photos,
  (COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'public') * 2)               AS public_storage_mb,
  COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'private')                    AS private_photos,
  (COUNT(*) FILTER (WHERE p.is_deleted = false AND e.type = 'private') * 2)              AS private_storage_mb,
  COUNT(DISTINCT CASE WHEN e.type = 'public'                          THEN e.id END)     AS public_events,
  COUNT(DISTINCT CASE WHEN e.type = 'private'                         THEN e.id END)     AS private_events,
  COUNT(DISTINCT CASE WHEN e.status IN ('archived','deleted')         THEN e.id END)     AS archived_events,
  ROUND(
    (COUNT(*) FILTER (WHERE p.is_deleted = false) * 2.0 / 1024 * 0.023)::numeric, 2
  )                                                                                       AS estimated_cost_usd
FROM photos p
JOIN events e ON e.id = p.event_id;
