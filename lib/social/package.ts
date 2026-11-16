import { zipSync, strToU8 } from "fflate"
import { captionLength } from "@/lib/social/checks"
import type { SocialPlan } from "@/lib/social/plan-schema"

/** Port of social/code/package.py for one calendar entry. */

export interface PhotoRecord {
  path: string
  focus?: string
  source: "upload" | "unsplash"
  photographer?: string | null
  photographer_url?: string | null
  unsplash_id?: string | null
  file_name?: string | null
}

/** "jane-doe-AbC123xYz-unsplash.jpg" → { photographer: "Jane Doe", id: "AbC123xYz" } (photo_sheet.py's rule) */
export function parseUnsplashName(fileName: string): { photographer: string; unsplash_id: string } | null {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "")
  const m = stem.match(/^(.+)-([A-Za-z0-9_-]{11})-unsplash$/)
  if (!m) return null
  return { photographer: m[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), unsplash_id: m[2] }
}

export function captionsMarkdown(postId: string, title: string, date: string | null, plan: SocialPlan, captions: Record<string, string>, approved: string | null) {
  const lines = [`# Captions: ${title}`, "", `## ${postId}: ${title}${date ? ` (go-live ${date})` : ""}`, ""]
  if (approved) lines.push(`**Approved option:** ${approved}`, "")
  for (const c of plan.captions) {
    const text = captions[c.platform] ?? c.text
    lines.push(`**${c.platform}** (${captionLength(text)} chars)`, text, "")
  }
  lines.push("**Alt text**")
  for (const o of plan.options) {
    o.slides.forEach((s, i) => lines.push(`- Option ${o.option}${o.slides.length > 1 ? `, card ${i + 1}` : ""}: ${s.alt_text}`))
  }
  lines.push("")
  if (plan.flags.length) {
    lines.push("**Notes for Angela:**")
    for (const f of plan.flags) lines.push(`- ${f.text}: ${f.reason}`)
    lines.push("")
  }
  return lines.join("\n")
}

export function creditsMarkdown(postId: string, photos: Record<string, PhotoRecord>) {
  const lines = ["# Photo credits", "", "Unsplash's licence doesn't require credit, but crediting is good practice when a photographer is clearly identifiable.", ""]
  const slots = Object.keys(photos).sort()
  if (!slots.length) lines.push("- No photos used.")
  for (const slot of slots) {
    const p = photos[slot]
    const [option, card] = slot.split("-")
    const who = p.photographer || (p.source === "upload" ? `uploaded file${p.file_name ? ` ${p.file_name}` : ""} (no Unsplash credit in the file name)` : "unknown")
    const link = p.unsplash_id ? `https://unsplash.com/photos/${p.unsplash_id}` : p.photographer_url ?? ""
    lines.push(`- ${postId} option ${option}${card !== "1" ? `, card ${card}` : ""}: ${who} ${link}`.trimEnd())
  }
  return lines.join("\n") + "\n"
}

export const README = [
  "One folder per post. File names: <post>_<option>_<layout>_<format>.png",
  "Options A, B and C are alternatives: pick one per post.",
  "Carousels: <post>_<option>_carousel_<format>_01of05.png etc. Upload in number order.",
  "Formats: square 1080x1080, portrait 1080x1350 (Instagram and LinkedIn feed),",
  "story 1080x1920 (Stories, text kept inside the safe zone), landscape 1200x628 (X, LinkedIn, Facebook).",
  "Captions for every post and platform are in captions.md.",
  "",
].join("\n")

export function buildZip(name: string, postId: string, files: { name: string; data: Uint8Array }[], captionsMd: string, creditsMd: string) {
  const tree: Record<string, Uint8Array> = {}
  for (const f of files) tree[`${name}/${postId}/${f.name}`] = f.data
  tree[`${name}/captions.md`] = strToU8(captionsMd)
  tree[`${name}/photo-credits.md`] = strToU8(creditsMd)
  tree[`${name}/README.txt`] = strToU8(README)
  // PNGs are already compressed; store them as is
  return zipSync(tree, { level: 0 })
}
