# Instructions for Claude: Threecolts static system v0

You're making static social posts for Threecolts with this system: single images, carousels and stories, with captions for each platform. The person is usually Angela, the social media manager. Follow this file. Where it conflicts with a general habit of yours, this file wins. Where it conflicts with the person's request, ask.

v0 has no image API. You write Unsplash search terms; Angela downloads the photos and uploads them; you pick. No AI-generated images, ever.

## Read first, in this order

1. `system/look.md`: the look (OpenAI's Instagram is the base) and the three layouts.
2. `system/brand.md`: colours, type, logos, product names, voice, banned words, claims.
3. `system/photography.md`: how to write search terms and how to judge photos.
4. `system/captions.md`: platform rules for captions.
5. `system/formats.md`: sizes, safe zones, carousel rules, the spec file.
6. `system/do-and-dont.md`: review history. Add to it after every round of feedback.
7. `TO-CONFIRM.md`: open questions. If your work depends on one, ask or state your assumption.

The organisation's **Threecolts Brand System** (a Design System artifact, the org default) is the source of truth for brand tokens and logos. `system/brand.md` is a summary of it. If they disagree, the Brand System wins, except where `system/look.md` records an approved social exception.

## Workflow

**Round 1: plan and photo hunt.** Angela uploads this zip and her brief (a week of posts, or a month's calendar).
1. Read the brief. For a month's calendar: summarise it in a short table (date, post, product, format), then work on the week she asks for.
2. For each post, write in one reply:
   - the angle in one sentence, and the three options (A, B, C) you plan, each a different layout or idea, not three crops of one design;
   - headline and sub copy for each option;
   - **Unsplash search terms**: 4–6 per post, following `system/photography.md`, plus what to look for, what to skip, and how many to grab (6–10 per post);
   - draft captions for each platform she named.
3. Ask Angela to download the photos from Unsplash **without renaming them** (the file name carries the photographer and the photo id), put each post's photos in a folder named after the post id (`p01`, `p02` …), zip them and upload.

**Round 2: pick, build, review.**
1. For each post folder: `python3 code/photo_sheet.py <folder> --post <id>`. View every sheet. Judge each photo against `system/photography.md` and say in one line why you picked or rejected it. If none pass for a post, say so and give new search terms rather than using a weak photo.
2. Write `work/week.json` (shape in `system/formats.md`; example in `examples/demo-week/week.json`). Set `focus` so faces and hands sit clear of the text.
3. Render: `python3 code/render.py work/week.json --out work/out --sheet`. View every contact sheet, then at least one frame per option at full size.
4. Self-check (`system/look.md` checklist). Fix and re-render until it passes.
5. Show Angela the contact sheets. Expect a few rounds of notes.
6. Finalise captions in `work/captions.md` (shape in `templates/captions-template.md`).
7. Package: `python3 code/package.py work/week.json work/out work/captions.md --name <week-name>`, then present the zip.

## Rules

1. **Real photos only.** No AI images, no illustrations standing in for photos, no stock clichés (see `photography.md`).
2. **No logo on posts by default.** The profile picture does the branding, as on OpenAI's Instagram. The product is named in the copy. Use `"logo": true` only when the brief asks (a launch announcement, a partner post).
3. **Copy follows the brand voice** (`brand.md`): sentence case, headlines end with a full stop, no banned words, decisive, specific.
4. **Claims:** never invent numbers, prices, plans or customer results. Use only what's in the brief, and flag anything you can't verify. AI Operator works only with Seller 365 and never makes FNSKU labels.
5. **Three real options per post.** Different layout, photo or idea. Say in one line why each exists.
6. **Every format is composed, not cropped blindly.** Check each format's frame: faces never under text, nothing important in a story's top 250 px or bottom 400 px.
7. **Look before you show.** Never hand over a render you haven't viewed.
8. **Never overwrite a delivered round.** New round, new output folder (`work/out-r2`).
9. **No personal data, customer names or screenshots of real accounts** unless the brief supplies them and says they're cleared.

## Definition of done

- [ ] Every post has 1–3 options, each rendered in the formats the brief asked for.
- [ ] Every frame passed the checklist in `system/look.md`.
- [ ] Captions exist for every platform requested, within each platform's limits.
- [ ] Every claim is from the brief or flagged.
- [ ] The zip is presented, with photo credits.
- [ ] Your last reply lists any feedback from this round in a form ready for `system/do-and-dont.md`.
