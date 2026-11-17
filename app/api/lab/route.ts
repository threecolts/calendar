import { generateText, Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { decide, type DecisionResult, type Question } from "@/lib/ai/decide"
import { steadySampling, writerModel } from "@/lib/ai/models"
import { readGoogleDoc } from "@/lib/google-doc"
import {
  AUDIENCE_SEGMENTS, CHANNEL_OPTIONS, FORMAT_OPTIONS, MOTION_OPTIONS, PRODUCT_OPTIONS, TYPE_OPTIONS,
} from "@/lib/database.types"

export const maxDuration = 120

/**
 * AI Lab: demos of a "Claude writes, Jev decides" workflow on the real data.
 *   triage — sort a new idea (campaign, channel, format, product, audience, priority, duplicate)
 *   intent — what is a comment asking for?
 *   draft  — Claude drafts campaigns from an idea + comment (or a pasted plan),
 *            then every campaign and item is checked against what already exists
 * Nothing is written here; the client creates campaigns only after review.
 */

const INTENTS = [
  "Split into multiple campaigns",
  "Promote to a campaign",
  "Promote to a calendar item",
  "Change the date",
  "Approval",
  "Blocker",
  "Question",
  "Nothing to act on",
] as const

const NEW_CAMPAIGN = "Create new campaign"
const NO_DUPLICATE = "No duplicate"

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Active campaigns that haven't passed their end date, plus every existing item title */
async function loadContext(supabase: Supabase) {
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: campaigns }, { data: items }] = await Promise.all([
    supabase.from("campaigns").select("id, title, objective, product, motion, type, end_date, status").eq("status", "Active"),
    supabase.from("content_items").select("id, title, campaign_id"),
  ])
  const live = (campaigns ?? []).filter(c => !c.end_date || c.end_date >= today)
  return { today, live, titles: (items ?? []).map(i => i.title as string) }
}

