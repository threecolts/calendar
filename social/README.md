# Threecolts static system v0

Makes on-brand static social posts (single images, carousels and stories) with Claude, plus captions for each platform. It runs on anyone's claude.ai, so Angela doesn't need Lionel's account.

## What you need

- claude.ai with **Code execution and file creation** turned on (Settings → Capabilities).
- This zip.
- Your brief: a week of posts (`templates/weekly-brief.md`), or the month's content calendar.
- Access to Unsplash, to download photos.

## How it works (two rounds)

1. **Brief.** New chat → upload this zip and your brief → paste the Round 1 message from `templates/first-message.md`. Claude returns, for every post: the angle, three design options with copy, Unsplash search terms, and draft captions.
2. **Photo hunt.** Search Unsplash with Claude's terms. Download 6–10 photos per post ("Original" size). **Don't rename them**: the file name holds the photographer's name for the credits. Put each post's photos in a folder named `p01`, `p02` … and zip them.
3. **Build.** Upload the photo zip, paste the Round 2 message. Claude picks the photos, says why, builds every option in every format, and shows you contact sheets.
4. **Feedback.** Give specific notes ("p02 option B: bigger headline, use photo #14"). Expect a round or two.
5. **Download.** You get one zip per week: a folder per post with options A–C in each size, `captions.md` and `photo-credits.md`.

Claude doesn't remember past chats, so upload the zip at the start of every new chat. Or put it in a claude.ai Project's knowledge and run each week in that Project.

## What's inside

| Path | What |
|---|---|
| `CLAUDE.md` | Claude's instructions: workflow, rules, definition of done |
| `system/` | the look, brand summary, photography, captions, formats, review history |
| `templates/` | weekly brief, first messages, captions layout |
| `code/` | the renderer (`post.html`, `render.py`), photo contact sheets, packaging; `later/unsplash.py` for the API version |
| `brand/`, `fonts/` | official logos and washes from the Threecolts Brand System; Inter and IBM Plex Mono |
| `examples/demo-week/` | a sample spec and its renders (placeholder product photos) |
| `TO-CONFIRM.md` | open questions |

## Keeping it current

After each week, add any lasting feedback to `system/do-and-dont.md` (Claude writes the lines for you). Re-zip and share the new version.

## Roadmap

- **v1 (Claude Code tool):** Unsplash API search and download (`code/later/unsplash.py` is written, untested). Jev (TypeSafe) to score search terms and filter stock-looking results by their metadata before Claude looks at the shortlist. Needs `api.unsplash.com`, `images.unsplash.com`, `plus.unsplash.com` and `api.typesafe.ai` allowed.

## In the content calendar app (the Social tab)

The calendar app runs this system itself, so Angela doesn't need claude.ai or the zip. It lives in **Social** (top tab; formerly Lab → Social posts), and nothing there changes the calendar for anyone else.

**How Angela uses it:** pick a calendar entry → paste the brief or upload the Doc as a .docx → choose platforms and post type → *Write three options*. The app then runs the rest with no manual steps: Claude writes the options and captions, photos are found on Unsplash and picked, and every size is rendered. She approves one option, edits captions if needed, and downloads the zip (same layout as `code/package.py`). Per photo she can *Find another* or *Upload my own*.

**Where things are**

