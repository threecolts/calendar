"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, List,
  Sparkles, Download, Columns, SlidersHorizontal
} from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import { useRefreshData } from "@/components/data-provider"
import { updateContentItemClient, moveContentItemsClient } from "@/lib/data-client"
import type { ContentItemWithCampaign, ItemStatus } from "@/lib/database.types"
import {
  CHANNEL_ICONS,
  CHANNEL_OPTIONS, MOTION_OPTIONS, STATUS_OPTIONS, PRODUCT_OPTIONS,
  NO_CAMPAIGN_ID, AUDIENCE_SEGMENTS, campaignColor, channelBackground
} from "@/lib/database.types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button, SegmentedControl, buttonCls, cx, fieldSmCls, linkCls } from "@/components/kit"
import { ContentItemChip } from "@/components/content-item-chip"
import { ContentItemDialog } from "@/components/content-item-dialog"
import { ImportPlanDialog } from "@/components/import-plan-dialog"
import { ExportCalendarDialog } from "@/components/export-calendar-dialog"

// ─── date helpers ────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Full Mon–Sun grid for the month, padded so columns align */
function monthGrid(year: number, month: number): (string | null)[][] {
  const weeks: (string | null)[][] = []
  let current: (string | null)[] = []
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)

  // Front-pad so day 1 lands in its Mon(0)..Sun(6) column
  const firstDow = first.getDay() // 0=Sun..6=Sat
  const firstCol = firstDow === 0 ? 6 : firstDow - 1
  for (let i = 0; i < firstCol; i++) current.push(null)

  for (let d = 1; d <= last.getDate(); d++) {
    current.push(toDateStr(new Date(year, month, d)))
    if (current.length === 7) {
      weeks.push(current)
      current = []
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null)
    weeks.push(current)
  }
  return weeks
}

/**
 * Six full Mon–Sun weeks around the month, filled with real dates from the
 * previous and next month (like Apple Calendar) so you can see what's coming
 * up next month without leaving this one.
 */
function monthGridWithNeighbours(year: number, month: number): string[][] {
  const first = new Date(year, month, 1)
  const col = (first.getDay() + 6) % 7 // Mon=0 … Sun=6
  const start = new Date(year, month, 1 - col)
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) =>
      toDateStr(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)),
    ),
  )
}

/** Full Mon–Sun of the week containing `date` */
function currentWeekDays(date: Date): (string | null)[] {
  const dow = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toDateStr(d)
  })
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
]

type ViewMode = "month" | "week" | "list"

// ─── component ───────────────────────────────────────────────────────────────

