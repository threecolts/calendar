"use client"

import { useEffect } from "react"
import { useStore } from "@/lib/store"
import { getCampaignsWithItemsClient, getProfilesClient, getTeamsClient } from "@/lib/data-client"
import type { CampaignWithItems, Profile } from "@/lib/database.types"

export function DataProvider({
  children,
  initialCampaigns,
  initialProfiles,
}: {
  children: React.ReactNode
  initialCampaigns: CampaignWithItems[]
  initialProfiles: Profile[]
}) {
  const { setCampaigns, setProfiles } = useStore()

  useEffect(() => {
    setCampaigns(initialCampaigns)
    setProfiles(initialProfiles)
  }, [initialCampaigns, initialProfiles, setCampaigns, setProfiles])

  return <>{children}</>
}

export function useRefreshData() {
  const { setCampaigns, setProfiles, setTeams, currentUser, setCurrentUser } = useStore()
  // Keep "me" in step with the profile list (e.g. after changing your own team)
  const syncMe = (profiles: { id: string }[]) => {
    const me = currentUser && profiles.find(p => p.id === currentUser.id)
    if (me) setCurrentUser(me as typeof currentUser)
  }

  const refreshAll = async () => {
    const [campaigns, profiles, teams] = await Promise.all([
      getCampaignsWithItemsClient(),
      getProfilesClient(),
      getTeamsClient(),
    ])
    setCampaigns(campaigns)
    setProfiles(profiles)
    syncMe(profiles)
    setTeams(teams)
  }

  const refreshTeams = async () => setTeams(await getTeamsClient())

  const refreshCampaigns = async () => {
    const campaigns = await getCampaignsWithItemsClient()
    setCampaigns(campaigns)
  }

  const refreshProfiles = async () => {
    const profiles = await getProfilesClient()
    setProfiles(profiles)
    syncMe(profiles)
  }

  return { refreshAll, refreshCampaigns, refreshProfiles, refreshTeams }
}
