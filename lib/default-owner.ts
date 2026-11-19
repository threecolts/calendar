import type { ContentChannel, ContentFormat, Profile } from "@/lib/database.types"

/**
 * Who owns new Brand work by default (Lionel's rules, Nov 2026):
 * social and blog → Angela, video and design → Lionel, website copy → Monika.
 * Campaign leads (Nora) sit on the campaign, not on items.
 * Matched by first name, so it keeps working if people's titles change.
 */
const VIDEO_FORMATS = new Set<string>(["Video", "Short", "Reel", "Edit", "Thumbnail"])
const SOCIAL = new Set<string>(["Instagram", "LinkedIn", "TikTok", "Facebook", "Twitter/X", "Blog"])

export function defaultOwnerName(channel: ContentChannel | string, format: ContentFormat | string): string | null {
  if (VIDEO_FORMATS.has(format) || channel === "YouTube") return "Lionel"
  if (channel === "Website") return "Monika"
  if (SOCIAL.has(channel)) return "Angela"
  return null
}

export function defaultOwnerId(channel: ContentChannel | string, format: ContentFormat | string, profiles: Profile[]): string | null {
  const name = defaultOwnerName(channel, format)
  if (!name) return null
  return profiles.find(p => p.full_name?.toLowerCase().startsWith(name.toLowerCase()))?.id ?? null
}
