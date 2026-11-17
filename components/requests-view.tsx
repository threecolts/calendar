"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, ClipboardPaste, Download, Loader2, Plus, Sparkles, X } from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import {
  OPEN_STAGES, REQUEST_FIELDS, REQUEST_KINDS, fieldText, isOverdue, missingInfo,
  type Request, type RequestKind,
} from "@/lib/requests"
import { listRequests, parseRequestText, RequestsNotSetUp } from "@/lib/requests-client"
import { parseDateString } from "@/lib/database.types"
import { RequestSheet, StagePill, type RequestDraft } from "@/components/request-sheet"
import { Avatar, Button, ErrorText, PageHeader, SegmentedControl, StatTile, cx, textareaCls } from "@/components/kit"

const niceDate = (d: string | null) => {
  if (!d) return "—"
  try { return parseDateString(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) } catch { return d }
}

function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map(r => r.map(v => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(",")).join("\n")
}

/** Paste a Linear Ask; Claude fills in the form for review before saving */
function PasteDialog({ onClose, onRead }: { onClose: () => void; onRead: (draft: Partial<RequestDraft>) => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function read() {
    setBusy(true); setError("")
    try {
      const p = await parseRequestText(text)
      onRead({ ...p, raw_text: text, status: "New" })
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that") }
    finally { setBusy(false) }
  }
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xl bg-background rounded-2xl border border-border shadow-2xl p-6 flex flex-col gap-4" role="dialog" aria-label="Paste a request">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h2 className="text-[19px] font-semibold text-on-surface">Paste a request from Linear</h2>
              <p className="text-sm text-on-surface-variant">Open the Ask in Linear, select all the text (and the link), copy and paste it here. Claude fills in the form; you check it before saving.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
          <textarea autoFocus rows={12} value={text} onChange={e => setText(e.target.value)} className={textareaCls} placeholder={"Marketing Request: Video Asset\nVideo type: Product explainer\nPlease describe what you need: …"} />
          <ErrorText>{error}</ErrorText>
          <div className="flex items-center gap-3">
            <Button onClick={read} disabled={busy || text.trim().length < 20}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? "Reading…" : "Fill in the form"}
            </Button>
            {busy && <span className="text-sm text-on-surface-variant">A few seconds.</span>}
          </div>
        </div>
      </div>
    </>
  )
}

