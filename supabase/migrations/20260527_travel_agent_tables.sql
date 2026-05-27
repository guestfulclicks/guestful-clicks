-- ── 1. packages table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  shots            integer NOT NULL,
  price_per_person integer NOT NULL,
  description      text,
  is_featured      boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  event_type       text NOT NULL DEFAULT 'travel',
  country_code     text NOT NULL DEFAULT 'IN',
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed default travel packages (India)
INSERT INTO public.packages
  (name, shots, price_per_person, description, is_featured, event_type, country_code, sort_order)
VALUES
  ('Essential', 10, 149, 'Perfect for short excursions and day trips.',              false, 'travel', 'IN', 1),
  ('Explorer',  20, 249, 'Great for weekend getaways and short tours.',              true,  'travel', 'IN', 2),
  ('Journey',   35, 399, 'For multi-day trips with rich memories to capture.',       false, 'travel', 'IN', 3),
  ('Grand Tour',50, 599, 'Full experience for extended travel adventures.',          false, 'travel', 'IN', 4)
ON CONFLICT DO NOTHING;

-- ── 2. travel_bookings table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.travel_bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  agent_id         uuid NOT NULL REFERENCES public.users(id),
  package_id       uuid NOT NULL REFERENCES public.packages(id),
  total_travellers integer NOT NULL,
  price_per_person integer NOT NULL,
  total_paid       integer NOT NULL,
  payment_id       text,
  slots_remaining  integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Row-Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.packages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_bookings ENABLE ROW LEVEL SECURITY;

-- packages: anyone can read active packages
CREATE POLICY "packages_public_read" ON public.packages
  FOR SELECT USING (is_active = true);

-- travel_bookings: agents read and insert their own rows
CREATE POLICY "travel_bookings_agent_select" ON public.travel_bookings
  FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "travel_bookings_agent_insert" ON public.travel_bookings
  FOR INSERT WITH CHECK (agent_id = auth.uid());