| Path | What |
|---|---|
| `lib/social/render.ts` | Port of `code/render.py`: headless Chromium loads `code/post.html` from disk. Local Chrome in dev; `@sparticuz/chromium` on Vercel |
| `lib/social/system.ts` | System prompt: `CLAUDE.md`, `system/*.md` and `TO-CONFIRM.md`, verbatim, after a short note on how the app runs |
| `lib/social/plan.ts`, `plan-schema.ts` | Claude plan (structured output), one retry with check errors, option rewrite, plan → spec |
| `lib/social/checks.ts` | Hard checks: banned words (read from `brand.md`), headline full stops, product spelling, caption lengths, numbers not in the Doc |
| `lib/social/package.ts` | `captions.md`, `photo-credits.md`, `README.txt` and the zip |
| `app/api/social/route.ts` | API for the tab |
| `components/social-studio.tsx` | The tab |
| `lib/social/unsplash.ts` | Unsplash search, filters, download tracking (port of `code/later/unsplash.py`) |
| `lib/social/photos.ts` | Photo picking: Jev term scores → search → Jev stock filter → Claude visual pick, two rounds at most |
| `scripts/010_social_posts.sql` | `social_posts` table and the private `social` storage bucket |

**Setup**
1. Run `scripts/010_social_posts.sql` in the Supabase SQL editor.
2. `ANTHROPIC_API_KEY` must be set (already used by the Lab). `ANTHROPIC_MODEL` picks the writer model (default Claude Sonnet 5.5). `UNSPLASH_ACCESS_KEY` turns on photo picking (`UNSPLASH_API_KEY` also works). `JEV_API_KEY` runs the filters on Jev; without it Claude Haiku stands in.
3. The brief: Threecolts Docs can't be shared publicly, so Angela pastes the Doc's text or uploads it as a .docx (File → Download → Microsoft Word). The .docx is read in her browser (`lib/social/docx.ts`). If an entry's Doc link happens to be public and the box is empty, the app reads the link instead.
4. Rendering needs about 1.6 GB of function memory on Vercel (Chromium).

**Check the renderer:** `npx tsx scripts/social-render-demo.mts` renders `examples/demo-week/week.json` through the app's renderer and compares each frame with the reference renders from `code/render.py` (about 1% of pixels differ, all text anti-aliasing).

**Photo picking, per photo slot** (`lib/social/photos.ts`):
1. Jev scores each of Claude's search terms. Question `t<n>`, type `score` 1–3: 1 generic stock, 2 somewhat specific, 3 specific person-action-place-light. The best three (score ≥ 2 first) are searched.
2. Unsplash search: `orientation=portrait`, `content_filter=high`, 30 per term, merged and de-duplicated. Dropped: Unsplash+ (`premium`/`plus`, TO-CONFIRM TC-04) and anything under 2400 px on the long side. Photos already used in the post are excluded.
3. Jev reads the first 24 candidates' metadata (description, alt text, tags, query; Jev doesn't see images). Per candidate: `s<n>`, `score` 1–3 (candid documentary / neutral / staged corporate stock), and `b<n>`, `choice` Yes/No ("shows the moment described in the post"). Ranked by P(on brief) − 0.35 × (stock − 1); the top 12 go to Claude. Answers and probabilities are stored per slot in `social_posts.plan.photo_log`, to tune the levels later.
4. Claude sees the 12 photos (640 px) with the post's copy and `photography.md`, and returns a pick, a `focus`, a reason and one line per rejection, or three new terms. Two rounds at most; then the slot is left for a manual upload.

**Unsplash API guidelines:**
- *Hotlinking:* the app shows thumbnails from `urls.small` and renders from `urls.raw` (2400 px); it never re-hosts the original photo. Only the rendered posts are stored.
- *Download tracking:* `links.download_location` is called (with the key) for every photo picked.
- *Attribution:* "Photo by <name> on Unsplash" with `utm_source=threecolts_content_calendar&utm_medium=referral` links, in the app and in `photo-credits.md`.
- *Not a replacement for Unsplash:* searches run per post, for Threecolts' own posts only; nothing is browsable as a photo library.
- *Rate limit:* demo apps get 50 requests an hour. One post uses roughly 7–20 (3 searches per photo, a second round if nothing passes, 1 download tracking call per pick). **Apply for production** in the Unsplash developer dashboard before Angela uses it for a full month.

**Not built yet:** Claude's self-review of the rendered frames against the `look.md` checklist (BUILD-SPEC step 5).
