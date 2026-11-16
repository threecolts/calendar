import { generateText, Output } from "ai"
import { writerModel } from "@/lib/ai/models"
import { socialSystemPrompt } from "@/lib/social/system"
import { runChecks, type CheckIssue } from "@/lib/social/checks"
import { planSchema, type Platform, type PostType, type SocialPlan } from "@/lib/social/plan-schema"
import type { Format, OptionSpec, PostSpec } from "@/lib/social/render"

export interface BriefInput {
  title: string
  publishDate: string | null
  channel: string
  format: string
  campaign: string | null
  notes: string | null
  docText: string
  platforms: Platform[]
  postType: PostType
  cards?: number
  extra?: string
}

export interface ModelRun {
  step: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  at: string
}

/** Calendar fields mapped onto templates/weekly-brief.md; the Doc fills the rest */
function briefMessage(b: BriefInput) {
  const type = b.postType === "carousel" ? `carousel (${b.cards ?? 5} cards)` : b.postType
  return [
    "Plan one post from this calendar entry. Follow the rules files.",
    "",
    "## Post",
    `- **Go-live date and platform(s):** ${b.publishDate ?? "not set"}; ${b.platforms.join(", ")}`,
    `- **Calendar entry:** "${b.title}" (channel ${b.channel}, format ${b.format}${b.campaign ? `, campaign "${b.campaign}"` : ""})`,
    `- **Type:** ${type}`,
    b.notes ? `- **Notes on the calendar entry:** ${b.notes}` : "",
    b.extra ? `- **Extra direction from Angela:** ${b.extra}` : "",
    "",
    "## How to use the Doc",
    "- The Doc may cover a whole campaign (emails, several audiences, several posts). Use only the part this calendar entry is about; name it in `source`.",
    "- If the Doc already has social copy for this post (a kicker, headline, sub-line, CTA, offer terms), that is Angela's approved copy: keep its words and facts, and vary the layout, photo and emphasis across the three options rather than rewriting it. Fix only what breaks the brand rules, and flag the change. If her copy uses a word brand.md bans (e.g. \"tools\"), keep her wording and flag it rather than rewriting it.",
    "- Offer terms, dates, prices and percentages: copy them exactly from the Doc. Anything not in the Doc goes in `flags`.",
    "- If the Doc doesn't say which product, audience or CTA, choose from the Doc's context and flag the assumption.",
    "",
    "## Output",
    `- Three options, A–C. ${b.postType === "carousel" ? `Each option is a carousel of ${b.cards ?? 5} cards.` : b.postType === "story" ? "Each option is one story frame." : "Each option is one frame."}`,
    "- Photo slides (fullbleed, framed) need a `photo` brief with search terms; type and close slides have `photo: null`.",
    `- Captions for: ${b.postType === "story" ? "none (stories get no caption)" : b.platforms.join(", ")}. Don't write character counts; the app counts.`,
    "",
    "## The Doc",
    "<doc>",
    b.docText,
    "</doc>",
  ].filter(l => l !== "").join("\n")
}

function issuesMessage(issues: CheckIssue[]) {
  return [
    "Your plan failed these checks. Return the whole plan again with every one fixed, changing nothing else:",
    ...issues.map(i => `- ${i.where}: ${i.message}`),
  ].join("\n")
}

/** Claude writes the plan; code checks it; one retry with the errors listed (BUILD-SPEC step 2) */
export async function generatePlan(b: BriefInput): Promise<{ plan: SocialPlan; issues: CheckIssue[]; runs: ModelRun[] }> {
  const runs: ModelRun[] = []
  const messages: Parameters<typeof generateText>[0]["messages"] = [{ role: "user", content: briefMessage(b) }]
  let plan: SocialPlan | null = null
  let issues: CheckIssue[] = []

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateText({
      model: writerModel,
      system: socialSystemPrompt(),
      messages,
      output: Output.object({ schema: planSchema }),
      providerOptions: { anthropic: { effort: "medium", cacheControl: { type: "ephemeral" } } },
    })
    runs.push({
      step: attempt ? "plan (retry)" : "plan",
      model: result.response.modelId,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      at: new Date().toISOString(),
    })
    plan = normalise(result.output)
    issues = runChecks(plan, b.docText)
    if (!issues.some(i => i.severity === "error")) break
    messages.push({ role: "assistant", content: JSON.stringify(result.output) })
    messages.push({ role: "user", content: issuesMessage(issues.filter(i => i.severity === "error")) })
  }

  return { plan: plan!, issues, runs }
}

