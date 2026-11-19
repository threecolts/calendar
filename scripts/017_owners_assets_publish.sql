-- ============================================================
-- 017: Profiles that save, Facebook + Website channels, item assets,
--      default owners and auto-publish
--
--   1. Profiles: anyone can change their own name, title and photo;
--      editors can change anyone's. Only editors can change who is an
--      editor or which team someone is in (a viewer can't promote
--      themself).
--   2. "avatars" storage bucket for profile photos (public read; you
--      upload your own, editors upload anyone's).
--   3. Facebook and Website channels.
--   4. campaign_assets.item_id: a file can belong to one calendar item.
--      It shows inside the item and on the campaign's Assets page.
--   5. Default owners for Brand work that has none yet:
--      Instagram / LinkedIn / TikTok / Facebook / X / Blog → Angela,
--      video formats and thumbnails → Lionel, Website → Monika.
--      (New items get the same defaults in the app.)
--   6. publish_due_items(): Scheduled items whose date has passed become
--      Published. The app calls it when someone opens the calendar.
--
-- Safe to re-run.
-- ============================================================

-- 1. Profiles ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role = 'editor')
$$;
REVOKE ALL ON FUNCTION public.is_editor() FROM public;
GRANT EXECUTE ON FUNCTION public.is_editor() TO authenticated;

DROP POLICY IF EXISTS "profiles_update_own"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_role_editor" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"             ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR (SELECT public.is_editor()))
  WITH CHECK (id = auth.uid() OR (SELECT public.is_editor()));

-- Only editors change roles and teams (server-side calls with the service key are allowed)
CREATE OR REPLACE FUNCTION public.profiles_guard_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_editor() THEN
    NEW.app_role := OLD.app_role;
    NEW.team_id  := OLD.team_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_guard_role ON public.profiles;
CREATE TRIGGER profiles_guard_role BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_role();

-- 2. Avatars bucket ----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "avatars_read"  ON storage.objects;
CREATE POLICY "avatars_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_write" ON storage.objects;
CREATE POLICY "avatars_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (SELECT public.is_threecolts_member())
         AND ((storage.foldername(name))[1] = auth.uid()::text OR (SELECT public.is_editor())))
  WITH CHECK (bucket_id = 'avatars' AND (SELECT public.is_threecolts_member())
         AND ((storage.foldername(name))[1] = auth.uid()::text OR (SELECT public.is_editor())));

-- 3. Channels ---------------------------------------------------------------
ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_channel_check;
ALTER TABLE public.content_items ADD CONSTRAINT content_items_channel_check
  CHECK (channel IN ('YouTube','Instagram','LinkedIn','TikTok','Facebook','Twitter/X','Blog','Website','Email','Podcast','Webinar','Other'));

-- 4. Assets that belong to an item -----------------------------------------
ALTER TABLE public.campaign_assets
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS campaign_assets_item_idx ON public.campaign_assets (item_id);

-- 5. Default owners for Brand work ------------------------------------------
WITH brand AS (SELECT id FROM public.teams WHERE lower(name) = 'brand' LIMIT 1),
people AS (
  SELECT
    (SELECT id FROM public.profiles WHERE full_name ILIKE 'Angela%' ORDER BY created_at LIMIT 1) AS angela,
    (SELECT id FROM public.profiles WHERE full_name ILIKE 'Lionel%' ORDER BY created_at LIMIT 1) AS lionel,
    (SELECT id FROM public.profiles WHERE full_name ILIKE 'Monika%' ORDER BY created_at LIMIT 1) AS monika
)
UPDATE public.content_items i
SET assignee_id = CASE
    WHEN i.format IN ('Video','Short','Reel','Edit','Thumbnail') OR i.channel = 'YouTube' THEN p.lionel
    WHEN i.channel = 'Website' THEN p.monika
    WHEN i.channel IN ('Instagram','LinkedIn','TikTok','Facebook','Twitter/X','Blog') THEN p.angela
  END
FROM people p, brand b
WHERE i.assignee_id IS NULL
  AND COALESCE(i.team_id, (SELECT c.team_id FROM public.campaigns c WHERE c.id = i.campaign_id)) = b.id
  AND (i.format IN ('Video','Short','Reel','Edit','Thumbnail')
       OR i.channel IN ('YouTube','Website','Instagram','LinkedIn','TikTok','Facebook','Twitter/X','Blog'));

-- 6. Auto-publish ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_due_items()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_threecolts_member() THEN RETURN 0; END IF;
  UPDATE public.content_items
  SET status = 'Published', updated_at = now()
  WHERE status = 'Scheduled' AND publish_date IS NOT NULL AND publish_date <= current_date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.publish_due_items() FROM public;
GRANT EXECUTE ON FUNCTION public.publish_due_items() TO authenticated;
