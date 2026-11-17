export const dynamic = "force-dynamic"
import { StoreProvider } from "@/lib/store"
import { DashboardLayoutClient } from "@/components/dashboard-layout-client"
import { getCampaignsWithItems, getProfiles, getSettings, getCurrentUserProfile, getTeams } from "@/lib/data"
import type { CampaignWithItems, Profile, Team } from "@/lib/database.types"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let campaigns: CampaignWithItems[] = []
  let profiles: Profile[] = []
  let currentUser: Profile | null = null
  let settings: Record<string, string[]> = {}
  let teams: Team[] = []

  try {
    ;[campaigns, profiles, currentUser, teams] = await Promise.all([
      getCampaignsWithItems(),
      getProfiles(),
      getCurrentUserProfile(),
      getTeams(),
    ])
    const rawSettings = await getSettings()
    settings = {
      products: (rawSettings.products as string[]) ?? [],
      channels: (rawSettings.channels as string[]) ?? [],
    }
  } catch (e) {
    console.error("Dashboard layout fetch error:", e)
  }

  return (
    <StoreProvider
      initialCampaigns={campaigns}
      initialProfiles={profiles}
      initialCurrentUser={currentUser}
      initialSettings={settings}
      initialTeams={teams}
    >
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </StoreProvider>
  )
}