/** Cheap word-overlap shortlist so duplicate questions stay small */
function similar(text: string, titles: string[], n = 8) {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
  const target = words(text)
  return [...new Set(titles)]
    .map(t => {
      const w = words(t)
      let overlap = 0
      for (const x of w) if (target.has(x)) overlap++
      return { t, score: overlap / Math.max(1, Math.min(w.size, target.size)) }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.t)
}

const liveList = (live: { title: string; objective: string | null; product: string | null }[]) =>
  live.length
    ? live.map(c => `- ${c.title}${c.product ? ` (${c.product})` : ""}${c.objective ? `: ${c.objective}` : ""}`).join("\n")
    : "(none)"

const draftSchema = z.object({
  campaigns: z.array(z.object({
    title: z.string().describe("Short campaign name"),
    objective: z.string().describe("One sentence: what this campaign is for"),
    type: z.enum(TYPE_OPTIONS as [string, ...string[]]),
    motion: z.enum(MOTION_OPTIONS as [string, ...string[]]),
    product: z.string().nullable().describe("One of the known products, or null"),
    items: z.array(z.object({
      title: z.string(),
      channel: z.enum(CHANNEL_OPTIONS as [string, ...string[]]),
      format: z.enum(FORMAT_OPTIONS as [string, ...string[]]),
      publish_date: z.string().describe("YYYY-MM-DD, a weekday"),
      date_confidence: z.enum(["Confirmed", "Provisional"]),
    })).max(12),
  })).min(1).max(8),
})

export type Draft = z.infer<typeof draftSchema>

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  try {
    // ── Sort a new idea ──
    if (body.action === "triage") {
      const text = String(body.text ?? "").trim()
      if (text.length < 4) return Response.json({ error: "Type a bit more" }, { status: 400 })
      const { live, titles } = await loadContext(supabase)
      const dupes = similar(text, titles)
      const questions: Question[] = [
        { id: "campaign", type: "choice", question: "Which live campaign does this idea belong to?", options: [...live.map(c => c.title), NEW_CAMPAIGN] },
        { id: "channel", type: "choice", question: "Best channel for it?", options: CHANNEL_OPTIONS },
        { id: "format", type: "choice", question: "Best format?", options: FORMAT_OPTIONS },
        { id: "product", type: "choice", question: "Which product is it about?", options: [...PRODUCT_OPTIONS] },
        { id: "audience", type: "choice", question: "Which audience is it for?", options: [...AUDIENCE_SEGMENTS, "General"] },
        { id: "priority", type: "score", question: "How much priority should it get (1 low, 5 high)?", min: 1, max: 5 },
        { id: "duplicate", type: "choice", question: "Is it a near-duplicate of something already planned?", options: [...dupes, NO_DUPLICATE] },
      ]
      const result = await decide(`New idea: "${text}"\n\nLive campaigns:\n${liveList(live)}`, questions)
      return Response.json(result)
    }

    // ── What is a comment asking for? ──
    if (body.action === "intent") {
      const comment = String(body.comment ?? "").trim()
      if (!comment) return Response.json({ error: "Write a comment first" }, { status: 400 })
      const result = await decide(
        `A teammate commented on the idea "${String(body.ideaTitle ?? "")}":\n"${comment}"`,
        [{ id: "intent", type: "choice", question: "What is the comment asking for?", options: [...INTENTS] }],
      )
      return Response.json(result)
    }

    // ── Claude drafts campaigns, then everything is checked ──
    if (body.action === "draft") {
      const { today, live, titles } = await loadContext(supabase)
      let source = ""
      let docStatus: "read" | "not-shared" | "none" | "pasted" = "none"

      if (body.ideaId) {
        const { data: idea } = await supabase.from("content_items").select("title, notes, brief_url").eq("id", body.ideaId).single()
        if (!idea) return Response.json({ error: "Idea not found" }, { status: 404 })
        const pasted = String(body.docText ?? "").trim()
        let docText: string | null = null
        if (pasted) { docText = pasted.slice(0, 30000); docStatus = "pasted" }
        else { const doc = await readGoogleDoc(idea.brief_url); docText = doc.text; docStatus = doc.status }
        source = [
          `IDEA: ${idea.title}`,
          idea.notes ? `NOTES:\n${idea.notes}` : "",
          docText ? `LINKED DOCUMENT:\n${docText}` : "",
          body.comment ? `TEAMMATE'S REQUEST: "${body.comment}"` : "",
          "Split this into separate campaigns as requested — typically one per distinct stream of work.",
        ].filter(Boolean).join("\n\n")
      } else {
        source = `CONTENT PLAN:\n${String(body.text ?? "").slice(0, 30000)}\n\nGroup this plan into campaigns.`
        if (String(body.text ?? "").trim().length < 10) return Response.json({ error: "Paste a plan first" }, { status: 400 })
      }

      const { output: draft } = await generateText({
        model: writerModel,
        ...steadySampling,
        output: Output.object({ schema: draftSchema }),
        prompt: [
          `Today is ${today}. Draft content marketing campaigns for a software company (Threecolts) from the material below.`,
          "Each campaign gets a short name, a one-line objective, a type, a motion, a product, and its content items with realistic weekday publish dates after today.",
          "Use Provisional when the material doesn't pin a date. Keep titles short and specific.",
          `Known products: ${PRODUCT_OPTIONS.join(", ")}.`,
          "",
          source,
        ].join("\n"),
      })

      // Checks run in parallel: one call per campaign
      const checks = await Promise.all(draft.campaigns.map(async c => {
        const itemQuestions: Question[] = c.items.flatMap((it, i) => [
          { id: `fit_${i}`, type: "choice" as const, question: `Does the format "${it.format}" suit the channel "${it.channel}" for "${it.title}"?`, options: ["Good fit", "Questionable", "Poor fit"] },
          { id: `dup_${i}`, type: "choice" as const, question: `Is "${it.title}" a near-duplicate of an existing item?`, options: [...similar(it.title, titles, 6), NO_DUPLICATE] },
        ])
        const result: DecisionResult = await decide(
          `Proposed campaign "${c.title}": ${c.objective} (product: ${c.product ?? "none"})\nItems:\n${c.items.map(it => `- ${it.title} [${it.channel} ${it.format}]`).join("\n")}\n\nLive campaigns:\n${liveList(live)}`,
          [{ id: "match", type: "choice", question: "Should this be added to one of the live campaigns, or created new?", options: [...live.map(l => l.title), NEW_CAMPAIGN] }, ...itemQuestions],
        )
        const match = result.decisions.match
        return {
          ms: result.ms,
          engineLabel: result.engineLabel,
          match: { ...match, campaignId: live.find(l => l.title === match.answer)?.id ?? null },
          items: c.items.map((_, i) => ({ fit: result.decisions[`fit_${i}`], duplicate: result.decisions[`dup_${i}`] })),
        }
      }))

      return Response.json({ draft, checks, docStatus, engineLabel: checks[0]?.engineLabel })
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[lab]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 })
  }
}
