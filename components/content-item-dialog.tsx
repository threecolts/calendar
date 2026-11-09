"use client"

import { useState, useEffect, useRef } from "react"
import { X, ExternalLink, Trash2, MessageCircle, Copy } from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import {
  updateContentItemClient, deleteContentItemClient, createContentItemClient, notifyTeamClient,
  getItemCommentsClient, addItemCommentClient, deleteItemCommentClient,
} from "@/lib/data-client"
import { useRefreshData } from "@/components/data-provider"
import { CreateCampaignDialog } from "@/components/create-campaign-dialog"
import { MentionInput } from "@/components/mention-input"
import { GoogleDocEmbed } from "@/components/google-doc-embed"
import { parseMentions } from "@/lib/mentions"
import {
  Button, ErrorText, Label, Pill, SegmentedControl, cx, fieldCls, fieldSmCls, linkCls, textareaCls,
} from "@/components/kit"
import type {
  ContentItemWithCampaign, ItemStatus, ContentChannel, ContentFormat,
  DateConfidence, ItemComment, Contributor, ContributorRole,
} from "@/lib/database.types"
import {
  STATUS_COLORS, STATUS_OPTIONS, CHANNEL_OPTIONS, FORMAT_OPTIONS, CONTRIBUTOR_ROLE_OPTIONS,
  NO_CAMPAIGN_ID, AUDIENCE_SEGMENT_GROUPS, campaignColor,
} from "@/lib/database.types"

const NEW_CAMPAIGN_OPTION = "__new_campaign__"

interface Props {
  item: ContentItemWithCampaign | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate?: string
  defaultCampaignId?: string
  /** Called with the new item's id after Duplicate, so the parent can open the copy. Without it the dialog just closes. */
  onDuplicated?: (id: string) => void
}

const EMPTY_FORM = {
  title: "",
  status: "Planned" as ItemStatus,
  format: "Video" as ContentFormat,
  channel: "YouTube" as ContentChannel,
  assignee_id: null as string | null,
  publish_date: null as string | null,
  date_confidence: "Confirmed" as DateConfidence,
  content_role: "",
  notes: "",
  brief_url: "",
  live_url: "",
}

const FieldLabel = Label
const selectCls = () => fieldCls

