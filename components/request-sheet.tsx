"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Send, Trash2, X } from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import {
  REQUEST_KINDS, REQUEST_STAGES, fieldsFor, missingInfo,
  type FieldDef, type Request, type RequestFields, type RequestKind, type RequestStage, type RequestUpdate,
} from "@/lib/requests"
import { createRequest, deleteRequest, deleteUpdate, listUpdates, postUpdate, updateRequest } from "@/lib/requests-client"
import { NO_CAMPAIGN_ID } from "@/lib/database.types"
import { Avatar, Button, ErrorText, Field, cx, fieldCls, linkCls, textareaCls } from "@/components/kit"

export type RequestDraft = Omit<Request, "id" | "created_at" | "updated_at" | "created_by"> & { id?: undefined }

export const STAGE_STYLE: Record<RequestStage, string> = {
  "New": "border-outline-variant text-on-surface",
  "Needs info": "border-amber-500/50 text-amber-700 dark:text-amber-300",
  "In progress": "border-sky-500/50 text-sky-700 dark:text-sky-300",
  "In review": "border-violet-500/50 text-violet-700 dark:text-violet-300",
  "Delivered": "bg-primary border-primary text-primary-foreground",
  "On hold": "border-outline-variant text-on-surface-variant",
}

export function StagePill({ stage }: { stage: RequestStage }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", STAGE_STYLE[stage])}>{stage}</span>
}

const timeAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function FieldInput({ def, value, onChange, editable }: { def: FieldDef; value: RequestFields[string] | undefined; onChange: (v: RequestFields[string]) => void; editable: boolean }) {
  if (!editable) {
    const text = Array.isArray(value) ? value.join(", ") : value
    return <p className={cx("text-sm whitespace-pre-wrap", text ? "text-on-surface" : "text-on-surface-variant")}>{text || "—"}</p>
  }
  if (def.type === "multi") {
    const list = Array.isArray(value) ? value : value ? [value] : []
    const extra = list.filter(v => !def.options?.includes(v))
    return (
      <div className="flex flex-wrap gap-1.5">
        {[...(def.options ?? []), ...extra].map(o => {
          const on = list.includes(o)
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? list.filter(x => x !== o) : [...list, o])}
              className={cx("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", on ? "bg-primary border-primary text-primary-foreground" : "border-outline-variant text-on-surface-variant hover:text-on-surface")}>
              {o}
            </button>
          )
        })}
      </div>
    )
  }
  if (def.type === "select") {
    const v = typeof value === "string" ? value : ""
    return (
      <select value={v} onChange={e => onChange(e.target.value || null)} className={fieldCls}>
        <option value="">—</option>
        {v && !def.options?.includes(v) && <option value={v}>{v}</option>}
        {def.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (def.type === "suggest") {
    return (
      <>
        <input list={`opt-${def.id}`} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value || null)} className={fieldCls} />
        <datalist id={`opt-${def.id}`}>{def.options?.map(o => <option key={o} value={o} />)}</datalist>
      </>
    )
  }
  if (def.type === "longtext") {
    return <textarea rows={3} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value || null)} className={textareaCls} />
  }
  return <input value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value || null)} className={fieldCls} />
}