export function ContentCalendar() {
  const { campaigns, profiles, setCampaigns } = useStore()
  const { refreshCampaigns } = useRefreshData()
  const isEditor = useIsEditor()

  const today       = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedView, setView] = useState<ViewMode>("month")
  // Month/week grids are unreadable at phone width, so phones always get the list.
  const isMobile = useIsMobile()
  const view: ViewMode = isMobile ? "list" : selectedView

  // week nav for week view
  const [weekAnchor, setWeekAnchor] = useState(today)

  // filters — synced with URL so filtered views are shareable
  const [filterCampaign, setFilterCampaign] = useState("All")
  const [filterChannel,  setFilterChannel]  = useState("All")
  const [filterAssignee, setFilterAssignee] = useState("All")
  const [filterMotion,   setFilterMotion]   = useState("All")
  const [filterProduct,  setFilterProduct]  = useState("All")
  const [filterStatus,   setFilterStatus]   = useState("All")
  const [filterSegment,  setFilterSegment]  = useState("All")

  // Read filters from URL on mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("campaign")) setFilterCampaign(p.get("campaign")!)
    if (p.get("channel"))  setFilterChannel(p.get("channel")!)
    if (p.get("assignee")) setFilterAssignee(p.get("assignee")!)
    if (p.get("motion"))   setFilterMotion(p.get("motion")!)
    if (p.get("product"))  setFilterProduct(p.get("product")!)
    if (p.get("status"))   setFilterStatus(p.get("status")!)
    if (p.get("segment"))  setFilterSegment(p.get("segment")!)
  }, [])

  // Write filters back to URL (shareable links)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const setOrDelete = (k: string, v: string) => (v !== "All" ? p.set(k, v) : p.delete(k))
    setOrDelete("campaign", filterCampaign)
    setOrDelete("channel",  filterChannel)
    setOrDelete("assignee", filterAssignee)
    setOrDelete("motion",   filterMotion)
    setOrDelete("product",  filterProduct)
    setOrDelete("status",   filterStatus)
    setOrDelete("segment",  filterSegment)
    const qs = p.toString()
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }, [filterCampaign, filterChannel, filterAssignee, filterMotion, filterProduct, filterStatus, filterSegment])

  // Drop the selection whenever the visible set changes, so nothing stays
  // selected off-screen and gets moved by surprise.
  useEffect(() => {
    setSelectedIds(new Set())
    setMoveTarget("")
    setMoveError("")
  }, [view, year, month, filterCampaign, filterChannel, filterAssignee, filterMotion, filterProduct, filterStatus, filterSegment])

  // dialogs
  const [selectedItem, setSelectedItem] = useState<ContentItemWithCampaign | null>(null)
  /** A just-duplicated item to open as soon as it shows up in the refreshed data */
  const [openWhenLoaded, setOpenWhenLoaded] = useState<string | null>(null)
  const [newItemDate,  setNewItemDate]   = useState<string | null>(null)
  const [importOpen,   setImportOpen]    = useState(false)
  const [exportOpen,   setExportOpen]    = useState(false)

  // drag & drop
  const dragItem  = useRef<ContentItemWithCampaign | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  // bulk selection (list view)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [moveTarget,  setMoveTarget]  = useState("")
  const [moving,      setMoving]      = useState(false)
  const [moveError,   setMoveError]   = useState("")

  // ── flatten all items ──────────────────────────────────────────────────────

  const allItems: ContentItemWithCampaign[] = useMemo(() =>
    campaigns.flatMap(c =>
      (c.items || []).map(item => ({ ...item, campaign: c }))
    ), [campaigns])

  // After Duplicate, swap the open dialog over to the new copy once it's loaded
  useEffect(() => {
    if (!openWhenLoaded) return
    const copy = allItems.find(i => i.id === openWhenLoaded)
    if (copy) { setSelectedItem(copy); setOpenWhenLoaded(null) }
  }, [allItems, openWhenLoaded])

  // ── deep link: /?item=<id> (from a notification) opens that item ─────────

  const itemParam = useSearchParams().get("item")
  const openedForRef    = useRef<string | null>(null)
  const refreshedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!itemParam || openedForRef.current === itemParam) return
    const found = allItems.find(i => i.id === itemParam)
    if (found) {
      openedForRef.current = itemParam
      setSelectedItem(found)
      const p = new URLSearchParams(window.location.search)
      p.delete("item")
      const qs = p.toString()
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
    } else if (refreshedForRef.current !== itemParam) {
      // Probably created by a teammate since this page loaded — fetch once.
      refreshedForRef.current = itemParam
      refreshCampaigns()
    }
  }, [itemParam, allItems]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── apply filters ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => allItems.filter(item => {
    if (filterCampaign !== "All" && item.campaign_id !== filterCampaign) return false
    if (filterChannel  !== "All" && item.channel  !== filterChannel)     return false
    if (filterAssignee !== "All" && item.assignee_id !== filterAssignee) return false
    if (filterMotion   !== "All" && item.campaign.motion !== filterMotion) return false
    if (filterProduct  !== "All" && item.campaign.product !== filterProduct) return false
    if (filterStatus   !== "All" && item.status !== filterStatus) return false
    if (filterSegment  !== "All" && !(item.audience_segments ?? []).includes(filterSegment)) return false
    return true
  }), [allItems, filterCampaign, filterChannel, filterAssignee, filterMotion, filterProduct, filterStatus, filterSegment])

  // ── navigation ─────────────────────────────────────────────────────────────

  const goBack = () => {
    if (view === "week") {
      const d = new Date(weekAnchor)
      d.setDate(d.getDate() - 7)
      setWeekAnchor(d)
    } else {
      if (month === 0) { setYear(y => y - 1); setMonth(11) }
      else setMonth(m => m - 1)
    }
  }

  const goForward = () => {
    if (view === "week") {
      const d = new Date(weekAnchor)
      d.setDate(d.getDate() + 7)
      setWeekAnchor(d)
    } else {
      if (month === 11) { setYear(y => y + 1); setMonth(0) }
      else setMonth(m => m + 1)
    }
  }

  const navLabel = view === "week"
    ? (() => {
        const days = currentWeekDays(weekAnchor).filter(Boolean) as string[]
        const start = parseDateStr(days[0])
        const end   = parseDateStr(days[days.length - 1])
        return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`
      })()
    : `${MONTHS[month]} ${year}`

  // ── item helpers ──────────────────────────────────────────────────────────

  const itemsForDate = (date: string) =>
    filtered.filter(item => item.publish_date === date && item.status !== "Idea")

  // Spec: the unscheduled lane holds ideas and anything without a publish date
  const unscheduled = filtered.filter(item => !item.publish_date || item.status === "Idea")

  // ── drag & drop ──────────────────────────────────────────────────────────

  const handleDragStart = (item: ContentItemWithCampaign, e: React.DragEvent) => {
    dragItem.current = item
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDrop = async (date: string | null, e: React.DragEvent) => {
    e.preventDefault()
    const item = dragItem.current
    dragItem.current = null
    setDragOverDate(null)
    if (!item || item.publish_date === date) return

    // Spec: dragging an Idea onto a date promotes it to Planned
    const patch: { publish_date: string | null; status?: ItemStatus } =
      date && item.status === "Idea"
        ? { publish_date: date, status: "Planned" }
        : { publish_date: date }

    // optimistic
    setCampaigns(campaigns.map(c => {
      if (c.id !== item.campaign_id) return c
      return { ...c, items: (c.items || []).map(it =>
        it.id === item.id ? { ...it, ...patch } : it
      )}
    }))
    try {
      await updateContentItemClient(item.id, patch)
    } catch {
      refreshCampaigns()
    }
  }

  // ── open helpers ─────────────────────────────────────────────────────────���

  const openItem = (item: ContentItemWithCampaign) => setSelectedItem(item)
  const openNew  = (date: string | null) => setNewItemDate(date ?? "")

  // ── bulk selection ────────────────────────────────────────────────────────

  const toggleSelected = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setManySelected = (ids: string[], on: boolean) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const clearSelection = () => { setSelectedIds(new Set()); setMoveTarget(""); setMoveError("") }

  const handleBulkMove = async () => {
    if (selectedIds.size === 0) return
    setMoving(true); setMoveError("")
    try {
      // "" means detach — NO_CAMPAIGN_ID is a synthetic UI id, never a real row
      await moveContentItemsClient([...selectedIds], moveTarget || null)
      await refreshCampaigns()
      clearSelection()
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : "Failed to move items")
    } finally {
      setMoving(false)
    }
  }

  // ── cell renderer ─────────────────────────────────────────────────────────

  const renderCell = (date: string | null, mini = false, outside = false) => {
    const isToday   = date === toDateStr(today)
    const isTarget  = date !== null && date === dragOverDate
    const parsed    = date ? parseDateStr(date) : null
    const dayNum    = parsed ? parsed.getDate() : null
    // Label the 1st of any month with its name ("1 Nov"), as Apple Calendar does
    const dayLabel  = parsed && dayNum === 1 && !mini ? `1 ${MONTHS[parsed.getMonth()].slice(0, 3)}` : dayNum
    const items     = date ? itemsForDate(date) : []

    return (
      <div
        onDragOver={e => { e.preventDefault(); if (date) setDragOverDate(date) }}
        onDragLeave={() => { if (dragOverDate === date) setDragOverDate(null) }}
        onDrop={e => handleDrop(date, e)}
        className={`flex-1 flex flex-col gap-1 p-1.5 sm:p-2 transition-colors ${
          !date || outside ? "bg-surface-container-low/40" : ""
        } ${isToday ? "bg-surface-container-lowest" : ""} ${
          isTarget ? "bg-surface-container-low ring-2 ring-inset ring-on-surface/25" : ""
        }`}
      >
        {date && (
          <div className="flex items-center justify-between mb-0.5">
            <span className={`text-xs font-medium leading-none tabular-nums ${
              isToday
                ? "bg-primary text-primary-foreground min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center"
                : outside ? "text-on-surface-variant/50" : "text-on-surface-variant"
            }`}>{dayLabel}</span>
            {!mini && (
              <button
                onClick={() => openNew(date)}
                className="opacity-0 group-hover/cell:opacity-100 h-5 w-5 rounded-full flex items-center justify-center hover:bg-surface-container-low transition-all"
              >
                <Plus className="h-3 w-3 text-on-surface-variant" />
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {items.map(item => (
            <ContentItemChip
              key={item.id}
              item={item}
              onClick={() => openItem(item)}
              onDragStart={e => handleDragStart(item, e)}
              muted={outside}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── month grid ────────────────────────────────────────────────────────────

  const renderMonthGrid = () => {
    const grid = monthGridWithNeighbours(year, month)
    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`
    return (
      <div className="rounded-xl border border-border overflow-hidden bg-surface-bright">
        {/* weekday headers */}
        <div className="grid grid-cols-7 border-b border-border bg-surface-container-low">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center py-2.5 text-[13px] text-on-surface-variant">
              {d}
            </div>
          ))}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0 divide-x divide-border">
            {week.map((date, di) => (
              <div key={di} className="min-h-[110px] group/cell flex flex-col">
                {renderCell(date, false, !date.startsWith(monthPrefix))}
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // ── week grid ─────────────────────────────────────────────────────────────

  const renderWeekGrid = () => {
    const days = currentWeekDays(weekAnchor)
    return (
      <div className="rounded-xl border border-border overflow-hidden bg-surface-bright">
        <div className="grid grid-cols-7 border-b border-border bg-surface-container-low">
          {days.map((date, i) => {
            const isToday = date === toDateStr(today)
            const d = date ? parseDateStr(date) : null
            return (
              <div key={i} className="text-center py-3">
                <div className="text-[13px] text-on-surface-variant">{DAY_LABELS[i]}</div>
                {d && (
                  <div className={`mx-auto mt-1 h-8 w-8 rounded-full flex items-center justify-center text-base font-semibold tabular-nums ${
                    isToday ? "bg-primary text-primary-foreground" : "text-on-surface"
                  }`}>{d.getDate()}</div>
                )}
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-7 divide-x divide-border">
          {days.map((date, di) => (
            <div key={di} className="min-h-[300px] group/cell flex flex-col">
              {renderCell(date)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── list view ─────────────────────────────────────────────────────────────

  const renderListView = () => {
    const grid = monthGrid(year, month)
    return (
      <div className="flex flex-col gap-6">
        {grid.map((week, wi) => {
          const dates = week.filter(Boolean) as string[]
          const items = dates.flatMap(d => itemsForDate(d))
          if (!items.length) return null
          const start = parseDateStr(dates[0])
          const end   = parseDateStr(dates[dates.length - 1])
          const done  = items.filter(i => i.status === "Published").length
          const weekIds = items.map(i => i.id)
          const selectedInWeek  = weekIds.filter(id => selectedIds.has(id)).length
          const weekAllSelected  = selectedInWeek === weekIds.length && weekIds.length > 0
          const weekSomeSelected = selectedInWeek > 0
          return (
            <div key={wi} className="rounded-xl border border-border overflow-hidden bg-surface-bright">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-container-low border-b border-border">
                {isEditor && (
                  <input
                    type="checkbox"
                    checked={weekAllSelected}
                    ref={el => { if (el) el.indeterminate = weekSomeSelected && !weekAllSelected }}
                    onChange={e => setManySelected(weekIds, e.target.checked)}
                    className="h-4 w-4 rounded border-outline-variant accent-primary cursor-pointer flex-shrink-0"
                    aria-label={`Select all items in week ${wi + 1}`}
                  />
                )}
                <span className="text-sm font-medium text-on-surface">
                  Week {wi + 1} — {MONTHS[start.getMonth()].slice(0,3)} {start.getDate()}–{end.getDate()}
                </span>
                <span className="ml-auto text-xs text-on-surface-variant">{done}/{items.length} published</span>
              </div>
              {items.map(item => (
                <div
                  key={item.id}
                  className="w-full flex items-center gap-3 px-4 border-b border-border last:border-b-0 hover:bg-surface-container-low/60 transition-colors"
                >
                  {isEditor && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="h-4 w-4 rounded border-outline-variant accent-primary cursor-pointer flex-shrink-0"
                      aria-label={`Select ${item.title}`}
                    />
                  )}
                  <button
                    onClick={() => openItem(item)}
                    className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-on-surface truncate">{item.title}</span>
                      {/* On phones the extra columns are hidden, so show them as a sub-line */}
                      <span className="sm:hidden flex items-center gap-1.5 text-xs text-on-surface-variant min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: campaignColor(item.campaign_id) }} aria-hidden="true" />
                        <span className="truncate">{item.campaignTitle} · {CHANNEL_ICONS[item.channel] || ""} {item.channel} · {item.status}</span>
                      </span>
                    </span>
                    {(item.audience_segments ?? []).length > 0 && (
                      <span className="hidden md:flex gap-1 flex-shrink-0">
                        {item.audience_segments.slice(0, 2).map(seg => (
                          <span key={seg} className="text-[10px] px-1.5 py-0.5 rounded-full border border-outline-variant text-on-surface-variant">{seg}</span>
                        ))}
                        {item.audience_segments.length > 2 && (
                          <span className="text-[10px] text-on-surface-variant">+{item.audience_segments.length - 2}</span>
                        )}
                      </span>
                    )}
                    <span className="text-xs text-on-surface-variant flex-shrink-0">{item.publish_date ? parseDateStr(item.publish_date).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : ""}</span>
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 max-w-[200px] border border-outline-variant text-on-surface">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: campaignColor(item.campaign_id) }} aria-hidden="true" />
                      <span className="truncate">{item.campaignTitle}</span>
                    </span>
                    <span className="hidden sm:inline text-xs text-on-surface-variant flex-shrink-0 w-20">{item.status}</span>
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-on-surface-variant flex-shrink-0">
                      <span className="w-2 h-2 rounded-full" style={{ background: channelBackground(item.channel) }} aria-hidden="true" />
                      {item.channel}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  // ── unscheduled lane ──────────────────────────────────────────────────────

  const renderUnscheduled = () => {
    if (!unscheduled.length) return null
    return (
      <div
        data-tour="cal-unscheduled"
        className="rounded-xl border border-dashed border-outline-variant overflow-hidden"
        onDragOver={e => { e.preventDefault(); setDragOverDate("__unscheduled__") }}
        onDragLeave={() => { if (dragOverDate === "__unscheduled__") setDragOverDate(null) }}
        onDrop={e => handleDrop(null, e)}
      >
        <div className={`flex items-center justify-between px-4 py-3 transition-colors ${
          dragOverDate === "__unscheduled__" ? "bg-primary/10" : "bg-surface-container-low"
        }`}>
          <span className="text-sm font-medium text-on-surface">Unscheduled <span className="text-on-surface-variant font-normal">{unscheduled.length}</span></span>
          <button onClick={() => openNew(null)} className={cx("text-[13px]", linkCls)}>Add item</button>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {unscheduled.map(item => (
            <ContentItemChip
              key={item.id}
              item={item}
              onClick={() => openItem(item)}
              onDragStart={e => handleDragStart(item, e)}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── filters ───────────────────────────────────────────────────────────────

  const activeFilterCount = [
    filterCampaign, filterChannel, filterAssignee, filterMotion, filterProduct, filterStatus, filterSegment,
  ].filter(v => v !== "All").length

  const clearFilters = () => {
    setFilterCampaign("All"); setFilterChannel("All"); setFilterAssignee("All")
    setFilterMotion("All");   setFilterProduct("All"); setFilterStatus("All")
    setFilterSegment("All")
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* Toolbar — single row */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Month / week nav */}
        <div className="flex items-center h-10 rounded-full border border-outline-variant">
          <button onClick={goBack} aria-label="Previous" className="h-10 w-10 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-1 text-sm font-medium text-on-surface min-w-[150px] text-center">{navLabel}</span>
          <button onClick={goForward} aria-label="Next" className="h-10 w-10 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Phones always show the list, so the switcher is desktop-only */}
        <div className="hidden md:block" data-tour="cal-views">
          <SegmentedControl
            ariaLabel="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: "month", label: "Month", icon: <CalendarDays className="h-3.5 w-3.5" /> },
              { value: "week",  label: "Week",  icon: <Columns className="h-3.5 w-3.5" /> },
              { value: "list",  label: "List",  icon: <List className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>

        {/* Filters — collapsed into one popover to keep the header to a single row */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              data-tour="cal-filters"
              className={cx(
                "inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm font-medium transition-colors",
                activeFilterCount > 0
                  ? "border-primary text-on-surface"
                  : "border-outline-variant text-on-surface-variant hover:text-on-surface",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3 flex flex-col gap-2">
            <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className={fieldSmCls}>
              <option value="All">All campaigns</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            {[
              { value: filterMotion,   setter: setFilterMotion,   label: "All motions",   options: MOTION_OPTIONS },
              { value: filterChannel,  setter: setFilterChannel,  label: "All channels",  options: CHANNEL_OPTIONS },
              { value: filterStatus,   setter: setFilterStatus,   label: "All statuses",  options: STATUS_OPTIONS },
              { value: filterProduct,  setter: setFilterProduct,  label: "All products",  options: PRODUCT_OPTIONS },
              { value: filterSegment,  setter: setFilterSegment,  label: "All audiences", options: AUDIENCE_SEGMENTS },
            ].map(({ value, setter, label, options }) => (
              <select key={label} value={value} onChange={e => setter(e.target.value)} className={fieldSmCls}>
                <option value="All">{label}</option>
                {options.map(o => <option key={o}>{o}</option>)}
              </select>
            ))}
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className={fieldSmCls}>
              <option value="All">All assignees</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className={cx("self-end text-[13px]", linkCls)}>
                Clear filters
              </button>
            )}
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        <div className="flex items-center gap-2" data-tour="cal-actions">
        <Button onClick={() => openNew("")}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add item</span>
        </Button>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>
        <Button variant="secondary" onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        </div>
      </div>

      {/* Calendar body */}
      {view === "month" && renderMonthGrid()}
      {view === "week"  && renderWeekGrid()}
      {view === "list"  && renderListView()}

      {/* Unscheduled lane — below the grid so the calendar gets the top of the screen */}
      {renderUnscheduled()}

      {/* Bulk move bar — list view only, editors only */}
      {view === "list" && isEditor && selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto w-fit max-w-full flex flex-wrap items-center gap-2 pl-5 pr-2 py-2 rounded-full border border-outline-variant bg-surface-bright shadow-lg">
          <span className="text-sm font-medium text-on-surface whitespace-nowrap mr-1">
            {selectedIds.size} selected
          </span>
          <select
            value={moveTarget}
            onChange={e => setMoveTarget(e.target.value)}
            className={cx(fieldSmCls, "w-auto rounded-full")}
            aria-label="Destination campaign"
          >
            <option value="">No campaign</option>
            {campaigns.filter(c => c.id !== NO_CAMPAIGN_ID).map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button
            onClick={handleBulkMove}
            disabled={moving}
            className={buttonCls("primary", "sm")}
          >
            {moving ? "Moving…" : "Move"}
          </button>
          <button
            onClick={clearSelection}
            disabled={moving}
            className={buttonCls("ghost", "sm")}
          >
            Clear
          </button>
          {moveError && <span className="text-[13px] text-error w-full px-1 pb-1">{moveError}</span>}
        </div>
      )}

      {/* Stats row */}
      {(() => {
        const inRange = view === "month"
          ? filtered.filter(i => i.publish_date?.startsWith(`${year}-${String(month+1).padStart(2,"0")}`))
          : filtered
        const done     = inRange.filter(i => i.status === "Published").length
        const inprog   = inRange.filter(i => i.status === "In progress").length
        const inreview = inRange.filter(i => i.status === "In review").length
        const sched    = inRange.filter(i => i.status === "Scheduled").length
        return (
          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 px-1 pt-1">
            {[
              { label: "Total",       val: inRange.length },
              { label: "Published",   val: done },
              { label: "In progress", val: inprog },
              { label: "In review",   val: inreview },
              { label: "Scheduled",   val: sched },
            ].map(s => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tracking-tight text-on-surface tabular-nums">{s.val}</span>
                <span className="text-[13px] text-on-surface-variant">{s.label}</span>
              </div>
            ))}
            {/* Colour key — card colour = channel */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:ml-auto self-center" aria-label="Channel colours" data-tour="cal-key">
              {CHANNEL_OPTIONS.filter(c => c !== "Other").map(c => (
                <span key={c} className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: channelBackground(c) }} aria-hidden="true" />
                  {c}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Dialogs */}
      {selectedItem && (
        <ContentItemDialog
          key={selectedItem.id}
          item={selectedItem}
          open={!!selectedItem}
          onOpenChange={open => { if (!open) setSelectedItem(null) }}
          onDuplicated={setOpenWhenLoaded}
        />
      )}
      {newItemDate !== null && (
        <ContentItemDialog
          item={null}
          defaultDate={newItemDate}
          open={newItemDate !== null}
          onOpenChange={open => { if (!open) setNewItemDate(null) }}
        />
      )}
      <ImportPlanDialog open={importOpen} onOpenChange={setImportOpen} calendarYear={year} calendarMonth={month} />
      <ExportCalendarDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        items={allItems}
        year={year}
        month={month}
      />
    </div>
  )
}
