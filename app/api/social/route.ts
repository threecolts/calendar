import { createHash } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { readGoogleDoc } from "@/lib/google-doc"
import { generatePlan, planToPostSpec, regenerateOption, type BriefInput, type ModelRun } from "@/lib/social/plan"
import { PLATFORMS, POST_TYPES, type Platform, type PostType, type SocialPlan } from "@/lib/social/plan-schema"
import { runChecks, type CheckIssue } from "@/lib/social/checks"
import { buildZip, captionsMarkdown, creditsMarkdown, type PhotoRecord } from "@/lib/social/package"

export const maxDuration = 120

/**
 * Lab → Social: one calendar entry + its Google Doc → three static post
 * options, captions, renders and a zip (social/BUILD-SPEC.md).
 *
 * GET  ?item=<id>            the entry's social post, with signed image URLs
 * GET  ?item=<id>&zip=1      the zip download
 * POST { action: "plan" | "regenerate" | "photo" | "render" | "captions" | "approve", itemId, … }
 *
 * Everything runs as the signed-in user, so the database rules apply:
 * members read, editors write (scripts/010_social_posts.sql).
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

const BUCKET = "social"
const SIGNED_URL_TTL = 60 * 60
const MAX_BRIEF = 60000

interface SocialPostRow {
  id: string
  content_item_id: string
  status: "draft" | "planned" | "rendered" | "approved" | "error"
  brief_url: string | null
  brief_text: string | null
  brief_hash: string | null
  plan: (SocialPlan & { meta?: { platforms: Platform[]; postType: PostType; cards?: number; extra?: string; briefSource?: "pasted" | "doc" } }) | null
  checks: CheckIssue[]
  photos: Record<string, PhotoRecord>
  renders: { name: string; option: string; format: string; path: string }[]
  approved_option: string | null
  captions: Record<string, string>
  runs: ModelRun[]
  error: string | null
  updated_at: string
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16)
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32)

/** File-name prefix for an entry: "1124-bf-annual-offer" */
function postIdFor(item: { title: string; publish_date: string | null }) {
  const d = item.publish_date ? item.publish_date.slice(5).replace("-", "") : "undated"
  return `${d}-${slug(item.title) || "post"}`
}

async function loadItem(supabase: Supabase, itemId: string) {
  const { data } = await supabase
    .from("content_items")
    .select("id, title, publish_date, channel, format, notes, brief_url, campaign:campaigns(title)")
    .eq("id", itemId)
    .single()
  return data as unknown as {
    id: string; title: string; publish_date: string | null; channel: string; format: string
    notes: string | null; brief_url: string | null; campaign: { title: string } | null
  } | null
}

async function loadRow(supabase: Supabase, itemId: string) {
  const { data } = await supabase.from("social_posts").select("*").eq("content_item_id", itemId).maybeSingle()
  return data as SocialPostRow | null
}

async function saveRow(supabase: Supabase, itemId: string, patch: Partial<SocialPostRow> & Record<string, unknown>) {
  const { data, error } = await supabase
    .from("social_posts")
    .upsert({ content_item_id: itemId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "content_item_id" })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return data as SocialPostRow
}

/** The row as the client sees it: signed URLs for every render and photo */
async function present(supabase: Supabase, row: SocialPostRow | null, stale = false) {
  if (!row) return { post: null }
  const paths = [...row.renders.map(r => r.path), ...Object.values(row.photos).map(p => p.path)]
  const urls: Record<string, string> = {}
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)
    for (const s of data ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl
  }
  return {
    post: {
      ...row,
      stale,
      renders: row.renders.map(r => ({ ...r, url: urls[r.path] ?? null })),
      photos: Object.fromEntries(Object.entries(row.photos).map(([k, p]) => [k, { ...p, url: urls[p.path] ?? null }])),
    },
  }
}

function briefFrom(item: NonNullable<Awaited<ReturnType<typeof loadItem>>>, docText: string, meta: { platforms: Platform[]; postType: PostType; cards?: number; extra?: string }): BriefInput {
  return {
    title: item.title,
    publishDate: item.publish_date,
    channel: item.channel,
    format: item.format,
    campaign: item.campaign?.title ?? null,
    notes: item.notes,
    docText,
    ...meta,
  }
}

