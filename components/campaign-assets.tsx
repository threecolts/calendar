"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Download, ExternalLink, FileText, ImagePlus, Link2, Loader2, Pencil, Sparkles, Trash2, Upload, X,
} from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import {
  AssetsNotSetUp, SECTIONS, addLinkAsset, deleteAsset, embedUrl, isImage, isVideo, listAssets, listSocialPosts, updateAsset, uploadAsset,
  type AssetSection, type CampaignAsset, type CampaignSocialPost,
} from "@/lib/campaign-assets"
import { campaignColor, parseDateString } from "@/lib/database.types"
import { Button, ErrorText, cx, fieldSmCls, linkCls } from "@/components/kit"

const niceDate = (d: string | null) => {
  if (!d) return "No date"
  try { return parseDateString(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) } catch { return d }
}
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url } }
const mb = (n: number | null) => (n ? `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB` : "")

/** One asset as a tile: image, playable video, embedded link, or a file/link card */
function AssetTile({ asset, big, editable, onOpen, onChanged }: {
  asset: CampaignAsset; big?: boolean; editable: boolean
  onOpen: (a: CampaignAsset) => void
  onChanged: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(asset.title ?? "")
  const [busy, setBusy] = useState(false)
  const embed = asset.kind === "link" ? embedUrl(asset.url!) : null

  async function save() {
    setBusy(true)
    try { await updateAsset(asset.id, { title: title.trim() || null }); setRenaming(false); onChanged() } finally { setBusy(false) }
  }

  let media: React.ReactNode
  if (isImage(asset) && asset.src) {
    media = (
      <button type="button" onClick={() => onOpen(asset)} className="block w-full">
        <img src={asset.src} alt={asset.title ?? ""} className={cx("w-full h-auto block bg-surface-container-low", !big && "max-h-80 object-cover")} loading="lazy" />
      </button>
    )
  } else if (isVideo(asset) && asset.src) {
    media = <video src={asset.src} controls preload="metadata" className="w-full block bg-black aspect-video" />
  } else if (embed) {
    media = <iframe src={embed} title={asset.title ?? "Embedded media"} className="w-full aspect-video block border-0 bg-surface-container-low" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy" />
  } else {
    const href = asset.kind === "link" ? asset.url! : asset.src ?? "#"
    media = (
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 bg-surface-container-low hover:bg-surface-container transition-colors">
        {asset.kind === "link" ? <Link2 className="h-5 w-5 text-on-surface-variant" /> : <FileText className="h-5 w-5 text-on-surface-variant" />}
        <span className="min-w-0">
          <span className="block text-sm text-on-surface truncate">{asset.title || (asset.kind === "link" ? host(asset.url!) : "File")}</span>
          <span className="block text-xs text-on-surface-variant">{asset.kind === "link" ? host(asset.url!) : `${asset.mime_type ?? "file"} ${mb(asset.size_bytes)}`}</span>
        </span>
        <ExternalLink className="h-3.5 w-3.5 ml-auto text-on-surface-variant" />
      </a>
    )
  }

  return (
    <figure className="break-inside-avoid mb-3 rounded-xl overflow-hidden border border-border bg-card group">
      {media}
      <figcaption className="flex items-center gap-1.5 px-3 py-2 min-h-10">
        {renaming ? (
          <form className="flex items-center gap-1.5 flex-1" onSubmit={e => { e.preventDefault(); save() }}>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} className={cx(fieldSmCls, "h-8 flex-1")} aria-label="Asset name" />
            <Button size="sm" type="submit" disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</Button>
            <button type="button" onClick={() => setRenaming(false)} aria-label="Cancel" className="p-1 text-on-surface-variant"><X className="h-3.5 w-3.5" /></button>
          </form>
        ) : (
          <>
            <span className="text-xs text-on-surface truncate flex-1">{asset.title || (asset.kind === "link" ? host(asset.url!) : "Untitled")}</span>
            {asset.kind === "link" && (embed || isImage(asset)) && (
              <a href={asset.url!} target="_blank" rel="noopener noreferrer" aria-label="Open link" className="p-1 text-on-surface-variant hover:text-on-surface"><ExternalLink className="h-3.5 w-3.5" /></a>
            )}
            {asset.kind === "file" && asset.src && (
              <a href={asset.src} download={asset.title ?? undefined} aria-label="Download" className="p-1 text-on-surface-variant hover:text-on-surface"><Download className="h-3.5 w-3.5" /></a>
            )}
            {editable && (
              <>
                <button type="button" onClick={() => setRenaming(true)} aria-label="Rename" className="p-1 text-on-surface-variant hover:text-on-surface"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={busy} aria-label="Delete" className="p-1 text-on-surface-variant hover:text-error" onClick={async () => {
                  if (!confirm(`Delete ${asset.title || "this asset"}?`)) return
                  setBusy(true)
                  try { await deleteAsset(asset); onChanged() } finally { setBusy(false) }
                }}><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </>
        )}
      </figcaption>
    </figure>
  )
}

/** Upload (button or drop) and add-a-link controls for a section */
function AddControls({ campaignId, section, accept, onAdded }: { campaignId: string; section: AssetSection; accept: string; onAdded: () => void }) {
  const { currentUser } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [error, setError] = useState("")
  const input = useRef<HTMLInputElement>(null)

  async function upload(files: FileList | File[]) {
    setError("")
    const list = [...files]
    for (const [i, f] of list.entries()) {
      setBusy(`Uploading ${i + 1} of ${list.length}…`)
      try { await uploadAsset(campaignId, section, f, currentUser?.id ?? null) }
      catch (e) { setError(e instanceof Error ? e.message : `Couldn't upload ${f.name}`) }
    }
    setBusy(null)
    onAdded()
  }

  async function addLink() {
    setBusy("Adding…"); setError("")
    try { await addLinkAsset(campaignId, section, url, title, currentUser?.id ?? null); setUrl(""); setTitle(""); setLinkOpen(false); onAdded() }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't add the link") }
    finally { setBusy(null) }
  }

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={e => { e.preventDefault() }}
      onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {busy ?? "Upload"}
        </Button>
        <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = "" }} />
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setLinkOpen(v => !v)}>
          <Link2 className="h-3.5 w-3.5" /> Add a link
        </Button>
        <span className="text-xs text-on-surface-variant hidden sm:inline">or drop files here</span>
      </div>
      {linkOpen && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); if (url.trim()) addLink() }}>
          <input autoFocus value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className={cx(fieldSmCls, "flex-1 min-w-56")} aria-label="Link" />
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Name (optional)" className={cx(fieldSmCls, "w-44")} aria-label="Name" />
          <Button size="sm" type="submit" disabled={!url.trim() || !!busy}>Add</Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

