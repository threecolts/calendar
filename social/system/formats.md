# Formats and the spec file

| Format | Size | Use | Notes |
|---|---|---|---|
| `square` | 1080×1080 | Instagram grid, Facebook, LinkedIn | Pad 88 px |
| `portrait` | 1080×1350 | Instagram and LinkedIn feed: the default for feed posts and carousels | Pad 88/96 px. The profile grid shows a 3:4 centre crop, trimming about 34 px from each side; the 88 px pad already covers it |
| `story` | 1080×1920 | Instagram and Facebook Stories | Text and key visuals between y 250 and y 1520 (the renderer enforces this) |
| `landscape` | 1200×628 | X, LinkedIn link-style posts, Facebook | Smaller type, two-column framed layout |

Defaults if the brief doesn't say: single posts in `portrait` + `square`, with `story` for the strongest option; carousels in `portrait`; add `landscape` when X or LinkedIn is named.

**Carousels:** 3–8 cards. Cover = photo (full-bleed) with the promise. Interior = one point per card, usually `type` cards. Last card = `close` with the CTA. Keep the same canvas (light or dark) for all interior cards. Number cards in the copy only if the content really is a sequence.

## The spec file (`work/week.json`)

```json
{
  "week": "Week 47",
  "posts": [
    {
      "id": "p01",
      "product": "ai-operator",
      "options": [
        {"option": "A", "layout": "fullbleed", "why": "…",
         "photo": "photos/007.jpg", "focus": "60% 35%",
         "prompt": "Check if I'm ungated for these 40 products.",
         "headline": "**Ask before you buy.** Not after.",
         "sub": "", "formats": ["portrait", "square", "story"]},
        {"option": "B", "layout": "framed", "photo": "photos/012.jpg", "headline": "…", "sub": "…", "formats": ["portrait"]},
        {"option": "C", "layout": "type", "dark": true, "headline": "…", "prompt": "…", "cta": "Try AI Operator", "formats": ["portrait"]}
      ]
    },
    {
      "id": "p02", "product": "seller-365",
      "options": [{"option": "A", "formats": ["portrait"], "slides": [
        {"layout": "fullbleed", "photo": "photos/020.jpg", "headline": "…"},
        {"layout": "type", "headline": "…", "sub": "…"},
        {"layout": "close", "headline": "…", "cta": "Start Free Trial"}
      ]}]
    }
  ]
}
```

Fields: `layout` (fullbleed, framed, type, close) · `photo` (path relative to the spec) · `focus` (CSS background-position) · `headline` (`**…**` for the bold phrase) · `sub` · `eyebrow` (uppercase label; use rarely, only to name a card's function, e.g. "Question two") · `prompt` (chat bubble) · `stat` `{"value": "30,000+", "label": "SELLERS"}` (only with a confirmed number) · `cta` · `dark` (graphite canvas for framed/type/close) · `anchor: "bottom"` (type cards: text at the bottom) · `mark: true` (outline 3 behind a type card) · `logo: true` (only when the brief asks) · `product` (ai-operator, seller-365, threecolts) · `debug_safe: true` (shows the story safe zone).

Files come out as `<post>_<option>_<layout>_<format>.png` and `<post>_<option>_carousel_<format>_02of05.png`.
