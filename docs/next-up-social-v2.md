# Next up: Social v2 (from Lionel's review, 17 Nov 2026)

Built 18 Nov 2026 (branch feat/social-v2). Seen on the UniCon carousel (MCMPOM): only the cover card had a photo, the inside cards were plain type on the wash, option C's cover found no photo, and UniCon isn't a product the system knows.

## 1. Keep three options, but make each one a real design

- **Carousels use photos inside too.** Cover plus at least one or two interior cards with photos (different photos, or crops of the cover), so a carousel isn't one photo and four empty cards. Type-only cards stay for single statements, but never more than two in a row.
- **Use the campaign's own assets.** Pull the campaign's mood board, key visuals and marks (Assets) into the designs: e.g. the key visual as a framed card, the webinar mark on the close card. Needs post.html to place an asset image (a new `asset` field per card) and the planner to know which assets exist (it already gets their names).
- **Never leave an empty photo.** If no photo passes after two rounds, use the best alternate that passed for another slot, or switch that card to a type layout, and say so. No grey placeholder cover.

## 2. Tweak an option without starting over

Buttons on each option, next to Render again:
- **Dark mode / Light mode** (re-render with `dark` flipped on type and close cards).
- **More photo** (turn type cards into photo cards with alternates).
- **Use the key visual** (put the campaign KV on the cover or close card).
- **Shorter copy** and **Different photo** (exists: Other options).
- **Per-card thumbs up / down**: tick the cards you like, then "More like these" rewrites only the thumbs-down cards, keeping the rest.

## 3. Products: add UniCon (and the endorsed names)

- Add **UniCon** to the planner's products (`lib/social/plan-schema.ts` PRODUCTS) and to post.html's logo set (needs the official UniCon lockup files in `social/brand/`), with "UniCon by Threecolts" as the endorsed form.
- Check the calendar's own Product dropdown (`PRODUCT_OPTIONS` in `lib/database.types.ts`) has UniCon and the deck's names (Seller 365, UniCon, MarginPro, Tactical Arbitrage, InventoryLab, SmartRepricer, FeedbackWhiz, ProfitView).

## 4. Model

- Add `SOCIAL_MODEL` so Social can run on Claude Opus 5.5 while the rest of the app stays on Sonnet 5.5. Opus 5.5 is $4 / $20 per million tokens vs Sonnet 5.5's $2 / $10, so a post goes from roughly $0.10–0.30 to $0.20–0.60. Worth it for design judgement and photo picking.

## Order

1 and 3 first (they fix what Angela sees), then 2, then 4 (a one-line switch).
