-- ============================================================
-- 012: Teams and sub-teams
--
-- Everyone is in Marketing; people belong to a sub-team (Brand first).
-- Each team gets its own view of the calendar, campaigns and inbox,
-- while everything still shows on the main calendar ("Everything").
--
--   teams                 Marketing → Brand (parent_id makes sub-teams)
--   profiles.team_id      the person's team: their default view
--   campaigns.team_id     the team that owns the campaign (null = shared)
--   content_items.team_id the team that owns the item (null = shared);
--                         new items in a team's campaign inherit its team
--   content_items.asset_url  link to the creative / final assets
--
-- "Other people don't touch our stuff": a team's campaigns and items can
-- only be created, changed or deleted by members of that team (or of one
-- of its sub-teams). Anyone can still send a team a request: an Inbox idea
-- (status 'Idea') tagged to that team, which its sender can keep editing.
-- These are RESTRICTIVE policies, ANDed with the existing ones (members
-- only from 009, editors write), so nothing that's allowed today for
-- untagged work changes.
--
-- Seeds Marketing and Brand, and puts Lionel, Monika, Angela and Nora in
-- Brand (by name, only if they have no team yet). Check the Team page.
--
-- Safe to re-run.
-- ============================================================

-- 1. Teams -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  parent_id   uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "threecolts_members_only" ON public.teams;
CREATE POLICY "threecolts_members_only" ON public.teams AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_threecolts_member())) WITH CHECK ((SELECT public.is_threecolts_member()));

DROP POLICY IF EXISTS "teams_read" ON public.teams;
CREATE POLICY "teams_read" ON public.teams FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "teams_write_editors" ON public.teams;
CREATE POLICY "teams_write_editors" ON public.teams FOR ALL TO authenticated
  USING  ((SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor')
  WITH CHECK ((SELECT app_role FROM public.profiles WHERE id = auth.uid()) = 'editor');

REVOKE ALL ON public.teams FROM anon;

-- 2. Team columns -----------------------------------------------------------
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns     ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS asset_url text;

CREATE INDEX IF NOT EXISTS campaigns_team_idx     ON public.campaigns (team_id);
CREATE INDEX IF NOT EXISTS content_items_team_idx ON public.content_items (team_id);

-- 3. Who may change a team's work ------------------------------------------
-- The caller's own team and every team above it: a Brand member can edit
-- Brand work (and Marketing-wide work), not another sub-team's.
CREATE OR REPLACE FUNCTION public.can_edit_team(t uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t IS NULL OR EXISTS (
    WITH RECURSIVE mine AS (
      SELECT p.team_id AS id FROM public.profiles p WHERE p.id = auth.uid() AND p.team_id IS NOT NULL
      UNION
      SELECT tm.parent_id FROM public.teams tm JOIN mine ON tm.id = mine.id WHERE tm.parent_id IS NOT NULL
    )
    SELECT 1 FROM mine WHERE mine.id = t
  )
$$;
REVOKE ALL ON FUNCTION public.can_edit_team(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_edit_team(uuid) TO authenticated;

-- Campaigns
DROP POLICY IF EXISTS "team_campaigns_insert" ON public.campaigns;
CREATE POLICY "team_campaigns_insert" ON public.campaigns AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_edit_team(team_id)));
DROP POLICY IF EXISTS "team_campaigns_update" ON public.campaigns;
CREATE POLICY "team_campaigns_update" ON public.campaigns AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.can_edit_team(team_id))) WITH CHECK ((SELECT public.can_edit_team(team_id)));
DROP POLICY IF EXISTS "team_campaigns_delete" ON public.campaigns;
CREATE POLICY "team_campaigns_delete" ON public.campaigns AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.can_edit_team(team_id)));

-- Content items: requests (Inbox ideas) can be sent to any team
DROP POLICY IF EXISTS "team_items_insert" ON public.content_items;
CREATE POLICY "team_items_insert" ON public.content_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_edit_team(team_id)) OR (status = 'Idea' AND campaign_id IS NULL));
DROP POLICY IF EXISTS "team_items_update" ON public.content_items;
CREATE POLICY "team_items_update" ON public.content_items AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.can_edit_team(team_id)) OR (status = 'Idea' AND created_by = auth.uid()))
  WITH CHECK ((SELECT public.can_edit_team(team_id)) OR (status = 'Idea' AND created_by = auth.uid()));
DROP POLICY IF EXISTS "team_items_delete" ON public.content_items;
CREATE POLICY "team_items_delete" ON public.content_items AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.can_edit_team(team_id)) OR (status = 'Idea' AND created_by = auth.uid()));

-- 4. Items follow their campaign's team -----------------------------------
CREATE OR REPLACE FUNCTION public.content_item_inherit_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.team_id IS NULL AND NEW.campaign_id IS NOT NULL THEN
    SELECT team_id INTO NEW.team_id FROM public.campaigns WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS content_item_inherit_team ON public.content_items;
CREATE TRIGGER content_item_inherit_team BEFORE INSERT ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.content_item_inherit_team();

-- Moving a campaign to another team takes along the items that were on its old team
CREATE OR REPLACE FUNCTION public.campaign_team_moved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.content_items SET team_id = NEW.team_id
  WHERE campaign_id = NEW.id AND team_id IS NOT DISTINCT FROM OLD.team_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS campaign_team_moved ON public.campaigns;
CREATE TRIGGER campaign_team_moved AFTER UPDATE OF team_id ON public.campaigns
  FOR EACH ROW WHEN (OLD.team_id IS DISTINCT FROM NEW.team_id)
  EXECUTE FUNCTION public.campaign_team_moved();

-- 5. Seed: Marketing → Brand, and the Brand team ----------------------------
INSERT INTO public.teams (name, sort_order)
SELECT 'Marketing', 0
WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Marketing' AND parent_id IS NULL);

INSERT INTO public.teams (name, parent_id, sort_order)
SELECT 'Brand', m.id, 0 FROM public.teams m
WHERE m.name = 'Marketing' AND m.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.teams b WHERE b.name = 'Brand' AND b.parent_id = m.id);

UPDATE public.profiles p
SET team_id = (SELECT b.id FROM public.teams b JOIN public.teams m ON m.id = b.parent_id
               WHERE b.name = 'Brand' AND m.name = 'Marketing' LIMIT 1)
WHERE p.team_id IS NULL
  AND (p.full_name ILIKE 'lionel%' OR p.full_name ILIKE 'monika%' OR p.full_name ILIKE 'monica%'
       OR p.full_name ILIKE 'angela%' OR p.full_name ILIKE 'nora%');

NOTIFY pgrst, 'reload schema';
