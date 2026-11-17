/**
 * Requests (scripts/014): the Linear "Marketing Request" Asks for video and
 * design assets, as fields. One definition drives the form, the "needs
 * info" check, the CSV export and Claude's reading of a pasted Ask.
 * Options are copied from the Linear forms (Nov 2026).
 */

export type RequestKind = "video" | "design" | "other"
export const REQUEST_KINDS: { id: RequestKind; label: string }[] = [
  { id: "video", label: "Video asset" },
  { id: "design", label: "Design asset" },
  { id: "other", label: "Other" },
]

export const REQUEST_STAGES = ["New", "Needs info", "In progress", "In review", "Delivered", "On hold"] as const
export type RequestStage = (typeof REQUEST_STAGES)[number]
export const OPEN_STAGES: RequestStage[] = ["New", "Needs info", "In progress", "In review", "On hold"]

export type FieldType = "text" | "longtext" | "select" | "multi" | "suggest"
export interface FieldDef {
  id: string
  label: string
  type: FieldType
  options?: string[]
  hint?: string
  /** Shown as "needs info" when empty */
  required?: boolean
  kinds: RequestKind[]
}

const WHERE_VIDEO = ["Social (including YouTube Shorts)", "YouTube (long-form)", "Email", "Website", "Webinar", "Podcast", "Event or in-person", "Sales or client comms", "Internal", "Other"]
const WHERE_DESIGN = ["Social (including YouTube)", "Blog", "Email", "Website", "Sales or client comms", "Webinar", "Print", "Event or in-person", "Internal", "Other"]

export const REQUEST_FIELDS: FieldDef[] = [
  { id: "video_type", label: "Video type", type: "select", required: true, kinds: ["video"],
    options: ["Launch", "Product explainer", "Tutorial or how-to", "Onboarding or welcome", "User guide", "Screen recording or walkthrough", "Customer story", "Social clip", "Webinar cut", "Other"] },
  { id: "design_type", label: "Design type", type: "suggest", required: true, kinds: ["design"],
    options: ["Static ad", "Social graphic", "Key visual", "Banner", "Thumbnail", "Email graphic", "One-pager", "Slide deck", "Print", "Other"] },
  { id: "description", label: "What they need", type: "longtext", required: true, kinds: ["video", "design", "other"], hint: "A short description is fine" },
  { id: "purpose", label: "What it's for, and what people should do after seeing it", type: "longtext", required: true, kinds: ["video", "design", "other"] },
  { id: "key_messages", label: "Key messages", type: "longtext", required: true, kinds: ["video", "design", "other"], hint: "The 2–3 points it must get across" },
  { id: "sme", label: "Subject matter expert", type: "text", kinds: ["video"], hint: "Who can answer questions about the content (the requester if blank)" },
  { id: "where_used", label: "Where it will be used", type: "multi", required: true, kinds: ["video"], options: WHERE_VIDEO },
  { id: "where_used_design", label: "Where it will be used", type: "multi", required: true, kinds: ["design"], options: WHERE_DESIGN },
  { id: "length", label: "Length", type: "select", required: true, kinds: ["video"], options: ["Under 30s", "30–60s", "1–3 min", "3 min+"] },
  { id: "aspect", label: "Aspect ratio", type: "multi", required: true, kinds: ["video"], options: ["16:9", "9:16", "1:1", "Not sure"] },
  { id: "footage", label: "Footage", type: "select", required: true, kinds: ["video"], options: ["Supplied", "Needs filming", "Product screen recording", "Animation, stock, or AI"] },
  { id: "script", label: "Script", type: "suggest", required: true, kinds: ["video"], options: ["Supplied", "Needs writing", "Not needed"] },
  { id: "voiceover", label: "Voiceover or subtitles", type: "multi", kinds: ["video"], options: ["Voiceover", "Subtitles"] },
  { id: "specs", label: "Specs", type: "text", required: true, kinds: ["design"], hint: "Dimensions, format, quantity, if known" },
  { id: "copy", label: "Copy", type: "suggest", required: true, kinds: ["design"], options: ["Supplied", "Needs writing", "Not needed"] },
  { id: "audience", label: "Audience", type: "multi", required: true, kinds: ["video", "design", "other"], options: ["1P vendors", "3P sellers", "DTC brands", "Partners", "Internal", "Not sure"] },
  { id: "product", label: "Product", type: "multi", required: true, kinds: ["video", "design", "other"], options: ["Margin Pro", "Seller 365", "AI Operator", "UniCon", "Retail 365", "Other", "Company-wide"] },
  { id: "why_date", label: "Why that date", type: "text", kinds: ["video", "design", "other"], hint: "e.g. launch date, event date, prospect meeting" },
  { id: "links", label: "Links", type: "longtext", kinds: ["video", "design", "other"], hint: "Google Slides, Docs, Drive" },
]

export const fieldsFor = (kind: RequestKind) => REQUEST_FIELDS.filter(f => f.kinds.includes(kind))

export type FieldValue = string | string[] | null
export type RequestFields = Record<string, FieldValue>

export interface Request {
  id: string
  team_id: string | null
  kind: RequestKind
  title: string
  status: RequestStage
  requester: string | null
  linear_url: string | null
  assignee_id: string | null
  campaign_id: string | null
  due_date: string | null
  date_fixed: string | null
  deliverable_url: string | null
  fields: RequestFields
  unclear: string[]
  raw_text: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RequestUpdate {
  id: string
  request_id: string
  author_id: string | null
  body: string
  status_from: string | null
  status_to: string | null
  created_at: string
}

const empty = (v: FieldValue | undefined) => v == null || (Array.isArray(v) ? v.length === 0 : !String(v).trim())

/** What's still missing: required fields with no answer, plus the due date */
export function missingInfo(r: Pick<Request, "kind" | "fields" | "due_date" | "date_fixed">): string[] {
  const out = fieldsFor(r.kind).filter(f => f.required && empty(r.fields[f.id])).map(f => f.label)
  if (!r.due_date) out.unshift("Due date")
  else if (!r.date_fixed) out.push("Is the date fixed?")
  return out
}

export const fieldText = (v: FieldValue | undefined) => (Array.isArray(v) ? v.join(", ") : v ?? "")

/** Match a free answer to the closest option ("30-60 seconds" → "30–60s") */
export function normaliseOption(value: string, options: string[]): string {
  const key = (s: string) => s.toLowerCase().replace(/[–—-]/g, "-").replace(/seconds?|secs?/g, "s").replace(/minutes?|mins?/g, "min").replace(/[^a-z0-9:+-]/g, "")
  const k = key(value)
  return options.find(o => key(o) === k)
    ?? options.find(o => key(o).startsWith(k) || k.startsWith(key(o)))
    ?? value
}

export function isOverdue(r: Pick<Request, "due_date" | "status">, today = new Date().toISOString().slice(0, 10)) {
  return !!r.due_date && r.due_date < today && r.status !== "Delivered"
}
