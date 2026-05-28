-- Add package_id to participants so we can track which special package a guest used
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.packages(id);

-- Index for lookups by package
CREATE INDEX IF NOT EXISTS participants_package_id_idx
  ON public.participants (package_id)
  WHERE package_id IS NOT NULL;
