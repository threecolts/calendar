-- ============================================================
-- 011: Several channels per content item
--
-- A post is usually published to more than one account (Instagram,
-- LinkedIn, X, …). Until now each content item had exactly one
-- channel, so the same post was planned as several duplicate items.
--
-- Adds content_items.channels (text[]), every channel the item goes
-- out on. The existing `channel` column stays as the item's PRIMARY
-- channel (always channels[1]), so everything that reads `channel`
-- today — card colour, the Library, Slack, exports — keeps working.
--
-- The app treats `channels` as valid only when its first value equals
-- `channel`; otherwise it falls back to [channel]. Existing rows are
-- backfilled to [channel] here.
--
-- No new RLS: the column lives on content_items, which already has the
-- members-only rule from 009 and the editors-write policies.
--
-- Safe to re-run.
-- ============================================================

-- 1. The column ----------------------------------------------------------
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT '{}';

-- 2. Backfill: every existing item goes out on its one channel ------------
UPDATE public.content_items
SET channels = ARRAY[channel]
WHERE channel IS NOT NULL
  AND (channels IS NULL OR cardinality(channels) = 0);

-- 3. Same allowed values as the channel check from 006 ---------------------
ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_channels_check;

ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_channels_check
  CHECK (channels <@ ARRAY['YouTube','Instagram','LinkedIn','TikTok','Blog','Email','Twitter/X','Podcast','Webinar','Other']::text[]);

-- 4. Filtering "items on LinkedIn" looks inside the array -----------------
CREATE INDEX IF NOT EXISTS content_items_channels_idx
  ON public.content_items USING gin (channels);

-- 5. Make sure the API sees the new column straight away -------------------
NOTIFY pgrst, 'reload schema';
