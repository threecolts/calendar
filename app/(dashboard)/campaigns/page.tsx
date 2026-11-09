"use client"

import { useState } from "react"
import { Plus, Search } from "lucide-react"
import { useStore } from "@/lib/store"
import { ListSkeleton } from "@/components/loading-skeletons"
import { CampaignCard } from "@/components/campaign-card"
import { CampaignDetailSheet } from "@/components/campaign-detail-sheet"
import { CreateCampaignDialog } from "@/components/create-campaign-dialog"
import type { CampaignWithItems } from "@/lib/database.types"
import { MOTION_OPTIONS, MOTION_ACCENTS, NO_CAMPAIGN_ID } from "@/lib/database.types"

export default function CampaignsPage() {
  const { campaigns: allCampaigns, isLoading } = useStore()
  const campaigns = allCampaigns.filter(c => c.id !== NO_CAMPAIGN_ID)
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  // Derived live from the store (not a frozen snapshot) so the sheet reflects
  // changes made inside it — editing an item, or moving items out of it.
  const selected: CampaignWithItems | null = selectedId
    ? campaigns.find(c => c.id === selectedId) ?? null
    : null
  const [createOpen,     setCreateOpen]     = useState(false)
  const [search,         setSearch]         = useState("")
  const [filterMotion,   setFilterMotion]   = useState("All")

  if (isLoading) return <ListSkeleton />

  const filtered = campaigns.filter(c => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase())
    const matchMotion = filterMotion === "All" || c.motion === filterMotion
    return matchSearch && matchMotion
  })

  // Group by motion
  const motionGroups = MOTION_OPTIONS.filter(m =>
    filterMotion === "All" ? filtered.some(c => c.motion === m) : m === filterMotion
  )

  const total     = campaigns.reduce((s, c) => s + (c.items?.length || 0), 0)
  const published = campaigns.reduce((s, c) => s + (c.items?.filter(i => i.status === "Published").length || 0), 0)

  return (
    <div className="px-4 sm:px-8 lg:px-10 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold text-on-surface tracking-tight">Campaigns</h1>
          <p className="text-sm text-on-surface-variant font-medium">
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} &middot; {total} items &middot; {published} published
          </p>
        </div>
        <button
          data-tour="campaigns-new"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/85 transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          New campaign
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-outline-variant bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(["All", ...MOTION_OPTIONS] as string[]).map(m => {
            const active = filterMotion === m
            const accent = m !== "All" ? MOTION_ACCENTS[m as keyof typeof MOTION_ACCENTS] : null
            return (
              <button
                key={m}
                onClick={() => setFilterMotion(m)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  active
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {accent && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} aria-hidden="true" />
                )}
                {m}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grid by motion */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <p className="text-on-surface-variant text-sm">No campaigns found.</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/85 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create your first campaign
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {motionGroups.map(motionLabel => {
            const group = filtered.filter(c => c.motion === motionLabel)
            if (!group.length) return null
            const accent = MOTION_ACCENTS[motionLabel] || "#94a3b8"
            return (
              <section key={motionLabel}>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-2 h-2 rounded-full" style={{ background: accent }} aria-hidden="true" />
                  <h2 className="text-[15px] font-semibold text-on-surface">{motionLabel}</h2>
                  <span className="text-xs text-on-surface-variant">{group.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.map(c => (
                    <CampaignCard key={c.id} campaign={c} onClick={() => setSelectedId(c.id)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {selected && (
        <CampaignDetailSheet key={selected.id} campaign={selected} onClose={() => setSelectedId(null)} onOpenCampaign={setSelectedId} />
      )}
      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
