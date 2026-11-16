import { readSocialFile } from "@/lib/social/system"
import type { SocialPlan } from "@/lib/social/plan-schema"

/**
 * Hard checks run in code after every Claude plan (BUILD-SPEC step 2):
 * banned words, headline full stops, product spelling, caption lengths,
 * and numbers that aren't in the brief. Rules come from the system files
 * where they live there, so editing brand.md updates the check.
 */

export interface CheckIssue {
  severity: "error" | "warning"
  where: string
  message: string
}

/** Platform caption limits, from system/captions.md (soft guidance, not the platforms' hard maximums) */
export const CAPTION_LIMITS: Record<string, number> = {
  Instagram: 2200,
  LinkedIn: 1000,
  X: 280,
  Facebook: 600,
}

let banned: string[] | null = null
function bannedWords(): string[] {
  if (banned) return banned
  const line = readSocialFile("system/brand.md").split("\n").find(l => l.includes("**Banned:**")) ?? ""
  banned = line.replace(/.*\*\*Banned:\*\*/, "").replace(/\.$/, "").split(",").map(w => w.trim().toLowerCase()).filter(Boolean)
  return banned
}

let products: string[] | null = null
/** Product names exactly as brand.md writes them (the bold names in "Company and products") */
function productNames(): string[] {
  if (products) return products
  const md = readSocialFile("system/brand.md")
  const section = md.slice(md.indexOf("Products, named exactly"), md.indexOf("## Claims"))
  const names = [...section.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1].trim())
  products = [...new Set(names)].sort((a, b) => b.length - a.length)
  return products
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const plain = (s: string) => s.replace(/\*\*/g, "")

/** "Seller 365" also matches "Seller365", "seller 365", "SELLER-365" … */
function looseName(name: string) {
  const letters = name.replace(/[\s-]+/g, "")
  return new RegExp(`\\b${letters.split("").map(esc).join("[\\s-]?")}\\b`, "gi")
}

/** Numbers, money and percentages that must appear in the brief: "20%", "$69", "14-day", "2,400" */
function numbersIn(text: string): string[] {
  return [...text.matchAll(/[$£€]?\d[\d,.]*\s?(%|k\b|m\b)?/gi)]
    .map(m => m[0].trim().replace(/[.,]$/, ""))
    .filter(n => /\d/.test(n))
}

/** Every piece of copy in the plan, labelled with where it is */
export function copyFields(plan: SocialPlan): { where: string; field: string; text: string }[] {
  const out: { where: string; field: string; text: string }[] = []
  for (const opt of plan.options) {
    opt.slides.forEach((s, i) => {
      const where = opt.slides.length > 1 ? `Option ${opt.option}, card ${i + 1}` : `Option ${opt.option}`
      for (const field of ["headline", "sub", "eyebrow", "prompt"] as const) {
        const v = s[field]
        if (v) out.push({ where, field, text: v })
      }
      if (s.stat) out.push({ where, field: "stat", text: `${s.stat.value} ${s.stat.label}` })
    })
  }
  for (const c of plan.captions) out.push({ where: `${c.platform} caption`, field: "caption", text: c.text })
  return out
}

const label = (f: { where: string; field: string }) => (f.field === "caption" ? f.where : `${f.where} ${f.field}`)

export function runChecks(plan: SocialPlan, briefText: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const fields = copyFields(plan)
  const brief = briefText.toLowerCase()

  // Banned words (whole words, any case). If the Doc itself uses the word, it may be
  // Angela's approved copy: flag it for her instead of forcing a rewrite.
  for (const f of fields) {
    for (const w of bannedWords()) {
      const re = new RegExp(`\\b${esc(w)}s?\\b`, "i")
      if (!re.test(plain(f.text))) continue
      issues.push(re.test(briefText)
        ? { severity: "warning", where: label(f), message: `Uses "${w}", which brand.md bans, but the Doc uses it too. Keep it only if it's approved copy.` }
        : { severity: "error", where: label(f), message: `Uses the banned word "${w}".` })
    }
  }

  // Headlines end with a full stop (a question or exclamation mark is accepted too)
  for (const opt of plan.options) {
    opt.slides.forEach((s, i) => {
      const h = plain(s.headline ?? "").trim()
      const where = opt.slides.length > 1 ? `Option ${opt.option}, card ${i + 1}` : `Option ${opt.option}`
      if (!h) issues.push({ severity: "error", where, message: "Headline is empty." })
      else if (!/[.?!]["”’)]?$/.test(h)) issues.push({ severity: "error", where, message: `Headline doesn't end with a full stop: "${h}"` })
    })
  }

  // Product names spelled exactly
  for (const f of fields) {
    const text = plain(f.text)
    for (const name of productNames()) {
      for (const m of text.matchAll(looseName(name))) {
        if (m[0] !== name) issues.push({ severity: "error", where: label(f), message: `Write "${name}", not "${m[0]}".` })
      }
    }
    if (/cedcommerce/i.test(text)) issues.push({ severity: "error", where: label(f), message: `Write "UniCon", never "CedCommerce".` })
  }

  // Caption lengths
  for (const c of plan.captions) {
    const limit = CAPTION_LIMITS[c.platform]
    if (limit && c.text.length > limit) {
      issues.push({ severity: "error", where: `${c.platform} caption`, message: `${c.text.length} characters; keep it under ${limit}.` })
    }
  }

  // Numbers, prices and percentages must come from the brief
  const seen = new Set<string>()
  for (const f of fields) {
    for (const n of numbersIn(plain(f.text))) {
      const bare = n.replace(/[$£€,\s]/g, "").toLowerCase()
      const key = `${f.where}|${bare}`
      if (seen.has(key)) continue
      seen.add(key)
      const inBrief = brief.includes(n.toLowerCase()) || brief.replace(/[,\s]/g, "").includes(bare)
      if (!inBrief) issues.push({ severity: "warning", where: label(f), message: `"${n}" isn't in the brief. Check it before posting.` })
    }
  }

  return issues
}

/** Character count shown beside each caption */
export const captionLength = (s: string) => [...s].length
