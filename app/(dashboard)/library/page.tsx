"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search, ExternalLink, Copy, Check, Clapperboard, PenTool, ClipboardList, Images } from "lucide-react"
import { useStore } from "@/lib/store"
import { ListSkeleton } from "@/components/loading-skeletons"
import type { CampaignWithItems, ContentChannel } from "@/lib/database.types"
import { CHANNEL_OPTIONS, CHANNEL_ICONS, NO_CAMPAIGN_ID, campaignColor, itemChannels } from "@/lib/database.types"
import { useTeamRequests } from "@/lib/requests-client"
import { REQUEST_KINDS } from "@/lib/requests"
import { SECTIONS, isImage, listAssetsForCampaigns, type CampaignAsset } from "@/lib/campaign-assets"

/** Only real web links are rendered as links — never javascript: or other schemes. */
function isWebUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url.trim())
}

const selectCls =
  "text-sm bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"

type Kind = "published" | "delivered" | "asset"
const KIND_LABEL: Record<Kind, string> = { published: "Published", delivered: "Delivered request", asset: "Campaign asset" }

interface Row {
  key: string
  kind: Kind
  title: string
  detail: string
  campaignId: string | null
  campaignTitle: string | null
  date: string | null
  /** External link to open (and copy, when it's permanent) */
  url: string | null
  copyable: boolean
  /** Where it lives in the app */
  href: string
  channels: ContentChannel[]
  segments: string[]
  thumb: string | null
  icon: "video" | "design" | "other" | "asset" | null
}

const fmt = (d: string | null) =>
  d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""

/**
 * Library: everything finished, in one place, to find and reuse.
 *   Published  content items with a Live URL
 *   Delivered  requests marked Delivered, with their deliverable link
 *   Assets     campaign assets: design assets, videos and socials
 * Follows the team view, like every page.
 */
