# Next up: campaign assets preview, saving social posts, campaign context in Social

Requested by Lionel, 17 Nov 2026. Built 17 Nov 2026 (needs scripts/015_campaign_brief.sql). Not built: share link, drag to reorder, choosing which sizes go to the campaign.

## 1. Campaign assets: an Upload view and a Preview view

**Today:** `/campaigns/<id>` (`components/campaign-assets.tsx`) mixes upload controls with the assets, and videos and images sit in a grid.

**Wanted:** the team can open a campaign and see everything at once, like a presentation, without clicking into each file.

- Two modes on the page, switched at the top: **Preview** (the default for everyone) and **Upload / manage** (editors in the campaign's team).
- Preview shows, in this order, full width and without controls:
  1. **Mood board:** large, as a board (masonry); click for full screen with arrow keys.
  2. **Videos:** playing inline (Drive, YouTube, Vimeo, Loom embeds and uploads), one or two per row.
  3. **Design assets:** grouped by name (e.g. "Key visual A", "Paid ad: webinar"), each shown at its real proportions.
  4. **Socials:** the approved posts from the Social tab, plus uploads, shown as they'd appear on a feed (portrait cards, carousels as swipeable rows).
- A **Present** button: a full-screen walk through the same sections for review meetings.
- **Share link:** a read-only link to the Preview view for people in other teams (still sign-in only).
- Upload / manage keeps today's controls: upload, add link, rename, delete, plus reorder (drag) so the board's order is the order shown.

## 2. Social: a clear "Save" for Angela

**Today:** everything is saved automatically (plan, photos, renders, captions in `social_posts`). Approved options already appear in the campaign's Assets under Socials, but nothing on screen says so.

**Wanted:** Angela knows her work is kept and where it went.

- A **Saved** indicator (and time) on the Social page after every step.
- **Save to campaign:** a button on the approved option that confirms it's in the campaign's Assets → Socials. Optionally, choose which sizes go there.
- **Drafts list:** on the Social page, the entries she's worked on, with status (planned / rendered / approved), so she can pick up where she left off.
- The final captions go with the saved post (shown under it in Assets and in the zip).

## 3. Social: use the campaign's context, so the brief is optional

**Today:** Social sends Claude the entry's title, date, channel, format and only the campaign's *name* (`briefFrom` in `app/api/social/route.ts`), so Angela has to paste a brief every time.

**Wanted:** the campaign's context is always there; Angela only adds what's specific to the post.

- Send Claude the campaign itself: objective, product, type, motion, dates, team, and the brief or planning doc if one is attached to the campaign. This needs a **campaign brief** field on campaigns: text and/or Doc link, filled once by whoever sets the campaign up.
- Also send the campaign's other entries around this date (titles, channels, phases), so posts fit the sequence (hook vs proof vs reminder) and don't repeat each other.
- Also send the mood board and key-visual names/notes from the campaign's Assets, so photo choice and copy match the agreed look.
- The entry's own brief (Doc upload or paste) becomes **optional**: "Add anything specific to this post." Write still works with no paste when the campaign has a brief.
- Show Angela what context was used ("Using: campaign brief, 12 nearby entries, mood board") so nothing is a black box.
- The Threecolts brand system (logos, fonts, washes, rules) is already built into Social from `social/` (the same files as `threecolts-static-for-claude-code.zip`); nothing to add there. If more brand assets are needed (e.g. UniCon lockup, webinar mark), put them in `social/brand/` and list them in `system/brand.md`.

## Order to build

3 first (it saves Angela the most time), then 1, then 2.
