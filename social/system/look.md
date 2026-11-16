# The look

**Base: OpenAI's Instagram.** Angela's references were OpenAI, Meta and Wise; OpenAI is the base. What we take from it:

- **Real people, real places, natural light.** Warm, candid, a little cinematic. People mid-task, not posing for the camera. Faces are welcome: OpenAI and Meta put text right next to faces.
- **Text sits on the photo, lower left, in white.** No boxes, no bars, no outline. A soft dark fade from the bottom keeps it readable.
- **Type is quiet.** Inter, mostly regular weight, with the key phrase in semibold ("This legend built an app to **help your grandparents** not get scammed."). Or one short semibold line.
- **No logo on the post.** The profile picture carries the brand. The product is named in the words.
- **Plain type cards** for news and explainers: a clean canvas, a sentence, nothing else.
- **Carousels** open on a photo and then go to type cards.

What we take from Wise: confident short headlines, the occasional bold type-only card. What we leave: Wise's lime green, its condensed caps, and Meta's subtitle-style captions.

What keeps it Threecolts: Inter, the brand voice, the soft brand wash on type cards, and the graphite dark canvas for AI Operator.

## The three layouts (`layout` in the spec)

| Layout | What it is | Use for |
|---|---|---|
| `fullbleed` (A) | Photo fills the frame, white text lower left, optional prompt bubble above the headline | The default. Stories about sellers, product moments, hooks |
| `framed` (B) | Photo in a rounded frame on the light wash, dark text below | When the photo is busy, or you want the cleaner brand-book look |
| `type` (C) | No photo. Headline on the wash, optional stat, prompt bubble or CTA pill. `"dark": true` for graphite | News, explainers, quotes, AI Operator prompts, carousel interior cards |
| `close` | Carousel closing card: headline, sub, CTA pill | The last card of a carousel |

**Mixed-weight headlines:** wrap the key phrase in `**…**`, e.g. `"She checked **400 products** before lunch."`. The rest sets in regular weight. Without `**`, the whole headline is semibold. Use mixed weight on most full-bleed posts; semibold for short punchy lines (five words or fewer).

**Prompt bubble** (`prompt`): a frosted chat bubble with a plus button, from the AI Operator posts. Use it when the post is about asking AI Operator something. Keep the prompt a real, plain-English request a seller would type.

**Brand-book note:** the Brand System says photography sits in a frame and never full-bleed behind text. For social, the full-bleed layout is the approved exception (Lionel, 2026-11-16). Framed (B) is the brand-book version.

## Self-check before showing any frame

1. Is the photo real, specific and unposed? Would anyone think "stock" or "AI"?
2. Is every face and important hand clear of the text?
3. Can you read every word at phone size? Is the text in the lower part of the frame, on the darker side of the photo?
4. Is there one idea per post, and is the headline under about 12 words?
5. Is the copy in sentence case, ending with a full stop, with no banned words?
6. Is any claim, number or price not from the brief?
7. Story: is all text between y 250 and y 1520?
8. Carousel: does the cover work on its own in the grid? Does every card have one point?
9. Are the three options genuinely different?
