import { readFileSync } from "fs"
import path from "path"

/**
 * The system prompt for every social Claude call: the static system's own
 * rules files, verbatim (BUILD-SPEC: "use these as the system prompt, not a
 * paraphrase"), after a short note on how the app runs the workflow.
 */
const FILES = [
  "CLAUDE.md",
  "system/look.md",
  "system/brand.md",
  "system/brand-strategy.md",
  "system/products.md",
  "system/photography.md",
  "system/captions.md",
  "system/formats.md",
  "system/do-and-dont.md",
  "TO-CONFIRM.md",
]

const APP_NOTE = `# Running inside the Threecolts content calendar

You're being called by the content calendar app (the Social tab), not in a chat. The app runs the file steps in CLAUDE.md for you: it reads the brief, renders with post.html, packages the zip and handles photos. So:
- Ignore instructions about python scripts, uploading zips, folders and "ask Angela to download". Never ask questions: state assumptions as flags instead.
- Return exactly the JSON the request asks for. Angela reviews everything in the app before anything is used.
- Where TO-CONFIRM.md leaves something open, don't decide it: keep to what the brief says and flag the rest.

The rules files follow, verbatim.`

let cached: string | null = null

export function socialSystemPrompt(): string {
  if (cached) return cached
  const parts = FILES.map(f => `<file path="${f}">\n${readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "social", f), "utf8").trim()}\n</file>`)
  cached = [APP_NOTE, ...parts].join("\n\n")
  return cached
}

export function readSocialFile(rel: string): string {
  return readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "social", rel), "utf8")
}
