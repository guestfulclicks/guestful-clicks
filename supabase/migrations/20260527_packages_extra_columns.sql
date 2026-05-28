-- Add user_type, valid_from, valid_to to packages table
-- Required by admin/pages/packages.tsx for seasonal & user-type filtering

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS user_type  text
    CHECK (user_type IN ('host', 'organiser', 'travel_agent')),
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to   date;

-- Index for seasonal package queries
CREATE INDEX IF NOT EXISTS packages_valid_from_idx ON public.packages (valid_from)
  WHERE valid_from IS NOT NULL;

-- Update the existing seeded travel packages to have explicit user_type
UPDATE public.packages
SET user_type = 'travel_agent'
WHERE event_type = 'travel' AND user_type IS NULL;
