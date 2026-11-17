"use client"

import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode, Dispatch, SetStateAction } from "react"
import { setWriteTeam, updateContentItemClient } from "./data-client"
import type {
  CampaignWithItems,
  ContentItemWithCampaign,
  ContentStatus,
  Profile,
  CampaignMotion,
  ContentChannel,
  Team,
} from "./database.types"

export interface CalendarFilters {
  channel: ContentChannel | "All"
  assignee: string | "All"
  motion: CampaignMotion | "All"
  search: string
}

/** "all" = the main calendar (everything); otherwise a team id */
export type TeamView = "all" | string

interface StoreContextType {
  // Data
  /** Campaigns and items in the current team view (everything in the main view) */
  campaigns: CampaignWithItems[]
  /** Every campaign, whatever the team view */
  allCampaigns: CampaignWithItems[]
  /** Teams and sub-teams; [] until scripts/012 has run */
  teams: Team[]
  setTeams: (teams: Team[]) => void
  /** The team view: "all" or a team id. Defaults to your own team */
  activeTeam: TeamView
  setActiveTeam: (view: TeamView) => void
  /** Is this team (or null) inside the current view? */
  inTeamView: (teamId: string | null | undefined) => boolean
  /** May the current user change work owned by this team? (null = shared work) */
  canEditTeam: (teamId: string | null | undefined) => boolean
  profiles: Profile[]
  /** Alias for profiles — all team members */
  teamMembers: Profile[]
  currentUser: Profile | null
  settings: Record<string, string[]>
  isLoading: boolean
  setCampaigns: Dispatch<SetStateAction<CampaignWithItems[]>>
  setProfiles: (profiles: Profile[]) => void
  setCurrentUser: (user: Profile | null) => void
  setSettings: (settings: Record<string, string[]>) => void
  // Calendar UI state
  calendarView: "month" | "week" | "list"
  setCalendarView: (view: "month" | "week" | "list") => void
  calendarDate: Date
  setCalendarDate: (date: Date) => void
  filters: CalendarFilters
  setFilters: (filters: CalendarFilters) => void
  // Optimistic mutations
  updateItemStatus: (itemId: string, status: ContentStatus) => Promise<void>
  updateItemDate: (itemId: string, publishDate: string | null) => Promise<void>
  refreshKey: number
  triggerRefresh: () => void
}

const StoreContext = createContext<StoreContextType | null>(null)

export function StoreProvider({
  children,
  initialCampaigns = [],
  initialProfiles = [],
  initialCurrentUser = null,
  initialSettings = {},
  initialTeams = [],
}: {
  children: ReactNode
  initialCampaigns?: CampaignWithItems[]
  initialProfiles?: Profile[]
  initialCurrentUser?: Profile | null
  initialSettings?: Record<string, string[]>
  initialTeams?: Team[]
}) {
  const [allCampaigns, setCampaigns] = useState<CampaignWithItems[]>(initialCampaigns)
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  // Your own team's view by default; a choice you make is remembered per browser
  const [activeTeam, setActiveTeamState] = useState<TeamView>(() =>
    initialTeams.some(t => t.id === initialCurrentUser?.team_id) ? initialCurrentUser!.team_id! : "all")
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [currentUser, setCurrentUser] = useState<Profile | null>(initialCurrentUser)
  const [settings, setSettings] = useState<Record<string, string[]>>(initialSettings)
  const [calendarView, setCalendarView] = useState<"month" | "week" | "list">("month")
  const [calendarDate, setCalendarDate] = useState<Date>(new Date())
  const [refreshKey, setRefreshKey] = useState(0)
  const [filters, setFilters] = useState<CalendarFilters>({
    channel: "All",
    assignee: "All",
    motion: "All",
    search: "",
  })

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  // ---- Teams ----
  const teamKey = currentUser ? `content-calendar:team-view:v1:${currentUser.id}` : null
  useEffect(() => {
    if (!teamKey || !teams.length) return
    try {
      const saved = localStorage.getItem(teamKey)
      if (saved && (saved === "all" || teams.some(t => t.id === saved))) setActiveTeamState(saved)
    } catch {}
  }, [teamKey, teams])
  const setActiveTeam = useCallback((view: TeamView) => {
    setActiveTeamState(view)
    try { if (teamKey) localStorage.setItem(teamKey, view) } catch {}
  }, [teamKey])

  /** The team in view and every sub-team under it */
  const scope = useMemo(() => {
    if (activeTeam === "all" || !teams.some(t => t.id === activeTeam)) return null
    const ids = new Set([activeTeam])
    let grew = true
    while (grew) {
      grew = false
      for (const t of teams) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); grew = true }
    }
    return ids
  }, [activeTeam, teams])

  const inTeamView = useCallback((teamId: string | null | undefined) => !scope || (!!teamId && scope.has(teamId)), [scope])

  /** Your team and every team above it: the work you may change */
  const myTeams = useMemo(() => {
    const ids = new Set<string>()
    let id = currentUser?.team_id ?? null
    while (id && !ids.has(id)) { ids.add(id); id = teams.find(t => t.id === id)?.parent_id ?? null }
    return ids
  }, [currentUser?.team_id, teams])
  const canEditTeam = useCallback((teamId: string | null | undefined) => !teamId || myTeams.has(teamId), [myTeams])

  // New work is filed under the team in view
  useEffect(() => { setWriteTeam(scope && teams.length ? activeTeam : null) }, [scope, activeTeam, teams.length])

  /** An item belongs to its own team, else its campaign's */
  const campaigns = useMemo(() => {
    if (!scope) return allCampaigns
    return allCampaigns.flatMap(c => {
      const items = (c.items || []).filter(i => inTeamView(i.team_id ?? c.team_id))
      return inTeamView(c.team_id) || items.length ? [{ ...c, items }] : []
    })
  }, [allCampaigns, scope, inTeamView])

  const updateItemStatus = useCallback(async (itemId: string, status: ContentStatus) => {
    setCampaigns((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((item) =>
          item.id === itemId ? { ...item, status } : item
        ),
      }))
    )
    try {
      await updateContentItemClient(itemId, { status })
    } catch (e) {
      console.error("Failed to update item status:", e)
    }
  }, [])

  const updateItemDate = useCallback(async (itemId: string, publishDate: string | null) => {
    setCampaigns((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((item) =>
          item.id === itemId ? { ...item, publish_date: publishDate } : item
        ),
      }))
    )
    try {
      await updateContentItemClient(itemId, { publish_date: publishDate })
    } catch (e) {
      console.error("Failed to update item date:", e)
    }
  }, [])

  return (
    <StoreContext.Provider
      value={{
        campaigns,
        allCampaigns,
        teams,
        setTeams,
        activeTeam,
        setActiveTeam,
        inTeamView,
        canEditTeam,
        profiles,
        teamMembers: profiles,
        isLoading: false,
        currentUser,
        settings,
        setCampaigns,
        setProfiles,
        setCurrentUser,
        setSettings,
        calendarView,
        setCalendarView,
        calendarDate,
        setCalendarDate,
        filters,
        setFilters,
        updateItemStatus,
        updateItemDate,
        refreshKey,
        triggerRefresh,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}

export function useIsEditor(): boolean {
  const { currentUser } = useStore()
  return currentUser?.app_role === "editor"
}
