"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Lightbulb, Megaphone, CalendarPlus, Trash2, Send, MessageCircle, FileText } from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import { useRefreshData } from "@/components/data-provider"
import {
  createIdeaClient,
  deleteContentItemClient,
  getIdeasClient,
  promoteIdeaToCampaignClient,
  promoteIdeaToItemClient,
} from "@/lib/data-client"
import type { IdeaWithCreator } from "@/lib/database.types"
import { CreateCampaignDialog } from "@/components/create-campaign-dialog"
import { IdeaDialog } from "@/components/idea-dialog"

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function InboxView({ initialIdeas }: { initialIdeas: IdeaWithCreator[] }) {
  const { currentUser, teams, activeTeam, inTeamView, canEditTeam } = useStore()
  const isEditor = useIsEditor()
  // Who it's for: the team in view by default. Anyone can send a request to any team.
  const [sendTo, setSendTo] = useState<string>(activeTeam)
  useEffect(() => setSendTo(activeTeam), [activeTeam])
  const sendTeam = teams.find(t => t.id === sendTo) ?? null
  const teamName = (id: string | null | undefined) => teams.find(t => t.id === id)?.name
  const { refreshCampaigns } = useRefreshData()

  const [ideas, setIdeas] = useState<IdeaWithCreator[]>(initialIdeas)
  const shown = ideas.filter(i => inTeamView(i.team_id))
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [showNotes, setShowNotes] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null)
  const [promoteIdea, setPromoteIdea] = useState<IdeaWithCreator | null>(null)
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null)
  const openIdea = openIdeaId ? ideas.find(i => i.id === openIdeaId) ?? null : null

  // Deep link from a notification: /inbox?idea=<id>
  const ideaParam = useSearchParams().get("idea")
  useEffect(() => {
    if (ideaParam && ideas.some(i => i.id === ideaParam)) setOpenIdeaId(ideaParam)
  }, [ideaParam, ideas])

  const reload = async () => setIdeas(await getIdeasClient())

  const handleAdd = async () => {
    if (!title.trim()) return
    setAdding(true)
    try {
      await createIdeaClient({ title: title.trim(), notes: notes.trim() || null, createdById: currentUser?.id ?? null, teamId: teams.length ? sendTeam?.id ?? null : undefined })
      setTitle("")
      setNotes("")
      setShowNotes(false)
      await reload()
    } finally {
      setAdding(false)
    }
  }

  const handlePromoteToItem = async (idea: IdeaWithCreator) => {
    setBusyId(idea.id)
    try {
      await promoteIdeaToItemClient(idea.id)
      await Promise.all([reload(), refreshCampaigns()])
    } finally {
      setBusyId(null)
    }
  }

  const handleDiscard = async (id: string) => {
    setBusyId(id)
    try {
      await deleteContentItemClient(id)
      setConfirmDiscardId(null)
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  const handlePromoted = async () => {
    setPromoteIdea(null)
    await Promise.all([reload(), refreshCampaigns()])
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {/* Quick-add bar */}
      <div data-tour="inbox-capture" className="rounded-2xl border border-border bg-surface-container-low p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onFocus={() => setShowNotes(true)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && !showNotes) {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder={sendTeam ? `Request for ${sendTeam.name}… e.g. "Key visuals for the UniCon webinar ads"` : "Capture an idea… e.g. \"Customer story about X\""}
            className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
          <button
            onClick={handleAdd}
            disabled={!title.trim() || adding}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/85 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {showNotes && teams.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <label htmlFor="inbox-send-to">For</label>
            <select
              id="inbox-send-to"
              value={sendTeam ? sendTeam.id : "all"}
              onChange={e => setSendTo(e.target.value)}
              className="h-7 rounded-full border border-outline-variant bg-transparent px-2 text-xs text-on-surface"
            >
              <option value="all">Everyone (main inbox)</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {sendTeam && <span>Only {sendTeam.name} can act on it; you can still edit it.</span>}
          </div>
        )}
        {showNotes && (
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={sendTeam
              ? "What's it for? Where is it going (placement, channel)? Sizes / specs? Due date? Link to the brief."
              : "Optional notes…"}
            rows={sendTeam ? 4 : 2}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
        )}
      </div>

      {/* Idea list */}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-2xl border-2 border-dashed border-outline-variant">
          <Lightbulb className="h-6 w-6 text-on-surface-variant" aria-hidden="true" />
          <p className="text-sm text-on-surface-variant">{teamName(activeTeam) ? `No requests for ${teamName(activeTeam)} yet.` : "No ideas yet. Capture the first one above."}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map(idea => (
            <li
              key={idea.id}
              data-tour="inbox-idea"
              className="rounded-2xl border border-border bg-card px-4 py-3 flex flex-col gap-2"
            >
              <button
                type="button"
                onClick={() => setOpenIdeaId(idea.id)}
                className="text-left min-w-0 -mx-1 px-1 rounded-lg hover:bg-surface-container-low/60 transition-colors"
              >
                <p className="text-sm font-semibold text-on-surface text-pretty">{idea.title}</p>
                {idea.notes && (
                  <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{idea.notes}</p>
                )}
                <p className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-1">
                  <span>{idea.createdBy?.full_name ?? "Someone"} &middot; {timeAgo(idea.created_at)}</span>
                  {teamName(idea.team_id) && <span className="rounded-full border border-outline-variant px-1.5">For {teamName(idea.team_id)}</span>}
                  {idea.brief_url && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Doc</span>}
                  <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> Open to comment</span>
                </p>
              </button>

              {isEditor && canEditTeam(idea.team_id) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setPromoteIdea(idea)}
                    disabled={busyId === idea.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border border-outline-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
                  >
                    <Megaphone className="h-3.5 w-3.5 text-primary" />
                    Promote to campaign
                  </button>
                  <button
                    onClick={() => handlePromoteToItem(idea)}
                    disabled={busyId === idea.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border border-outline-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
                  >
                    <CalendarPlus className="h-3.5 w-3.5 text-primary" />
                    Promote to item
                  </button>
                  <button
                    onClick={() => setConfirmDiscardId(idea.id)}
                    disabled={busyId === idea.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-error hover:bg-error-container transition-colors ml-auto disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Discard
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {openIdea && (
        <IdeaDialog idea={openIdea} onClose={() => setOpenIdeaId(null)} onSaved={reload} />
      )}

      {/* Promote to campaign — reuses the New Campaign dialog, pre-filled */}
      {promoteIdea && (
        <CreateCampaignDialog
          open={!!promoteIdea}
          onOpenChange={open => { if (!open) setPromoteIdea(null) }}
          initialTitle={promoteIdea.title}
          initialObjective={promoteIdea.notes ?? ""}
          onCreated={async campaign => {
            await promoteIdeaToCampaignClient(promoteIdea.id, campaign.id)
            await handlePromoted()
          }}
        />
      )}

      {/* Discard confirm */}
      {confirmDiscardId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
          <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-base font-bold text-on-surface">Discard idea?</h3>
            <p className="text-sm text-on-surface-variant">This deletes the idea and its comments. It cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDiscardId(null)}
                className="px-4 py-2 rounded-full text-sm font-medium border border-outline-variant hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDiscard(confirmDiscardId)}
                className="px-4 py-2 rounded-full text-sm font-medium bg-error text-on-error hover:bg-error/90 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
