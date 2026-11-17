"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { useRefreshData } from "@/components/data-provider"
import { useStore } from "@/lib/store"
import { similarCampaigns } from "@/lib/campaign-match"
import { createCampaignClient } from "@/lib/data-client"
import type { Campaign, CampaignMotion, CampaignType } from "@/lib/database.types"
import { MOTION_OPTIONS, TYPE_OPTIONS, PRODUCT_OPTIONS, NO_CAMPAIGN_ID } from "@/lib/database.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-fill the title, e.g. when promoting an Inbox idea */
  initialTitle?: string
  /** Pre-fill the objective, e.g. from an idea's notes */
  initialObjective?: string
  /** Called with the newly created campaign, in addition to the default refresh + close */
  onCreated?: (campaign: Campaign) => void | Promise<void>
  /** Render above another z-50 dialog (e.g. opened from the Add Item dialog) */
  stacked?: boolean
}

export function CreateCampaignDialog({ open, onOpenChange, initialTitle, initialObjective, onCreated, stacked }: Props) {
  const { refreshCampaigns } = useRefreshData()
  const { allCampaigns, teams, activeTeam } = useStore()

  const [title,     setTitle]     = useState(initialTitle ?? "")
  const [type,      setType]      = useState<CampaignType>("Always-on")
  const [motion,    setMotion]    = useState<CampaignMotion>("Both")
  const [product,   setProduct]   = useState("")
  const [objective, setObjective] = useState(initialObjective ?? "")
  const [endDate,   setEndDate]   = useState("")
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState("")

  if (!open) return null

  // Across every team: the same campaign is often planned by two teams
  const matches = similarCampaigns(title, allCampaigns.filter(c => c.id !== NO_CAMPAIGN_ID && c.status !== "Archived"))
  const teamName = (id: string | null | undefined) => teams.find(t => t.id === id)?.name
  const viewTeam = teamName(activeTeam)
  const pickExisting = async (c: Campaign) => {
    setSaving(true)
    try { await onCreated?.(c); refreshCampaigns(); onOpenChange(false) }
    finally { setSaving(false) }
  }

  const handleCreate = async () => {
    if (!title.trim()) { setError("Title is required"); return }
    setSaving(true)
    setError("")
    try {
      const campaign = await createCampaignClient({
        title: title.trim(), type, motion, product: product || null, objective: objective || null, end_date: endDate || null,
      })
      await onCreated?.(campaign)
      refreshCampaigns()
      onOpenChange(false)
      setTitle(""); setType("Always-on"); setMotion("Both"); setProduct(""); setObjective(""); setEndDate("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] ${stacked ? "z-[60]" : "z-50"}`} onClick={() => onOpenChange(false)} />
      <div className={`fixed inset-0 ${stacked ? "z-[60]" : "z-50"} flex items-center justify-center p-4 pointer-events-none`}>
        <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md pointer-events-auto flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] text-on-surface">New campaign</h2>
            <button onClick={() => onOpenChange(false)} className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-on-surface-variant">Title *</label>
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Q3 Brand Push"
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {matches.length > 0 && (
                <div className="rounded-lg bg-surface-container-low px-3 py-2 flex flex-col gap-1.5">
                  <p className="text-xs text-on-surface">This campaign may already exist:</p>
                  {matches.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <span className="flex-1 min-w-0 truncate">
                        <span className="text-on-surface">{c.title}</span>
                        {teamName(c.team_id) ? ` · ${teamName(c.team_id)}` : " · shared"}
                        {c.end_date ? ` · ends ${c.end_date}` : ""}
                      </span>
                      {onCreated && (
                        <button type="button" disabled={saving} onClick={() => pickExisting(c)} className="underline underline-offset-2 hover:text-on-surface disabled:opacity-50">
                          Use this one
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-on-surface-variant">Add your work to it instead of starting a second one, or carry on if it's really new.</p>
                </div>
              )}
              {viewTeam && <p className="text-[11px] text-on-surface-variant">It'll belong to {viewTeam} and also show on the main calendar.</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-on-surface-variant">Type *</label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as CampaignType)}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-on-surface-variant">Motion *</label>
                <select
                  value={motion}
                  onChange={e => setMotion(e.target.value as CampaignMotion)}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MOTION_OPTIONS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-on-surface-variant">Product</label>
              <select
                value={product}
                onChange={e => setProduct(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None</option>
                {PRODUCT_OPTIONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-on-surface-variant">Objective</label>
              <textarea
                value={objective}
                onChange={e => setObjective(e.target.value)}
                rows={2}
                placeholder="What is this campaign trying to achieve?"
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-on-surface-variant">Completion date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex justify-end gap-3">
            <button onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-full text-sm font-medium border border-outline-variant hover:bg-surface-container-low transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-60 transition-colors"
            >
              {saving ? "Creating…" : "Create campaign"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
