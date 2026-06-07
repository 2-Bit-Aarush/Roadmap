-- ALTER TABLE memberships
ALTER TABLE public.memberships
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ALTER TABLE invites
ALTER TABLE public.invites
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
