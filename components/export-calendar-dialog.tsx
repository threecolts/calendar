"use client"

import { useMemo, useState } from "react"
import { X, FileText, Table2, Download } from "lucide-react"
import type { ContentItemWithCampaign } from "@/lib/database.types"
import { STATUS_COLORS, itemChannels } from "@/lib/database.types"

// ---- date helpers ----
function toDS(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}
function parseDS(s: string) { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d) }
function startOfWeek(d: Date) {
  const o = new Date(d); const dow = o.getDay()
  o.setDate(o.getDate() - (dow === 0 ? 6 : dow - 1)); return o
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

// ---- export helpers ----
function escape(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
}
function escapeCsv(s: string) { return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s }
function downloadFile(name: string, content: string, mime: string) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: mime })),
    download: name,
  })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

function statusDot(status: string): string {
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS]?.dot || "#94a3b8"
}

function buildCsv(items: ContentItemWithCampaign[]): string {
  const rows = items.map(it => {
    const d = it.publish_date ? parseDS(it.publish_date) : null
    return [
      it.publish_date || "",
      d ? d.toLocaleDateString("en-US", { weekday: "long" }) : "",
      it.title,
      it.campaignTitle,
      it.campaignMotion,
      itemChannels(it).join("; "),
      it.format,
      it.status,
      it.assignee?.full_name || "Unassigned",
      it.date_confidence,
    ].map(escapeCsv).join(",")
  })
  return ["Due Date,Day,Title,Campaign,Motion,Channel,Format,Status,Assignee,Confidence", ...rows].join("\n")
}

