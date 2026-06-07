-- ====================================================
-- DATABASE REPAIR MIGRATION
-- ====================================================

-- 1. Enable RLS on profiles and create policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
CREATE POLICY "Allow public read access to profiles" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
CREATE POLICY "Allow users to update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. Synchronize any missing profile entries from auth.users
INSERT INTO public.profiles (id, name, email, avatar_url, updated_at, role)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', email, 'Unknown User') as name,
  email,
  raw_user_meta_data->>'avatar_url' as avatar_url,
  now() as updated_at,
  'user' as role
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Also update any existing profiles with missing fields
UPDATE public.profiles p
SET 
  name = COALESCE(p.name, u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', u.email, 'Unknown User'),
  email = COALESCE(p.email, u.email),
  avatar_url = COALESCE(p.avatar_url, u.raw_user_meta_data->>'avatar_url'),
  updated_at = now()
FROM auth.users u
WHERE p.id = u.id AND (p.name IS NULL OR p.email IS NULL);

-- 3. Repair foreign key constraints pointing to public.profiles(id)
-- team_resources (pointing to profiles instead of auth.users)
ALTER TABLE public.team_resources DROP CONSTRAINT IF EXISTS team_resources_created_by_fkey;
ALTER TABLE public.team_resources ADD CONSTRAINT team_resources_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- team_activities (pointing to profiles instead of auth.users)
ALTER TABLE public.team_activities DROP CONSTRAINT IF EXISTS team_activities_actor_id_fkey;
ALTER TABLE public.team_activities ADD CONSTRAINT team_activities_actor_id_fkey 
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- memberships
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_user_id_fkey;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
