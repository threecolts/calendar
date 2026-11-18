"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle, Check, Download, ExternalLink, ImagePlus, Loader2, RefreshCw, FileUp, Search, Sparkles, Trash2, X,
} from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { NO_CAMPAIGN_ID, parseDateString, itemChannels, type CampaignWithItems, type ContentItem } from "@/lib/database.types"
import { ChannelIcon } from "@/components/channel-icon"
import { briefFileToText } from "@/lib/social/docx"
import { Button, ErrorText, Field, Pill, SegmentedControl, cx, fieldCls, linkCls, textareaCls } from "@/components/kit"

// ---- Types mirrored from /api/social ----
type Platform = "Instagram" | "LinkedIn" | "X" | "Facebook"
type PostType = "single" | "carousel" | "story"
interface PlanSlide {
  layout: "fullbleed" | "framed" | "type" | "close"
  headline: string; sub: string | null; eyebrow: string | null; prompt: string | null
  photo: { moment: string; search_terms: { term: string }[]; look_for: string; skip: string } | null
  /** One of the campaign's own visuals placed in this card */
  campaign_asset?: string | null
  alt_text: string
}
interface PlanOption { option: "A" | "B" | "C"; why: string; strongest: boolean; slides: PlanSlide[] }
interface Plan {
  source: string; angle: string; product: string
  options: PlanOption[]
  captions: { platform: Platform; text: string }[]
  flags: { text: string; reason: string }[]
  meta?: { platforms: Platform[]; postType: PostType; cards?: number; extra?: string; briefSource?: string; context?: { brief: boolean; nearby: number; visuals: number } }
  photo_log?: Record<string, { rounds: PickRound[]; note: string; error: string | null }>
}
interface Photo {
  source: "upload" | "unsplash"
  display: string | null
  focus?: string
  photographer?: string | null
  photographer_url?: string | null
  unsplash_id?: string | null
  file_name?: string | null
  page?: string
  reason?: string
  /** Other passing photos (a closer one when the pick is wide) */
  alternates?: { thumb: string; photographer: string; reason: string; unsplash_id: string }[]
}
interface PickRound { terms: string[]; found: number; shortlist: unknown[]; pick: string | null; reason: string; engine: string }
interface Render { name: string; option: string; format: string; path: string; url: string | null }
interface SocialPost {
  id: string
  status: "draft" | "planned" | "rendered" | "approved" | "error"
  stale: boolean
  unsplash: boolean
  error: string | null
  brief_text: string | null
  plan: Plan | null
  checks: { severity: "error" | "warning"; where: string; message: string }[]
  photos: Record<string, Photo>
  renders: Render[]
  approved_option: string | null
  captions: Record<string, string>
  runs: { step: string; inputTokens: number; outputTokens: number }[]
  updated_at: string
}

const PLATFORMS: Platform[] = ["Instagram", "LinkedIn", "X", "Facebook"]
const CAPTION_LIMITS: Record<Platform, number> = { Instagram: 2200, LinkedIn: 1000, X: 280, Facebook: 600 }
const SOCIAL_CHANNELS = new Set(["Instagram", "LinkedIn", "Twitter/X", "TikTok", "Other"])
const isSocial = (i: ContentItem) => itemChannels(i).some(c => SOCIAL_CHANNELS.has(c))
const FOCUS_PRESETS = [
  { label: "Top", value: "50% 20%" }, { label: "Upper", value: "50% 35%" }, { label: "Centre", value: "50% 50%" },
  { label: "Lower", value: "50% 70%" }, { label: "Left", value: "25% 45%" }, { label: "Right", value: "75% 45%" },
]

async function social<T = { post: SocialPost | null }>(body: unknown): Promise<T> {
  const res = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Something went wrong")
  return data as T
}

const niceDate = (d: string | null) => {
  if (!d) return "No date"
  try { return parseDateString(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) } catch { return d }
}

/** Every social account the calendar item is planned for; Instagram + LinkedIn when it names none */
function defaultPlatforms(channels: readonly string[]): Platform[] {
  const map: Record<string, Platform> = { Instagram: "Instagram", LinkedIn: "LinkedIn", "Twitter/X": "X" }
  const picked = PLATFORMS.filter(p => channels.some(c => map[c] === p))
  return picked.length ? picked : ["Instagram", "LinkedIn"]
}

/** Shrink a photo to 2400 px on the long side (JPEG) before upload, so renders stay fast */
async function prepareImage(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(img.width, img.height))
  if (scale === 1 && file.type === "image/jpeg") return file
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), "image/jpeg", 0.86))
}

/** "jane-doe-AbC123xYz-unsplash.jpg" → credit (same rule as social/code/photo_sheet.py) */
function unsplashCredit(fileName: string) {
  const m = fileName.replace(/\.[a-z0-9]+$/i, "").match(/^(.+)-([A-Za-z0-9_-]{11})-unsplash$/)
  if (!m) return { photographer: null, unsplash_id: null, file_name: fileName }
  return { photographer: m[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), unsplash_id: m[2], file_name: fileName }
}

const savedAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

// ---- Entry picker ----

function EntryPicker({ items, value, onChange }: { items: (ContentItem & { campaignTitle: string | null })[]; value: string | null; onChange: (id: string) => void }) {
  const [q, setQ] = useState("")
  const today = new Date().toISOString().slice(0, 10)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items
      .filter(i => !s || i.title.toLowerCase().includes(s) || (i.campaignTitle ?? "").toLowerCase().includes(s))
      .sort((a, b) => {
        // Upcoming first (soonest first), then past (most recent first), then undated
        const da = a.publish_date ?? "9999", db = b.publish_date ?? "9999"
        const fa = da >= today, fb = db >= today
        if (fa !== fb) return fa ? -1 : 1
        return fa ? da.localeCompare(db) : db.localeCompare(da)
      })
      .slice(0, 40)
  }, [items, q, today])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-3 text-on-surface-variant" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search calendar entries" className={cx(fieldCls, "pl-9 w-full")} />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {shown.length === 0 && <p className="p-4 text-sm text-on-surface-variant">No calendar entries match.</p>}
        {shown.map(i => (
          <button
            key={i.id}
            type="button"
            onClick={() => onChange(i.id)}
            className={cx("w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors", value === i.id ? "bg-surface-container-low" : "hover:bg-surface-container-low/60")}
          >
            <ChannelIcon channel={i.channel} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-on-surface truncate">{i.title}</span>
              <span className="block text-xs text-on-surface-variant truncate">{niceDate(i.publish_date)} · {itemChannels(i).join(", ")} · {i.campaignTitle ?? "No campaign"}</span>
            </span>
            {value === i.id && <Check className="h-4 w-4 text-on-surface" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- One option: copy, photo slots, renders, actions ----

function PhotoSlot({ post, slot, slide, itemId, editable, onPost, onChanged }: {
  post: SocialPost; slot: string; slide: PlanSlide; itemId: string; editable: boolean
  onPost: (p: SocialPost) => void
  /** The photo changed: re-render this option */
  onChanged: (option: string) => void
}) {
  const photo = post.photos[slot]
  const log = post.plan?.photo_log?.[slot]
  const [busy, setBusy] = useState<"" | "upload" | "find" | "save">("")
  const [error, setError] = useState("")
  const option = slot.split("-")[0]

  async function call(kind: "upload" | "find" | "save", body: Record<string, unknown>, rerender: boolean) {
    setBusy(kind); setError("")
    try {
      const { post: next } = await social({ itemId, slot, ...body })
      if (next) { onPost(next); if (rerender && next.photos[slot]) onChanged(option) }
      const err = (next as SocialPost & { error?: string | null } | null)?.error
      if (kind === "find" && err) setError(err)
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong") }
    finally { setBusy("") }
  }

  async function upload(file: File) {
    setBusy("upload"); setError("")
    const path = `${post.id}/photos/${slot}-${Date.now()}.jpg`
    try {
      const blob = await prepareImage(file)
      const { error: upErr } = await createClient().storage.from("social").upload(path, blob, { contentType: "image/jpeg", upsert: true })
      if (upErr) throw new Error(upErr.message)
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); setBusy(""); return }
    await call("upload", { action: "photo", path, credit: unsplashCredit(file.name) }, true)
  }

  return (
    <div className="rounded-xl bg-surface-container-low p-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {photo?.page
          ? <a href={photo.page} target="_blank" rel="noopener noreferrer" className="h-24 w-[4.5rem] rounded-lg bg-surface-container-high flex-shrink-0 bg-cover" style={photo.display ? { backgroundImage: `url("${photo.display}")`, backgroundPosition: photo.focus ?? "50% 40%" } : undefined} aria-label="Open on Unsplash" />
          : <div className="h-24 w-[4.5rem] rounded-lg bg-surface-container-high flex-shrink-0 bg-cover" style={photo?.display ? { backgroundImage: `url("${photo.display}")`, backgroundPosition: photo.focus ?? "50% 40%" } : undefined} />}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-xs text-on-surface"><span className="font-medium">Photo:</span> {slide.photo?.moment ?? "A photo for this frame."}</p>
          {photo?.source === "unsplash" && (
            <p className="text-xs text-on-surface-variant">
              Photo by{" "}
              <a href={photo.photographer_url ?? "#"} target="_blank" rel="noopener noreferrer" className={linkCls}>{photo.photographer}</a>
              {" "}on{" "}
              <a href="https://unsplash.com/?utm_source=threecolts_content_calendar&utm_medium=referral" target="_blank" rel="noopener noreferrer" className={linkCls}>Unsplash</a>
            </p>
          )}
          {photo?.source === "unsplash" && photo.reason && <p className="text-xs text-on-surface-variant">Why: {photo.reason}</p>}
          {photo?.alternates && photo.alternates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-xs text-on-surface-variant">Other options:</span>
              {photo.alternates.map((a, i) => (
                <button key={a.unsplash_id} type="button" disabled={!editable || !!busy} title={`${a.reason} (photo by ${a.photographer})`}
                  onClick={() => call("save", { action: "swap", index: i }, true)}
                  className="h-12 w-10 rounded-md bg-cover bg-center border border-outline-variant hover:ring-2 hover:ring-on-surface/30 disabled:opacity-60"
                  style={{ backgroundImage: `url("${a.thumb}")` }} aria-label={`Use the photo by ${a.photographer} instead`} />
              ))}
            </div>
          )}
          {photo?.source === "upload" && (photo.photographer
            ? <p className="text-xs text-on-surface-variant">Uploaded · by {photo.photographer}</p>
            : <p className="text-xs text-on-surface-variant">Uploaded · no credit in the file name</p>)}
          {!photo && log && (log.error || log.note) && <p className="text-xs text-on-surface-variant">{log.error || log.note}</p>}
          {!photo && busy !== "find" && !log && post.unsplash && <p className="text-xs text-on-surface-variant">Not picked yet.</p>}
          {!photo && !post.unsplash && <p className="text-xs text-on-surface-variant">Unsplash isn't connected yet, so photos aren't picked for you. Upload one for now: search Unsplash with the terms below and don't rename the file.</p>}
          {editable && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {post.unsplash && (
                <button type="button" disabled={!!busy} onClick={() => call("find", { action: "photos", exclude: photo?.unsplash_id ? [photo.unsplash_id] : [] }, true)}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-outline-variant text-xs font-medium hover:border-on-surface/30 disabled:opacity-60">
                  {busy === "find" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {busy === "find" ? "Searching Unsplash…" : photo ? "Find another" : "Find a photo"}
                </button>
              )}
              <label className={cx("inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-outline-variant text-xs font-medium cursor-pointer hover:border-on-surface/30", busy && "opacity-60 pointer-events-none")}>
                {busy === "upload" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                Upload my own
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
              </label>
              {photo && (
                <>
                  <select
                    aria-label="Focus"
                    disabled={!!busy}
                    value={FOCUS_PRESETS.find(f => f.value === photo.focus)?.value ?? ""}
                    onChange={e => call("save", { action: "photo", focus: e.target.value }, true)}
                    className="h-7 rounded-full border border-outline-variant bg-transparent px-2 text-xs text-on-surface"
                  >
                    <option value="" disabled>Focus</option>
                    {FOCUS_PRESETS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <button type="button" disabled={!!busy} onClick={() => call("save", { action: "photo", remove: true }, false)} className="h-7 w-7 inline-grid place-items-center rounded-full text-on-surface-variant hover:text-on-surface" aria-label="Remove photo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {slide.photo && (
        <details className="text-xs text-on-surface-variant">
          <summary className="cursor-pointer select-none">Search terms{log?.rounds.length ? " and how it was picked" : ""}</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              {slide.photo.search_terms.map(t => (
                <a key={t.term} href={`https://unsplash.com/s/photos/${encodeURIComponent(t.term.replace(/\s+/g, "-"))}?orientation=portrait`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2 py-0.5 hover:text-on-surface">
                  {t.term} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
            <p><span className="font-medium text-on-surface">Look for:</span> {slide.photo.look_for}</p>
            <p><span className="font-medium text-on-surface">Skip:</span> {slide.photo.skip}</p>
            {log?.rounds.map((r, i) => (
              <p key={i}>
                <span className="font-medium text-on-surface">Round {i + 1}:</span> searched {r.terms.map(t => `“${t}”`).join(", ")}; {r.found} usable results, {r.shortlist.length} shortlisted by {r.engine || "Jev"}. {r.pick ? "Claude picked one." : "Nothing passed."} {r.reason}
              </p>
            ))}
          </div>
        </details>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

function OptionCard({ post, option, itemId, editable, busy, error, onAction, onPost, onZoom, campaign }: {
  post: SocialPost; option: PlanOption; itemId: string; editable: boolean; busy: string | null; error: string
  /** The entry's campaign: approving saves the option to its Assets → Socials */
  campaign: { id: string; title: string } | null
  onAction: (action: string, extra?: Record<string, unknown>) => void
  onPost: (p: SocialPost) => void
  onZoom: (r: Render) => void
}) {
  const renders = post.renders.filter(r => r.option === option.option)
  const approved = post.approved_option === option.option
  const issues = post.checks.filter(c => c.where.startsWith(`Option ${option.option}`))
  const [note, setNote] = useState("")
  const [showRegen, setShowRegen] = useState(false)
  // Per-card votes for "More like these" (carousels): card index → 1 like, -1 dislike
  const [votes, setVotes] = useState<Record<number, 1 | -1>>({})
  const vote = (i: number, v: 1 | -1) => setVotes(prev => { const n = { ...prev }; if (n[i] === v) delete n[i]; else n[i] = v; return n })
  const voted = Object.keys(votes).length > 0
  const flippable = option.slides.filter(sl => sl.layout !== "fullbleed")
  const mostlyDark = flippable.length > 0 && flippable.filter(sl => (sl as PlanSlide & { dark?: boolean }).dark).length >= flippable.length / 2
  const tweak = (kind: string, extra: Record<string, unknown> = {}) => { onAction("tweak", { option: option.option, kind, ...extra }); if (kind === "feedback") setVotes({}) }
  const isCarousel = option.slides.length > 1
  const photoSlides = option.slides.map((s, i) => ({ s, slot: `${option.option}-${i + 1}` })).filter(({ s }) => (s.layout === "fullbleed" || s.layout === "framed") && !s.campaign_asset)
  const missing = photoSlides.filter(({ slot }) => !post.photos[slot]).length

  return (
    <div className={cx("rounded-2xl border bg-card p-5 flex flex-col gap-4", approved ? "border-primary" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-semibold text-on-surface">Option {option.option}</span>
            {option.strongest && <Pill>Strongest: gets a story</Pill>}
            {approved && <Pill active><Check className="h-3 w-3 mr-1" />Approved</Pill>}
          </div>
          <p className="text-sm text-on-surface-variant">{option.why}</p>
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        {option.slides.map((s, i) => (
          <li key={i} className="text-sm text-on-surface flex gap-2">
            {option.slides.length > 1 && <span className="text-on-surface-variant tabular-nums w-5">{i + 1}.</span>}
            <span className="flex-1">
              <span className="text-xs uppercase tracking-wide text-on-surface-variant mr-1.5">{s.layout}{s.campaign_asset ? " · campaign visual" : ""}</span>
              {s.eyebrow && <span className="text-xs text-on-surface-variant mr-1.5">[{s.eyebrow}]</span>}
              <span dangerouslySetInnerHTML={{ __html: s.headline.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
              {s.sub && <span className="block text-on-surface-variant">{s.sub}</span>}
              {s.prompt && <span className="block text-on-surface-variant">Prompt: “{s.prompt}”</span>}
            </span>
          </li>
        ))}
      </ol>

      {issues.length > 0 && (
        <ul className="flex flex-col gap-1">
          {issues.map((c, i) => (
            <li key={i} className={cx("text-xs flex gap-1.5", c.severity === "error" ? "text-error" : "text-on-surface-variant")}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" /> {c.where.replace(`Option ${option.option}`, "").replace(/^, /, "")} {c.message}
            </li>
          ))}
        </ul>
      )}

      {photoSlides.length > 0 && (
        <div className="flex flex-col gap-2">
          {photoSlides.map(({ s, slot }) => (
            <PhotoSlot key={slot} post={post} slot={slot} slide={s} itemId={itemId} editable={editable} onPost={onPost} onChanged={opt => onAction("render", { option: opt })} />
          ))}
        </div>
      )}

      {renders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {renders.map(r => {
            const n = r.name.match(/_(\d+)of\d+$/)?.[1]
            const card = n ? Number(n) - 1 : null
            // Votes on the first format only (one set of cards)
            const votable = editable && isCarousel && card !== null && r.format === renders[0].format
            return (
              <div key={r.path} className="flex-shrink-0 flex flex-col gap-1 items-start">
                <button type="button" onClick={() => onZoom(r)}>
                  {r.url
                    ? <img src={r.url} alt={r.name} className={cx("h-40 w-auto rounded-lg border bg-surface-container-low", card !== null && votes[card] === 1 ? "border-primary ring-2 ring-primary/40" : card !== null && votes[card] === -1 ? "border-border opacity-50" : "border-border")} />
                    : <span className="h-40 w-32 rounded-lg bg-surface-container-high" />}
                </button>
                <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                  {r.format}{n ? ` ${n}` : ""}
                  {votable && (
                    <>
                      <button type="button" aria-label={`Keep card ${n}`} aria-pressed={votes[card!] === 1} onClick={() => vote(card!, 1)} className={cx("px-1 rounded", votes[card!] === 1 && "bg-primary text-primary-foreground")}>👍</button>
                      <button type="button" aria-label={`Change card ${n}`} aria-pressed={votes[card!] === -1} onClick={() => vote(card!, -1)} className={cx("px-1 rounded", votes[card!] === -1 && "bg-primary text-primary-foreground")}>👎</button>
                    </>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={renders.length ? "secondary" : "primary"} disabled={!!busy} onClick={() => onAction("render", { option: option.option })}>
            {busy === `render-${option.option}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {renders.length ? "Render again" : missing ? `Render (${missing} photo${missing > 1 ? "s" : ""} missing)` : "Render"}
          </Button>
          {renders.length > 0 && (
            <Button size="sm" variant={approved ? "secondary" : "primary"} disabled={!!busy} onClick={() => onAction("approve", { option: approved ? null : option.option })}>
              <Check className="h-3.5 w-3.5" /> {approved ? "Unapprove" : campaign ? "Approve & save to campaign" : "Approve this option"}
            </Button>
          )}
          {approved && campaign && (
            <a href={`/campaigns/${campaign.id}#social`} className={cx("text-xs inline-flex items-center gap-1", linkCls)}>
              Saved in {campaign.title} → Assets → Socials <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setShowRegen(v => !v)}>
            <RefreshCw className="h-3.5 w-3.5" /> New copy
          </Button>
        </div>
      )}
      {editable && renders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-on-surface-variant mr-1">Try:</span>
          {flippable.length > 0 && <Pill onClick={busy ? undefined : () => tweak("dark")}>{mostlyDark ? "Light mode" : "Dark mode"}</Pill>}
          <Pill onClick={busy ? undefined : () => tweak("more-photos")}>More photos</Pill>
          <Pill onClick={busy ? undefined : () => tweak("shorter")}>Shorter copy</Pill>
          <Pill onClick={busy ? undefined : () => tweak("use-visual")}>Use campaign visual</Pill>
          {voted && (
            <Button size="sm" disabled={!!busy} onClick={() => tweak("feedback", {
              liked: Object.entries(votes).filter(([, v]) => v === 1).map(([k]) => Number(k)),
              disliked: Object.entries(votes).filter(([, v]) => v === -1).map(([k]) => Number(k)),
            })}>
              {busy === `tweak-${option.option}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} More like these
            </Button>
          )}
          {busy === `tweak-${option.option}` && <span className="text-xs text-on-surface-variant">Rewriting, then finding photos and rendering…</span>}
          {isCarousel && !voted && <span className="text-xs text-on-surface-variant">Or 👍 the cards to keep and 👎 the ones to change.</span>}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {showRegen && editable && (
        <div className="flex flex-col gap-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What should change? (optional)" className={textareaCls} />
          <div className="flex gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => { onAction("regenerate", { option: option.option, note }); setShowRegen(false); setNote("") }}>
              {busy === `regenerate-${option.option}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Rewrite option {option.option}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRegen(false)}>Cancel</Button>
          </div>
          <p className="text-xs text-on-surface-variant">Rewriting clears this option's photos and renders.</p>
        </div>
      )}
    </div>
  )
}

// ---- Captions ----

function Captions({ post, itemId, editable, onPost }: { post: SocialPost; itemId: string; editable: boolean; onPost: (p: SocialPost) => void }) {
  const platforms = post.plan?.captions.map(c => c.platform) ?? []
  const [draft, setDraft] = useState<Record<string, string>>(post.captions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => setDraft(post.captions), [post.captions])
  const dirty = platforms.some(p => (draft[p] ?? "") !== (post.captions[p] ?? ""))

  if (!platforms.length) return <p className="text-sm text-on-surface-variant">Stories don't get captions.</p>
  return (
    <div className="flex flex-col gap-4">
      {platforms.map(p => {
        const text = draft[p] ?? ""
        const n = [...text].length
        const over = n > CAPTION_LIMITS[p]
        return (
          <Field key={p} label={<span className="flex items-center gap-2"><ChannelIcon channel={p === "X" ? "Twitter/X" : p} />{p}</span>}
            hint={<span className={cx(over && "text-error")}>{n} / {CAPTION_LIMITS[p]} characters{p === "Instagram" ? " · the first 125 show before “more”" : p === "LinkedIn" ? " · the first ~200 show before “see more”" : ""}</span>}>
            <textarea value={text} readOnly={!editable} onChange={e => setDraft(d => ({ ...d, [p]: e.target.value }))} rows={p === "X" ? 3 : 6} className={textareaCls} />
          </Field>
        )
      })}
      {editable && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || saving} onClick={async () => {
            setSaving(true); setError("")
            try { const { post: next } = await social({ action: "captions", itemId, captions: draft }); if (next) onPost(next) }
            catch (e) { setError(e instanceof Error ? e.message : "Couldn't save") }
            finally { setSaving(false) }
          }}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save captions
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  )
}

// ---- The tab ----

export function SocialStudio() {
  const { campaigns, allCampaigns } = useStore() as { campaigns: CampaignWithItems[]; allCampaigns: CampaignWithItems[] }
  const isEditor = useIsEditor()
  const params = useSearchParams()
  const router = useRouter()

  type Entry = ContentItem & { campaignTitle: string | null }
  const items = useMemo<Entry[]>(() => campaigns.flatMap(c => c.items.map((i): Entry => ({ ...i, campaignTitle: c.id === NO_CAMPAIGN_ID ? null : c.title })))
    .filter(i => i.status !== "Idea")
    .sort((a, b) => Number(isSocial(b)) - Number(isSocial(a))), [campaigns])

  const [itemId, setItemId] = useState<string | null>(params.get("item"))
  const item = items.find(i => i.id === itemId) ?? null
  // The entry's campaign, and whether it has a brief Claude can use (scripts/015)
  const itemCampaign = item?.campaign_id ? allCampaigns.find(c => c.id === item.campaign_id) ?? null : null
  const campaignBrief = !!itemCampaign?.brief?.trim()
  const [post, setPost] = useState<SocialPost | null>(null)
  // Posts already started, newest first, in this team view
  const [recentRows, setRecentRows] = useState<{ content_item_id: string; status: string; updated_at: string }[]>([])
  useEffect(() => {
    createClient().from("social_posts").select("content_item_id, status, updated_at").order("updated_at", { ascending: false }).limit(30)
      .then(({ data }) => setRecentRows(data ?? []))
  }, [post?.updated_at])
  const recent = recentRows
    .map(r => { const it = items.find(i => i.id === r.content_item_id); return it ? { id: it.id, title: it.title, status: r.status } : null })
    .filter((r): r is { id: string; title: string; status: string } => !!r)
    .slice(0, 8)

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [zoom, setZoom] = useState<Render | null>(null)
  /** Which action failed ("render-A", "render", "plan" …), so its error shows next to its button */
  const [errorAt, setErrorAt] = useState<string | null>(null)
  const optionError = (o: string) => (errorAt === `render-${o}` || errorAt === `regenerate-${o}` || errorAt === `tweak-${o}` ? error : "")

  const [platforms, setPlatforms] = useState<Platform[]>(["Instagram"])
  const [postType, setPostType] = useState<PostType>("single")
  const [cards, setCards] = useState(5)
  const [extra, setExtra] = useState("")
  const [brief, setBrief] = useState("")
  const [briefNote, setBriefNote] = useState("")

  function pick(id: string) {
    setItemId(id)
    router.replace(`/social?item=${encodeURIComponent(id)}`, { scroll: false })
  }

  useEffect(() => {
    if (!itemId) { setPost(null); return }
    let cancelled = false
    setLoading(true); setError(""); setPost(null)
    fetch(`/api/social?item=${encodeURIComponent(itemId)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Couldn't load"); return d })
      .then(d => {
        if (cancelled) return
        setPost(d.post)
        const meta = d.post?.plan?.meta
        const it = items.find(i => i.id === itemId)
        setPlatforms(meta?.platforms ?? defaultPlatforms(it ? itemChannels(it) : []))
        setPostType(meta?.postType ?? "single")
        setCards(meta?.cards ?? 5)
        setExtra(meta?.extra ?? "")
        setBrief(d.post?.brief_text ?? "")
        setBriefNote("")
      })
      .catch(e => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
    // items only seeds defaults; don't refetch when the store refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])

  async function run(action: string, extraBody: Record<string, unknown> = {}) {
    if (!itemId) return null
    const key = extraBody.option ? `${action}-${extraBody.option}` : action
    setBusy(key); setError(""); setErrorAt(null)
    try {
      const { post: next } = await social({ action, itemId, ...extraBody })
      setPost(next)
      return next
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); setErrorAt(key); return null }
    finally { setBusy(null) }
  }

  /** Option actions; a rewrite (new copy or a tweak) goes straight on to photos and a render */
  async function act(action: string, extra: Record<string, unknown> = {}) {
    const next = await run(action, extra)
    if (!next || !(action === "regenerate" || action === "tweak")) return
    if (extra.kind !== "dark" && next.unsplash) await run("photos")
    await run("render", { option: extra.option })
  }

  /**
   * Opening a post that isn't finished finishes it: any photo slot that was never
   * searched gets Unsplash photos, then anything unrendered renders. Once per post per visit.
   */
  const autoBuilt = useRef(new Set<string>())
  useEffect(() => {
    if (!post?.plan || !isEditor || busy || !itemId || autoBuilt.current.has(itemId)) return
    autoBuilt.current.add(itemId)
    const slots = post.plan.options.flatMap(o => o.slides.map((sl, i) => ({ slot: `${o.option}-${i + 1}`, sl })))
      .filter(x => (x.sl.layout === "fullbleed" || x.sl.layout === "framed") && !x.sl.campaign_asset)
    const unsearched = slots.some(x => !post.photos[x.slot] && !post.plan?.photo_log?.[x.slot])
    const unrendered = post.renders.length === 0
    if (!(unsearched && post.unsplash) && !unrendered) return
    ;(async () => {
      if (unsearched && post.unsplash) await run("photos")
      await run("render")
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, itemId])

  /** The whole thing, no manual steps: plan → photos from Unsplash → render every option */
  async function generate() {
    if (itemId) autoBuilt.current.add(itemId)
    const planned = await run("plan", { platforms, postType, cards, extra, briefText: brief })
    if (!planned?.plan) return
    const needsPhotos = planned.plan.options.some(o => o.slides.some(s => (s.layout === "fullbleed" || s.layout === "framed") && !s.campaign_asset))
    let current = planned
    if (needsPhotos && planned.unsplash) {
      const withPhotos = await run("photos")
      if (withPhotos) current = withPhotos
    }
    await run("render")
    if (current.error) setError(current.error)
  }

  const plan = post?.plan ?? null
  const generalChecks = post?.checks.filter(c => !c.where.startsWith("Option ")) ?? []
  const tokens = post?.runs.reduce((s, r) => ({ i: s.i + r.inputTokens, o: s.o + r.outputTokens }), { i: 0, o: 0 })

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-5">
        {recent.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-on-surface-variant">Pick up where you left off</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map(r => (
                <button key={r.id} type="button" onClick={() => pick(r.id)}
                  className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors max-w-full",
                    itemId === r.id ? "bg-primary border-primary text-primary-foreground" : "border-outline-variant text-on-surface hover:border-on-surface/30")}>
                  <span className="truncate max-w-[16rem]">{r.title}</span>
                  <span className={cx(itemId === r.id ? "text-primary-foreground/70" : "text-on-surface-variant")}>{r.status === "approved" ? "approved" : r.status === "rendered" ? "rendered" : "planned"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div data-tour="social-entry">
          <Field label="1. Calendar entry">
            <EntryPicker items={items} value={itemId} onChange={pick} />
          </Field>
        </div>

        {item ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-on-surface"><span className="font-medium">{item.title}</span> · {niceDate(item.publish_date)} · {itemChannels(item).join(", ")}</p>
            {item.brief_url && (
              <a href={item.brief_url} target="_blank" rel="noopener noreferrer" className={cx("text-xs inline-flex items-center gap-1 self-start", linkCls)}>
                Open the Google Doc <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {item.campaign_id && (
              <a href={`/campaigns/${item.campaign_id}#social`} className={cx("text-xs inline-flex items-center gap-1 self-start", linkCls)}>
                Rendered posts also show in {item.campaignTitle ?? "the campaign"}'s assets, under Socials <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">Pick an entry above to start.</p>
        )}

        {/* Shown before an entry is picked (greyed out) so the guide can point at each step */}
        <fieldset disabled={!item} className={cx("flex flex-col gap-5 min-w-0", !item && "opacity-50 pointer-events-none select-none")}>
            <div data-tour="social-brief">
            <Field
              label={campaignBrief ? "2. Anything specific to this post (optional)" : "2. The brief"}
              hint={briefNote || (campaignBrief
                ? `Claude already has the ${itemCampaign?.title ?? "campaign"} brief, its other entries and its mood board. Add only what's specific to this post, or leave it empty.`
                : itemCampaign
                  ? "Paste the Doc's text, or upload it (File → Download → Microsoft Word). Tip: add a Campaign brief to the campaign once and every post can skip this."
                  : "Paste the Doc's text, or upload it: in Google Docs, File → Download → Microsoft Word (.docx). The whole campaign Doc is fine; Claude uses the part for this entry.")}
            >
              <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={6} className={textareaCls} placeholder={campaignBrief ? "e.g. Use the speaker quote from Ben; lean on the 48-hour proof point." : "Paste the brief here"} />
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-outline-variant text-[13px] font-medium cursor-pointer hover:border-on-surface/30">
                  <FileUp className="h-3.5 w-3.5" /> Upload .docx or .txt
                  <input type="file" accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; e.target.value = ""
                    if (!f) return
                    setError("")
                    try { const text = await briefFileToText(f); setBrief(text); setBriefNote(`Loaded ${f.name}: ${text.length.toLocaleString()} characters. Check it looks right, then write the options.`) }
                    catch (err) { setError(err instanceof Error ? err.message : "Couldn't read that file") }
                  }} />
                </label>
                {brief && <span className="text-xs text-on-surface-variant">{brief.length.toLocaleString()} characters</span>}
              </div>
            </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2" data-tour="social-setup">
              <Field label="3. Platforms">
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map(p => (
                    <Pill key={p} active={platforms.includes(p)} onClick={() => setPlatforms(cur => cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p])}>{p}</Pill>
                  ))}
                </div>
              </Field>
              <Field label="4. Post type">
                <div className="flex items-center gap-2 flex-wrap">
                  <SegmentedControl value={postType} onChange={setPostType} ariaLabel="Post type"
                    options={[{ value: "single", label: "Single" }, { value: "carousel", label: "Carousel" }, { value: "story", label: "Story" }]} />
                  {postType === "carousel" && (
                    <select value={cards} onChange={e => setCards(Number(e.target.value))} aria-label="Cards" className="h-9 rounded-full border border-outline-variant bg-transparent px-3 text-[13px] text-on-surface">
                      {[3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} cards</option>)}
                    </select>
                  )}
                </div>
              </Field>
            </div>

            <Field label="Direction (optional)" hint="Anything the Doc doesn't say: which audience block to use, a mood, a photo idea.">
              <textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2} className={textareaCls} placeholder="e.g. Use the “Current monthly customers: Annual offer” copy." />
            </Field>

            {isEditor ? (
              <div className="flex flex-wrap items-center gap-3" data-tour="social-generate">
                <Button disabled={!item || !!busy || (!brief.trim() && !campaignBrief) || (!platforms.length && postType !== "story")} onClick={() => {
                  if (plan && !confirm("Write a new plan? This replaces the current options, photos and renders.")) return
                  generate()
                }}>
                  {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {plan ? "Write a new plan" : "Write three options"}
                </Button>
                {busy === "plan" && <span className="text-sm text-on-surface-variant">1 of 3 · Claude is reading the brief and writing three options. About a minute.</span>}
                {busy === "photos" && <span className="text-sm text-on-surface-variant">2 of 3 · Finding photos on Unsplash: Jev filters out stock, Claude picks. About a minute.</span>}
                {busy === "render" && <span className="text-sm text-on-surface-variant">3 of 3 · Rendering every size.</span>}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant" data-tour="social-generate">Only editors can generate posts.</p>
            )}
        </fieldset>
        <ErrorText>{errorAt?.includes("-") ? "" : error}</ErrorText>
      </div>

      {loading && <p className="text-sm text-on-surface-variant flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}

      {post && plan && item && (
        <>
          {post.stale && (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> The Google Doc has changed since this plan was written. Write a new plan to use the latest brief.
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[17px] font-semibold text-on-surface">The angle</h3>
              <span className="text-xs text-on-surface-variant inline-flex items-center gap-1" title="Plans, photos, renders and captions save automatically">
                <Check className="h-3 w-3" /> Saved {savedAgo(post.updated_at)}
              </span>
            </div>
            <p className="text-sm text-on-surface">{plan.angle}</p>
            <p className="text-xs text-on-surface-variant">Built from: {plan.source}</p>
            {plan.meta?.context && (
              <p className="text-xs text-on-surface-variant">
                Using: {[
                  plan.meta.context.brief && "the campaign brief",
                  plan.meta.context.nearby > 0 && `${plan.meta.context.nearby} nearby campaign entr${plan.meta.context.nearby === 1 ? "y" : "ies"}`,
                  plan.meta.context.visuals > 0 && `${plan.meta.context.visuals} mood board and key visual note${plan.meta.context.visuals === 1 ? "" : "s"}`,
                  plan.meta.briefSource !== "campaign" && "your post brief",
                ].filter(Boolean).join(", ") || "the calendar entry only"}
              </p>
            )}
            {(plan.flags.length > 0 || generalChecks.length > 0) && (
              <div className="flex flex-col gap-1.5 mt-1">
                <p className="text-[13px] font-medium text-on-surface">Check before posting</p>
                {plan.flags.map((f, i) => (
                  <p key={`f${i}`} className="text-xs text-on-surface-variant flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" /><span><span className="text-on-surface">{f.text}</span>: {f.reason}</span></p>
                ))}
                {generalChecks.map((c, i) => (
                  <p key={`c${i}`} className={cx("text-xs flex gap-1.5", c.severity === "error" ? "text-error" : "text-on-surface-variant")}><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />{c.where}: {c.message}</p>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {plan.options.map(o => (
              <OptionCard key={o.option} post={post} option={o} itemId={item.id} editable={isEditor} busy={busy} error={optionError(o.option)} onAction={act} onPost={setPost} onZoom={setZoom} campaign={itemCampaign ? { id: itemCampaign.id, title: itemCampaign.title } : null} />
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
            <h3 className="text-[17px] font-semibold text-on-surface">Captions</h3>
            <Captions post={post} itemId={item.id} editable={isEditor} onPost={setPost} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isEditor && (
              <Button variant="secondary" disabled={!!busy} onClick={() => run("render")}>
                {busy === "render" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Render all options
              </Button>
            )}
            {post.renders.length > 0 && (
              <a href={`/api/social?item=${encodeURIComponent(item.id)}&zip=1`} className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                <Download className="h-4 w-4" /> Download zip
              </a>
            )}
            {errorAt === "render" && <ErrorText>{error}</ErrorText>}
            {tokens && tokens.i > 0 && (
              <span className="text-xs text-on-surface-variant">Claude so far: {tokens.i.toLocaleString()} tokens in, {tokens.o.toLocaleString()} out</span>
            )}
          </div>
        </>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-6" onClick={() => setZoom(null)}>
          <button type="button" aria-label="Close" className="absolute top-4 right-4 h-9 w-9 grid place-items-center rounded-full bg-white/90 text-black"><X className="h-4 w-4" /></button>
          {zoom.url && <img src={zoom.url} alt={zoom.name} className="max-h-full max-w-full rounded-lg" onClick={e => e.stopPropagation()} />}
        </div>
      )}
    </div>
  )
}