/** One request: the form, what's missing, stage and owner, and the progress timeline */
export function RequestSheet({ request, onClose, onSaved }: {
  request: Request | RequestDraft
  onClose: () => void
  onSaved: (r: Request | null) => void
}) {
  const { profiles, allCampaigns, teams, canEditTeam, currentUser } = useStore()
  const isNew = !request.id
  const editable = useIsEditor() && canEditTeam(request.team_id)

  const [r, setR] = useState(request)
  const set = <K extends keyof RequestDraft>(k: K, v: RequestDraft[K]) => setR(prev => ({ ...prev, [k]: v }))
  const setField = (id: string, v: RequestFields[string]) => setR(prev => ({ ...prev, fields: { ...prev.fields, [id]: v } }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  // Progress timeline
  const [updates, setUpdates] = useState<RequestUpdate[]>([])
  const [note, setNote] = useState("")
  const [moveTo, setMoveTo] = useState<RequestStage | "">("")
  const [posting, setPosting] = useState(false)
  useEffect(() => { if (request.id) listUpdates(request.id).then(setUpdates).catch(() => {}) }, [request.id])

  const missing = missingInfo(r)
  const campaigns = allCampaigns.filter(c => c.id !== NO_CAMPAIGN_ID)
  const person = (id: string | null) => profiles.find(p => p.id === id)
  const dirty = JSON.stringify(r) !== JSON.stringify(request)

  async function save() {
    if (!r.title.trim()) { setError("Give the request a title"); return }
    setSaving(true); setError("")
    try {
      const row = {
        team_id: r.team_id, kind: r.kind, title: r.title.trim(), status: r.status, requester: r.requester?.trim() || null,
        linear_url: r.linear_url?.trim() || null, assignee_id: r.assignee_id, campaign_id: r.campaign_id,
        due_date: r.due_date || null, date_fixed: r.date_fixed || null, deliverable_url: r.deliverable_url?.trim() || null,
        fields: r.fields, unclear: r.unclear, raw_text: r.raw_text,
      }
      const saved = isNew
        ? await createRequest({ ...row, created_by: currentUser?.id ?? null })
        : await updateRequest(request.id!, row)
      if (!isNew && request.status !== r.status && currentUser) {
        await postUpdate({ request_id: saved.id, author_id: currentUser.id, body: "", status_from: request.status, status_to: r.status }).catch(() => {})
      }
      onSaved(saved)
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save") }
    finally { setSaving(false) }
  }

  async function post() {
    if (!request.id || !currentUser || (!note.trim() && !moveTo)) return
    setPosting(true); setError("")
    try {
      const to = moveTo && moveTo !== r.status ? moveTo : null
      await postUpdate({ request_id: request.id, author_id: currentUser.id, body: note.trim(), status_from: to ? r.status : null, status_to: to })
      if (to) { const saved = await updateRequest(request.id, { status: to }); setR(prev => ({ ...prev, status: to })); onSaved(saved) }
      setNote(""); setMoveTo("")
      setUpdates(await listUpdates(request.id))
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't post the update") }
    finally { setPosting(false) }
  }

  /** The missing info as a message to paste back into Linear or Slack */
  const askMessage = [
    `Hi${r.requester ? ` ${r.requester.split(" ")[0]}` : ""}, thanks for the request "${r.title}". To get started we need:`,
    ...missing.map(m => `• ${m}`),
    ...r.unclear.map(q => `• ${q}`),
  ].join("\n")

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border z-50 flex flex-col shadow-2xl overflow-y-auto" role="dialog" aria-label="Request">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <StagePill stage={r.status} />
            <span className="text-sm text-on-surface-variant truncate">{isNew ? "New request" : REQUEST_KINDS.find(k => k.id === r.kind)?.label}</span>
          </div>
          {r.linear_url && (
            <a href={r.linear_url} target="_blank" rel="noopener noreferrer" className={cx("text-sm inline-flex items-center gap-1", linkCls)}>Linear <ExternalLink className="h-3 w-3" /></a>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">
          {editable
            ? <input value={r.title} onChange={e => set("title", e.target.value)} placeholder="Request title" className={cx(fieldCls, "text-lg font-medium h-12")} aria-label="Title" />
            : <h2 className="text-[22px] text-on-surface">{r.title}</h2>}

          {/* What's missing, in one place */}
          {(missing.length > 0 || r.unclear.length > 0) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 flex flex-col gap-2">
              <p className="text-[13px] font-medium text-on-surface flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Needs info</p>
              {missing.length > 0 && <p className="text-sm text-on-surface">{missing.join(" · ")}</p>}
              {r.unclear.map((q, i) => <p key={i} className="text-sm text-on-surface-variant">{q}</p>)}
              <button type="button" className={cx("self-start text-xs inline-flex items-center gap-1", linkCls)}
                onClick={() => { navigator.clipboard.writeText(askMessage).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy as a message to the requester"}
              </button>
            </div>
          )}

          {/* The essentials */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              {editable ? (
                <select value={r.kind} onChange={e => set("kind", e.target.value as RequestKind)} className={fieldCls}>
                  {REQUEST_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              ) : <p className="text-sm text-on-surface">{REQUEST_KINDS.find(k => k.id === r.kind)?.label}</p>}
            </Field>
            <Field label="Stage">
              {editable ? (
                <select value={r.status} onChange={e => set("status", e.target.value as RequestStage)} className={fieldCls}>
                  {REQUEST_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : <StagePill stage={r.status} />}
            </Field>
            <Field label={r.kind === "design" ? "Final files due" : r.kind === "video" ? "Final video due" : "Due"}>
              {editable
                ? <input type="date" value={r.due_date ?? ""} onChange={e => set("due_date", e.target.value || null)} className={fieldCls} />
                : <p className="text-sm text-on-surface">{r.due_date ?? "—"}</p>}
            </Field>
            <Field label="Is the date fixed?">
              {editable ? (
                <select value={r.date_fixed ?? ""} onChange={e => set("date_fixed", e.target.value || null)} className={fieldCls}>
                  <option value="">—</option>
                  <option>Fixed</option>
                  <option>Flexible</option>
                  {r.date_fixed && !["Fixed", "Flexible"].includes(r.date_fixed) && <option>{r.date_fixed}</option>}
                </select>
              ) : <p className="text-sm text-on-surface">{r.date_fixed ?? "—"}</p>}
            </Field>
            <Field label="Requested by">
              {editable ? <input value={r.requester ?? ""} onChange={e => set("requester", e.target.value || null)} className={fieldCls} placeholder="Name" />
                : <p className="text-sm text-on-surface">{r.requester ?? "—"}</p>}
            </Field>
            <Field label="Owner">
              {editable ? (
                <select value={r.assignee_id ?? ""} onChange={e => set("assignee_id", e.target.value || null)} className={fieldCls}>
                  <option value="">Unassigned</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              ) : <p className="text-sm text-on-surface">{person(r.assignee_id)?.full_name ?? "Unassigned"}</p>}
            </Field>
            <Field label="Campaign">
              {editable ? (
                <select value={r.campaign_id ?? ""} onChange={e => set("campaign_id", e.target.value || null)} className={fieldCls}>
                  <option value="">None</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              ) : r.campaign_id ? (
                <Link href={`/campaigns/${r.campaign_id}`} className={cx("text-sm", linkCls)}>{campaigns.find(c => c.id === r.campaign_id)?.title ?? "Campaign"}</Link>
              ) : <p className="text-sm text-on-surface">—</p>}
            </Field>
            {teams.length > 0 && (
              <Field label="Team">
                {editable ? (
                  <select value={r.team_id ?? ""} onChange={e => set("team_id", e.target.value || null)} className={fieldCls}>
                    <option value="">Shared</option>
                    {teams.filter(t => canEditTeam(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : <p className="text-sm text-on-surface">{teams.find(t => t.id === r.team_id)?.name ?? "Shared"}</p>}
              </Field>
            )}
            <Field label="Linear link">
              {editable ? <input type="url" value={r.linear_url ?? ""} onChange={e => set("linear_url", e.target.value || null)} className={fieldCls} placeholder="https://linear.app/…" />
                : r.linear_url ? <a href={r.linear_url} target="_blank" rel="noopener noreferrer" className={cx("text-sm", linkCls)}>Open in Linear</a> : <p className="text-sm">—</p>}
            </Field>
            <Field label="Deliverable" hint="Link to the final asset (Drive, Frame.io…)">
              {editable ? <input type="url" value={r.deliverable_url ?? ""} onChange={e => set("deliverable_url", e.target.value || null)} className={fieldCls} placeholder="https://…" />
                : r.deliverable_url ? <a href={r.deliverable_url} target="_blank" rel="noopener noreferrer" className={cx("text-sm", linkCls)}>Open deliverable</a> : <p className="text-sm">—</p>}
            </Field>
          </div>

          {/* The brief, as the Linear form asks it */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[17px] font-semibold text-on-surface">The brief</h3>
            {fieldsFor(r.kind).map(def => (
              <Field key={def.id} label={<span>{def.label}{def.required ? "" : " (optional)"}</span>} hint={editable ? def.hint : undefined}>
                <FieldInput def={def} value={r.fields[def.id]} onChange={v => setField(def.id, v)} editable={editable} />
              </Field>
            ))}
          </div>

          {r.raw_text && (
            <details className="text-sm">
              <summary className="cursor-pointer text-on-surface-variant">Original request text</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-on-surface-variant bg-surface-container-low rounded-lg p-3 font-sans">{r.raw_text}</pre>
            </details>
          )}

          <ErrorText>{error}</ErrorText>
          {editable && (
            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={saving || (!isNew && !dirty)}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {isNew ? "Save request" : "Save changes"}
              </Button>
              {!isNew && (
                <Button variant="ghost" className="ml-auto hover:text-error" onClick={async () => {
                  if (!confirm(`Delete "${r.title}" and its updates?`)) return
                  try { await deleteRequest(request.id!); onSaved(null) } catch (e) { setError(e instanceof Error ? e.message : "Couldn't delete") }
                }}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>
          )}

          {/* Progress timeline */}
          {!isNew && (
            <div className="flex flex-col gap-3 border-t border-border pt-5">
              <h3 className="text-[17px] font-semibold text-on-surface">Progress</h3>
              {updates.length === 0 && <p className="text-sm text-on-surface-variant">No updates yet.</p>}
              <ol className="flex flex-col gap-3">
                {updates.map(u => {
                  const who = person(u.author_id)
                  return (
                    <li key={u.id} className="flex gap-3">
                      <Avatar src={who?.avatar_url} name={who?.full_name ?? "?"} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-on-surface-variant">
                          <span className="text-on-surface font-medium">{who?.full_name ?? "Someone"}</span> · {timeAgo(u.created_at)}
                          {u.status_to && <> · moved to <StagePill stage={u.status_to as RequestStage} /></>}
                        </p>
                        {u.body && <p className="text-sm text-on-surface whitespace-pre-wrap mt-0.5">{u.body}</p>}
                      </div>
                      {u.author_id === currentUser?.id && (
                        <button type="button" aria-label="Delete update" className="text-on-surface-variant hover:text-error self-start p-1"
                          onClick={async () => { await deleteUpdate(u.id).catch(() => {}); setUpdates(await listUpdates(request.id!)) }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
              {editable && (
                <div className="flex flex-col gap-2">
                  <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={textareaCls} placeholder="Post an update: e.g. First cut sent to Nora for review." />
                  <div className="flex items-center gap-2">
                    <select value={moveTo} onChange={e => setMoveTo(e.target.value as RequestStage | "")} className="h-9 rounded-full border border-outline-variant bg-transparent px-3 text-[13px] text-on-surface" aria-label="Move to stage">
                      <option value="">Keep stage</option>
                      {REQUEST_STAGES.filter(s => s !== r.status).map(s => <option key={s} value={s}>Move to {s}</option>)}
                    </select>
                    <Button size="sm" onClick={post} disabled={posting || (!note.trim() && !moveTo)}>
                      {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Post
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