function fullWeeks(start: Date, end: Date): (string | null)[][] {
  const weeks: (string | null)[][] = []
  let cursor = startOfWeek(start)
  while (cursor <= end) {
    const week: (string | null)[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor); d.setDate(d.getDate() + i)
      week.push(d >= start && d <= end ? toDS(d) : null)
    }
    if (week.some(Boolean)) weeks.push(week)
    cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

function buildHtml(items: ContentItemWithCampaign[], start: Date, end: Date, label: string): string {
  const byDate: Record<string, ContentItemWithCampaign[]> = {}
  items.forEach(it => { if (it.publish_date) { (byDate[it.publish_date] ||= []).push(it) } })

  const done = items.filter(i => i.status === "Published").length
  const inProg = items.filter(i => i.status === "In progress").length
  const inReview = items.filter(i => i.status === "In review").length

  const weeksHtml = fullWeeks(start, end).map(week => {
    const cells = week.map(date => {
      if (!date) return `<td class="empty"></td>`
      const day = parseDS(date).getDate()
      const dayItems = byDate[date] || []
      const tasksHtml = dayItems.map(it => {
        return `<div class="chip">
          <span class="dot" style="background:${statusDot(it.status)}"></span>
          <span class="lbl">${escape(it.title)}</span>
          ${it.assignee ? `<span class="who">${escape(it.assignee.full_name.split(" ")[0])}</span>` : ""}
        </div>`
      }).join("")
      return `<td><div class="daynum">${day}</div>${tasksHtml}</td>`
    }).join("")
    return `<tr>${cells}</tr>`
  }).join("")

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Content Calendar – ${escape(label)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f1f0ed;color:#141414;padding:32px}
.wrap{max-width:1200px;margin:0 auto}
h1{font-size:24px;font-weight:800;letter-spacing:-.02em}
.sub{color:#6e6c68;font-size:13px;margin-top:4px}
.stats{display:flex;gap:12px;margin:20px 0;flex-wrap:wrap}
.stat{background:#faf9f7;border:1px solid #dfddd8;border-radius:12px;padding:10px 18px}
.stat b{display:block;font-size:20px;font-weight:800}
.stat span{font-size:11px;color:#6e6c68;font-weight:600}
table{width:100%;border-collapse:collapse;background:#faf9f7;border:1px solid #dfddd8;border-radius:12px;overflow:hidden}
thead th{background:#e9e8e4;padding:10px;font-size:11px;color:#6e6c68;border-bottom:1px solid #dfddd8}
td{vertical-align:top;width:14.28%;border:1px solid #dfddd8;padding:6px;min-height:100px}
td.empty{background:#f1f0ed}
.daynum{font-size:11px;font-weight:700;color:#a8a5a0;margin-bottom:4px}
.chip{border-radius:6px;padding:4px 6px;font-size:11px;font-weight:600;margin-bottom:4px;display:flex;align-items:flex-start;gap:5px;background:#f1f0ed;border:1px solid #dfddd8;color:#141414}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:2px}
.lbl{flex:1}
.who{font-size:9px;opacity:.7;font-weight:800;flex-shrink:0}
footer{margin-top:20px;font-size:11px;color:#a8a5a0}
@media print{body{padding:8px;background:#faf9f7}@page{size:landscape;margin:10mm}}
</style></head>
<body><div class="wrap">
<h1>Content Calendar</h1>
<div class="sub">Threecolts · ${escape(label)} · Exported ${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
<div class="stats">
  <div class="stat"><b>${items.length}</b><span>Total</span></div>
  <div class="stat"><b>${done}</b><span>Published</span></div>
  <div class="stat"><b>${inProg}</b><span>In progress</span></div>
  <div class="stat"><b>${inReview}</b><span>In review</span></div>
</div>
<table>
<thead><tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th><th>Sunday</th></tr></thead>
<tbody>${weeksHtml}</tbody>
</table>
<footer>Generated by Content Calendar. Open in a browser · Print for PDF.</footer>
</div></body></html>`
}

// ---- component ----
type RangeMode = "month" | "week" | "custom"
type Format = "html" | "csv"

export function ExportCalendarDialog({
  open, onOpenChange, items, year, month,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ContentItemWithCampaign[]
  year: number
  month: number
}) {
  const today = new Date()
  const [rangeMode, setRangeMode] = useState<RangeMode>("month")
  const [format,    setFormat]    = useState<Format>("html")
  const [cStart, setCStart] = useState(toDS(startOfWeek(today)))
  const [cEnd,   setCEnd]   = useState(() => { const e = startOfWeek(today); e.setDate(e.getDate()+6); return toDS(e) })

  const range = useMemo(() => {
    if (rangeMode === "month") return {
      start: new Date(year, month, 1), end: new Date(year, month+1, 0),
      label: `${MONTHS[month]} ${year}`,
    }
    if (rangeMode === "week") {
      const s = startOfWeek(today); const e = new Date(s); e.setDate(e.getDate()+6)
      return { start: s, end: e, label: `Week of ${s.toLocaleDateString("en-US",{month:"short",day:"numeric"})}–${e.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}` }
    }
    const s = parseDS(cStart), e = parseDS(cEnd)
    return { start: s, end: e, label: `${s.toLocaleDateString("en-US",{month:"short",day:"numeric"})}–${e.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}` }
  }, [rangeMode, year, month, cStart, cEnd])

  const inRange = useMemo(() => {
    const s = toDS(range.start), e = toDS(range.end)
    return items.filter(i => i.publish_date && i.publish_date >= s && i.publish_date <= e)
      .sort((a,b) => (a.publish_date||"").localeCompare(b.publish_date||""))
  }, [items, range])

  const invalid = rangeMode === "custom" && cStart > cEnd

  const doExport = () => {
    const slug = range.label.toLowerCase().replace(/[^a-z0-9]+/g,"-")
    if (format === "csv") downloadFile(`content-cal-${slug}.csv`, buildCsv(inRange), "text/csv;charset=utf-8")
    else downloadFile(`content-cal-${slug}.html`, buildHtml(inRange, range.start, range.end, range.label), "text/html;charset=utf-8")
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5 pointer-events-auto max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] text-on-surface">Export calendar</h2>
            <button onClick={() => onOpenChange(false)} className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Range */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-on-surface-variant">Date Range</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { mode: "month", label: `${MONTHS[month].slice(0,3)} ${year}` },
                { mode: "week",  label: "This Week" },
                { mode: "custom",label: "Custom" },
              ] as { mode: RangeMode; label: string }[]).map(opt => (
                <button key={opt.mode} onClick={() => setRangeMode(opt.mode)}
                  className={`px-3 py-2.5 rounded-full text-sm font-medium border transition-colors ${
                    rangeMode === opt.mode
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container-high"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {rangeMode === "custom" && (
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">From</label>
                  <input type="date" value={cStart} onChange={e => setCStart(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">To</label>
                  <input type="date" value={cEnd} onChange={e => setCEnd(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
            )}
            {invalid && <p className="text-xs text-error">Start must be before end.</p>}
          </div>

          {/* Format */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-on-surface-variant">Format</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { fmt: "html" as Format, Icon: FileText, label: "Calendar document", desc: "Styled HTML. Open in browser, print to PDF." },
                { fmt: "csv"  as Format, Icon: Table2,   label: "Spreadsheet",  desc: "CSV for Excel or Google Sheets." },
              ]).map(({ fmt, Icon, label, desc }) => (
                <button key={fmt} onClick={() => setFormat(fmt)}
                  className={`flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition-colors ${
                    format === fmt
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-outline-variant bg-surface-container-low hover:bg-surface-container-high"
                  }`}>
                  <Icon className={`h-5 w-5 ${format === fmt ? "text-primary" : "text-on-surface-variant"}`} />
                  <span className="text-sm font-bold text-on-surface">{label}</span>
                  <span className="text-xs text-on-surface-variant leading-snug">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div className="px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface-variant">
            <span className="font-bold text-on-surface">{inRange.length}</span> item{inRange.length !== 1 ? "s" : ""} in {range.label}
          </div>

          <button onClick={doExport} disabled={invalid || inRange.length === 0}
            className="w-full py-2.5 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/85 transition-colors disabled:opacity-40">
            <Download className="h-4 w-4" />
            {format === "csv" ? "Download CSV" : "Download calendar"}
          </button>
        </div>
      </div>
    </>
  )
}
