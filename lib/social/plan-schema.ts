import { z } from "zod"

export const PLATFORMS = ["Instagram", "LinkedIn", "X", "Facebook"] as const
export type Platform = (typeof PLATFORMS)[number]

export const POST_TYPES = ["single", "carousel", "story"] as const
export type PostType = (typeof POST_TYPES)[number]

export const PRODUCTS = ["threecolts", "seller-365", "ai-operator"] as const

const searchTerm = z.object({
  term: z.string().describe("3–6 words: a person, an action, a place and a light (system/photography.md)"),
})

const photoBrief = z.object({
  moment: z.string().describe("The moment the photo shows, in one sentence"),
  search_terms: z.array(searchTerm).describe("4–6 Unsplash search terms from different angles: the person, the hands, the place, the moment"),
  look_for: z.string().describe("What a passing photo has: orientation, where the subject sits, where the text goes"),
  skip: z.string().describe("What to reject for this post"),
})

const slide = z.object({
  layout: z.enum(["fullbleed", "framed", "type", "close"]),
  headline: z.string().describe("Sentence case, ends with a full stop. Wrap the key phrase in **…** for a mixed-weight headline"),
  sub: z.string().nullable(),
  eyebrow: z.string().nullable().describe("Rarely: only to name a card's function"),
  prompt: z.string().nullable().describe("AI Operator chat bubble: a real plain-English request a seller would type"),
  cta: z.string().nullable().describe("Title Case, no full stop. Only the CTA the brief gives"),
  dark: z.boolean().describe("Graphite canvas for framed/type/close. AI Operator type cards are dark"),
  anchor_bottom: z.boolean().describe("Type cards only: text at the bottom"),
  stat: z.object({ value: z.string(), label: z.string() }).nullable().describe("Only with a number from the brief"),
  photo: photoBrief.nullable().describe("Required for fullbleed and framed; null for type and close"),
  alt_text: z.string().describe("Plain description of the image and the words on it"),
})

export const planSchema = z.object({
  source: z.string().describe("Which part of the Doc this post is built from (a heading or the first words), so the reviewer can check it"),
  angle: z.string().describe("The angle, in one sentence"),
  product: z.enum(PRODUCTS).describe("Which product the post is about (sets the logo files if a logo is ever asked for)"),
  options: z.array(z.object({
    option: z.enum(["A", "B", "C"]),
    why: z.string().describe("One line: why this option exists and how it differs from the others"),
    strongest: z.boolean().describe("True for exactly one option: the one that also gets a story size"),
    slides: z.array(slide).describe("One slide for a single post or a story; 3–8 for a carousel (cover photo, one point per card, close card last)"),
  })).describe("Exactly three options, A, B and C: different layouts or ideas, not three crops of one"),
  captions: z.array(z.object({
    platform: z.enum(PLATFORMS),
    text: z.string(),
  })).describe("One caption per requested platform (none for a story-only post)"),
  flags: z.array(z.object({
    text: z.string().describe("The claim, number, price or date"),
    reason: z.string().describe("Why it needs checking: not in the Doc, from TO-CONFIRM, or an assumption you made"),
  })).describe("Anything that isn't clearly in the Doc, plus any assumption you had to make"),
})

export type SocialPlan = z.infer<typeof planSchema>
export type PlanSlide = SocialPlan["options"][number]["slides"][number]

/** Photo slot key for a slide: "A-1", "B-1", "A-3" … */
export const slotKey = (option: string, slideIndex: number) => `${option}-${slideIndex + 1}`
