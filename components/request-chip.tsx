"use client"

import Link from "next/link"
import { Clapperboard, PenTool, ClipboardList } from "lucide-react"
import { isOverdue, type Request } from "@/lib/requests"
import { cx } from "@/components/kit"

/** A request's due date on the calendar: links to the request, never draggable */
export function RequestChip({ request, muted }: { request: Request; muted?: boolean }) {
  const Icon = request.kind === "video" ? Clapperboard : request.kind === "design" ? PenTool : ClipboardList
  const late = isOverdue(request)
  const done = request.status === "Delivered"
  return (
    <Link
      href={`/requests?request=${request.id}`}
      title={`Request due: ${request.title} (${request.status})`}
      className={cx(
        "flex items-center gap-1.5 rounded-md border border-dashed px-1.5 py-1 text-[11px] leading-tight transition-colors",
        late ? "border-error/60 text-error" : "border-outline-variant text-on-surface",
        done && "opacity-60 line-through",
        muted && "opacity-50",
        "hover:bg-surface-container-low",
      )}
    >
      <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span className="truncate"><span className="font-medium">Due</span> · {request.title}</span>
    </Link>
  )
}
