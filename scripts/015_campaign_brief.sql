-- ============================================================
-- 015: Campaign brief
--
-- The campaign's own brief: what it's for, who it's for, the offer, the
-- phases, the messages. Filled once by whoever sets the campaign up, and
-- given to Claude whenever the Social tab writes a post for one of the
-- campaign's entries, so the per-post brief becomes optional.
--
--   campaigns.brief      the brief as text (pasted, or read from a .docx)
--   campaigns.brief_url  link to the brief or planning Doc, for people
--
-- No new rules: campaigns already have members-only reads, editors write
-- and the team rules from 012. Safe to re-run.
-- ============================================================

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS brief text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS brief_url text;

NOTIFY pgrst, 'reload schema';
