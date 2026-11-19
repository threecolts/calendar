-- ============================================================
-- 018: Facebook and Website in the multi-channel list too
--
-- 017 added them to the primary channel check, but the list of every
-- channel an item goes out on (content_items.channels, from 011) has its
-- own check. Same values in both. Safe to re-run.
-- ============================================================

ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_channels_check;
ALTER TABLE public.content_items ADD CONSTRAINT content_items_channels_check
  CHECK (channels <@ ARRAY['YouTube','Instagram','LinkedIn','TikTok','Facebook','Twitter/X','Blog','Website','Email','Podcast','Webinar','Other']::text[]);
