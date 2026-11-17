import { createHash } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { itemChannels } from "@/lib/database.types"
import { readGoogleDoc } from "@/lib/google-doc"
import { formatsFor, generatePlan, planToPostSpec, regenerateOption, type BriefInput, type ModelRun } from "@/lib/social/plan"
import { PLATFORMS, POST_TYPES, type Platform, type PostType, type SocialPlan } from "@/lib/social/plan-schema"
import { runChecks, type CheckIssue } from "@/lib/social/checks"
import { buildZip, captionsMarkdown, creditsMarkdown, type PhotoRecord } from "@/lib/social/package"
import { findPhoto, type PickRound } from "@/lib/social/photos"
import { unsplashKey, UnsplashError } from "@/lib/social/unsplash"

// Planning, photo picking and rendering each take 20–90 s
export const maxDuration = 300

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
  plan: (SocialPlan & {
    meta?: { platforms: Platform[]; postType: PostType; cards?: number; extra?: string; briefSource?: "pasted" | "doc" }
    /** Per photo slot: search terms, Jev scores, shortlist, Claude's pick and reasons */
    photo_log?: Record<string, { rounds: PickRound[]; note: string; error: string | null; at: string }>
  }) | null
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
    // "*" rather than a column list: `channels` (scripts/011) is there only once that migration has run
    .select("*, campaign:campaigns(title)")
    .eq("id", itemId)
    .single()
  return data as unknown as {
    id: string; title: string; publish_date: string | null; channel: string; channels?: string[] | null; format: string
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
  const paths = [...row.renders.map(r => r.path), ...Object.values(row.photos).map(p => p.path).filter((p): p is string => !!p)]
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
      // display: what the app shows (Unsplash thumbnails are hotlinked; uploads get a signed URL)
      photos: Object.fromEntries(Object.entries(row.photos).map(([k, p]) => [k, { ...p, display: p.source === "unsplash" ? p.thumb ?? null : (p.path ? urls[p.path] ?? null : null) }])),
      unsplash: !!unsplashKey(),
    },
  }
}

function briefFrom(item: NonNullable<Awaited<ReturnType<typeof loadItem>>>, docText: string, meta: { platforms: Platform[]; postType: PostType; cards?: number; extra?: string }): BriefInput {
  return {
    title: item.title,
    publishDate: item.publish_date,
    channel: itemChannels(item).join(", "),
    format: item.format,
    campaign: item.campaign?.title ?? null,
    notes: item.notes,
    docText,
    ...meta,
  }
}

async function fetchDataUrl(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't load the Unsplash photo (${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${res.headers.get("content-type") || "image/jpeg"};base64,${buf.toString("base64")}`
}

/** Every slide that needs a photo, with what the picker needs to know */
function photoSlots(plan: SocialPlan) {
  return plan.options.flatMap(o => o.slides.map((slide, i) => ({ slot: `${o.option}-${i + 1}`, slide, layout: slide.layout, strongest: o.strongest })))
    .filter(s => s.layout === "fullbleed" || s.layout === "framed")
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
      else if (body.path) {
        // A manual upload replaces whatever was in the slot
        const path = String(body.path)
        if (!path.startsWith(`${row.id}/`)) return Response.json({ error: "Upload the photo first" }, { status: 400 })
        photos[slot] = {
          path,
          source: "upload",
          ...(body.focus ? { focus: String(body.focus).slice(0, 20) } : {}),
          ...(body.credit ? {
            photographer: body.credit.photographer ?? null,
            unsplash_id: body.credit.unsplash_id ?? null,
            file_name: body.credit.file_name ?? null,
          } : {}),
        }
      } else if (body.focus && photos[slot]) {
        photos[slot] = { ...photos[slot], focus: String(body.focus).slice(0, 20) }
      } else return Response.json({ error: "Nothing to change" }, { status: 400 })
      return Response.json(await present(supabase, await saveRow(supabase, itemId, { photos })))
    }

    // ── Find photos on Unsplash: every empty photo slot, or one slot again ("find another") ──
    if (body.action === "photos") {
      if (!unsplashKey()) return Response.json({ error: "Unsplash isn't connected (UNSPLASH_ACCESS_KEY). Upload photos instead." }, { status: 400 })
      const one = body.slot ? String(body.slot) : null
      const slots = photoSlots(row.plan).filter(s => (one ? s.slot === one : !row.photos[s.slot]))
      if (!slots.length) return Response.json(await present(supabase, row))
      // Fits the set: never reuse a photo already in this post, or one Angela rejected
      const exclude = new Set<string>([
        ...Object.values(row.photos).map(p => p.unsplash_id).filter((x): x is string => !!x),
        ...(Array.isArray(body.exclude) ? body.exclude.map(String) : []),
      ])
      const results = await Promise.all(slots.map(async s => {
        try { return { s, r: await findPhoto(s.slide, s.layout, formatsFor(meta.postType, meta.platforms, s.strongest), new Set(exclude)), error: null } }
        catch (e) { return { s, r: null, error: e instanceof UnsplashError ? e.message : e instanceof Error ? e.message : "Photo search failed" } }
      }))

      // Re-read so a concurrent edit isn't lost, then merge only these slots
      const fresh = (await loadRow(supabase, itemId)) ?? row
      const photos = { ...fresh.photos }
      const log: Record<string, { rounds: PickRound[]; note: string; error: string | null; at: string }> = { ...(fresh.plan?.photo_log ?? {}) }
      const runs = [...fresh.runs]
      const errors: string[] = []
      for (const { s, r, error } of results) {
        log[s.slot] = { rounds: r?.rounds ?? [], note: r?.note ?? "", error, at: new Date().toISOString() }
        if (r) runs.push(...r.runs)
        if (r?.photo) photos[s.slot] = r.photo
        else if (one) delete photos[s.slot]
        if (error) errors.push(error)
      }
      // That option's renders are out of date now
      const changed = new Set(results.filter(x => x.r?.photo).map(x => x.s.slot.split("-")[0]))
      const saved = await saveRow(supabase, itemId, {
        photos,
        plan: { ...fresh.plan!, photo_log: log },
        runs,
        renders: fresh.renders,
        error: errors.length ? [...new Set(errors)].join(" ") : null,
      })
      return Response.json({ ...(await present(supabase, saved)), changed: [...changed] })
    }

    // ── Render one option, or all three ──
    if (body.action === "render") {
      const only = body.option ? String(body.option) : null
      const postId = postIdFor(item)
      const dataUrls: Record<string, string> = {}
      for (const [slot, p] of Object.entries(row.photos)) {
        if (only && !slot.startsWith(`${only}-`)) continue
        dataUrls[slot] = p.source === "unsplash" && p.url ? await fetchDataUrl(p.url) : await toDataUrl(supabase, p.path!)
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

