"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Sparkles, Zap, PenLine, MessageSquare, Check, AlertTriangle, Copy as CopyIcon, FlaskConical, Compass } from "lucide-react"
import { useStore, useIsEditor } from "@/lib/store"
import { useRefreshData } from "@/components/data-provider"
import {
  createCampaignClient, createContentItemsClient, createIdeaClient, getIdeasClient, getItemCommentsClient,
} from "@/lib/data-client"
import {
  PRODUCT_OPTIONS, channelBackground, parseDateString,
  type CampaignMotion, type CampaignType, type CampaignWithItems, type ContentChannel, type ContentFormat, type IdeaWithCreator, type ItemComment,
} from "@/lib/database.types"
import { toPlainText } from "@/lib/mentions"
import { GuidedTour, OPEN_GUIDE_EVENT, type Step } from "@/components/onboarding-tour"
import { ChannelIcon } from "@/components/channel-icon"
import { Button, ErrorText, Field, SegmentedControl, cx, fieldCls, linkCls, textareaCls } from "@/components/kit"
import { SocialStudio } from "@/components/social-studio"

// ---- Types mirrored from /api/lab ----
interface Decision { id: string; answer: string; confidence: number; alternatives: { option: string; probability: number }[] }
interface DecisionResult { engineLabel: string; ms: number; decisions: Record<string, Decision> }
interface DraftItem { title: string; channel: string; format: string; publish_date: string; date_confidence: "Confirmed" | "Provisional" }
interface DraftCampaign { title: string; objective: string; type: string; motion: string; product: string | null; items: DraftItem[] }
interface CampaignCheck {
  ms: number
  engineLabel: string
  match: Decision & { campaignId: string | null }
  items: { fit: Decision; duplicate: Decision }[]
}
interface DraftResult { draft: { campaigns: DraftCampaign[] }; checks: CampaignCheck[]; docStatus: "read" | "not-shared" | "none" | "pasted"; engineLabel?: string }

const NEW_CAMPAIGN = "Create new campaign"
const NO_DUPLICATE = "No duplicate"
const SPLIT = "Split into multiple campaigns"

async function lab<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Something went wrong")
  return data as T
}

const pct = (p: number) => `${Math.round(p * 100)}%`
const niceDate = (d: string) => {
  try { return parseDateString(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) } catch { return d }
}

// ---- Small shared pieces ----

function EngineLine({ label, ms, what }: { label?: string; ms?: number; what?: string }) {
  if (!label) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
      {what ? `${what} ` : "Decided "}by {label}{ms !== undefined && <> in <span className="tabular-nums font-medium text-on-surface">{ms.toLocaleString()} ms</span></>}
    </p>
  )
}

function DecisionCard({ label, decision, render }: { label: string; decision?: Decision; render?: (answer: string) => React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-2 min-w-0">
      <span className="text-xs text-on-surface-variant">{label}</span>
      {decision ? (
        <>
          <span className="text-sm font-semibold text-on-surface break-words">{render ? render(decision.answer) : decision.answer}</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: pct(decision.confidence) }} />
            </div>
            <span className="text-xs tabular-nums text-on-surface-variant">{pct(decision.confidence)}</span>
          </div>
          {decision.alternatives.length > 1 && (
            <span className="text-[11px] text-on-surface-variant truncate">
              then {decision.alternatives.slice(1).map(a => `${a.option} ${pct(a.probability)}`).join(" · ")}
            </span>
          )}
        </>
      ) : (
        <span className="h-5 w-2/3 rounded bg-surface-container-high animate-pulse" />
      )}
    </div>
  )
}

function ProbabilityBars({ decision }: { decision: Decision }) {
  return (
    <div className="flex flex-col gap-2">
      {decision.alternatives.map((a, i) => (
        <div key={a.option} className="flex items-center gap-3">
          <span className={cx("w-56 text-sm truncate", i === 0 ? "font-semibold text-on-surface" : "text-on-surface-variant")}>{a.option}</span>
          <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
            <div className={cx("h-full rounded-full transition-all duration-500", i === 0 ? "bg-primary" : "bg-on-surface/25")} style={{ width: pct(a.probability) }} />
          </div>
          <span className="w-10 text-right text-xs tabular-nums text-on-surface-variant">{pct(a.probability)}</span>
        </div>
      ))}
    </div>
  )
}

