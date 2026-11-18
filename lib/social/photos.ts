import { generateText, Output } from "ai"
import { z } from "zod"
import { socialModel } from "@/lib/ai/models"
import { decide, type Question } from "@/lib/ai/decide"
import { socialSystemPrompt } from "@/lib/social/system"
import { judgeUrl, renderUrl, searchPhotos, trackDownload, type Candidate } from "@/lib/social/unsplash"
import type { ModelRun } from "@/lib/social/plan"
import type { PlanSlide } from "@/lib/social/plan-schema"

/**
 * Find a photo for one slot (BUILD-SPEC steps 3–4):
 *   Jev scores the search terms → Unsplash search → Jev filters stock-looking
 *   results from their metadata (Jev doesn't see images) → Claude looks at the
 *   12 best and picks one, or asks for new terms. At most two rounds; after
 *   that the slot is left for a manual upload.
 */

const SHORTLIST = 12
const JEV_POOL = 24

/** A passing photo kept in reserve: one click swaps it in */
export interface AlternatePhoto {
  url: string
  thumb: string
  unsplash_id: string
  photographer: string
  photographer_url: string
  page: string
  focus: string
  reason: string
  download_location: string
}

export interface UnsplashPhoto {
  source: "unsplash"
  /** Up to two other photos that passed; a closer, expressive one whenever this pick is wide */
  alternates?: AlternatePhoto[]
  url: string
  thumb: string
  unsplash_id: string
  photographer: string
  photographer_url: string
  page: string
  focus: string
  reason: string
}

export interface PickRound {
  terms: string[]
  term_scores: Record<string, { answer: string; confidence: number }>
  found: number
  shortlist: { n: number; id: string; stock: string; stock_p: number; on_brief: string; on_brief_p: number }[]
  pick: string | null
  reason: string
  rejections: { id: string; reason: string }[]
  engine: string
}

export interface PickResult {
  photo: UnsplashPhoto | null
  rounds: PickRound[]
  runs: ModelRun[]
  note: string
}

const pickSchema = z.object({
  pick: z.number().nullable().describe("The number of the photo that passes every test in photography.md, or null if none does"),
  focus: z.string().describe('CSS background-position for the chosen photo, e.g. "55% 35%": eyes in the upper half, the lower third calm and darker for text'),
  reason: z.string().describe("One line: why this photo, or why nothing passed"),
  pick_is_wide: z.boolean().describe("True if the pick is a wide shot (a whole room or place, the person small in the frame)"),
  alternates: z.array(z.object({
    photo: z.number().describe("Number of another photo that passes every test"),
    focus: z.string().describe("CSS background-position for it"),
    reason: z.string().describe("One line: what this one offers instead"),
  })).describe("Up to 2 other photos that pass, best first. If the pick is wide, the first alternate MUST be a closer shot of a person whose face shows the moment. Empty if nothing else passes"),
  rejections: z.array(z.object({ photo: z.number(), reason: z.string() })).describe("One short line for each photo you rejected"),
  new_terms: z.array(z.string()).describe("If nothing passed: 3 new search terms (person, action, place, light). Otherwise empty"),
})

/** Jev: keep the specific terms (person + action + place + light), best first */
async function rankTerms(terms: string[], moment: string) {
  const qs: Question[] = terms.map((t, i) => ({
    id: `t${i}`,
    type: "score",
    min: 1,
    max: 3,
    question: `How specific is the Unsplash search term "${t}"? 1 = generic stock (abstract ideas, "business", "success"), 2 = somewhat specific, 3 = specific: a person, an action, a place and a light.`,
  }))
  const r = await decide(`Photo needed: ${moment}\nSearch terms:\n${terms.map(t => `- ${t}`).join("\n")}`, qs)
  const scored = terms.map((t, i) => ({ t, d: r.decisions[`t${i}`] }))
  const keep = scored.filter(s => Number(s.d.answer) >= 2).sort((a, b) => Number(b.d.answer) - Number(a.d.answer) || b.d.confidence - a.d.confidence)
  // Never search with fewer than three terms: top up with the best of the rest
  const rest = scored.filter(s => !keep.includes(s)).sort((a, b) => Number(b.d.answer) - Number(a.d.answer))
  const chosen = [...keep, ...rest].slice(0, 3).map(s => s.t)
  return {
    chosen,
    scores: Object.fromEntries(scored.map(s => [s.t, { answer: s.d.answer, confidence: s.d.confidence }])),
    engine: r.engineLabel,
  }
}