export function RequestsView() {
  const { profiles, allCampaigns, teams, activeTeam, inTeamView, currentUser, canEditTeam } = useStore()
  const isEditor = useIsEditor()
  const params = useSearchParams()
  const [requests, setRequests] = useState<Request[]>([])
  const [state, setState] = useState<"loading" | "ready" | "not-set-up" | "error">("loading")
  const [error, setError] = useState("")
  const [show, setShow] = useState<"open" | "delivered" | "all">("open")
  const [kind, setKind] = useState<RequestKind | "all">("all")
  const [openId, setOpenId] = useState<string | null>(params.get("request"))
  const [draft, setDraft] = useState<RequestDraft | null>(null)
  const [pasting, setPasting] = useState(false)

  const load = async () => {
    try { setRequests(await listRequests()); setState("ready") }
    catch (e) {
      if (e instanceof RequestsNotSetUp) setState("not-set-up")
      else { setError(e instanceof Error ? e.message : "Couldn't load requests"); setState("error") }
    }
  }
  useEffect(() => { load() }, [])

  const today = new Date().toISOString().slice(0, 10)
  const weekOut = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const inView = requests.filter(r => inTeamView(r.team_id))
  const open = inView.filter(r => OPEN_STAGES.includes(r.status))
  const shown = useMemo(() => inView
    .filter(r => show === "all" || (show === "open" ? r.status !== "Delivered" : r.status === "Delivered"))
    .filter(r => kind === "all" || r.kind === kind)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")), [inView, show, kind])

  const person = (id: string | null) => profiles.find(p => p.id === id)
  const campaign = (id: string | null) => allCampaigns.find(c => c.id === id)
  // New requests belong to the team in view, or your own team
  const newTeam = activeTeam !== "all" ? activeTeam : currentUser?.team_id ?? null
  const canCreate = isEditor && canEditTeam(newTeam)

  function startDraft(partial: Partial<RequestDraft> = {}) {
    setPasting(false)
    setDraft({
      team_id: newTeam, kind: "video", title: "", status: "New", requester: null, linear_url: null,
      assignee_id: currentUser?.id ?? null, campaign_id: null, due_date: null, date_fixed: null, deliverable_url: null,
      fields: {}, unclear: [], raw_text: null, ...partial,
    })
  }

  function exportCsv() {
    const fieldCols = REQUEST_FIELDS.map(f => f.id)
    const rows = [
      ["Title", "Type", "Stage", "Due", "Date fixed", "Requested by", "Owner", "Campaign", "Needs info", "Linear", "Deliverable", ...REQUEST_FIELDS.map(f => f.label)],
      ...shown.map(r => [
        r.title, REQUEST_KINDS.find(k => k.id === r.kind)?.label, r.status, r.due_date, r.date_fixed, r.requester,
        person(r.assignee_id)?.full_name, campaign(r.campaign_id)?.title, missingInfo(r).join("; "), r.linear_url, r.deliverable_url,
        ...fieldCols.map(id => fieldText(r.fields[id])),
      ]),
    ]
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url; a.download = `requests-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const current = openId ? requests.find(r => r.id === openId) ?? null : null
  const teamName = teams.find(t => t.id === activeTeam)?.name

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Requests"
        subtitle={`Video and design asks${teamName ? ` for ${teamName}` : ""}: deadlines, what's missing and where each one is.`}
        actions={state === "ready" && (
          <>
            <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!shown.length}><Download className="h-3.5 w-3.5" /> CSV</Button>
            {canCreate && <Button variant="secondary" size="sm" onClick={() => startDraft()}><Plus className="h-3.5 w-3.5" /> New</Button>}
            {canCreate && <Button size="sm" onClick={() => setPasting(true)}><ClipboardPaste className="h-3.5 w-3.5" /> Paste from Linear</Button>}
          </>
        )}
      />

      {state === "loading" && <p className="text-sm text-on-surface-variant flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading requests…</p>}
      {state === "not-set-up" && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface">
          Requests need a one-off database update: run <code>scripts/014_requests.sql</code> in Supabase (after 012).
        </p>
      )}
      {state === "error" && <ErrorText>{error}</ErrorText>}

      {state === "ready" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-border bg-surface-bright divide-x divide-border">
            <StatTile label="Open" value={open.length} />
            <StatTile label="Due in 7 days" value={open.filter(r => r.due_date && r.due_date >= today && r.due_date <= weekOut).length} />
            <StatTile label="Overdue" value={open.filter(r => isOverdue(r, today)).length} />
            <StatTile label="Needs info" value={open.filter(r => missingInfo(r).length > 0 || r.status === "Needs info").length} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl value={show} onChange={setShow} ariaLabel="Show"
              options={[{ value: "open", label: "Open" }, { value: "delivered", label: "Delivered" }, { value: "all", label: "All" }]} />
            <SegmentedControl value={kind} onChange={setKind} ariaLabel="Type"
              options={[{ value: "all", label: "All types" }, { value: "video", label: "Video" }, { value: "design", label: "Design" }, { value: "other", label: "Other" }]} />
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-outline-variant py-14 text-center text-sm text-on-surface-variant">
              {inView.length ? "Nothing here with these filters." : canCreate ? "No requests yet. Paste one from Linear to start." : "No requests yet."}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface-bright overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-[13px] text-on-surface-variant border-b border-border">
                    <th className="font-normal px-5 py-3">Request</th>
                    <th className="font-normal px-4 py-3">Due</th>
                    <th className="font-normal px-4 py-3">Stage</th>
                    <th className="font-normal px-4 py-3">Owner</th>
                    <th className="font-normal px-4 py-3">Needs info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map(r => {
                    const missing = missingInfo(r)
                    const late = isOverdue(r, today)
                    const owner = person(r.assignee_id)
                    return (
                      <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="block font-medium text-on-surface">{r.title}</span>
                          <span className="block text-[13px] text-on-surface-variant">
                            {REQUEST_KINDS.find(k => k.id === r.kind)?.label}
                            {r.requester && ` · from ${r.requester}`}
                            {campaign(r.campaign_id) && ` · ${campaign(r.campaign_id)!.title}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cx(late ? "text-error font-medium" : "text-on-surface")}>{niceDate(r.due_date)}</span>
                          {r.date_fixed && <span className="block text-xs text-on-surface-variant">{r.date_fixed}</span>}
                          {late && <span className="block text-xs text-error">Overdue</span>}
                        </td>
                        <td className="px-4 py-3"><StagePill stage={r.status} /></td>
                        <td className="px-4 py-3">
                          {owner ? <span className="inline-flex items-center gap-2"><Avatar src={owner.avatar_url} name={owner.full_name} size={24} /><span className="text-on-surface">{owner.full_name.split(" ")[0]}</span></span> : <span className="text-on-surface-variant">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {missing.length || r.unclear.length ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300" title={[...missing, ...r.unclear].join("\n")}>
                              <AlertTriangle className="h-3.5 w-3.5" /> {missing.length + r.unclear.length}
                            </span>
                          ) : <span className="text-on-surface-variant">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {pasting && <PasteDialog onClose={() => setPasting(false)} onRead={partial => startDraft(partial)} />}
      {(draft || current) && (
        <RequestSheet
          key={current?.id ?? "new"}
          request={(current ?? draft)!}
          onClose={() => { setOpenId(null); setDraft(null) }}
          onSaved={saved => { setDraft(null); setOpenId(saved?.id ?? null); load() }}
        />
      )}
    </div>
  )
}
