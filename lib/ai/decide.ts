import { experimental_decide, generateText, Output } from "ai"
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai"
import { z } from "zod"
import { deciderLabel, deciderModel, steadySampling } from "@/lib/ai/models"

/**
 * Fast, structured decisions: hand over some context and a few questions with
 * fixed answers, get back a typed verdict per question with a confidence.
 *
 * With JEV_API_KEY set, questions go to Jev (TypeSafe AI). Without it, or if
 * a Jev call fails, the same questions go to a small, fast Claude model
 * instead. Every result says which engine answered, so a demo never passes
 * one off as the other.
 */

export type Question =
  | { id: string; type: "choice"; question: string; options: string[] }
  | { id: string; type: "score"; question: string; min: number; max: number }

export interface Decision {
  id: string
  answer: string
  confidence: number
  /** Top alternatives with their probability, best first (choice questions) */
  alternatives: { option: string; probability: number }[]
}

export interface DecisionResult {
  engine: "jev" | "stand-in"
  engineLabel: string
  ms: number
  decisions: Record<string, Decision>
}

const decisionSchema = z.object({
  decisions: z.array(z.object({
    id: z.string(),
    alternatives: z
      .array(z.object({ option: z.string(), probability: z.number() }))
      .describe("The most likely answers, best first, with calibrated probabilities that sum to at most 1"),
  })),
})

const jevKey = process.env.JEV_API_KEY
const jev = jevKey ? createTypeSafeAi({ apiKey: jevKey }) : null

async function decideWithJev(state: string, questions: Question[]): Promise<DecisionResult> {
  const start = Date.now()
  const levels = (q: Extract<Question, { type: "score" }>) =>
    Array.from({ length: q.max - q.min + 1 }, (_, i) => String(q.min + i))

  const result = await experimental_decide({
    model: jev!.decisionModel(process.env.JEV_MODEL || "jev-latest"),
    state,
    questions: Object.fromEntries(questions.map(q => [q.id, q.type === "choice"
      ? { type: "choice" as const, instructions: q.question, criteria: Object.fromEntries(q.options.map(o => [o, null])) }
      : { type: "score" as const, instructions: q.question, criteria: levels(q) }])),
  })

  const confidence = (result.providerMetadata?.typesafe?.confidence ?? {}) as Record<string, number>
  const decisions: Record<string, Decision> = {}
  for (const q of questions) {
    const a = result.answers[q.id] as { type: string; choice?: string; score?: number; probabilities?: Record<string, number> }
    const allowed = q.type === "choice" ? q.options : levels(q)
    const ranked = Object.entries(a.probabilities ?? {})
      .filter(([option]) => allowed.includes(option))
      .sort((x, y) => y[1] - x[1])
      .map(([option, probability]) => ({ option, probability }))
    let answer: string
    if (q.type === "choice") answer = a.choice ?? ranked[0]?.option ?? allowed[allowed.length - 1]
    else if (ranked.length) answer = ranked[0].option
    else {
      // Fractional score: a 0–1 position on the rubric, or a level index
      const s = a.score ?? 0
      const idx = s <= 1 ? Math.round(s * (allowed.length - 1)) : Math.round(s)
      answer = allowed[Math.min(allowed.length - 1, Math.max(0, idx))]
    }
    const top = ranked.find(r => r.option === answer)
    const alternatives = [top ?? { option: answer, probability: confidence[q.id] ?? 0 }, ...ranked.filter(r => r.option !== answer)].slice(0, 3)
    decisions[q.id] = { id: q.id, answer, confidence: confidence[q.id] ?? top?.probability ?? 0, alternatives }
  }

  return { engine: "jev", engineLabel: `Jev (${result.response.modelId})`, ms: Date.now() - start, decisions }
}

export async function decide(state: string, questions: Question[]): Promise<DecisionResult> {
  if (jev) {
    try {
      return await decideWithJev(state, questions)
    } catch (e) {
      console.error("[decide] Jev call failed, using the stand-in:", e)
    }
  }
  return decideWithStandIn(state, questions)
}

async function decideWithStandIn(state: string, questions: Question[]): Promise<DecisionResult> {
  const start = Date.now()

  const prompt = [
    "You are a fast decision model. Read the STATE, then answer every QUESTION by choosing from its allowed answers only.",
    "For each question give up to 3 alternatives, best first, with honest calibrated probabilities (not just 1.0).",
    "For score questions the allowed answers are the whole numbers in the range, written as digits.",
    "",
    "STATE:",
    state,
    "",
    "QUESTIONS:",
    ...questions.map(q => q.type === "choice"
      ? `- id "${q.id}": ${q.question}\n  Allowed answers: ${q.options.map(o => JSON.stringify(o)).join(", ")}`
      : `- id "${q.id}": ${q.question}\n  Allowed answers: whole numbers ${q.min} to ${q.max}`),
  ].join("\n")

  const { output } = await generateText({
    model: deciderModel,
    ...steadySampling,
    output: Output.object({ schema: decisionSchema }),
    prompt,
  })

  const decisions: Record<string, Decision> = {}
  for (const q of questions) {
    const allowed = q.type === "choice"
      ? q.options
      : Array.from({ length: q.max - q.min + 1 }, (_, i) => String(q.min + i))
    const raw = output.decisions.find(d => d.id === q.id)?.alternatives ?? []
    // Keep only allowed answers (case-insensitive), clamp probabilities
    const alternatives = raw
      .map(a => ({ option: allowed.find(o => o.toLowerCase() === a.option.trim().toLowerCase()), probability: Math.min(1, Math.max(0, a.probability)) }))
      .filter((a): a is { option: string; probability: number } => !!a.option)
      .slice(0, 3)
    const top = alternatives[0] ?? { option: allowed[allowed.length - 1], probability: 0 }
    decisions[q.id] = { id: q.id, answer: top.option, confidence: top.probability, alternatives }
  }

  return { engine: "stand-in", engineLabel: `${deciderLabel} (Jev stand-in)`, ms: Date.now() - start, decisions }
}