export function ContentItemDialog({ item, open, onOpenChange, defaultDate, defaultCampaignId, onDuplicated }: Props) {
  const { profiles, campaigns, currentUser } = useStore()
  const isEditor = useIsEditor()
  const { refreshCampaigns } = useRefreshData()

  const isNew = item === null

  const [form, setForm] = useState(() =>
    item
      ? {
          title: item.title,
          status: item.status,
          format: item.format,
          channel: item.channel,
          assignee_id: item.assignee_id,
          publish_date: item.publish_date,
          date_confidence: item.date_confidence,
          content_role: item.content_role ?? "",
          notes: item.notes ?? "",
          brief_url: item.brief_url ?? "",
          live_url: item.live_url ?? "",
        }
      : { ...EMPTY_FORM, publish_date: defaultDate || null }
  )
  const realCampaigns = campaigns.filter(c => c.id !== NO_CAMPAIGN_ID)
  // Existing items must start on their OWN campaign — defaulting to the first
  // campaign here would silently re-parent the item on the next save.
  const [campaignId, setCampaignId]   = useState(
    item ? (item.campaign_id ?? "") : (defaultCampaignId || realCampaigns[0]?.id || "")
  )
  const [contributors, setContribs]   = useState<Contributor[]>((item as any)?.contributors ?? [])
  const [segments, setSegments]       = useState<string[]>(item?.audience_segments ?? [])
  const [saving, setSaving]           = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [error, setError]             = useState("")
  const [confirmDel, setConfirmDel]   = useState(false)
  const [newCampaignOpen, setNewCampaignOpen] = useState(false)
  const [notifyTeam, setNotifyTeam]   = useState(false)
  const [activeTab, setActiveTab]     = useState<"details" | "comments">("details")
  const titleInputRef                 = useRef<HTMLInputElement>(null)

  // Comments
  const [comments, setComments]         = useState<ItemComment[]>([])
  const [loadingComments, setLoading]   = useState(false)
  const [commentError, setCommentError] = useState("")
  const commentsEndRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!item || activeTab !== "comments") return
    setLoading(true)
    getItemCommentsClient(item.id)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [item, activeTab])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [comments])

  if (!open) return null

  const handleClose = () => onOpenChange(false)

  const f = <K extends keyof typeof form>(key: K, val: typeof form[K]) =>
    setForm(prev => ({ ...prev, [key]: val }))

  // Only send segments when they changed, so saves keep working even before
  // the audience_segments column migration (scripts/008) has been run.
  const segmentsChanged =
    [...segments].sort().join("|") !== [...(item?.audience_segments ?? [])].sort().join("|")

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Title is required")
      titleInputRef.current?.focus()
      return
    }
    setError("")
    setSaving(true)
    try {
      if (isNew) {
        const created = await createContentItemClient({
          campaign_id: campaignId || null,
          title: form.title.trim(),
          status: form.status,
          format: form.format,
          channel: form.channel,
          assignee_id: form.assignee_id,
          publish_date: form.publish_date || null,
          date_confidence: form.date_confidence,
          content_role: form.content_role || null,
          notes: form.notes || null,
          brief_url: form.brief_url || null,
          live_url: form.live_url || null,
          contributors,
          ...(segments.length > 0 ? { audience_segments: segments } : {}),
          sort_order: 0,
        })
        if (notifyTeam) {
          // The item is already saved; don't block on the notification.
          try { await notifyTeamClient(created.id) } catch (e) { console.error("notify_team failed:", e) }
        }
      } else {
        await updateContentItemClient(item!.id, {
          campaign_id: campaignId || null,
          title: form.title.trim(),
          status: form.status,
          format: form.format,
          channel: form.channel,
          assignee_id: form.assignee_id,
          publish_date: form.publish_date || null,
          date_confidence: form.date_confidence,
          content_role: form.content_role || null,
          notes: form.notes || null,
          brief_url: form.brief_url || null,
          live_url: form.live_url || null,
          contributors,
          ...(segmentsChanged ? { audience_segments: segments } : {}),
        })
      }
      await refreshCampaigns()
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item")
    } finally {
      setSaving(false)
    }
  }

  // Copy what's on screen into a new item on the same day. A copy of a
  // published piece starts again as Planned, without the live link.
  const handleDuplicate = async () => {
    if (!item) return
    setError("")
    setDuplicating(true)
    try {
      const published = form.status === "Published"
      const created = await createContentItemClient({
        campaign_id: campaignId || null,
        title: `${form.title.trim() || item.title} (copy)`,
        status: published ? "Planned" : form.status,
        format: form.format,
        channel: form.channel,
        assignee_id: form.assignee_id,
        publish_date: form.publish_date || null,
        date_confidence: form.date_confidence,
        content_role: form.content_role || null,
        notes: form.notes || null,
        brief_url: form.brief_url || null,
        live_url: published ? null : form.live_url || null,
        contributors,
        ...(segments.length > 0 ? { audience_segments: segments } : {}),
        sort_order: item.sort_order + 1,
        created_by: currentUser?.id ?? null,
      })
      await refreshCampaigns()
      if (onDuplicated) onDuplicated(created.id)
      else handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to duplicate item")
    } finally {
      setDuplicating(false)
    }
  }

  const handleDelete = async () => {
    await deleteContentItemClient(item!.id)
    await refreshCampaigns()
    handleClose()
  }

  // Rethrows so MentionInput keeps the text for a retry.
  const handlePostComment = async (body: string) => {
    if (!item) return
    setCommentError("")
    try {
      const c = await addItemCommentClient(item.id, body)
      setComments(prev => [...prev, c])
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Failed to post comment")
      throw e
    }
  }

  const handleDeleteComment = async (id: string) => {
    await deleteItemCommentClient(id)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  const addContributor = () => {
    setContribs(prev => [...prev, { profile_id: profiles[0]?.id || "", role: "Writer" }])
  }

  const statusDot = STATUS_COLORS[form.status]?.dot || "#94a3b8"

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50" onClick={handleClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? "New content item" : form.title}
          className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-xl pointer-events-auto flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-6 pt-6 pb-4 flex-shrink-0">
            <div className="flex-1 min-w-0">
              {!isNew && (
                <p className="flex items-center gap-1.5 text-[13px] text-on-surface-variant mb-2 truncate">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: campaignColor(item.campaign_id) }} aria-hidden="true" />
                  {item.campaignTitle}
                </p>
              )}
              {isEditor ? (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Title</FieldLabel>
                  <input
                    ref={titleInputRef}
                    autoFocus
                    value={form.title}
                    onChange={e => { f("title", e.target.value); if (error) setError("") }}
                    placeholder="Content item title"
                    className={selectCls()}
                  />
                </div>
              ) : (
                <h2 className="text-[22px] text-on-surface">{form.title}</h2>
              )}
            </div>
            <button
              onClick={handleClose}
              aria-label="Close dialog"
              className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors flex-shrink-0 text-on-surface-variant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs — show Comments tab only for existing items */}
          {!isNew && (
            <div className="flex-shrink-0 px-6 pb-4 border-b border-border">
              <SegmentedControl
                ariaLabel="Item sections"
                value={activeTab}
                onChange={setActiveTab}
                options={[
                  { value: "details", label: "Details" },
                  {
                    value: "comments",
                    icon: <MessageCircle className="h-3.5 w-3.5" />,
                    label: <>Comments{comments.length > 0 && <span className="tabular-nums opacity-70">{comments.length}</span>}</>,
                  },
                ]}
              />
            </div>
          )}

          {/* --- DETAILS TAB --- */}
          {activeTab === "details" && (
            <div className="overflow-y-auto flex flex-col gap-5 px-6 py-5">
              {/* Campaign selector — also how an existing item is moved to another campaign */}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Campaign</FieldLabel>
                {isEditor ? (
                  <select
                    value={campaignId}
                    onChange={e => {
                      if (e.target.value === NEW_CAMPAIGN_OPTION) setNewCampaignOpen(true)
                      else setCampaignId(e.target.value)
                    }}
                    className={selectCls()}
                  >
                    <option value="">No campaign</option>
                    {realCampaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    <option value={NEW_CAMPAIGN_OPTION}>+ New campaign…</option>
                  </select>
                ) : (
                  <p className="text-sm text-on-surface px-3 py-2">
                    {realCampaigns.find(c => c.id === campaignId)?.title ?? "No campaign"}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Status */}
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Status</FieldLabel>
                  {isEditor ? (
                    <select value={form.status} onChange={e => f("status", e.target.value as ItemStatus)} className={selectCls()}>
                      {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2 py-2 text-sm">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusDot }} aria-hidden="true" />
                      <span className="text-on-surface">{form.status}</span>
                    </div>
                  )}
                </div>

                {/* Channel */}
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Channel</FieldLabel>
                  {isEditor ? (
                    <select value={form.channel} onChange={e => f("channel", e.target.value as ContentChannel)} className={selectCls()}>
                      {CHANNEL_OPTIONS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  ) : (
                    <div className="py-2 text-sm text-on-surface">{form.channel}</div>
                  )}
                </div>

                {/* Format */}
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Format</FieldLabel>
                  {isEditor ? (
                    <select value={form.format} onChange={e => f("format", e.target.value as ContentFormat)} className={selectCls()}>
                      {FORMAT_OPTIONS.map(x => <option key={x}>{x}</option>)}
                    </select>
                  ) : (
                    <div className="py-2 text-sm text-on-surface">{form.format}</div>
                  )}
                </div>

                {/* Assignee */}
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Owner</FieldLabel>
                  {isEditor ? (
                    <select value={form.assignee_id ?? "none"} onChange={e => f("assignee_id", e.target.value === "none" ? null : e.target.value)} className={selectCls()}>
                      <option value="none">Unassigned</option>
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  ) : (
                    <div className="py-2 text-sm text-on-surface">{item?.assignee?.full_name ?? "Unassigned"}</div>
                  )}
                </div>

                {/* Publish date */}
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Publish date</FieldLabel>
                  {isEditor ? (
                    <input type="date" value={form.publish_date ?? ""}
                      onChange={e => f("publish_date", e.target.value || null)}
                      className={selectCls()} />
                  ) : (
                    <div className="py-2 text-sm text-on-surface">{form.publish_date || "Unscheduled"}</div>
                  )}
                </div>

                {/* Date confidence */}
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Confidence</FieldLabel>
                  {isEditor ? (
                    <select value={form.date_confidence} onChange={e => f("date_confidence", e.target.value as DateConfidence)} className={selectCls()}>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Provisional">Provisional (TBC)</option>
                    </select>
                  ) : (
                    <div className="py-2 text-sm text-on-surface">{form.date_confidence}</div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Notes</FieldLabel>
                {isEditor ? (
                  <textarea rows={2} value={form.notes} onChange={e => f("notes", e.target.value)}
                    placeholder="Add context, copy points, references…"
                    className={textareaCls} />
                ) : (
                  <p className="text-sm text-on-surface-variant">{form.notes || "—"}</p>
                )}
              </div>

              {/* URLs */}
              <div className="grid grid-cols-2 gap-3">
                {(["brief_url", "live_url"] as const).map(field => (
                  <div key={field} className="flex flex-col gap-1.5">
                    <FieldLabel>{field === "brief_url" ? "Brief URL" : "Live URL"}</FieldLabel>
                    {isEditor ? (
                      <input type="url" value={form[field] ?? ""}
                        onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder="https://…"
                        className={selectCls()} />
                    ) : form[field] && /^https?:\/\//i.test(form[field]!.trim()) ? (
                      <a href={form[field]!.trim()} target="_blank" rel="noopener noreferrer"
                        className={cx("inline-flex items-center gap-1 text-sm py-2", linkCls)}>
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-sm text-on-surface-variant py-2">—</span>
                    )}
                  </div>
                ))}
              </div>

              <GoogleDocEmbed url={form.brief_url} />

              {/* Audience segments */}
              <div className="flex flex-col gap-2">
                <FieldLabel>Audience</FieldLabel>
                {AUDIENCE_SEGMENT_GROUPS.map(group => (
                  <div key={group.label} className="flex flex-col gap-1.5">
                    <span className="text-xs text-on-surface-variant/80">{group.label}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {group.segments.map(seg => {
                        const on = segments.includes(seg)
                        if (!isEditor && !on) return null
                        return (
                          <Pill
                            key={seg}
                            active={on}
                            onClick={isEditor ? () => setSegments(prev => on ? prev.filter(x => x !== seg) : [...prev, seg]) : undefined}
                            className="px-3 py-1 text-[13px]"
                          >
                            {seg}
                          </Pill>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {!isEditor && segments.length === 0 && (
                  <span className="text-sm text-on-surface-variant">None</span>
                )}
              </div>

              {/* Contributors */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <FieldLabel>Contributors</FieldLabel>
                  {isEditor && (
                    <button onClick={addContributor} className={cx("text-[13px]", linkCls)}>
                      Add
                    </button>
                  )}
                </div>
                {contributors.length === 0 && (
                  <p className="text-[13px] text-on-surface-variant">No contributors yet.</p>
                )}
                {contributors.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {isEditor ? (
                      <>
                        <select
                          value={c.profile_id}
                          onChange={e => setContribs(prev => prev.map((x, j) => j === i ? { ...x, profile_id: e.target.value } : x))}
                          className={cx(fieldSmCls, "flex-1")}
                        >
                          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                        </select>
                        <select
                          value={c.role}
                          onChange={e => setContribs(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value as ContributorRole } : x))}
                          className={cx(fieldSmCls, "w-32")}
                        >
                          {CONTRIBUTOR_ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
                        </select>
                        <button
                          onClick={() => setContribs(prev => prev.filter((_, j) => j !== i))}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:text-error hover:bg-error-container transition-colors"
                          aria-label="Remove contributor"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-on-surface">
                        {profiles.find(p => p.id === c.profile_id)?.full_name ?? "Unknown"} — {c.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- COMMENTS TAB --- */}
          {activeTab === "comments" && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
                {loadingComments && (
                  <p className="text-xs text-on-surface-variant text-center py-4">Loading…</p>
                )}
                {!loadingComments && comments.length === 0 && (
                  <p className="text-xs text-on-surface-variant text-center py-8">No comments yet. Be the first to add one.</p>
                )}
                {comments.map(c => {
                  const isOwn = currentUser?.id === c.author_id
                  return (
                    <div key={c.id} className="flex flex-col gap-0.5 group">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-on-surface">
                          {c.author?.full_name ?? "Unknown"}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          {new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isOwn && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 text-on-surface-variant hover:text-error transition-all"
                            aria-label="Delete comment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-on-surface bg-surface-container rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
                        {parseMentions(c.body).map((seg, i) =>
                          seg.type === "text" ? (
                            <span key={i}>{seg.value}</span>
                          ) : (
                            <span
                              key={i}
                              className={`font-semibold rounded px-0.5 ${
                                seg.id === currentUser?.id ? "bg-on-surface/10 text-on-surface" : "text-on-surface underline decoration-on-surface/25 underline-offset-2"
                              }`}
                            >
                              @{seg.name}
                            </span>
                          )
                        )}
                      </p>
                    </div>
                  )
                })}
                <div ref={commentsEndRef} />
              </div>

              {/* Comment input — type @ to mention a teammate */}
              <div className="flex-shrink-0 border-t border-border px-4 py-3 flex flex-col gap-1.5">
                <ErrorText>{commentError}</ErrorText>
                <MentionInput onSubmit={handlePostComment} />
              </div>
            </div>
          )}

          {/* Footer (details tab only) */}
          {activeTab === "details" && isEditor && (
            <div className="flex flex-col gap-2 px-6 py-4 border-t border-border flex-shrink-0">
              <ErrorText>{error}</ErrorText>
              <div className="flex justify-between items-center">
                {!isNew ? (
                  <div className="flex items-center gap-1 -ml-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)} className="text-error hover:text-error hover:bg-error-container">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDuplicate} disabled={duplicating || saving}>
                      <Copy className="h-3.5 w-3.5" /> {duplicating ? "Duplicating…" : "Duplicate"}
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={notifyTeam}
                      onChange={e => setNotifyTeam(e.target.checked)}
                      className="h-4 w-4 rounded border-outline-variant accent-primary"
                    />
                    Notify the team
                  </label>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : isNew ? "Create" : "Save changes"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
          <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-[20px] text-on-surface">Delete item?</h3>
            <p className="text-sm text-on-surface-variant">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmDel(false)}>Cancel</Button>
              <Button onClick={handleDelete} className="bg-error hover:bg-error/90">Delete</Button>
            </div>
          </div>
        </div>
      )}

      {newCampaignOpen && (
        <CreateCampaignDialog
          stacked
          open={newCampaignOpen}
          onOpenChange={setNewCampaignOpen}
          onCreated={async campaign => {
            // Refresh before selecting, or the new id has no <option> yet
            await refreshCampaigns()
            setCampaignId(campaign.id)
          }}
        />
      )}
    </>
  )
}
