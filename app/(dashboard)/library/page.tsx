"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search, ExternalLink, Copy, Check } from "lucide-react"
import { useStore } from "@/lib/store"
import { ListSkeleton } from "@/components/loading-skeletons"
import type { CampaignWithItems, ContentChannel } from "@/lib/database.types"
import { CHANNEL_OPTIONS, CHANNEL_ICONS, NO_CAMPAIGN_ID, campaignColor, itemChannels } from "@/lib/database.types"

/** Only real web links are rendered as links — never javascript: or other schemes. */
function isWebUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url.trim())
}

const selectCls =
  "text-sm bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"

/**
 * Library — every published or linked piece of content in one place, so
 * teams can find and reuse assets (videos, pages, posts) across motions.
 * Built from content items that have a live URL; no separate asset store.
 */
export default function LibraryPage() {
  const store = useStore()
  const campaigns: CampaignWithItems[] = store.campaigns
  const isLoading: boolean = store.isLoading
  const [search, setSearch]     = useState("")
  const [channel, setChannel]   = useState("All")
  const [campaign, setCampaign] = useState("All")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const assets = useMemo(() =>
    campaigns
      .flatMap(c => (c.items || []).map(item => ({ item, campaign: c })))
      .filter(({ item }) => isWebUrl(item.live_url))
      .sort((a, b) => (b.item.publish_date ?? "").localeCompare(a.item.publish_date ?? "")),
    [campaigns])

  const filtered = assets.filter(({ item, campaign: c }) => {
    if (channel !== "All" && !itemChannels(item).includes(channel as ContentChannel)) return false
    if (campaign !== "All" && c.id !== campaign) return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.title.toLowerCase().includes(q) && !c.title.toLowerCase().includes(q)) return false
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
          Published and linked content, to find and reuse across teams. Anything with a Live URL shows up here.
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
        <select value={channel} onChange={e => setChannel(e.target.value)} className={selectCls}>
          <option value="All">All channels</option>
          {CHANNEL_OPTIONS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={campaign} onChange={e => setCampaign(e.target.value)} className={selectCls}>
          <option value="All">All campaigns</option>
          {campaigns.filter(c => c.id !== NO_CAMPAIGN_ID).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <span className="ml-auto text-xs text-on-surface-variant">{filtered.length} of {assets.length}</span>
      </div>

      {assets.length === 0 ? (
        <div className="py-20 text-center text-sm text-on-surface-variant">
          Nothing here yet. Add a <strong>Live URL</strong> to a content item once it&apos;s published and it will appear in the Library.
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-on-surface-variant">No content matches these filters.</div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
          {filtered.map(({ item, campaign: c }) => {
            const url = item.live_url!.trim()
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-surface-container-low/60 transition-colors"
              >
                <div className="flex-1 min-w-[220px] flex flex-col gap-0.5">
                  <Link href={`/?item=${item.id}`} className="text-sm font-semibold text-on-surface hover:underline truncate">
                    {item.title}
                  </Link>
                  <span className="text-xs text-on-surface-variant truncate">
                    {itemChannels(item).map(c => `${CHANNEL_ICONS[c] || ""} ${c}`).join(", ")} · {item.format}
                    {item.publish_date && ` · ${new Date(item.publish_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                  </span>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full max-w-[220px] border border-outline-variant text-on-surface"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: campaignColor(item.campaign_id) }} aria-hidden="true" />
                  <span className="truncate">{c.title}</span>
                </span>
                {(item.audience_segments ?? []).length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {item.audience_segments.map(seg => (
                      <span key={seg} className="text-[10px] px-1.5 py-0.5 rounded-full border border-outline-variant text-on-surface-variant">{seg}</span>
                    ))}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-outline-variant hover:bg-surface-container-high transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </a>
                  <button
                    onClick={() => copy(item.id, url)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border border-outline-variant hover:bg-surface-container-low transition-colors"
                  >
                    {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-on-surface" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === item.id ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