/** Rewrite the copy of one option, keeping the other two and the captions (Angela's "regenerate copy") */
export async function regenerateOption(b: BriefInput, plan: SocialPlan, option: "A" | "B" | "C", note: string): Promise<{ plan: SocialPlan; issues: CheckIssue[]; runs: ModelRun[] }> {
  const optionSchema = planSchema.shape.options.element
  const current = plan.options.find(o => o.option === option)
  const result = await generateText({
    model: writerModel,
    system: socialSystemPrompt(),
    messages: [
      { role: "user", content: briefMessage(b) },
      { role: "assistant", content: JSON.stringify(plan) },
      {
        role: "user",
        content: [
          `Write option ${option} again. Keep it different from the other two options.`,
          note ? `Angela's note: ${note}` : "Angela didn't like it; try a different idea or layout.",
          `Keep "option": "${option}" and "strongest": ${current?.strongest ?? false}. Return only that one option.`,
        ].join("\n"),
      },
    ],
    output: Output.object({ schema: optionSchema }),
    providerOptions: { anthropic: { effort: "medium", cacheControl: { type: "ephemeral" } } },
  })
  const replaced = { ...result.output, option, strongest: current?.strongest ?? false }
  const next = { ...plan, options: plan.options.map(o => (o.option === option ? replaced : o)) }
  return {
    plan: next,
    issues: runChecks(next, b.docText),
    runs: [{
      step: `regenerate ${option}`,
      model: result.response.modelId,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      at: new Date().toISOString(),
    }],
  }
}

/** Keep exactly one "strongest" option and the A/B/C order */
function normalise(plan: SocialPlan): SocialPlan {
  const options = [...plan.options].sort((a, b) => a.option.localeCompare(b.option)).slice(0, 3)
  const strongest = options.findIndex(o => o.strongest)
  options.forEach((o, i) => { o.strongest = i === (strongest < 0 ? 0 : strongest) })
  return { ...plan, options }
}

/**
 * Sizes per option (system/formats.md defaults): singles in portrait + square,
 * plus story for the strongest option; carousels in portrait; stories as story;
 * landscape too when X or LinkedIn is a platform (not for carousels or stories).
 */
export function formatsFor(postType: PostType, platforms: Platform[], strongest: boolean): Format[] {
  if (postType === "story") return ["story"]
  if (postType === "carousel") return ["portrait"]
  const f: Format[] = ["portrait", "square"]
  if (strongest) f.push("story")
  if (platforms.includes("X") || platforms.includes("LinkedIn")) f.push("landscape")
  return f
}

/** The plan as a post.html spec (system/formats.md shape). Photos are filled in by slot. */
export function planToPostSpec(
  postId: string,
  plan: SocialPlan,
  postType: PostType,
  platforms: Platform[],
  photoFor: (slot: string) => { url: string; focus?: string } | null,
): PostSpec {
  return {
    id: postId,
    product: plan.product,
    options: plan.options.map(o => {
      const frames = o.slides.map((s, i) => {
        const p = s.layout === "fullbleed" || s.layout === "framed" ? photoFor(`${o.option}-${i + 1}`) : null
        return {
          layout: s.layout,
          headline: s.headline,
          ...(s.sub ? { sub: s.sub } : {}),
          ...(s.eyebrow ? { eyebrow: s.eyebrow } : {}),
          ...(s.prompt ? { prompt: s.prompt } : {}),
          ...(s.cta ? { cta: s.cta } : {}),
          ...(s.stat ? { stat: s.stat } : {}),
          ...(s.dark ? { dark: true } : {}),
          ...(s.anchor_bottom && s.layout === "type" ? { anchor: "bottom" as const } : {}),
          ...(p ? { photo: p.url, focus: p.focus } : {}),
        }
      })
      const formats = formatsFor(postType, platforms, o.strongest)
      const base = { option: o.option, why: o.why, formats }
      return (postType === "carousel" && frames.length > 1
        ? { ...base, slides: frames }
        : { ...base, ...frames[0] }) as OptionSpec
    }),
  }
}
