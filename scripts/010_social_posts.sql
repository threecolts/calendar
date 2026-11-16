-- ============================================================
-- 010: Social posts (Lab → Social)
--
-- One row per calendar item that has been turned into static social
-- graphics. Holds everything the pipeline decided, so a run can be
-- reviewed, regenerated or audited later (BUILD-SPEC.md, "Settings and data"):
--   the brief snapshot, Claude's plan, photo picks and credits,
--   the render list, approval state and the edited captions.
--
-- Rendered PNGs and uploaded photos live in the private "social" bucket,
-- under <social_post_id>/...; the app hands out short-lived signed URLs.
--
-- Members only (the 009 rule), editors write. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.social_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id  uuid NOT NULL UNIQUE REFERENCES public.content_items(id) ON DELETE CASCADE,
  -- draft → planned → rendered → approved; 'error' when a step failed
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','planned','rendered','approved','error')),
  brief_url        text,
  brief_text       text,
  -- sha256 of the Doc text when it was read; a different hash later = stale
  brief_hash       text,
  -- Claude's plan: angle, options (spec + why + search terms + photo slots), captions, alt text, flags
  plan             jsonb,
  -- results of the hard checks run in code after the Claude call
  checks           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- photo slot → { path, url?, source: 'upload'|'unsplash', credit?, focus? }
  photos           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [{ name, option, format, path }]
  renders          jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_option  text,
  -- platform → caption text, as edited by the reviewer
  captions         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- model calls made for this post, with token usage, for cost tracking
  runs             jsonb NOT NULL DEFAULT '[]'::jsonb,
  error            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "threecolts_members_only" ON public.social_posts;
CREATE POLICY "threecolts_members_only" ON public.social_posts AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_threecolts_member())) WITH CHECK ((SELECT public.is_threecolts_member()));

DROP POLICY IF EXISTS "social_posts_read" ON public.social_posts;
CREATE POLICY "social_posts_read" ON public.social_posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "social_posts_write" ON public.social_posts;
CREATE POLICY "social_posts_write" ON public.social_posts FOR ALL TO authenticated
  USING  ((SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor')
  WITH CHECK ((SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor');

REVOKE ALL ON public.social_posts FROM anon;

-- Storage: private bucket for renders and uploaded photos -----------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('social', 'social', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "social_bucket_read" ON storage.objects;
CREATE POLICY "social_bucket_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'social' AND (SELECT public.is_threecolts_member()));

DROP POLICY IF EXISTS "social_bucket_write" ON storage.objects;
CREATE POLICY "social_bucket_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'social' AND (SELECT public.is_threecolts_member())
         AND (SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor')
  WITH CHECK (bucket_id = 'social' AND (SELECT public.is_threecolts_member())
         AND (SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor');
