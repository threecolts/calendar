"use client"

import { createClient } from "@/lib/supabase/client"

/** Campaign assets (scripts/013): mood board, videos, design assets, socials */

export type AssetSection = "moodboard" | "video" | "design" | "social"

export const SECTIONS: { id: AssetSection; title: string; blurb: string; accept: string }[] = [
  { id: "moodboard", title: "Mood board", blurb: "The campaign's look and feel. Images, or a Figma, Milanote or Pinterest link.", accept: "image/*,application/pdf" },
  { id: "video", title: "Videos", blurb: "Paste a Google Drive link (best for big files: it plays right here), or a YouTube, Vimeo or Loom link, or upload a short video.", accept: "video/*" },
  { id: "design", title: "Design assets", blurb: "Agreed designs: key visuals, paid ads, statics, banners, thumbnails.", accept: "image/*,video/*,application/pdf" },
  { id: "social", title: "Socials", blurb: "Social posts for this campaign. Posts made in Lab → Social posts appear here on their own.", accept: "image/*,video/*" },
]

export interface CampaignAsset {
  id: string
  campaign_id: string
  section: AssetSection
  kind: "file" | "link"
  title: string | null
  note: string | null
  path: string | null
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  sort_order: number
  created_by: string | null
  created_at: string
  /** Signed URL for files (1 hour) */
  src?: string | null
}

const BUCKET = "campaign-assets"

export class AssetsNotSetUp extends Error {}

export async function listAssets(campaignId: string): Promise<CampaignAsset[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("campaign_assets").select("*").eq("campaign_id", campaignId)
    .order("sort_order").order("created_at", { ascending: false })
  if (error) {
    if (/campaign_assets/.test(error.message) && /(exist|schema cache|not find)/i.test(error.message)) throw new AssetsNotSetUp()
    throw error
  }
  const rows = (data ?? []) as CampaignAsset[]
  const paths = rows.map(r => r.path).filter((p): p is string => !!p)
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
    const map = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))
    for (const r of rows) if (r.path) r.src = map.get(r.path) ?? null
  }
  return rows
}

export async function uploadAsset(campaignId: string, section: AssetSection, file: File, userId: string | null) {
  const supabase = createClient()
  const safe = file.name.replace(/[^\w.\-]+/g, "-").slice(-80)
  const path = `${campaignId}/${section}/${Date.now()}-${safe}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (upErr) {
    if (/exceeded|too large|maximum/i.test(upErr.message)) {
      throw new Error(`${file.name} is too big to upload here. Put it on YouTube (unlisted), Frame.io or Google Drive and add the link instead.`)
    }
    throw new Error(upErr.message)
  }
  const { error } = await supabase.from("campaign_assets").insert({
    campaign_id: campaignId, section, kind: "file", path,
    title: file.name.replace(/\.[^.]+$/, ""), mime_type: file.type || null, size_bytes: file.size, created_by: userId,
  })
  if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error }
}

export async function addLinkAsset(campaignId: string, section: AssetSection, url: string, title: string | null, userId: string | null) {
  const supabase = createClient()
  const clean = url.trim()
  if (!/^https?:\/\//i.test(clean)) throw new Error("Paste a full link, starting with https://")
  const { error } = await supabase.from("campaign_assets").insert({
    campaign_id: campaignId, section, kind: "link", url: clean, title: title?.trim() || null, created_by: userId,
  })
  if (error) throw error
}

export async function updateAsset(id: string, updates: Partial<Pick<CampaignAsset, "title" | "note" | "section" | "sort_order">>) {
  const { error } = await createClient().from("campaign_assets").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteAsset(asset: CampaignAsset) {
  const supabase = createClient()
  const { error } = await supabase.from("campaign_assets").delete().eq("id", asset.id)
  if (error) throw error
  if (asset.path) await supabase.storage.from(BUCKET).remove([asset.path])
}

/** An embeddable player URL for common video and design links, or null */
export function embedUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const host = u.hostname.replace(/^www\./, "")
  if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
  if (host.endsWith("youtube.com")) {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]
    return id ? `https://www.youtube.com/embed/${id}` : null
  }
  if (host === "vimeo.com") { const id = u.pathname.match(/^\/(\d+)/)?.[1]; return id ? `https://player.vimeo.com/video/${id}` : null }
  if (host.endsWith("loom.com")) { const id = u.pathname.match(/\/(?:share|embed)\/([\w-]+)/)?.[1]; return id ? `https://www.loom.com/embed/${id}` : null }
  // Google Drive: a file plays in Drive's own player; a folder shows as a grid.
  // Viewers need access in Drive (e.g. "Anyone at Threecolts with the link").
  if (host === "drive.google.com" || host === "docs.google.com") {
    const folder = u.pathname.match(/\/folders\/([\w-]+)/)?.[1]
    if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder}#grid`
    const id = u.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]+)/)?.[1]
      ?? (/^\/(open|uc)$/.test(u.pathname) ? u.searchParams.get("id") : null)
    return id ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  if (host.endsWith("figma.com")) return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(raw)}`
  return null
}

export const isImage = (a: CampaignAsset) => a.kind === "file" && !!a.mime_type?.startsWith("image/")
export const isVideo = (a: CampaignAsset) => a.kind === "file" && !!a.mime_type?.startsWith("video/")

// ---- Lab → Social posts made for this campaign's items ----

export interface CampaignSocialPost {
  itemId: string
  itemTitle: string
  publishDate: string | null
  status: string
  approved: string | null
  angle: string | null
  /** Approved option's frames, or the first frame of each option */
  frames: { name: string; option: string; format: string; src: string | null }[]
}

export async function listSocialPosts(items: { id: string; title: string; publish_date: string | null }[]): Promise<CampaignSocialPost[]> {
  if (!items.length) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from("social_posts").select("content_item_id, status, approved_option, plan, renders")
    .in("content_item_id", items.map(i => i.id))
  if (error || !data) return []
  type Row = { content_item_id: string; status: string; approved_option: string | null; plan: { angle?: string } | null; renders: { name: string; option: string; format: string; path: string }[] }
  const rows = (data as Row[]).filter(r => r.renders?.length)
  const pick = (r: Row) => r.approved_option
    ? r.renders.filter(f => f.option === r.approved_option)
    : [...new Map(r.renders.map(f => [f.option, f])).values()]
  const paths = rows.flatMap(r => pick(r).map(f => f.path))
  const urls = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("social").createSignedUrls(paths, 60 * 60)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
  }
  return rows.map(r => {
    const item = items.find(i => i.id === r.content_item_id)!
    return {
      itemId: r.content_item_id,
      itemTitle: item.title,
      publishDate: item.publish_date,
      status: r.status,
      approved: r.approved_option,
      angle: r.plan?.angle ?? null,
      frames: pick(r).map(f => ({ name: f.name, option: f.option, format: f.format, src: urls.get(f.path) ?? null })),
    }
  }).sort((a, b) => (a.publishDate ?? "9999").localeCompare(b.publishDate ?? "9999"))
}