function LabPosts({ posts }: { posts: CampaignSocialPost[] }) {
  if (!posts.length) return null
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-medium text-on-surface flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> From Social</p>
      {posts.map(p => (
        <div key={p.itemId} className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-on-surface">{p.itemTitle}</span>
            <span className="text-xs text-on-surface-variant">{niceDate(p.publishDate)} · {p.approved ? `Option ${p.approved} approved` : "Not approved yet: all options"}</span>
            <Link href={`/social?item=${p.itemId}`} className={cx("text-xs ml-auto inline-flex items-center gap-1", linkCls)}>Open in Social <ExternalLink className="h-3 w-3" /></Link>
          </div>
          {p.angle && <p className="text-xs text-on-surface-variant">{p.angle}</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {p.frames.map(f => (
              <a key={f.name} href={f.src ?? "#"} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex flex-col gap-1">
                {f.src ? <img src={f.src} alt={f.name} className="h-40 w-auto rounded-lg border border-border" loading="lazy" /> : <span className="h-40 w-32 rounded-lg bg-surface-container-high" />}
                <span className="text-[11px] text-on-surface-variant">Option {f.option} · {f.format}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The campaign's visual assets page: mood board first, then videos, design assets and socials */
export function CampaignAssets({ campaignId }: { campaignId: string }) {
  const { allCampaigns, teams, canEditTeam } = useStore()
  const isEditor = useIsEditor()
  const campaign = allCampaigns.find(c => c.id === campaignId)
  const editable = isEditor && !!campaign && canEditTeam(campaign.team_id)
  const teamName = teams.find(t => t.id === campaign?.team_id)?.name

  const [assets, setAssets] = useState<CampaignAsset[]>([])
  const [social, setSocial] = useState<CampaignSocialPost[]>([])
  const [state, setState] = useState<"loading" | "ready" | "not-set-up" | "error">("loading")
  const [error, setError] = useState("")
  const [open, setOpen] = useState<CampaignAsset | null>(null)

  const itemKey = (campaign?.items ?? []).map(i => i.id).join(",")
  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        listAssets(campaignId),
        listSocialPosts((campaign?.items ?? []).map(i => ({ id: i.id, title: i.title, publish_date: i.publish_date }))),
      ])
      setAssets(a); setSocial(s); setState("ready")
    } catch (e) {
      if (e instanceof AssetsNotSetUp) setState("not-set-up")
      else { setError(e instanceof Error ? e.message : "Couldn't load assets"); setState("error") }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, itemKey])
  useEffect(() => { load() }, [load])

  if (!campaign) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <p className="text-sm text-on-surface-variant">Campaign not found. <Link href="/campaigns" className={linkCls}>Back to campaigns</Link></p>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/campaigns" className={cx("text-sm inline-flex items-center gap-1 self-start", linkCls)}><ArrowLeft className="h-3.5 w-3.5" /> Campaigns</Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ background: campaignColor(campaign.id) }} aria-hidden="true" />
          <h1 className="text-[28px] font-semibold text-on-surface tracking-tight">{campaign.title}</h1>
          {teamName && <span className="rounded-full border border-outline-variant px-2.5 py-0.5 text-xs text-on-surface-variant">{teamName}</span>}
        </div>
        <p className="text-sm text-on-surface-variant max-w-2xl">
          Assets for this campaign, in one place. {editable ? "Upload files or add links to each section." : teamName ? `Only ${teamName} can add or remove assets.` : "Only editors can add or remove assets."}
        </p>
      </div>

      {state === "loading" && <p className="text-sm text-on-surface-variant flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading assets…</p>}
      {state === "not-set-up" && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface">
          Campaign assets need a one-off database update: run <code>scripts/013_campaign_assets.sql</code> in Supabase (after 012).
        </p>
      )}
      {state === "error" && <ErrorText>{error}</ErrorText>}

      {state === "ready" && SECTIONS.map(sec => {
        const list = assets.filter(a => a.section === sec.id)
        const isBoard = sec.id === "moodboard"
        const count = list.length + (sec.id === "social" ? social.length : 0)
        return (
          <section key={sec.id} id={sec.id} className="flex flex-col gap-3 scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className={cx("font-semibold text-on-surface", isBoard ? "text-[22px]" : "text-[19px]")}>{sec.title} <span className="text-on-surface-variant font-normal text-sm">{count || ""}</span></h2>
                <p className="text-sm text-on-surface-variant">{sec.blurb}</p>
              </div>
            </div>
            {editable && <AddControls campaignId={campaign.id} section={sec.id} accept={sec.accept} onAdded={load} />}
            {sec.id === "social" && <LabPosts posts={social} />}
            {list.length > 0 ? (
              <div className={cx("gap-3", isBoard ? "columns-1 sm:columns-2 lg:columns-3" : "columns-1 sm:columns-2 lg:columns-4")}>
                {list.map(a => <AssetTile key={a.id} asset={a} big={isBoard} editable={editable} onOpen={setOpen} onChanged={load} />)}
              </div>
            ) : !(sec.id === "social" && social.length) && (
              <div className="rounded-xl border-2 border-dashed border-outline-variant px-4 py-8 text-center text-sm text-on-surface-variant flex flex-col items-center gap-2">
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
                {isBoard ? "No mood board yet." : `Nothing in ${sec.title.toLowerCase()} yet.`}
              </div>
            )}
          </section>
        )
      })}

      {open?.src && (
        <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-6" onClick={() => setOpen(null)}>
          <button type="button" aria-label="Close" className="absolute top-4 right-4 h-9 w-9 grid place-items-center rounded-full bg-white/90 text-black"><X className="h-4 w-4" /></button>
          <img src={open.src} alt={open.title ?? ""} className="max-h-full max-w-full rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
