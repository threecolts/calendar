"use client"

import type { ContentItemWithCampaign } from "@/lib/database.types"
import { campaignColor, channelBackground, itemChannels } from "@/lib/database.types"
import { ChannelIcon } from "@/components/channel-icon"
import { useStore } from "@/lib/store"
import { Avatar } from "@/components/kit"

interface Props {
  item: ContentItemWithCampaign
  onClick: () => void
  /** Omit to make the chip read-only (viewers, other teams' work) */
  onDragStart?: (e: React.DragEvent) => void
  compact?: boolean
  /** Dims items that belong to the previous / next month shown around the current one. */
  muted?: boolean
}

/**
 * Calendar chip — filled with its channel's colour (YouTube red, LinkedIn
 * blue, …), white text, no border. Title is capped at two lines (full title
 * on hover); the bottom line has the campaign dot + name and the platform
 * icon(s) on the right — one per channel, the first (primary) sets the colour. Provisional dates get a "TBC" tag; published items are
 * faded.
 */
export function ContentItemChip({ item, onClick, onDragStart, compact, muted }: Props) {
  const isProvisional = item.date_confidence === "Provisional"
  const channels = itemChannels(item)
  // The owner's face, bottom left: who's on it at a glance (fresh from the store, so a new photo shows at once)
  const { profiles } = useStore()
  const owner = (item.assignee_id && profiles.find(p => p.id === item.assignee_id)) || item.assignee

  return (
    <div
      data-tour="cal-card"
      role="button"
      tabIndex={0}
      draggable={!!onDragStart}
      onClick={onClick}
      onDragStart={onDragStart}
      onKeyDown={e => { if (e.key === "Enter") onClick() }}
      title={`${channels.join(", ")} · ${item.title}${owner ? `\nOwner: ${owner.full_name}` : ""}\nCampaign: ${item.campaignTitle} · ${item.status}${isProvisional ? " (Provisional)" : ""}${onDragStart ? "\nDrag to reschedule" : ""}`}
      style={{ background: channelBackground(item.channel) }}
      className={`rounded-lg px-2.5 py-2 text-white ${onDragStart ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} select-none transition-[filter,opacity] hover:brightness-110 ${
        item.status === "Published" || muted ? "opacity-50" : ""
      }`}
    >
      <span className={`text-[12px] font-medium leading-snug break-words ${compact ? "block truncate" : "line-clamp-2"}`}>{item.title}</span>
      {!compact && (
        <span className="flex items-center gap-1.5 mt-1.5 text-[10.5px] font-medium leading-tight text-white/90 min-w-0">
          {owner && <Avatar src={owner.avatar_url} name={owner.full_name} size={18} className="border-white/80 ring-1 ring-white/40" />}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 ring-[1.5px] ring-white/90"
            style={{ background: campaignColor(item.campaign_id) }}
            aria-hidden="true"
          />
          <span className="truncate flex-1 min-w-0">{item.campaignTitle}</span>
          {isProvisional && (
            <span className="flex-shrink-0 rounded-full bg-black/20 px-1.5 text-[10px] font-semibold leading-4">TBC</span>
          )}
          <span className="flex-shrink-0 flex items-center gap-1" aria-label={channels.join(", ")}>
            {channels.slice(0, 3).map(c => <ChannelIcon key={c} channel={c} />)}
            {channels.length > 3 && <span className="text-[10px] leading-none">+{channels.length - 3}</span>}
          </span>
        </span>
      )}
    </div>
  )
}
