"use client"

import { createClient } from "@/lib/supabase/client"
import type { AppNotification, Campaign, ContentItem, ContentItemWithCampaign, IdeaWithCreator, ItemComment, Profile, CampaignWithItems, Team } from "./database.types"
import { NO_CAMPAIGN_ID, NO_CAMPAIGN_LABEL } from "./database.types"

// ---- Teams (scripts/012) ----

/**
 * The team new work is filed under: set by the store from the team view
 * you're in, so anything created in the Brand view belongs to Brand.
 * Null in the main view, and whenever teams aren't set up yet.
 */
let writeTeamId: string | null = null
export function setWriteTeam(teamId: string | null) { writeTeamId = teamId }
const withTeam = <T extends { team_id?: string | null }>(row: T): T =>
  writeTeamId && row.team_id === undefined ? { ...row, team_id: writeTeamId } : row

/** Teams, or [] if scripts/012 hasn't run yet (the app then works as before) */
export async function getTeamsClient(): Promise<Team[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from("teams").select("*").order("sort_order").order("name")
  if (error) return []
  return (data ?? []) as Team[]
}

export async function createTeamClient(input: { name: string; parent_id: string | null }): Promise<Team> {
  const supabase = createClient()
  const { data, error } = await supabase.from("teams").insert({ name: input.name.trim(), parent_id: input.parent_id }).select().single()
  if (error) throw error
  return data as Team
}

export async function updateTeamClient(id: string, updates: Partial<Pick<Team, "name" | "parent_id" | "sort_order">>): Promise<Team> {
  const supabase = createClient()
  const { data, error } = await supabase.from("teams").update(updates).eq("id", id).select().single()
  if (error) throw error
  return data as Team
}

export async function deleteTeamClient(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("teams").delete().eq("id", id)
  if (error) throw error
}

// ---- Avatar ----

export async function uploadAvatarClient(userId: string, file: File): Promise<string> {
  const supabase = createClient()
  if (file.size > 5 * 1024 * 1024) throw new Error("Image too large. Please choose an image under 5MB.")
  const ext = file.name.split(".").pop()?.toLowerCase() || "png"
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from("avatars").getPublicUrl(path)
  return data.publicUrl
}

// ---- Profile mutations ----

export async function updateProfileClient(id: string, updates: Partial<Profile>): Promise<Profile> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("profiles").update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single()
  if (error) throw error
  return data as Profile
}

export async function getCurrentUserProfileClient(): Promise<Profile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  return (data ?? null) as Profile | null
}

export async function getProfilesClient(): Promise<Profile[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from("profiles").select("*").order("full_name")
  if (error) throw error
  return (data ?? []) as Profile[]
}

// ---- Campaign mutations ----

export async function createCampaignClient(
  campaign: Partial<Omit<Campaign, "id" | "created_at" | "updated_at">> & { title: string }
): Promise<Campaign> {
  const supabase = createClient()
  const { data, error } = await supabase.from("campaigns").insert(withTeam(campaign)).select().single()
  if (error) throw error
  return data as Campaign
}

export async function updateCampaignClient(id: string, updates: Partial<Campaign>): Promise<Campaign> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("campaigns").update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single()
  if (error) throw error
  return data as Campaign
}

export async function deleteCampaignClient(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("campaigns").delete().eq("id", id)
  if (error) throw error
}

// ---- Content item mutations ----

export async function createContentItemClient(
  item: Partial<Omit<ContentItem, "id" | "created_at" | "updated_at">> & { campaign_id: string | null; title: string }
): Promise<ContentItem> {
  const supabase = createClient()
  // An item in a campaign takes the campaign's team (database trigger), so only campaign-less items are tagged here
  const { data, error } = await supabase.from("content_items").insert(item.campaign_id ? item : withTeam(item)).select().single()
  if (error) throw error
  return data as ContentItem
}

/** Insert many content items in one round trip — used by bulk imports so a mid-batch failure doesn't leave a half-written campaign. */
export async function createContentItemsClient(
  items: (Partial<Omit<ContentItem, "id" | "created_at" | "updated_at">> & { campaign_id: string | null; title: string })[]
): Promise<ContentItem[]> {
  if (items.length === 0) return []
  const supabase = createClient()
  const { data, error } = await supabase.from("content_items").insert(items.map(i => (i.campaign_id ? i : withTeam(i)))).select()
  if (error) throw error
  return (data ?? []) as ContentItem[]
}

export async function updateContentItemClient(id: string, updates: Partial<ContentItem>): Promise<ContentItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("content_items").update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single()
  if (error) throw error
  return data as ContentItem
}

export async function deleteContentItemClient(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("content_items").delete().eq("id", id)
  if (error) throw error
}

/**
 * Delete many items in one statement. Returns the ids actually deleted: rows
 * another team owns are skipped by the database, not an error.
 */
