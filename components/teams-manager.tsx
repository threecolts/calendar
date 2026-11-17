"use client"

import { useState } from "react"
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import { useRefreshData } from "@/components/data-provider"
import { createTeamClient, deleteTeamClient, updateTeamClient } from "@/lib/data-client"
import { Button, ErrorText, cx, fieldSmCls } from "@/components/kit"
import type { Team } from "@/lib/database.types"

/**
 * Teams and sub-teams (scripts/012). Everyone is in Marketing; people sit in a
 * sub-team such as Brand. Each team gets its own view of the calendar,
 * campaigns and inbox (the switcher beside the app name).
 */
export function TeamsManager() {
  const { teams, profiles } = useStore()
  const isEditor = useIsEditor()
  const { refreshTeams, refreshProfiles } = useRefreshData()
  const [adding, setAdding] = useState<{ parent: string | null } | null>(null)
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  if (!teams.length) return null

  const members = (id: string) => profiles.filter(p => p.team_id === id).length

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError("")
    try { await fn(); await Promise.all([refreshTeams(), refreshProfiles()]); setAdding(null); setEditing(null); setName("") }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save") }
    finally { setBusy(false) }
  }

  const row = (t: Team, depth: number) => (
    <li key={t.id} className="flex flex-col">
      <div className="flex items-center gap-3 py-2" style={{ paddingLeft: depth * 20 }}>
        {editing === t.id ? (
          <form className="flex items-center gap-2 flex-1" onSubmit={e => { e.preventDefault(); if (name.trim()) act(() => updateTeamClient(t.id, { name: name.trim() })) }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} className={cx(fieldSmCls, "max-w-xs")} aria-label="Team name" />
            <Button size="sm" type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
          </form>
        ) : (
          <>
            <span className="text-sm font-medium text-on-surface">{t.name}</span>
            <span className="text-xs text-on-surface-variant">{members(t.id)} {members(t.id) === 1 ? "person" : "people"}</span>
            {isEditor && (
              <span className="ml-auto flex items-center gap-1">
                {depth === 0 && (
                  <Button size="sm" variant="ghost" onClick={() => { setAdding({ parent: t.id }); setName("") }}>
                    <Plus className="h-3.5 w-3.5" /> Sub-team
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setEditing(t.id); setName(t.name) }} aria-label={`Rename ${t.name}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${t.name}`} disabled={busy} onClick={() => {
                  if (confirm(`Delete ${t.name}${teams.some(x => x.parent_id === t.id) ? " and its sub-teams" : ""}? Its people, campaigns and items stay, but are no longer tagged to it.`)) act(() => deleteTeamClient(t.id))
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
          </>
        )}
      </div>
      {adding?.parent === t.id && addForm(depth + 1)}
      {teams.filter(x => x.parent_id === t.id).length > 0 && (
        <ul className="flex flex-col">{teams.filter(x => x.parent_id === t.id).map(x => row(x, depth + 1))}</ul>
      )}
    </li>
  )

  const addForm = (depth: number) => (
    <form className="flex items-center gap-2 py-2" style={{ paddingLeft: depth * 20 }}
      onSubmit={e => { e.preventDefault(); if (name.trim()) act(() => createTeamClient({ name: name.trim(), parent_id: adding?.parent ?? null })) }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={adding?.parent ? "Sub-team name, e.g. Growth" : "Team name"} className={cx(fieldSmCls, "max-w-xs")} aria-label="New team name" />
      <Button size="sm" type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(null)}><X className="h-3.5 w-3.5" /></Button>
    </form>
  )

  return (
    <div className="flex flex-col gap-3" data-tour="teams-manager">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[19px] font-semibold text-on-surface">Teams</h2>
          <p className="text-sm text-on-surface-variant">Each team has its own view of the calendar, campaigns and inbox. Put people in a team with Edit below.</p>
        </div>
        {isEditor && !adding && (
          <Button size="sm" variant="secondary" onClick={() => { setAdding({ parent: null }); setName("") }}>
            <Plus className="h-3.5 w-3.5" /> Team
          </Button>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-surface-bright px-5 py-2">
        <ul className="flex flex-col divide-y divide-border">
          {teams.filter(t => !t.parent_id).map(t => row(t, 0))}
        </ul>
        {adding?.parent === null && addForm(0)}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