async function toDataUrl(supabase: Supabase, path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`Couldn't load photo ${path}: ${error?.message ?? "missing"}`)
  const buf = Buffer.from(await data.arrayBuffer())
  return `data:${data.type || "image/jpeg"};base64,${buf.toString("base64")}`
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const itemId = url.searchParams.get("item")
  if (!itemId) return Response.json({ error: "Missing item" }, { status: 400 })
  const [item, row] = await Promise.all([loadItem(supabase, itemId), loadRow(supabase, itemId)])
  if (!item) return Response.json({ error: "Calendar entry not found" }, { status: 404 })

  if (url.searchParams.get("zip")) {
    if (!row?.plan || !row.renders.length) return Response.json({ error: "Render the post first" }, { status: 400 })
    const postId = postIdFor(item)
    const files = await Promise.all(row.renders.map(async r => {
      const { data } = await supabase.storage.from(BUCKET).download(r.path)
      return { name: `${r.name}.png`, data: new Uint8Array(await data!.arrayBuffer()) }
    }))
    const name = `threecolts-${postId}`
    const zip = buildZip(
      name, postId, files,
      captionsMarkdown(postId, item.title, item.publish_date, row.plan, row.captions, row.approved_option),
      creditsMarkdown(postId, row.photos),
    )
    return new Response(zip, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}.zip"` },
    })
  }

  // Stale: the Doc changed since the plan was written (only checkable when we read it from the link)
  let stale = false
  if (row?.brief_hash && item.brief_url && row.plan?.meta?.briefSource === "doc") {
    const doc = await readGoogleDoc(item.brief_url)
    stale = !!doc.text && hash(doc.text) !== row.brief_hash
  }
  return Response.json(await present(supabase, row, stale))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const itemId = String(body.itemId ?? "")
  const item = itemId ? await loadItem(supabase, itemId) : null
  if (!item) return Response.json({ error: "Calendar entry not found" }, { status: 404 })

  try {
    // ── Read the brief and write the plan ──
    if (body.action === "plan") {
      if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Social posts need Claude: set ANTHROPIC_API_KEY." }, { status: 500 })
      const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter((p: string): p is Platform => (PLATFORMS as readonly string[]).includes(p))
      const postType: PostType = (POST_TYPES as readonly string[]).includes(body.postType) ? body.postType : "single"
      if (!platforms.length && postType !== "story") return Response.json({ error: "Pick at least one platform" }, { status: 400 })
      const cards = Math.min(8, Math.max(3, Number(body.cards) || 5))
      const extra = String(body.extra ?? "").trim().slice(0, 2000) || undefined

      // The brief: text Angela pasted or uploaded (Threecolts Docs can't be shared
      // publicly), else the entry's Doc link if Google lets us read it.
      // Never generate from the title alone (BUILD-SPEC step 1).
      const pasted = String(body.briefText ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_BRIEF)
      let briefText = pasted
      let briefSource: "pasted" | "doc" = "pasted"
      if (!briefText) {
        const doc = item.brief_url ? await readGoogleDoc(item.brief_url) : null
        if (doc?.status !== "read" || !doc.text?.trim()) {
          return Response.json({ error: "Paste the brief's text, or upload the Doc as a .docx (File → Download → Microsoft Word)." }, { status: 400 })
        }
        briefText = doc.text.trim()
        briefSource = "doc"
      }
      if (briefText.length < 40) return Response.json({ error: "The brief is too short to write from. Paste the whole Doc." }, { status: 400 })

      const meta = { platforms, postType, cards: postType === "carousel" ? cards : undefined, extra, briefSource }
      const { plan, issues, runs } = await generatePlan(briefFrom(item, briefText, meta))
      const previous = await loadRow(supabase, itemId)
      const row = await saveRow(supabase, itemId, {
        status: "planned",
        brief_url: item.brief_url,
        brief_text: briefText,
        brief_hash: hash(briefText),
        plan: { ...plan, meta },
        checks: issues,
        photos: {},
        renders: [],
        approved_option: null,
        captions: Object.fromEntries(plan.captions.map(c => [c.platform, c.text])),
        runs: [...(previous?.runs ?? []), ...runs],
        error: null,
        created_by: user.id,
      })
      return Response.json(await present(supabase, row))
    }

    const row = await loadRow(supabase, itemId)
    if (!row?.plan) return Response.json({ error: "Write the plan first" }, { status: 400 })
    const meta = row.plan.meta ?? { platforms: ["Instagram"] as Platform[], postType: "single" as PostType }

    // ── New copy for one option ──
    if (body.action === "regenerate") {
      const option = body.option as "A" | "B" | "C"
      if (!["A", "B", "C"].includes(option)) return Response.json({ error: "Which option?" }, { status: 400 })
      const { plan, issues, runs } = await regenerateOption(briefFrom(item, row.brief_text ?? "", meta), row.plan, option, String(body.note ?? "").slice(0, 1000))
      // That option's photos and renders no longer match its copy
      const photos = Object.fromEntries(Object.entries(row.photos).filter(([k]) => !k.startsWith(`${option}-`)))
      const renders = row.renders.filter(r => r.option !== option)
      const saved = await saveRow(supabase, itemId, {
        plan: { ...plan, meta }, checks: issues, photos, renders,
        approved_option: row.approved_option === option ? null : row.approved_option,
        runs: [...row.runs, ...runs],
        status: renders.length ? "rendered" : "planned",
      })
      return Response.json(await present(supabase, saved))
    }

    // ── A photo was uploaded (by the browser, straight to storage) or its focus moved ──
    if (body.action === "photo") {
      const slot = String(body.slot ?? "")
      if (!/^[ABC]-\d+$/.test(slot)) return Response.json({ error: "Bad photo slot" }, { status: 400 })
      const photos = { ...row.photos }
      if (body.remove) delete photos[slot]
      else {
        const path = String(body.path ?? photos[slot]?.path ?? "")
        if (!path.startsWith(`${row.id}/`)) return Response.json({ error: "Upload the photo first" }, { status: 400 })
        photos[slot] = {
          ...photos[slot],
          path,
          source: "upload",
          ...(body.focus ? { focus: String(body.focus).slice(0, 20) } : {}),
          ...(body.credit ? {
            photographer: body.credit.photographer ?? null,
            unsplash_id: body.credit.unsplash_id ?? null,
            file_name: body.credit.file_name ?? null,
          } : {}),
        }
      }
      return Response.json(await present(supabase, await saveRow(supabase, itemId, { photos })))
    }

    // ── Render one option, or all three ──
    if (body.action === "render") {
      const only = body.option ? String(body.option) : null
      const postId = postIdFor(item)
      const dataUrls: Record<string, string> = {}
      for (const [slot, p] of Object.entries(row.photos)) {
        if (!only || slot.startsWith(`${only}-`)) dataUrls[slot] = await toDataUrl(supabase, p.path)
      }
      const spec = planToPostSpec(postId, row.plan, meta.postType, meta.platforms, slot =>
        dataUrls[slot] ? { url: dataUrls[slot], focus: row.photos[slot]?.focus } : null)
      // Loaded on demand: headless Chromium is only needed here, and a problem
      // starting it shouldn't take down the rest of the tab
      let renderPosts: typeof import("@/lib/social/render").renderPosts
      try { ({ renderPosts } = await import("@/lib/social/render")) }
      catch (e) { throw new Error(`The renderer couldn't load on the server: ${e instanceof Error ? e.message : String(e)}`) }
      const frames = await renderPosts([spec], { only: (_, o) => !only || o.option === only })

      const stamp = Date.now()
      const fresh = await Promise.all(frames.map(async f => {
        const path = `${row.id}/renders/${stamp}/${f.name}.png`
        const { error } = await supabase.storage.from(BUCKET).upload(path, f.png, { contentType: "image/png", upsert: true })
        if (error) throw new Error(`Saving ${f.name}: ${error.message}`)
        return { name: f.name, option: f.option, format: f.format, path }
      }))
      const renders = [...row.renders.filter(r => only && r.option !== only), ...fresh]
        .sort((a, b) => a.name.localeCompare(b.name))
      // Old files for the re-rendered options
      const old = row.renders.filter(r => !only || r.option === only).map(r => r.path)
      if (old.length) await supabase.storage.from(BUCKET).remove(old)
      return Response.json(await present(supabase, await saveRow(supabase, itemId, { renders, status: row.approved_option ? "approved" : "rendered" })))
    }

    // ── Edited captions, and copy edits that need re-checking ──
    if (body.action === "captions") {
      const captions = Object.fromEntries(Object.entries(body.captions ?? {}).filter(([k, v]) => (PLATFORMS as readonly string[]).includes(k) && typeof v === "string").map(([k, v]) => [k, String(v).slice(0, 5000)]))
      const plan = { ...row.plan, captions: row.plan.captions.map(c => ({ ...c, text: captions[c.platform] ?? c.text })) }
      return Response.json(await present(supabase, await saveRow(supabase, itemId, { captions, checks: runChecks(plan, row.brief_text ?? "") })))
    }

    // ── Approve one option (or clear the approval) ──
    if (body.action === "approve") {
      const option = body.option ? String(body.option) : null
      if (option && !row.renders.some(r => r.option === option)) return Response.json({ error: "Render that option first" }, { status: 400 })
      return Response.json(await present(supabase, await saveRow(supabase, itemId, { approved_option: option, status: option ? "approved" : "rendered" })))
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[social]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 })
  }
}

