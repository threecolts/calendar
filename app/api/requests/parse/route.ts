import { generateText, Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { writerModel } from "@/lib/ai/models"
import { REQUEST_FIELDS, fieldsFor, normaliseOption, type RequestFields, type RequestKind } from "@/lib/requests"

export const maxDuration = 60

/**
 * Paste a Linear Ask (or any request text) → the request form, filled in.
 * Claude only copies what the text says; anything it can't find stays empty
 * and shows as "needs info", and anything ambiguous goes in `unclear`.
 */

const answer = z.union([z.string(), z.array(z.string())]).nullable()

const schema = z.object({
  kind: z.enum(["video", "design", "other"]).describe("video for a Video Asset ask, design for a Design Asset ask"),
  title: z.string().describe("A short, specific title for the request, e.g. 'Walmart 1P recoveries explainer (Margin Pro)'"),
  requester: z.string().nullable().describe("Who asked, if the text says"),
  linear_url: z.string().nullable().describe("The Linear issue URL, if present"),
  due_date: z.string().nullable().describe("Final due date as YYYY-MM-DD, or null if none is given"),
  date_fixed: z.string().nullable().describe("'Fixed' or 'Flexible' if the text says whether the date is fixed, else null"),
  answers: z.array(z.object({
    field: z.enum(REQUEST_FIELDS.map(f => f.id) as [string, ...string[]]),
    value: answer.describe("The answer as written; a list for multi-choice fields"),
  })).describe("One entry per form field the text answers. Leave out fields it doesn't answer"),
  unclear: z.array(z.string()).describe("Questions to ask the requester: anything ambiguous or contradictory. Not a list of empty fields"),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Reading requests needs Claude: set ANTHROPIC_API_KEY." }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const text = String(body.text ?? "").trim().slice(0, 20000)
  if (text.length < 20) return Response.json({ error: "Paste the whole request first." }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const form = REQUEST_FIELDS.map(f =>
    `- ${f.id} (${f.kinds.join("/")}): ${f.label}${f.options ? `. Options: ${f.options.join(" | ")}${f.type === "multi" ? " (pick any)" : ""}` : ""}${f.hint ? ` (${f.hint})` : ""}`).join("\n")

  try {
    const { output } = await generateText({
      model: writerModel,
      output: Output.object({ schema }),
      providerOptions: { anthropic: { effort: "low" } },
      prompt: [
        `Today is ${today}. Below is a marketing request, usually copied from a Linear "Marketing Request: Video Asset" or "Design Asset" Ask. Fill in the request form from it.`,
        "Rules:",
        "- Copy what the text says. Never invent answers, dates, specs or names. If a field isn't answered, leave it out.",
        "- For choice fields use the option names exactly as listed; keep the requester's wording for free-text fields.",
        "- Relative dates ('next Friday', 'end of month') become YYYY-MM-DD from today's date; say so in unclear if it's a guess.",
        "",
        "The form fields (id (applies to): label. Options):",
        form,
        "",
        "<request>",
        text,
        "</request>",
      ].join("\n"),
    })

    const kind = output.kind as RequestKind
    const allowed = new Set(fieldsFor(kind).map(f => f.id))
    const fields: RequestFields = {}
    for (const a of output.answers) {
      // The design form's "where used" has its own list
      const id = kind === "design" && a.field === "where_used" ? "where_used_design" : kind === "video" && a.field === "where_used_design" ? "where_used" : a.field
      const def = REQUEST_FIELDS.find(f => f.id === id)
      if (!def || !allowed.has(id) || a.value == null) continue
      if (def.type === "multi") {
        const list = (Array.isArray(a.value) ? a.value : String(a.value).split(/,|;|\n/)).map(v => v.trim()).filter(Boolean)
        fields[id] = [...new Set(list.map(v => normaliseOption(v, def.options ?? [])))]
      } else {
        const v = Array.isArray(a.value) ? a.value.join(", ") : String(a.value).trim()
        if (v) fields[id] = def.type === "select" || def.type === "suggest" ? normaliseOption(v, def.options ?? []) : v
      }
    }
    const due = output.due_date && /^\d{4}-\d{2}-\d{2}$/.test(output.due_date) ? output.due_date : null
    const linear = output.linear_url ?? text.match(/https:\/\/linear\.app\/\S+/)?.[0] ?? null

    return Response.json({
      kind,
      title: output.title.trim().slice(0, 200) || "New request",
      requester: output.requester?.trim() || null,
      linear_url: linear,
      due_date: due,
      date_fixed: output.date_fixed?.trim() || null,
      fields,
      unclear: output.unclear.slice(0, 10),
    })
  } catch (e) {
    console.error("[requests/parse]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read that request" }, { status: 500 })
  }
}