export default function LibraryPage() {
  const store = useStore()
  const campaigns: CampaignWithItems[] = store.campaigns
  const isLoading: boolean = store.isLoading
  const requests = useTeamRequests()
  const [assets, setAssets] = useState<CampaignAsset[]>([])
  const [search, setSearch]     = useState("")
  const [kind, setKind]         = useState<Kind | "All">("All")
  const [channel, setChannel]   = useState("All")
  const [campaign, setCampaign] = useState("All")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const campaignIds = campaigns.filter(c => c.id !== NO_CAMPAIGN_ID).map(c => c.id)
  const idKey = campaignIds.join(",")
  useEffect(() => {
    listAssetsForCampaigns(campaignIds, ["design", "video", "social"]).then(setAssets).catch(() => setAssets([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey])

  const campaignTitle = (id: string | null) => campaigns.find(c => c.id === id)?.title ?? null

  const rows = useMemo<Row[]>(() => {
    const published: Row[] = campaigns
      .flatMap(c => (c.items || []).map(item => ({ item, c })))
      .filter(({ item }) => isWebUrl(item.live_url))
      .map(({ item, c }) => ({
        key: `i-${item.id}`, kind: "published", title: item.title,
        detail: `${itemChannels(item).map(ch => `${CHANNEL_ICONS[ch] || ""} ${ch}`).join(", ")} · ${item.format}`,
        campaignId: c.id === NO_CAMPAIGN_ID ? null : c.id, campaignTitle: c.id === NO_CAMPAIGN_ID ? null : c.title,
        date: item.publish_date, url: item.live_url!.trim(), copyable: true, href: `/?item=${item.id}`,
        channels: itemChannels(item), segments: item.audience_segments ?? [], thumb: null, icon: null,
      }))
    const delivered: Row[] = requests
      .filter(r => r.status === "Delivered" && isWebUrl(r.deliverable_url))
      .map(r => ({
        key: `r-${r.id}`, kind: "delivered", title: r.title,
        detail: `${REQUEST_KINDS.find(k => k.id === r.kind)?.label ?? "Request"}${r.requester ? ` · for ${r.requester}` : ""}`,
        campaignId: r.campaign_id, campaignTitle: campaignTitle(r.campaign_id),
        date: r.due_date ?? r.updated_at.slice(0, 10), url: r.deliverable_url!.trim(), copyable: true,
        href: `/requests?request=${r.id}`, channels: [], segments: [], thumb: null, icon: r.kind,
      }))
    const campaignAssets: Row[] = assets.map(a => ({
      key: `a-${a.id}`, kind: "asset", title: a.title || "Untitled",
      detail: SECTIONS.find(s => s.id === a.section)?.title ?? "Asset",
      campaignId: a.campaign_id, campaignTitle: campaignTitle(a.campaign_id),
      date: a.created_at.slice(0, 10),
      // Uploaded files only have short-lived links, so copy the campaign page instead
      url: a.kind === "link" ? a.url : a.src ?? null, copyable: a.kind === "link",
      href: `/campaigns/${a.campaign_id}#${a.section}`, channels: [], segments: [],
      thumb: isImage(a) ? a.src ?? null : null, icon: "asset",
    }))
    return [...published, ...delivered, ...campaignAssets].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, requests, assets])

  const filtered = rows.filter(r => {
    if (kind !== "All" && r.kind !== kind) return false
    if (channel !== "All" && !r.channels.includes(channel as ContentChannel)) return false
    if (campaign !== "All" && r.campaignId !== campaign) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.title.toLowerCase().includes(q) && !(r.campaignTitle ?? "").toLowerCase().includes(q) && !r.detail.toLowerCase().includes(q)) return false
    }
    return true
  })

  if (isLoading) return <ListSkeleton />

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500)
    } catch {
      // Clipboard unavailable (e.g. insecure context) — the Open link still works.
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[24px] font-semibold text-on-surface tracking-tight">Library</h1>
        <p className="text-sm text-on-surface-variant">
          Everything finished, to find and reuse: published content, delivered requests and campaign assets.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-tour="library-filters">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search titles and campaigns…"
            className={`${selectCls} w-full pl-9`}
          />
        </div>
        <select value={kind} onChange={e => setKind(e.target.value as Kind | "All")} className={selectCls} aria-label="Type">
          <option value="All">Everything</option>
          {(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}s</option>)}
        </select>
        <select value={channel} onChange={e => setChannel(e.target.value)} className={selectCls} aria-label="Channel">
          <option value="All">All channels</option>
          {CHANNEL_OPTIONS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={campaign} onChange={e => setCampaign(e.target.value)} className={selectCls} aria-label="Campaign">
          <option value="All">All campaigns</option>
          {campaigns.filter(c => c.id !== NO_CAMPAIGN_ID).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <span className="ml-auto text-xs text-on-surface-variant">{filtered.length} of {rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-20 text-center text-sm text-on-surface-variant">
          Nothing here yet. Published content (with a <strong>Live URL</strong>), delivered requests and campaign assets all show up here.
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-on-surface-variant">Nothing matches these filters.</div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
          {filtered.map(r => {
            const Icon = r.icon === "video" ? Clapperboard : r.icon === "design" ? PenTool : r.icon === "asset" ? Images : r.icon === "other" ? ClipboardList : null
            return (
              <div key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-surface-container-low/60 transition-colors">
                {r.thumb
                  ? <img src={r.thumb} alt="" className="h-10 w-10 rounded-md object-cover border border-border flex-shrink-0" loading="lazy" />
                  : Icon && <span className="h-10 w-10 rounded-md bg-surface-container-low grid place-items-center flex-shrink-0"><Icon className="h-4 w-4 text-on-surface-variant" /></span>}
                <div className="flex-1 min-w-[220px] flex flex-col gap-0.5">
                  <Link href={r.href} className="text-sm font-semibold text-on-surface hover:underline truncate">{r.title}</Link>
                  <span className="text-xs text-on-surface-variant truncate">
                    {KIND_LABEL[r.kind]} · {r.detail}{r.date && ` · ${fmt(r.date)}`}
                  </span>
                </div>
                {r.campaignTitle && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full max-w-[220px] border border-outline-variant text-on-surface">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: campaignColor(r.campaignId) }} aria-hidden="true" />
                    <span className="truncate">{r.campaignTitle}</span>
                  </span>
                )}
                {r.segments.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {r.segments.map(seg => (
                      <span key={seg} className="text-[10px] px-1.5 py-0.5 rounded-full border border-outline-variant text-on-surface-variant">{seg}</span>
                    ))}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-outline-variant hover:bg-surface-container-high transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                  )}
                  {r.url && r.copyable && (
                    <button onClick={() => copy(r.key, r.url!)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border border-outline-variant hover:bg-surface-container-low transition-colors">
                      {copiedId === r.key ? <Check className="h-3.5 w-3.5 text-on-surface" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === r.key ? "Copied" : "Copy link"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