export async function deleteContentItemsClient(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await createClient().from("content_items").delete().in("id", ids).select("id")
  if (error) throw error
  return (data ?? []).map(r => r.id as string)
}

/**
 * Re-parent many items to one campaign in a single statement, so a bulk move
 * can't half-apply. Pass null to detach the items from any campaign.
 */
export async function moveContentItemsClient(ids: string[], campaignId: string | null): Promise<void> {
  if (ids.length === 0) return
  const supabase = createClient()
  const { error } = await supabase
    .from("content_items")
    .update({ campaign_id: campaignId, updated_at: new Date().toISOString() })
    .in("id", ids)
  if (error) throw error
}

// ---- Full data fetch (client) ----

export async function getCampaignsWithItemsClient(): Promise<CampaignWithItems[]> {
  const supabase = createClient()
  const [{ data: campaigns, error: cErr }, { data: items, error: iErr }, profiles] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("content_items").select("*").order("publish_date", { ascending: true }),
    getProfilesClient(),
  ])
  if (cErr) throw cErr
  if (iErr) throw iErr
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

  // Build campaign shells first (without items, items added in second pass)
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

  // Attach items with back-reference to parent campaign shell
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

/** Raw ideas: campaign-less content items with status "Idea", newest last */
export async function getIdeasClient(): Promise<IdeaWithCreator[]> {
  const supabase = createClient()
  const [{ data, error }, profiles] = await Promise.all([
    supabase
      .from("content_items")
      .select("*")
      .is("campaign_id", null)
      .eq("status", "Idea")
      .order("created_at", { ascending: true }),
    getProfilesClient(),
  ])
  if (error) throw error
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))
  return ((data ?? []) as ContentItem[]).map((idea) => ({
    ...idea,
    createdBy: idea.created_by ? (profileMap[idea.created_by] ?? null) : null,
  }))
}

/** Quick-capture an idea — lightweight: just a title and optional notes */
export async function createIdeaClient(input: { title: string; notes?: string | null; createdById?: string | null; teamId?: string | null }): Promise<ContentItem> {
  const supabase = createClient()
  const row: Record<string, unknown> = {
    title: input.title,
    notes: input.notes || null,
    status: "Idea",
    campaign_id: null,
    created_by: input.createdById ?? null,
  }
  // A request sent to a team (teamId) or captured inside a team's view
  const team = input.teamId !== undefined ? input.teamId : writeTeamId
  if (team) row.team_id = team
  const { data, error } = await supabase
    .from("content_items")
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data as ContentItem
}

/** Promote an idea to a standalone, campaign-less content item */
export async function promoteIdeaToItemClient(id: string): Promise<ContentItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("content_items")
    .update({ status: "Planned", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data as ContentItem
}

/** Promote an idea by attaching it to a (usually newly created) campaign */
export async function promoteIdeaToCampaignClient(id: string, campaignId: string): Promise<ContentItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("content_items")
    .update({ campaign_id: campaignId, status: "Planned", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data as ContentItem
}

// ---- Settings ----

export async function upsertSettingClient(key: string, value: unknown): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("settings").upsert({ key, value })
  if (error) throw error
}

// ---- Comments ----

export async function getItemCommentsClient(itemId: string): Promise<ItemComment[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("comments")
    .select("*, author:profiles(*)")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as ItemComment[]
}

export async function addItemCommentClient(itemId: string, body: string): Promise<ItemComment> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")
  const { data, error } = await supabase
    .from("comments")
    .insert({ item_id: itemId, author_id: user.id, body })
    .select("*, author:profiles(*)")
    .single()
  if (error) throw error
  // Mentions also go to Slack — in the background, never blocking the comment
  if (/@\[[^\]]*\]\([0-9a-fA-F-]{36}\)/.test(body)) sendSlackNotifications({ commentId: (data as ItemComment).id })
  return data as ItemComment
}

export async function deleteItemCommentClient(commentId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("comments").delete().eq("id", commentId)
  if (error) throw error
}

// ---- Notifications ----
// RLS limits every query here to the signed-in user's own notifications.

export async function getNotificationsClient(limit = 20): Promise<AppNotification[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("notifications")
    .select("*, item:content_items(id, title, campaign_id, status)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

export async function markNotificationReadClient(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
}

export async function markAllNotificationsReadClient(): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null)
  if (error) throw error
}

/** Notify every other team member that this item has been started (editors only, enforced in SQL). */
export async function notifyTeamClient(itemId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc("notify_team", { p_item_id: itemId })
  if (error) throw error
  sendSlackNotifications({ itemId })
}

/** Mirror the notifications an action just created to Slack DMs. Fire-and-forget: Slack being down or not set up never affects the app. */
function sendSlackNotifications(body: { commentId: string } | { itemId: string }) {
  fetch("/api/slack-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {})
}