/** Jev: score each candidate's metadata for stock look and fit with the moment; keep the best 12 */
async function shortlist(cands: Candidate[], moment: string) {
  const pool = cands.slice(0, JEV_POOL)
  if (!pool.length) return { list: [] as (Candidate & { stock: string; stock_p: number; on_brief: string; on_brief_p: number })[], engine: "" }
  const qs: Question[] = pool.flatMap((_, i) => [
    { id: `s${i}`, type: "score" as const, min: 1, max: 3, question: `Photo ${i + 1}: from its description, how stock does it look? 1 = candid documentary, 2 = neutral, 3 = staged corporate stock.` },
    { id: `b${i}`, type: "choice" as const, question: `Photo ${i + 1}: does it show the moment described in the post?`, options: ["Yes", "No"] },
  ])
  const state = [
    `The post needs a photo of: ${moment}`,
    "",
    "Candidates (Unsplash metadata only):",
    ...pool.map((c, i) => `${i + 1}. ${[c.description, c.alt].filter(Boolean).join(" / ") || "(no description)"}${c.tags.length ? ` [tags: ${c.tags.slice(0, 8).join(", ")}]` : ""} (search: "${c.query}")`),
  ].join("\n")
  const r = await decide(state, qs)
  const list = pool.map((c, i) => {
    const s = r.decisions[`s${i}`], b = r.decisions[`b${i}`]
    const yes = b.answer === "Yes" ? b.confidence : 1 - b.confidence
    return { ...c, stock: s.answer, stock_p: s.confidence, on_brief: b.answer, on_brief_p: b.confidence, score: yes - 0.35 * (Number(s.answer) - 1) }
  })
  list.sort((a, b) => b.score - a.score)
  return { list: list.slice(0, SHORTLIST), engine: r.engineLabel }
}

/** Claude looks at the shortlist (images) and picks */
async function claudePick(slide: PlanSlide, layout: string, list: Candidate[], formats: string[]) {
  const images = await Promise.all(list.map(async c => {
    const res = await fetch(judgeUrl(c.raw))
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  }))
  const content: Array<{ type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: string }> = [{
    type: "text",
    text: [
      "Pick the photo for this frame, judging every photo against the tests in system/photography.md.",
      `Layout: ${layout}${layout === "fullbleed" ? " (photo fills the frame; white text sits lower left on a dark fade)" : " (photo sits in a rounded frame above dark text)"}.`,
      `It will be cropped to: ${formats.join(", ")} (square, 4:5 and 9:16 crops of a portrait photo).`,
      `Headline on the image: ${slide.headline.replace(/\*\*/g, "")}`,
      slide.sub ? `Sub: ${slide.sub}` : "",
      `The moment: ${slide.photo?.moment ?? ""}`,
      `Look for: ${slide.photo?.look_for ?? ""}`,
      `Skip: ${slide.photo?.skip ?? ""}`,
      "Prefer a person whose face shows expression and motive (head and shoulders to waist up: focus, relief, a genuine smile) over an empty scene or hands only. Follow the visual personality in brand-strategy.md: warm, real, a friend who gets it; never busy, fearful or staged.",
      "If you pick a wide shot, you must also give a closer alternate of a person whose face shows the moment. Give up to 2 alternates in any case.",
      "Don't settle: if nothing passes every test, return pick: null and three new search terms.",
    ].filter(Boolean).join("\n"),
  }]
  list.forEach((c, i) => {
    const img = images[i]
    if (!img) return
    content.push({ type: "text", text: `Photo ${i + 1} (${c.w}×${c.h}, ${c.orientation})` })
    content.push({ type: "image", image: img, mediaType: "image/jpeg" })
  })
  const result = await generateText({
    model: socialModel,
    system: socialSystemPrompt(),
    messages: [{ role: "user", content }],
    output: Output.object({ schema: pickSchema }),
    providerOptions: { anthropic: { effort: "medium", cacheControl: { type: "ephemeral" } } },
  })
  return { out: result.output, run: {
    step: "photo pick",
    model: result.response.modelId,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
    at: new Date().toISOString(),
  } satisfies ModelRun }
}

