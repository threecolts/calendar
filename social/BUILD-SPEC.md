# Build spec: Threecolts static posts in the content calendar

For Claude Code, working in the Threecolts content calendar repo. Drop this file and the `threecolts-static-system/` folder into the repo, then read this first.

## What we're trying to do

Angela (social media manager) plans posts in the content calendar. Each calendar entry has a Google Doc attached, embedded in the calendar, where she writes what the post needs to say.

From each entry, the calendar should produce **ready-to-post static graphics and captions**, with no designer in the loop:

1. Read the entry and its Google Doc.
2. Write the post: the angle, **three design options** (different layouts or ideas, not three crops of one), headline copy and captions for each platform.
3. Find **real Unsplash photos** that look cinematic and specific, not like stock and not like AI. Jev filters the results fast and cheaply; Claude makes the final visual pick.
4. Render the posts in the Threecolts look, in every size the entry needs: single images, carousels and stories.
5. Let Angela review, approve or regenerate each option, then download a zip: a folder per post with all options and sizes, `captions.md` and `photo-credits.md`.

No AI-generated images, ever. Gemini isn't used.

## What already exists

**In the calendar repo** (inspect it before writing code; don't assume):
- the Claude API, with a key;
- Jev (TypeSafe), with a key;
- Google Docs embedded per calendar entry (find how the app reads a Doc's text);
- the calendar's data model, UI and stack.

**In `threecolts-static-system/`** (a working v0, proven in claude.ai):

| Path | Use in the build |
|---|---|
| `code/post.html` | The renderer. One HTML page; `window.render(spec)` draws one frame. Keep it as is. |
| `code/render.py` | Playwright (headless Chromium) wrapper: spec JSON → PNGs and contact sheets. Port to the app's language if needed, or call it as a subprocess. |
| `code/package.py` | Zips a week: folders per post, `captions.md`, `photo-credits.md`, `README.txt`. |
| `code/photo_sheet.py` | Numbered contact sheets of photos, for Claude's visual judging. Reuse its sheet logic for Unsplash shortlists. |
| `code/later/unsplash.py` | Unsplash search, thumbnails, download with tracking, credits. **Written but untested.** Starting point for the Unsplash integration. |
| `brand/`, `fonts/` | Official logos and backgrounds from the org's Threecolts Brand System; Inter and IBM Plex Mono. The renderer loads them by relative path. |
| `CLAUDE.md`, `system/*.md` | The rules: look, brand and voice, photography, captions, formats, review history. **Use these as the system prompt** for every Claude call below, not a paraphrase. |
| `examples/demo-week/` | A sample spec (`week.json`), captions and renders. Use it as a test fixture. |
| `TO-CONFIRM.md` | Open questions. Don't hard-code an answer to any of them. |

## The pipeline, per calendar entry

### 1. Gather the brief
- Calendar fields: date, platforms, product, post type (single, carousel, story), CTA.
- The Google Doc's full text. If the Doc is empty or unreadable, stop and show that on the entry. Never generate from the title alone.
- The brief template Claude expects is in `templates/weekly-brief.md`. Map calendar fields onto it; the Doc fills the rest.

### 2. Plan and write (Claude API)
- **System prompt:** `CLAUDE.md` + `system/look.md`, `brand.md`, `photography.md`, `captions.md`, `formats.md`, `do-and-dont.md`.
- **Output:** structured JSON (enforce it with a schema). Per entry:
  - `angle` (one sentence);
  - `options[]`: each is a spec object in the `system/formats.md` shape (layout, headline with `**bold**` markup, sub, prompt, cta, dark, formats, slides for carousels), plus `why` and `search_terms[]` (4–6 per photo slot) with `look_for` and `skip`;
  - `captions`: one per platform requested, each with a character count;
  - `alt_text` per frame;
  - `flags[]`: any claim, number or price not found in the Doc.
- **Hard checks in code after the call:**
  - no banned words (list in `brand.md`);
  - headline ends with a full stop;
  - product names spelled exactly;
  - caption lengths within platform limits.

  On failure, retry once with the errors listed, then surface the problem to Angela.

### 3. Jev gates (text only; Jev doesn't see images)
Endpoint `POST https://api.typesafe.ai/v1/systemone` with body `{ model, state, questions }`. Model `jev-1.13.0` was current in Sept 2026. Reuse the app's existing Jev client and auth; verify the question shapes against TypeSafe's docs.
- **Search-term specificity:** a `score` question over each term (levels: generic stock / somewhat specific / specific person-action-place-light). Drop the generic ones; ask Claude for replacements if fewer than 3 remain.
- **Stock filter on Unsplash results:** for each candidate's metadata (description, alt text, tags, query), ask:
  - `stock_look`, a `score` question (levels: candid documentary / neutral / staged corporate stock);
  - `on_brief`, a `noul` question ("shows the moment described in the post").

  Rank by these, then keep the top 12 for Claude.
- Log Jev's probabilities next to each decision so we can tune the levels later.

### 4. Unsplash (new: add the integration)
- **Search:** `GET https://api.unsplash.com/search/photos` with `query`, `per_page=30`, `content_filter=high`, and orientation `portrait` by default (portrait crops to square, 4:5 and 9:16). Send headers `Authorization: Client-ID <UNSPLASH_ACCESS_KEY>` and `Accept-Version: v1`.
- Merge and de-duplicate across terms; keep the fields `unsplash.py` keeps in `slim()`.
- Skip photos smaller than 2400 px on the long side. Skip Unsplash+ (`premium`) photos unless TO-CONFIRM TC-04 says the account covers them.
- **Visual pick (Claude API with images):**
  - send a numbered contact sheet of the 12 shortlisted thumbnails, with `system/photography.md` and the post's copy;
  - Claude returns, per option, a chosen photo, a `focus` point (CSS background-position) and a one-line reason for each pick and rejection;
  - if nothing passes, Claude returns new search terms; loop at most twice, then fall back to manual upload (below).
- **Download:**
  - call the photo's `links.download_location` with the key; Unsplash's API guidelines require this for every photo used;
  - then fetch `urls.raw` with `&w=2400&q=86&fm=jpg`;
  - store the photographer's name and link for the credits.
- **Limits:** new Unsplash apps start in demo mode (50 requests an hour). Apply for production before Angela uses it on a full month. Cache search results per entry.
- **Compliance:** check Unsplash's current API guidelines on hotlinking, attribution and the "don't replicate Unsplash" rule, and record what we do about each in the README.

### 5. Render and self-review
- Build the week spec from the chosen options and photos, then render with `post.html`.
- **Formats** (`system/formats.md`):
  - square 1080×1080;
  - portrait 1080×1350;
  - story 1080×1920, with text kept between y 250 and y 1520;
  - landscape 1200×628.
- **Default sizes:** portrait and square for single posts, plus a story for the strongest option; portrait for carousels; add landscape when X or LinkedIn is a platform.
- **Self-review:** send each option's contact sheet to Claude with the self-check list in `system/look.md`.
  - Allow one automatic fix pass, such as changing `focus` or shortening a headline.
  - Anything still failing is flagged on the entry, not hidden.

### 6. Review UI and output
On the calendar entry, show:
- the three options as images, with each option's `why`;
- captions per platform, editable, with character counts;
- flags (unverified claims, weak photos).

Angela can:
- approve one option per post;
- regenerate copy or photo for one option;
- swap in her own photo (manual upload uses the same render path);
- edit captions;
- download the zip.

The zip follows `code/package.py`: `<post>_<option>_<layout>_<format>.png`, carousel frames numbered `01of05`, plus `captions.md`, `photo-credits.md` and `README.txt`.

**Fallback (no Unsplash results that pass, or the API is down):** show Claude's search terms on the entry and let Angela upload photos. This is the v0 manual flow; it must always work.

## Settings and data

- **Env:** add `UNSPLASH_ACCESS_KEY`; reuse the existing Claude and Jev keys. No keys in the repo or in rendered files.
- **Per entry, store:**
  - the brief snapshot (Doc text plus its revision id);
  - the Claude plan JSON;
  - search terms and Jev scores;
  - candidates, picks and reasons;
  - the render spec, output paths, approval state and credits.
- If the Doc changes after generation, mark the entry stale and offer to regenerate.
- **Rendering needs** Chromium (Playwright) on the server, plus the `brand/` and `fonts/` files beside `post.html`.

## Decisions already made (don't relitigate)

- **Base look:** OpenAI's Instagram. Real people and places in natural light, white text lower left on the photo, mostly regular weight with a semibold key phrase, plain type cards.
- **No logo on posts by default.** The product is named in the copy; `"logo": true` only when the brief asks.
- **Full-bleed photo with text is allowed on social,** as an exception to the Brand System's framed-photo rule.
- **Real Unsplash photos only.** No AI images.
- **Inter** is the typeface (from the Brand System).
- **Brand rules and copy** come from the org's Threecolts Brand System; `system/brand.md` summarises them.

## Done when

- [ ] Generating a real calendar entry with a real Google Doc gives three distinct options, captions for each platform, credits and a downloadable zip, with no manual steps.
- [ ] Every rendered frame passes `system/look.md`'s checklist, or the entry shows why not.
- [ ] No banned words, invented numbers or misspelled product names reach the UI unflagged.
- [ ] Unsplash downloads are tracked through `download_location`, and credits are complete.
- [ ] Manual photo upload works when Unsplash returns nothing usable.
- [ ] `examples/demo-week/week.json` renders identically through the app's pipeline and through `code/render.py`.
- [ ] README updated: setup, env vars, Unsplash production status, Jev question definitions.

## Suggested build order

1. Read the repo: how entries and Google Docs are stored and read, and where the Claude and Jev clients live.
2. Get the renderer running server-side on `examples/demo-week/week.json`.
3. Brief → plan (Claude, structured output) → render, using the manual-upload photo path.
4. Add Unsplash search, download and credits.
5. Add the Jev gates.
6. Add Claude's visual pick and self-review.
7. Build the review UI and zip download.