// ---- 1. Sort an idea as you type ----

const EXAMPLE_IDEAS = [
  "Customer story video: InventoryLab saved a seller 10 hours a week",
  "LinkedIn carousel on Q4 peak storage fees and how to avoid them",
  "Webinar on repricing strategies for the holiday rush",
]

function TriageDemo() {
  const { currentUser } = useStore()
  const [text, setText] = useState("")
  const [result, setResult] = useState<DecisionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [added, setAdded] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    setAdded(false)
    const t = text.trim()
    if (t.length < 4) { setResult(null); return }
    const run = ++latest.current
    const timer = setTimeout(async () => {
      setLoading(true); setError("")
      try {
        const r = await lab<DecisionResult>({ action: "triage", text: t })
        if (run === latest.current) setResult(r)
      } catch (e) {
        if (run === latest.current) setError(e instanceof Error ? e.message : "Couldn't sort the idea")
      } finally {
        if (run === latest.current) setLoading(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [text])

  const d = result?.decisions
  const addToInbox = async () => {
    if (!d) return
    const notes = [
      `Suggested by AI Lab: ${d.channel.answer} ${d.format.answer}`,
      d.campaign.answer !== NEW_CAMPAIGN ? `for "${d.campaign.answer}"` : "as a new campaign",
      d.product.answer !== "Other" ? `· ${d.product.answer}` : "",
      `· ${d.audience.answer} · priority ${d.priority.answer}/5`,
    ].filter(Boolean).join(" ")
    await createIdeaClient({ title: text.trim(), notes, createdById: currentUser?.id ?? null })
    setAdded(true)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Start typing an idea…"
          className={cx(fieldCls, "h-12 text-base")}
          data-tour="lab-triage-input"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          Try:
          {EXAMPLE_IDEAS.map(ex => (
            <button key={ex} onClick={() => setText(ex)} className="rounded-full border border-outline-variant px-2.5 py-1 hover:text-on-surface hover:border-on-surface/30 transition-colors">
              {ex.length > 44 ? ex.slice(0, 44) + "…" : ex}
            </button>
          ))}
        </div>
      </div>

      {(result || loading) && (
        <>
          <div className={cx("grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity", loading && "opacity-60")}>
            <DecisionCard label="Campaign" decision={d?.campaign} />
            <DecisionCard
              label="Channel"
              decision={d?.channel}
              render={a => (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-md inline-flex items-center justify-center text-white" style={{ background: channelBackground(a) }}>
                    <ChannelIcon channel={a} className="h-3 w-3" />
                  </span>
                  {a}
                </span>
              )}
            />
            <DecisionCard label="Format" decision={d?.format} />
            <DecisionCard label="Product" decision={d?.product} />
            <DecisionCard label="Audience" decision={d?.audience} />
            <DecisionCard label="Priority" decision={d?.priority} render={a => `${a} / 5`} />
            <div className="col-span-2">
              <DecisionCard
                label="Duplicate check"
                decision={d?.duplicate}
                render={a => a === NO_DUPLICATE ? "No duplicate found" : <>Looks like “{a}”</>}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <EngineLine label={result?.engineLabel} ms={result?.ms} what="7 decisions" />
            <Button variant="secondary" size="sm" onClick={addToInbox} disabled={!d || loading || added}>
              {added ? <><Check className="h-3.5 w-3.5" /> Added to Inbox</> : "Add to Inbox with these suggestions"}
            </Button>
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

// ---- Shared: review drafted campaigns, then create them ----

function DraftReview({ result, onDone }: { result: DraftResult; onDone?: () => void }) {
  const { campaigns, currentUser } = useStore()
  const isEditor = useIsEditor()
  const { refreshCampaigns } = useRefreshData()
  const today = new Date().toISOString().slice(0, 10)
  const liveCampaigns = campaigns.filter((c: CampaignWithItems) => c.status === "Active" && (!c.end_date || c.end_date >= today))

  const [include, setInclude] = useState(() => result.draft.campaigns.map(() => true))
  const [targets, setTargets] = useState(() => result.checks.map(c => c.match.campaignId ?? ""))
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState<{ created: number; added: number } | null>(null)

  const totalItems = result.draft.campaigns.reduce((n, c) => n + c.items.length, 0)
  const flagged = result.checks.reduce((n, c) => n + c.items.filter(it =>
    it.fit.answer !== "Good fit" || (it.duplicate.answer !== NO_DUPLICATE && it.duplicate.confidence >= 0.5)).length, 0)
  const slowest = Math.max(...result.checks.map(c => c.ms))

  const create = async () => {
    setCreating(true); setError("")
    let created = 0, added = 0
    try {
      for (const [i, c] of result.draft.campaigns.entries()) {
        if (!include[i]) continue
        const dates = c.items.map(it => it.publish_date).sort()
        let campaignId = targets[i]
        if (!campaignId) {
          const campaign = await createCampaignClient({
            title: c.title,
            objective: c.objective,
            type: c.type as CampaignType,
            motion: c.motion as CampaignMotion,
            product: c.product && PRODUCT_OPTIONS.includes(c.product) ? c.product : null,
            status: "Active",
            start_date: dates[0] ?? null,
            end_date: dates[dates.length - 1] ?? null,
          })
          campaignId = campaign.id
          created++
        } else {
          added++
        }
        await createContentItemsClient(c.items.map((it, n) => ({
          campaign_id: campaignId,
          title: it.title,
          channel: it.channel as ContentChannel,
          format: it.format as ContentFormat,
          status: "Planned" as const,
          publish_date: it.publish_date,
          date_confidence: it.date_confidence,
          sort_order: n,
          created_by: currentUser?.id ?? null,
        })))
      }
      await refreshCampaigns()
      setDone({ created, added })
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the campaigns")
    } finally {
      setCreating(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-2">
        <p className="text-lg font-semibold text-on-surface flex items-center gap-2"><Check className="h-5 w-5" /> Done</p>
        <p className="text-sm text-on-surface-variant">
          {done.created > 0 && `Created ${done.created} campaign${done.created === 1 ? "" : "s"}. `}
          {done.added > 0 && `Added items to ${done.added} existing campaign${done.added === 1 ? "" : "s"}.`}
        </p>
        <div className="flex gap-4 text-sm">
          <Link href="/" className={linkCls}>See them on the calendar</Link>
          <Link href="/campaigns" className={linkCls}>Open Campaigns</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface-container-low px-4 py-3 flex flex-col gap-1">
        <p className="text-sm text-on-surface">
          <span className="font-semibold">Claude</span> drafted {result.draft.campaigns.length} campaign{result.draft.campaigns.length === 1 ? "" : "s"} with {totalItems} items.
          {" "}Every campaign was matched against your live campaigns and every item checked for channel fit and duplicates
          {flagged > 0 ? <> — <span className="font-semibold">{flagged} flagged</span> for a look.</> : " — nothing flagged."}
        </p>
        <EngineLine label={result.engineLabel} ms={slowest} what="Checks" />
      </div>

      {result.draft.campaigns.map((c, i) => {
        const check = result.checks[i]
        return (
          <div key={i} className={cx("rounded-2xl border border-border bg-card overflow-hidden transition-opacity", !include[i] && "opacity-50")}>
            <div className="p-4 flex flex-col gap-3 border-b border-border">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={include[i]}
                  onChange={e => setInclude(prev => prev.map((v, n) => n === i ? e.target.checked : v))}
                  className="mt-1.5 h-4 w-4 accent-[var(--primary)]"
                  aria-label={`Include ${c.title}`}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[17px] font-semibold text-on-surface">{c.title}</h3>
                  <p className="text-sm text-on-surface-variant">{c.objective}</p>
                  <p className="text-xs text-on-surface-variant mt-1">{[c.type, c.motion, c.product].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-7">
                <span className="text-xs text-on-surface-variant">Goes to</span>
                <select
                  value={targets[i]}
                  onChange={e => setTargets(prev => prev.map((v, n) => n === i ? e.target.value : v))}
                  className="h-8 rounded-lg border border-outline-variant bg-surface-container px-2 text-[13px] text-on-surface"
                >
                  <option value="">New campaign</option>
                  {liveCampaigns.map((l: CampaignWithItems) => <option key={l.id} value={l.id}>Existing: {l.title}</option>)}
                </select>
                <span className="text-xs text-on-surface-variant">
                  Suggested: {check.match.answer === NEW_CAMPAIGN ? "new campaign" : `add to “${check.match.answer}”`} ({pct(check.match.confidence)})
                </span>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {c.items.map((it, n) => {
                const fit = check.items[n]?.fit
                const dup = check.items[n]?.duplicate
                const isDup = dup && dup.answer !== NO_DUPLICATE && dup.confidence >= 0.5
                return (
                  <li key={n} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="h-6 w-6 rounded-md inline-flex items-center justify-center text-white flex-shrink-0" style={{ background: channelBackground(it.channel) }} title={it.channel}>
                      <ChannelIcon channel={it.channel} className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 min-w-[180px] text-sm text-on-surface">{it.title}</span>
                    <span className="text-xs text-on-surface-variant">{it.format}</span>
                    <span className="text-xs text-on-surface-variant tabular-nums w-24 text-right">
                      {niceDate(it.publish_date)}{it.date_confidence === "Provisional" && " · TBC"}
                    </span>
                    {(fit && fit.answer !== "Good fit") || isDup ? (
                      <span className="w-full pl-9 flex flex-wrap gap-x-4 text-xs text-error">
                        {fit && fit.answer !== "Good fit" && (
                          <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {fit.answer}: {it.format} on {it.channel} ({pct(fit.confidence)})</span>
                        )}
                        {isDup && (
                          <span className="inline-flex items-center gap-1"><CopyIcon className="h-3 w-3" /> Possible duplicate of “{dup.answer}” ({pct(dup.confidence)})</span>
                        )}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ErrorText>{error}</ErrorText>
        {!isEditor && <span className="text-xs text-on-surface-variant">Only editors can create campaigns.</span>}
        <Button onClick={create} disabled={creating || !isEditor || !include.some(Boolean)}>
          {creating ? "Adding…" : "Add to calendar"}
        </Button>
      </div>
    </div>
  )
}

// ---- 2. A comment becomes a one-click action ----

function CommentDemo({ initialIdeaId, initialCommentId }: { initialIdeaId?: string; initialCommentId?: string }) {
  const [ideas, setIdeas] = useState<IdeaWithCreator[]>([])
  const [ideaId, setIdeaId] = useState(initialIdeaId ?? "")
  const [comments, setComments] = useState<ItemComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [comment, setComment] = useState("")
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)
  const autoRead = useRef(initialCommentId ?? null)
  const [intent, setIntent] = useState<DecisionResult | null>(null)
  const [reading, setReading] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [docText, setDocText] = useState("")
  const [draft, setDraft] = useState<DraftResult | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    getIdeasClient()
      .then(list => {
        setIdeas(list)
        // Default to the newest idea
        if (!initialIdeaId && list.length) setIdeaId(list[list.length - 1].id)
      })
      .catch(() => setError("Couldn't load Inbox ideas"))
  }, [initialIdeaId])

  // The selected idea's real comments
  useEffect(() => {
    if (!ideaId) { setComments([]); return }
    setLoadingComments(true)
    getItemCommentsClient(ideaId)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false))
  }, [ideaId])

  const idea = ideas.find(i => i.id === ideaId)

  const readComment = async (text = comment) => {
    if (!text.trim()) return
    setReading(true); setError(""); setIntent(null); setDraft(null)
    try { setIntent(await lab<DecisionResult>({ action: "intent", comment: text, ideaTitle: idea?.title })) }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't read the comment") }
    finally { setReading(false) }
  }

  const pickComment = (c: ItemComment) => {
    const text = toPlainText(c.body)
    setSelectedCommentId(c.id); setComment(text)
    readComment(text)
  }

  // Arriving from a comment's Jev button: read that comment straight away
  useEffect(() => {
    if (!autoRead.current || !idea) return
    const c = comments.find(x => x.id === autoRead.current)
    if (c) { autoRead.current = null; pickComment(c) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, idea])

  const changeIdea = (id: string) => {
    setIdeaId(id); setIntent(null); setDraft(null); setComment(""); setSelectedCommentId(null)
  }

  const split = async () => {
    setDrafting(true); setError(""); setDraft(null)
    try { setDraft(await lab<DraftResult>({ action: "draft", ideaId, comment, docText })) }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't draft the campaigns") }
    finally { setDrafting(false) }
  }

  const top = intent?.decisions.intent
  const isSplit = top?.answer === SPLIT

  return (
    <div className="flex flex-col gap-5">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Inbox idea">
          <select value={ideaId} onChange={e => changeIdea(e.target.value)} className={fieldCls} data-tour="lab-idea-picker">
            {ideas.length === 0 && <option value="">No ideas in the Inbox</option>}
            {ideas.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        </Field>
        <div className="text-xs text-on-surface-variant self-end pb-2">
          {idea?.brief_url ? "This idea has a Google Doc linked — Claude will try to read it." : "No Google Doc linked to this idea."}
        </div>
      </div>
      <div className="flex flex-col gap-2" data-tour="lab-comments">
        <span className="text-[13px] text-on-surface-variant">Comments on this idea</span>
        {loadingComments ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No comments on this idea yet. Write a test one below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {comments.map(c => (
              <li
                key={c.id}
                className={cx(
                  "rounded-xl border px-3.5 py-2.5 flex items-start gap-3 transition-colors",
                  selectedCommentId === c.id ? "border-primary bg-surface-container-low" : "border-border bg-card",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-on-surface">{c.author?.full_name ?? "Someone"}</p>
                  <p className="text-sm text-on-surface whitespace-pre-wrap">{toPlainText(c.body)}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => pickComment(c)} disabled={reading}>
                  <Zap className="h-3.5 w-3.5" /> Ask Jev
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Field label="Or write a test comment">
        <textarea
          value={comment}
          onChange={e => { setComment(e.target.value); setSelectedCommentId(null); setIntent(null) }}
          rows={2}
          placeholder="e.g. Can you split this into multiple campaigns?"
          className={textareaCls}
        />
      </Field>
      <div>
        <Button onClick={() => readComment()} disabled={reading || !comment.trim() || !ideaId}>
          <MessageSquare className="h-4 w-4" /> {reading ? "Jev is reading…" : "Ask Jev about this comment"}
        </Button>
      </div>

      {top && (
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-4" data-tour="lab-intent">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-on-surface-variant">What the comment is asking for</span>
            <ProbabilityBars decision={top} />
          </div>
          <EngineLine label={intent?.engineLabel} ms={intent?.ms} />
          {isSplit ? (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <div>
                <Button onClick={split} disabled={drafting}>
                  <Sparkles className="h-4 w-4" /> {drafting ? "Claude is drafting the campaigns…" : "Split into campaigns"}
                </Button>
              </div>
              {(draft?.docStatus === "not-shared" || docText) && (
                <Field label="Paste the Google Doc's text" hint="The doc isn't shared publicly, so the app can't open it. Paste its contents and split again.">
                  <textarea value={docText} onChange={e => setDocText(e.target.value)} rows={5} className={textareaCls} />
                </Field>
              )}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant border-t border-border pt-4">
              No action button for this one — the comment isn&apos;t asking for a split. Try a comment like “Can you split this into separate campaigns?”
            </p>
          )}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {draft && (
        <>
          {draft.docStatus === "read" && <p className="text-xs text-on-surface-variant">Claude read the linked Google Doc.</p>}
          {draft.docStatus === "not-shared" && <p className="text-xs text-on-surface-variant">The linked doc couldn&apos;t be opened, so this draft is from the idea&apos;s notes only. Paste the doc above for a better split.</p>}
          <DraftReview key={JSON.stringify(draft.draft).length + draft.docStatus} result={draft} />
        </>
      )}
    </div>
  )
}

// ---- 3. Claude drafts a plan, every item gets checked ----

const SAMPLE_PLAN = `Peak season push, Nov–Dec. YouTube: 3 videos on cutting FBA storage fees before Q4 (Ben), plus shorts cut from each. LinkedIn posts twice a week on inventory planning. A Reel for LinkedIn showing the dashboard. Email newsletter early Nov announcing the holiday repricing webinar, webinar itself mid Nov, recap blog after. Also a TikTok on "3 mistakes sellers make in December".`

function PlanDemo() {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<DraftResult | null>(null)
  const [error, setError] = useState("")

  const run = async () => {
    setLoading(true); setError(""); setDraft(null)
    try { setDraft(await lab<DraftResult>({ action: "draft", text })) }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't draft the plan") }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Paste a messy plan">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="Brain-dump the plan here…" className={textareaCls} data-tour="lab-plan" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={loading || text.trim().length < 10}>
          <PenLine className="h-4 w-4" /> {loading ? "Drafting and checking…" : "Draft and check"}
        </Button>
        <button onClick={() => setText(SAMPLE_PLAN)} className={cx("text-[13px]", linkCls)}>Use a sample plan</button>
      </div>
      <ErrorText>{error}</ErrorText>
      {draft && <DraftReview key={text.length} result={draft} />}
    </div>
  )
}

// ---- Page ----

type Tab = "triage" | "comment" | "plan" | "social"

const labSeenKey = (userId: string) => `content-calendar:lab-guide-seen:v1:${userId}`

export function AiLab() {
  const params = useSearchParams()
  const initialTab = params.get("tab")
  const [tab, setTab] = useState<Tab>(initialTab === "comment" || initialTab === "plan" || initialTab === "social" ? initialTab : "triage")

  const steps = useMemo<Step[]>(() => [
    {
      route: "/lab",
      title: "Welcome to the Lab",
      body: "The Lab shows how two kinds of AI work together on your real campaigns and ideas.",
      bullets: [
        "Claude writes: it reads documents and drafts campaigns.",
        "Jev decides: it makes fast, structured calls (which campaign, which channel, is this a duplicate, what is this comment asking for), each with a confidence score.",
        "You approve: nothing is added to the calendar until you click.",
      ],
    },
    {
      route: "/lab",
      target: "lab-tabs",
      title: "Three demos",
      body: "Each tab shows one way Claude and Jev help.",
      bullets: [
        "Sort an idea: Jev sorts a new idea as you type.",
        "Comment to action: a teammate's comment becomes a one-click action.",
        "Check a plan: Claude drafts a plan and Jev checks every item.",
      ],
    },
    {
      route: "/lab",
      target: "lab-triage-input",
      onEnter: () => setTab("triage"),
      title: "Sort an idea",
      body: "Type an idea, or click one of the examples below the box. Jev answers seven questions at once: campaign, channel, format, product, audience, priority and whether it's a duplicate.",
      bullets: [
        "Each answer has a confidence bar, plus the runner-up answers.",
        "The line underneath says which model decided, and how many milliseconds it took.",
        "Add to Inbox saves the idea with those suggestions.",
      ],
    },
    {
      route: "/lab",
      target: "lab-idea-picker",
      onEnter: () => setTab("comment"),
      title: "Comment to action",
      body: "Pick an Inbox idea. If it has a Google Doc linked, Claude will read it when drafting.",
    },
    {
      route: "/lab",
      target: "lab-comments",
      onEnter: () => setTab("comment"),
      title: "Ask Jev about a comment",
      body: "The idea's real comments are listed here. Click Ask Jev on one (or write a test comment) and Jev decides what it's asking for: a split, a promotion, a date change, an approval, a blocker, a question, or nothing.",
      bullets: [
        "You can also do this from the Inbox: every comment on an idea has an Ask Jev button.",
      ],
    },
    {
      route: "/lab",
      onEnter: () => setTab("comment"),
      title: "Split into campaigns",
      body: "When a comment asks for a split, a Split into campaigns button appears.",
      bullets: [
        "Claude reads the idea, its notes, the Google Doc and the comment, then drafts one campaign per stream of work.",
        "Jev checks each campaign against your live ones (add to an existing campaign, or create new?) and each item for channel fit and duplicates.",
        "You review, change anything you like, and click Add to calendar. Only editors can add.",
        "If the Google Doc isn't shared publicly, paste its text into the box that appears.",
      ],
    },
    {
      route: "/lab",
      target: "lab-plan",
      onEnter: () => setTab("plan"),
      title: "Check a plan",
      body: "Paste a messy plan, or click Use a sample plan, then Draft and check. Claude groups it into campaigns with dated items, and Jev flags anything odd, like a Reel on LinkedIn or a possible duplicate.",
    },
    {
      route: "/lab",
      target: "lab-guide",
      title: "That's the Lab",
      body: "Replay this guide any time from here, or from Guide in the top bar while you're in the Lab.",
    },
  ], [])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-semibold text-on-surface tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6" /> Lab
          </h1>
          <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_GUIDE_EVENT))} data-tour="lab-guide">
            <Compass className="h-3.5 w-3.5" /> How the Lab works
          </Button>
        </div>
        <p className="text-sm text-on-surface-variant max-w-2xl">
          <span className="font-semibold text-on-surface">Claude writes, Jev decides.</span> Claude handles the open-ended work: reading docs and drafting campaigns.
          The fast, structured calls (which campaign, which channel, is this a duplicate, what is this comment asking for) go to Jev,
          each with a confidence. Everything here runs on your real campaigns and ideas.
        </p>
        <p className="text-xs text-on-surface-variant max-w-2xl">
          Decisions run on Jev by TypeSafe AI. If Jev is ever unavailable, a fast Claude model stands in, and each result says which model answered.
        </p>
      </div>

      <div data-tour="lab-tabs" className="self-start">
        <SegmentedControl
          ariaLabel="Lab demos"
          value={tab}
          onChange={setTab}
          options={[
            { value: "triage", label: "Sort an idea" },
            { value: "comment", label: "Comment to action" },
            { value: "plan", label: "Check a plan" },
            { value: "social", label: "Social posts" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-[19px] font-semibold text-on-surface">
          {tab === "triage" && "Ideas sorted as you type"}
          {tab === "comment" && "A teammate's comment becomes a one-click action"}
          {tab === "plan" && "Claude drafts the plan, every item gets checked"}
          {tab === "social" && "A calendar entry and its Doc become ready-to-post graphics"}
        </h2>
        <p className="text-sm text-on-surface-variant">
          {tab === "triage" && "Seven decisions at once: campaign, channel, format, product, audience, priority and a duplicate check."}
          {tab === "comment" && "Pick an idea and ask Jev about one of its comments. If it asks for a split, Claude reads the idea and its doc and drafts the campaigns; each is matched against your live campaigns before anything is created."}
          {tab === "plan" && "Claude turns a brain-dump into campaigns and dated items. Each item is checked for channel fit and duplicates, and each campaign matched to a live one."}
          {tab === "social" && "Pick an entry and give it the brief. Claude writes three design options and captions, picks real Unsplash photos (Jev filters out stock first) and renders every size. You approve one, tweak captions and download the zip. Nothing here changes the calendar."}
        </p>
      </div>

      {tab === "triage" && <TriageDemo />}
      {tab === "comment" && <CommentDemo initialIdeaId={params.get("idea") ?? undefined} initialCommentId={params.get("comment") ?? undefined} />}
      {tab === "plan" && <PlanDemo />}
      {tab === "social" && <SocialStudio />}

      <GuidedTour steps={steps} storageKey={labSeenKey} active />
    </div>
  )
}