export async function findPhoto(slide: PlanSlide, layout: string, formats: string[], exclude: Set<string>): Promise<PickResult> {
  const rounds: PickRound[] = []
  const runs: ModelRun[] = []
  const moment = slide.photo?.moment ?? slide.headline
  let terms = (slide.photo?.search_terms ?? []).map(t => t.term).filter(Boolean)
  if (!terms.length) return { photo: null, rounds, runs, note: "The plan had no search terms for this photo." }

  for (let round = 0; round < 2; round++) {
    const ranked = await rankTerms(terms, moment)
    const { candidates } = await searchPhotos(ranked.chosen, exclude)
    const { list, engine } = await shortlist(candidates, moment)
    const log: PickRound = {
      terms: ranked.chosen,
      term_scores: ranked.scores,
      found: candidates.length,
      shortlist: list.map((c, i) => ({ n: i + 1, id: c.id, stock: c.stock, stock_p: c.stock_p, on_brief: c.on_brief, on_brief_p: c.on_brief_p })),
      pick: null,
      reason: "",
      rejections: [],
      engine: [ranked.engine, engine].filter(Boolean).join(" / "),
    }
    rounds.push(log)
    if (!list.length) {
      log.reason = "No usable results (after dropping Unsplash+ and photos under 2400 px)."
      terms = terms.slice(3).length >= 3 ? terms.slice(3) : terms
      if (round === 0 && terms.length) continue
      break
    }

    const { out, run } = await claudePick(slide, layout, list, formats)
    runs.push(run)
    const chosen = out.pick && out.pick >= 1 && out.pick <= list.length ? list[out.pick - 1] : null
    log.pick = chosen?.id ?? null
    log.reason = out.reason
    log.rejections = out.rejections.map(r => ({ id: list[r.photo - 1]?.id ?? String(r.photo), reason: r.reason }))
    if (chosen) {
      await trackDownload(chosen)
      const focusOk = (f: string) => (/^\d{1,3}% \d{1,3}%$/.test(f.trim()) ? f.trim() : "50% 40%")
      const alternates: AlternatePhoto[] = out.alternates
        .flatMap(a => {
          const c = a.photo >= 1 && a.photo <= list.length ? list[a.photo - 1] : null
          return c && c.id !== chosen.id ? [{ a, c }] : []
        })
        .slice(0, 2)
        .map(({ a, c }) => ({
          url: renderUrl(c.raw), thumb: c.thumb, unsplash_id: c.id, photographer: c.photographer,
          photographer_url: c.photographer_url, page: c.page, focus: focusOk(a.focus), reason: a.reason,
          // Counted with Unsplash only if it's swapped in and used
          download_location: c.download_location,
        }))
      return {
        photo: {
          source: "unsplash",
          alternates,
          url: renderUrl(chosen.raw),
          thumb: chosen.thumb,
          unsplash_id: chosen.id,
          photographer: chosen.photographer,
          photographer_url: chosen.photographer_url,
          page: chosen.page,
          focus: /^\d{1,3}% \d{1,3}%$/.test(out.focus.trim()) ? out.focus.trim() : "50% 40%",
          reason: out.reason,
        },
        rounds,
        runs,
        note: "",
      }
    }
    for (const c of list) exclude.add(c.id)
    terms = out.new_terms.filter(Boolean).slice(0, 5)
    if (!terms.length) break
  }
  return { photo: null, rounds, runs, note: rounds.at(-1)?.reason || "No photo passed. Upload one instead." }
}
