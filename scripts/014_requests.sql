-- ============================================================
-- 014: Requests (video and design asks)
--
-- Marketing requests arrive as Linear "Asks" (Marketing Request: Video
-- Asset / Design Asset). The team pastes the Ask into the calendar, Claude
-- fills in the form, and the request is tracked here: stage, owner, due
-- date, missing information, progress updates and the deliverable.
--
--   requests          one row per ask; the form's answers live in `fields`
--   request_updates   the progress timeline (an update can move the stage)
--
-- Members read everything; the owning team (or any editor, for shared
-- requests) creates and changes them, like the rest of a team's work
-- (scripts/012). Needs 012 first. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  kind             text NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'design', 'other')),
  title            text NOT NULL CHECK (length(trim(title)) > 0),
  status           text NOT NULL DEFAULT 'New'
                   CHECK (status IN ('New', 'Needs info', 'In progress', 'In review', 'Delivered', 'On hold')),
  requester        text,
  linear_url       text,
  assignee_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  campaign_id      uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  due_date         date,
  date_fixed       text,
  deliverable_url  text,
  -- The form's answers: video_type, description, purpose, key_messages, where_used, …
  fields           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- What Claude flagged as unclear when it read the pasted Ask
  unclear          jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_text         text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requests_team_idx ON public.requests (team_id, status, due_date);

CREATE TABLE IF NOT EXISTS public.request_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body         text NOT NULL DEFAULT '',
  status_from  text,
  status_to    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_updates_request_idx ON public.request_updates (request_id, created_at);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "threecolts_members_only" ON public.requests;
CREATE POLICY "threecolts_members_only" ON public.requests AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_threecolts_member())) WITH CHECK ((SELECT public.is_threecolts_member()));
DROP POLICY IF EXISTS "threecolts_members_only" ON public.request_updates;
CREATE POLICY "threecolts_members_only" ON public.request_updates AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_threecolts_member())) WITH CHECK ((SELECT public.is_threecolts_member()));

DROP POLICY IF EXISTS "requests_read" ON public.requests;
CREATE POLICY "requests_read" ON public.requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "request_updates_read" ON public.request_updates;
CREATE POLICY "request_updates_read" ON public.request_updates FOR SELECT TO authenticated USING (true);

-- Editors in the owning team (any editor for a shared request)
DROP POLICY IF EXISTS "requests_write" ON public.requests;
CREATE POLICY "requests_write" ON public.requests FOR ALL TO authenticated
  USING  ((SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor' AND (SELECT public.can_edit_team(team_id)))
  WITH CHECK ((SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor' AND (SELECT public.can_edit_team(team_id)));

-- Updates: anyone who may change the request posts them; authors can remove their own
DROP POLICY IF EXISTS "request_updates_insert" ON public.request_updates;
CREATE POLICY "request_updates_insert" ON public.request_updates FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.requests r WHERE r.id = request_id AND public.can_edit_team(r.team_id)
  ));
DROP POLICY IF EXISTS "request_updates_delete" ON public.request_updates;
CREATE POLICY "request_updates_delete" ON public.request_updates FOR DELETE TO authenticated
  USING (author_id = auth.uid());

REVOKE ALL ON public.requests FROM anon;
REVOKE ALL ON public.request_updates FROM anon;

NOTIFY pgrst, 'reload schema';
