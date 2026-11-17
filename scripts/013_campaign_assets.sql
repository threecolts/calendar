-- ============================================================
-- 013: Campaign assets
--
-- Each campaign gets a visual Assets page with sections:
--   moodboard  the main mood board (images, plus Figma/Milanote links)
--   video      videos: uploaded files or YouTube / Vimeo / Loom / Drive links
--   design     other agreed design assets: ads, statics, key visuals…
--   social     social posts; Lab → Social posts for the campaign's items
--              also show here automatically (read from social_posts)
--
-- An asset is an uploaded file (private "campaign-assets" bucket, under
-- <campaign_id>/…) or a link. Members see everything; only the team that
-- owns the campaign (or anyone, for a shared campaign) can add or remove,
-- like the rest of a team's work (scripts/012).
--
-- Needs scripts/012_teams.sql first (can_edit_team). Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaign_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  section      text NOT NULL CHECK (section IN ('moodboard', 'video', 'design', 'social')),
  kind         text NOT NULL CHECK (kind IN ('file', 'link')),
  title        text,
  note         text,
  path         text,          -- storage path, for files
  url          text,          -- the link, for links
  mime_type    text,
  size_bytes   bigint,
  sort_order   int NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'file' AND path IS NOT NULL) OR (kind = 'link' AND url IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS campaign_assets_campaign_idx ON public.campaign_assets (campaign_id, section, sort_order);

ALTER TABLE public.campaign_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "threecolts_members_only" ON public.campaign_assets;
CREATE POLICY "threecolts_members_only" ON public.campaign_assets AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_threecolts_member())) WITH CHECK ((SELECT public.is_threecolts_member()));

DROP POLICY IF EXISTS "campaign_assets_read" ON public.campaign_assets;
CREATE POLICY "campaign_assets_read" ON public.campaign_assets FOR SELECT TO authenticated USING (true);

-- Editors in the campaign's team (or any editor, for a shared campaign)
CREATE OR REPLACE FUNCTION public.can_edit_campaign(c uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor'
     AND EXISTS (SELECT 1 FROM public.campaigns WHERE id = c AND public.can_edit_team(team_id))
$$;
REVOKE ALL ON FUNCTION public.can_edit_campaign(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_edit_campaign(uuid) TO authenticated;

DROP POLICY IF EXISTS "campaign_assets_write" ON public.campaign_assets;
CREATE POLICY "campaign_assets_write" ON public.campaign_assets FOR ALL TO authenticated
  USING ((SELECT public.can_edit_campaign(campaign_id)))
  WITH CHECK ((SELECT public.can_edit_campaign(campaign_id)));

REVOKE ALL ON public.campaign_assets FROM anon;

-- Storage: private bucket, one folder per campaign ---------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-assets', 'campaign-assets', false)
ON CONFLICT (id) DO NOTHING;

-- The first folder of the path is the campaign id
CREATE OR REPLACE FUNCTION public.campaign_from_path(name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' THEN split_part(name, '/', 1)::uuid END
$$;

DROP POLICY IF EXISTS "campaign_assets_bucket_read" ON storage.objects;
CREATE POLICY "campaign_assets_bucket_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-assets' AND (SELECT public.is_threecolts_member()));

DROP POLICY IF EXISTS "campaign_assets_bucket_write" ON storage.objects;
CREATE POLICY "campaign_assets_bucket_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'campaign-assets' AND (SELECT public.is_threecolts_member())
         AND public.can_edit_campaign(public.campaign_from_path(name)))
  WITH CHECK (bucket_id = 'campaign-assets' AND (SELECT public.is_threecolts_member())
         AND public.can_edit_campaign(public.campaign_from_path(name)));

NOTIFY pgrst, 'reload schema';
