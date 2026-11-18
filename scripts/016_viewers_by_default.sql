-- ============================================================
-- 016: New people start as Viewers
--
-- The calendar is shared with the whole company (anyone with a
-- @threecolts.com email can sign in, scripts/009). New sign-ups now see
-- everything but can't change or move anything; they get an
-- "Add a request" button that opens #3c-marketing-requests in Slack.
-- Make someone an Editor on the Team page.
--
-- People an editor invites from the Team page still start as Editors.
-- Existing people keep their role. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, app_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'Content Creator'),
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles ALTER COLUMN app_role SET DEFAULT 'viewer';
