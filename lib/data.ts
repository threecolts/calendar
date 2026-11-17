import { createClient } from "@/lib/supabase/server"
import type {
  Campaign,
  CampaignWithItems,
  ContentItem,
  ContentItemWithCampaign,
  Profile,
  Team,
} from "@/lib/database.types"
import { NO_CAMPAIGN_ID, NO_CAMPAIGN_LABEL } from "@/lib/database.types"

// ---- Profiles ----

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("profiles").select("*").order("full_name")
  if (error) { console.error("getProfiles:", error.message); return [] }
  return (data ?? []) as Profile[]
}

export async function getCurrentUserProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  return (data ?? null) as Profile | null
}

export async function updateProfile(id: string, updates: Partial<Profile>): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single()
  if (error) throw error
  return data as Profile
}

// ---- Campaigns ----

export async function getCampaignsWithItems(): Promise<CampaignWithItems[]> {
  const supabase = await createClient()
  const [
    { data: campaigns, error: cErr },
    { data: items, error: iErr },
    profiles,
  ] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("content_items").select("*").order("publish_date", { ascending: true }),
    getProfiles(),
  ])
  if (cErr) { console.error("getCampaigns:", cErr.message); return [] }
  if (iErr) { console.error("getItems:", iErr.message) }
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

  // Build campaign shells, then attach items with a campaign back-reference
  const campaignMap: Record<string, CampaignWithItems> = {}
  for (const c of (campaigns ?? []) as Campaign[]) {
    campaignMap[c.id] = {
      ...c,
      items: [],
      lead: c.lead_id ? (profileMap[c.lead_id] ?? null) : null,
    }
  }

  // Synthetic bucket for content items that aren't tied to a campaign (e.g.
  // ideas promoted straight to a standalone item). Raw Inbox ideas
  // (status === "Idea" with no campaign) are intentionally excluded — they
  // only live in the Inbox until promoted.
  campaignMap[NO_CAMPAIGN_ID] = {
    id: NO_CAMPAIGN_ID,
    title: NO_CAMPAIGN_LABEL,
    description: "",
    category: "",
    lead_id: null,
    icon_label: "—",
    icon_color: "bg-slate-600",
    status: "Active",
    type: "Always-on",
    motion: "Both",
    product: null,
    objective: null,
    start_date: null,
    end_date: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    items: [],
    lead: null,
  }

  for (const item of (items ?? []) as ContentItem[]) {
    if (item.campaign_id === null && item.status === "Idea") continue
    const parent = campaignMap[item.campaign_id ?? NO_CAMPAIGN_ID]
    if (!parent) continue
    const enriched: ContentItemWithCampaign = {
      ...item,
      campaign: parent,
      campaignTitle: parent.title,
      campaignMotion: parent.motion,
      campaignType: parent.type,
      campaignProduct: parent.product ?? null,
      contributors: item.contributors ?? [],
      audience_segments: item.audience_segments ?? [],
      assignee: item.assignee_id ? (profileMap[item.assignee_id] ?? null) : null,
    }
    parent.items.push(enriched)
  }
  return Object.values(campaignMap).filter(c => c.id !== NO_CAMPAIGN_ID || c.items.length > 0)
}

// ---- Ideas (Inbox) ----

/** Raw ideas: campaign-less content items with status "Idea", oldest first */
export async function getIdeas(): Promise<import("@/lib/database.types").IdeaWithCreator[]> {
  const supabase = await createClient()
  const [{ data, error }, profiles] = await Promise.all([
    supabase
      .from("content_items")
      .select("*")
      .is("campaign_id", null)
      .eq("status", "Idea")
      .order("created_at", { ascending: true }),
    getProfiles(),
  ])
  if (error) { console.error("getIdeas:", error.message); return [] }
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))
  return ((data ?? []) as ContentItem[]).map((idea) => ({
    ...idea,
    createdBy: idea.created_by ? (profileMap[idea.created_by] ?? null) : null,
  }))
}

// ---- Settings ----

/** Teams, or [] if scripts/012 hasn't run yet */
export async function getTeams(): Promise<Team[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("teams").select("*").order("sort_order").order("name")
  if (error) return []
  return (data ?? []) as Team[]
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const supabase = await createClient()
  const { data } = await supabase.from("settings").select("*")
  return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]))
}
