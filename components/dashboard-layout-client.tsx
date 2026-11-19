"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { TopBar } from "@/components/top-bar"
import { OnboardingTour } from "@/components/onboarding-tour"
import { useStore } from "@/lib/store"
import { useRefreshData } from "@/components/data-provider"
import { createClient } from "@/lib/supabase/client"

/**
 * Team members start on the Library when they open the app (once per browser
 * session, and only from the home page), so a deep link still lands where it points.
 */
function TeamLanding() {
  const { currentUser, teams } = useStore()
  const pathname = usePathname()
  const router = useRouter()
  const hasTeam = !!currentUser?.team_id && teams.some(t => t.id === currentUser.team_id)
  useEffect(() => {
    if (!currentUser || !hasTeam) return
    const key = `content-calendar:landed:v1:${currentUser.id}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch { return }
    if (pathname === "/" && !window.location.search) router.replace("/library")
    // Only on the first render of a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, hasTeam])
  return null
}

/**
 * Scheduled items whose date has come are Published (scripts/017). Runs once
 * when the app opens; does nothing before that migration has run.
 */
function AutoPublish() {
  const { currentUser } = useStore()
  const { refreshCampaigns } = useRefreshData()
  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    createClient().rpc("publish_due_items").then(({ data, error }) => {
      if (!cancelled && !error && typeof data === "number" && data > 0) refreshCampaigns()
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])
  return null
}

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main>{children}</main>
      <OnboardingTour />
      <TeamLanding />
      <AutoPublish />
    </div>
  )
}
