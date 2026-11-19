// ============================================================
// V1 Database Types — Content Marketing Planner (spec-aligned)
// ============================================================

export type AppRole = "editor" | "viewer"

// ---- Campaigns ----
/** Spec: Type = Pillar / Launch / Always-on */
export type CampaignType = "Pillar" | "Launch" | "Always-on"

/** Spec: Motion = SMB / Enterprise / Both / Retention */
export type CampaignMotion = "SMB" | "Enterprise" | "Both" | "Retention"

export type CampaignStatus = "Active" | "On Hold" | "Completed" | "Archived"

/** A team or sub-team (scripts/012): Marketing → Brand */
export interface Team {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface Campaign {
  id: string
  title: string
  description: string
  category: string
  lead_id: string | null
  icon_label: string
  icon_color: string
  status: CampaignStatus
  type: CampaignType
  motion: CampaignMotion
  product: string | null
  objective: string | null
  start_date: string | null
  end_date: string | null
  /** Owning team (scripts/012); null = shared. Missing before that migration. */
  team_id?: string | null
  /** The campaign's brief (scripts/015), given to Claude in the Social tab */
  brief?: string | null
  brief_url?: string | null
  created_at: string
  updated_at: string
}

// ---- Content Items ----
export type ContentChannel =
  | "YouTube"
  | "Instagram"
  | "LinkedIn"
  | "TikTok"
  | "Blog"
  | "Email"
  | "Twitter/X"
  | "Facebook"
  | "Website"
  | "Podcast"
  | "Webinar"
  | "Other"

export type DateConfidence = "Confirmed" | "Provisional"

/** Spec statuses: Idea / Planned / In progress / In review / Scheduled / Published */
export type ItemStatus =
  | "Idea"
  | "Planned"
  | "In progress"
  | "In review"
  | "Scheduled"
  | "Published"

/** Alias used in older code paths */
export type ContentStatus = ItemStatus

export type ContentFormat =
  | "Video"
  | "Short"
  | "Reel"
  | "Post"
  | "Article"
  | "Newsletter"
  | "Thread"
  | "Script"
  | "Edit"
  | "Thumbnail"
  | "Other"

/** Spec: contributors with role Writer / Designer / Video / Reviewer */
export type ContributorRole = "Writer" | "Designer" | "Video" | "Reviewer"

export interface Contributor {
  profile_id: string
  role: ContributorRole
}

export interface ContentItem {
  id: string
  /** Null when the item isn't tied to a campaign yet — Inbox ideas and campaign-less "single" items */
  campaign_id: string | null
  title: string
  format: ContentFormat
  status: ItemStatus
  assignee_id: string | null
  publish_date: string | null
  sort_order: number
  /** Primary channel — card colour and icon. Always channels[0] when channels is set. */
  channel: ContentChannel
  /**
   * Every channel the item is published on (scripts/011). Optional: missing
   * before that migration has run. Read it through itemChannels(), not directly.
   */
  channels?: ContentChannel[] | null
  date_confidence: DateConfidence
  content_role: string | null
  contributors: Contributor[]
  /** Target audiences — values from AUDIENCE_SEGMENTS */
  audience_segments: string[]
  notes: string | null
  brief_url: string | null
  live_url: string | null
  /** Link to the creative / final assets (scripts/012) */
  asset_url?: string | null
  /** Owning team (scripts/012); null = shared, or the campaign's team */
  team_id?: string | null
  /** Who submitted the item — used to attribute Inbox ideas */
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Idea enriched with its submitter, for the Inbox view */
export interface IdeaWithCreator extends ContentItem {
  createdBy: Profile | null
}

// ---- Comments ----
export interface ItemComment {
  id: string
  item_id: string
  author_id: string
  body: string
  created_at: string
  author?: Profile | null
}

// ---- Notifications ----
export type NotificationType = "mention" | "new_content"

export interface AppNotification {
  id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  item_id: string | null
  comment_id: string | null
  body_preview: string | null
  read_at: string | null
  created_at: string
  /** Embedded so the bell can title and route the notification */
  item?: { id: string; title: string; campaign_id: string | null; status: string } | null
}

// ---- Profiles ----
export interface Profile {
  id: string
  full_name: string
  role: string | null
  avatar_url: string | null
  timezone: string | null
  is_online: boolean
  app_role: AppRole
  /** The person's team (scripts/012): their default view */
  team_id?: string | null
  created_at: string
  updated_at: string
}

// ---- Join types ----
export interface ContentItemWithCampaign extends ContentItem {
  /** The parent campaign (full object with items) */
  campaign: CampaignWithItems
  /** Convenience denorms kept for backward compat */
  campaignTitle: string
  campaignMotion: CampaignMotion
  campaignType: CampaignType
  campaignProduct: string | null
  assignee: Profile | null
}

export interface CampaignWithItems extends Campaign {
  items: ContentItemWithCampaign[]
  lead: Profile | null
}

// ============================================================
// Design tokens — neutral cards, subtle accents only.
// Cards/chips always use bg-card + text-foreground; the motion
// colour appears ONLY as a small accent (left border or dot).
// ============================================================

/** Motion accent colour — used for a 3px left border or dot ONLY, never as text or card colour */
// Monochrome by design: colour is reserved for campaigns on the calendar.
export const MOTION_ACCENTS: Record<CampaignMotion, string> = {
  SMB:        "#8d8a85",
  Enterprise: "#5c5a56",
  Both:       "#a8a5a0",
  Retention:  "#3b3a37",
}

/** Campaign type accent — small badge tint */
export const TYPE_ACCENTS: Record<CampaignType, string> = {
  Pillar:      "#3b3a37",
  Launch:      "#6e6c68",
  "Always-on": "#a8a5a0",
}

// ---- Status: neutral badge + coloured dot only ----
/** Greyscale ramp: the further along an item is, the darker its dot. */
export const STATUS_COLORS: Record<ItemStatus, { dot: string }> = {
  Idea:          { dot: "#d0cdc7" },
  Planned:       { dot: "#b3b0aa" },
  "In progress": { dot: "#8d8a85" },
  "In review":   { dot: "#5c5a56" },
  Scheduled:     { dot: "#3b3a37" },
  Published:     { dot: "#141414" },
}

// ---- Channel icons (short marks) ----
export const CHANNEL_ICONS: Record<string, string> = {
  YouTube:   "▶",
  Instagram: "◈",
  LinkedIn:  "in",
  TikTok:    "♪",
  Blog:      "✍",
  Email:     "✉",
  "Twitter/X": "𝕏",
  Facebook:  "f",
  Website:   "◍",
  Podcast:   "◉",
  Webinar:   "⊙",
  Other:     "·",
}

/**
 * Card colour per channel. Real platforms use their brand colour; the rest
 * are picked to be distinct from those. Every value carries white text, so
 * each is dark enough for 4.5:1 contrast (YouTube is a touch deeper than
 * pure #ff0000 for that reason). Values are CSS backgrounds, so Instagram
 * can use its gradient.
 */
export const CHANNEL_COLORS: Record<string, string> = {
  YouTube:     "#e00000",
  Instagram:   "linear-gradient(135deg, #f58529 0%, #dd2a7b 45%, #8134af 75%, #515bd4 100%)",
  LinkedIn:    "#0a66c2",
  TikTok:      "#fe2c55",
  "Twitter/X": "#0f1419",
  Facebook:    "#0866ff",
  Website:     "#4338ca",
  Blog:        "#15803d",
  Email:       "#b45309",
  Podcast:     "#8b2fc9",
  Webinar:     "#0e7490",
  Other:       "#57534e",
}

export function channelBackground(channel: string | null | undefined): string {
  return (channel && CHANNEL_COLORS[channel]) || CHANNEL_COLORS.Other
}

/**
 * Every channel an item goes out on, primary first. Falls back to the single
 * `channel` when `channels` is missing (old rows, migration 011 not run yet)
 * or stale (its first value no longer matches `channel`).
 */
export function itemChannels(item: { channel: string; channels?: readonly string[] | null }): ContentChannel[] {
  const list = item.channels ?? []
  if (list.length > 0 && list[0] === item.channel) return [...new Set(list)] as ContentChannel[]
  return [item.channel as ContentChannel]
}

/**
 * The `channel` + `channels` fields to save for a picked list (primary first).
 * `channels` is only included when it carries more than `channel` does, or
 * the item already had a list — so single-channel saves keep working before
 * migration 011 has been run.
 */
export function channelFields(
  picked: readonly ContentChannel[],
  previous?: { channels?: readonly string[] | null } | null,
): { channel: ContentChannel; channels?: ContentChannel[] } {
  const list = [...new Set(picked)]
  const channel = list[0] ?? "Other"
  const hadList = (previous?.channels?.length ?? 0) > 0
  return list.length > 1 || hadList ? { channel, channels: list.length ? list : [channel] } : { channel }
}

// ---- Option lists ----
export const TYPE_OPTIONS: CampaignType[] = ["Pillar", "Launch", "Always-on"]

export const MOTION_OPTIONS: CampaignMotion[] = ["SMB", "Enterprise", "Both", "Retention"]

export const CHANNEL_OPTIONS: ContentChannel[] = [
  "YouTube", "Instagram", "LinkedIn", "TikTok", "Facebook", "Twitter/X", "Blog", "Website", "Email", "Podcast", "Webinar", "Other",
]

export const FORMAT_OPTIONS: ContentFormat[] = [
  "Video", "Short", "Reel", "Post", "Article", "Newsletter", "Thread", "Script", "Edit", "Thumbnail", "Other",
]

export const STATUS_OPTIONS: ItemStatus[] = [
  "Idea", "Planned", "In progress", "In review", "Scheduled", "Published",
]

export const CONTRIBUTOR_ROLE_OPTIONS: ContributorRole[] = ["Writer", "Designer", "Video", "Reviewer"]

/** Audience tags for content items, grouped for display. Add values here freely — the DB column has no CHECK. */
export const AUDIENCE_SEGMENT_GROUPS: { label: string; segments: string[] }[] = [
  { label: "Lifecycle stage",     segments: ["Onboarding", "Product adoption", "Upsell", "Retention", "Win-back"] },
  { label: "Subscription status", segments: ["Trial", "Free", "Paid", "Churned"] },
]
export const AUDIENCE_SEGMENTS: string[] = AUDIENCE_SEGMENT_GROUPS.flatMap(g => g.segments)

export const ROLE_OPTIONS = ["Editor", "Videographer", "Designer", "Copywriter", "Strategist", "Producer", "Other"]

export const PRODUCT_OPTIONS = [
  // Seller 365 suite
  "Seller 365",
  "AI Operator",
  "InventoryLab",
  "Tactical Arbitrage",
  "FeedbackWhiz Emails",
  "FeedbackWhiz Alerts",
  "FeedbackWhiz Profits",
  "SmartRepricer",
  "InventoryLab Accounting",
  "ScoutIQ",
  "Scoutify",
  "ScoutX",
  // Standalone products
  "Margin Pro",
  "UniCon",
  "Onsite Support",
  "Retail 365",
  "CedCommerce",
  "ExportYourStore",
  "Marketplace Pulse",
  // Brand / other
  "Threecolts (brand)",
  "Other",
]

// ---- Campaign statuses ----
export const CAMPAIGN_STATUSES: CampaignStatus[] = ["Active", "On Hold", "Completed", "Archived"]

// ---- Synthetic bucket for campaign-less content items in campaign-shaped views ----
export const NO_CAMPAIGN_ID = "__no_campaign__"
export const NO_CAMPAIGN_LABEL = "No campaign"

// Solid card colour per campaign, derived from the id (the stored icon_color is
// a Tailwind class most campaigns leave at the same default). Every shade is
// dark enough for white text to stay readable (contrast ≥ 4.5:1).
const CAMPAIGN_PALETTE = [
  "#2563eb", // blue
  "#047857", // emerald
  "#dc2626", // red
  "#b45309", // amber
  "#7c3aed", // violet
  "#0e7490", // cyan
  "#be185d", // pink
  "#4d7c0f", // lime
  "#c2410c", // orange
  "#4f46e5", // indigo
]
const NO_CAMPAIGN_COLOR = "#57534e"

export function campaignColor(campaignId: string | null | undefined): string {
  if (!campaignId || campaignId === NO_CAMPAIGN_ID) return NO_CAMPAIGN_COLOR
  let hash = 0
  for (let i = 0; i < campaignId.length; i++) hash = (hash * 31 + campaignId.charCodeAt(i)) | 0
  return CAMPAIGN_PALETTE[Math.abs(hash) % CAMPAIGN_PALETTE.length]
}

// ---- Misc ----
export const ICON_COLORS = [
  "bg-indigo-500", "bg-emerald-500", "bg-rose-500", "bg-violet-500",
  "bg-amber-500",  "bg-cyan-500",    "bg-teal-500", "bg-blue-500",
  "bg-orange-500", "bg-pink-500",    "bg-slate-600",
]


export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
