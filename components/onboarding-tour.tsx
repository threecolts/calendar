"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { X } from "lucide-react"
import { useStore } from "@/lib/store"
import { Button, cx } from "@/components/kit"

/** Fire this on window to open the guide from anywhere (the top bar's Guide button does). */
export const OPEN_GUIDE_EVENT = "open-onboarding-guide"

// Bump the version to show a rewritten guide to everyone again.
const seenKey = (userId: string) => `content-calendar:guide-seen:v1:${userId}`

export interface Step {
  route: string
  /** data-tour value of the element to spotlight; omitted = centred card */
  target?: string
  title: string
  body: string
  bullets?: string[]
  /** Runs when the step opens, e.g. to switch to the tab it talks about */
  onEnter?: () => void
}

const MAIN_STEPS: Step[] = [
  {
    route: "/",
    title: "Welcome to Content Calendar",
    body: "This is where all our content lives: raw ideas, campaigns, what's going out when, and who's on it. This guide walks through each part of the app.",
    bullets: [
      "Use Next and Back, or the ← → arrow keys.",
      "You can still click around the page while the guide is open.",
      "Replay it any time from Guide in the top bar.",
    ],
  },
  {
    route: "/",
    target: "nav",
    title: "Five areas",
    body: "Everything is one click away from the top bar.",
    bullets: [
      "Inbox: raw ideas anyone can drop in.",
      "Calendar: every piece of content and when it goes out.",
      "Campaigns: bigger pushes that group content around one goal.",
      "Library: everything we've made, searchable.",
      "Team: who's who, and who can edit.",
    ],
  },
  {
    route: "/",
    target: "cal-card",
    title: "Each card is one piece of content",
    body: "You can read a lot from a card at a glance.",
    bullets: [
      "Card colour and the icon bottom-right show the channel.",
      "The dot and name show the campaign it belongs to.",
      "TBC means the date is still provisional.",
      "Faded cards are already published.",
      "Hover to see the full title.",
    ],
  },
  {
    route: "/",
    target: "cal-card",
    title: "Drag to reschedule, click for detail",
    body: "Drag a card onto another day to move it. Click it to open everything about that piece:",
    bullets: [
      "Title, channel, format, status and campaign.",
      "Owner and contributors (writer, designer, video, reviewer).",
      "Publish date, and whether it's confirmed or provisional.",
      "Audience, notes, and a brief link. Google Docs preview right inside it.",
      "Comments, where you can @mention teammates.",
    ],
  },
  {
    route: "/",
    target: "cal-views",
    title: "Month, Week or List",
    body: "Switch between a month grid, a single week, or a plain list. On phones the calendar always shows the list, so it stays readable.",
  },
  {
    route: "/",
    target: "cal-filters",
    title: "Filter down to what matters",
    body: "Narrow the calendar by campaign, motion, channel, status, product, audience or assignee. Filters are kept in the page link, so you can send someone exactly the view you're looking at.",
  },
  {
    route: "/",
    target: "cal-actions",
    title: "Add, import and export",
    body: "",
    bullets: [
      "Add item: create a new piece of content.",
      "Import: paste a plan from a doc, Slack or a spreadsheet. AI turns it into campaigns and dated items, and you review everything before it's saved.",
      "Export: a clean, printable calendar to share outside the app.",
    ],
  },
  {
    route: "/",
    target: "cal-unscheduled",
    title: "Unscheduled items",
    body: "Content without a date waits here, below the calendar. Once you know when it's going out, drag it onto a day.",
  },
  {
    route: "/",
    target: "cal-key",
    title: "Progress and colour key",
    body: "Under the calendar: how many items are in progress, in review and scheduled, plus the key for which colour is which channel.",
  },
  {
    route: "/inbox",
    target: "inbox-capture",
    title: "Inbox: capture ideas",
    body: "Anyone can drop an idea here: just a title and optional notes. Ideas stay out of the calendar until someone decides to run with them.",
  },
  {
    route: "/inbox",
    target: "inbox-idea",
    title: "Discuss and promote ideas",
    body: "Click an idea to open it.",
    bullets: [
      "Whoever created it can edit the title and notes.",
      "Paste a Google Doc link to preview it inline.",
      "Comment and @mention people. They get notified and can reply.",
      "Editors can promote it to an item (it joins the calendar) or to a whole campaign. Comments come along with it.",
    ],
  },
  {
    route: "/inbox",
    target: "bell",
    title: "Notifications",
    body: "The bell lights up when someone @mentions you, or when a teammate starts new content and lets the team know. Click a notification to jump straight to it.",
  },
  {
    route: "/campaigns",
    target: "campaigns-new",
    title: "Campaigns",
    body: "A campaign groups content around one goal. Each has a product, a type (Pillar, Launch or Always-on), a motion (SMB, Enterprise, Both or Retention), an objective and dates. Search and filter by motion just below.",
  },
  {
    route: "/campaigns",
    target: "campaign-card",
    title: "Inside a campaign",
    body: "Open a campaign to:",
    bullets: [
      "Edit its details.",
      "See every piece of content in it, and its progress.",
      "Generate with AI: describe the goal and get draft items to review.",
      "Select several items and move them to another campaign in one go.",
    ],
  },
  {
    route: "/library",
    target: "library-filters",
    title: "Library",
    body: "Every piece of content in one searchable table. Filter by campaign or channel, and use the live links to jump to what's been published.",
  },
  {
    route: "/team",
    target: "team-table",
    title: "Team and access",
    body: "Who's on the team, what they're assigned and what they've published.",
    bullets: [
      "Editors can create and change content and campaigns.",
      "Viewers can browse, add ideas and comment.",
      "Editors invite people and switch someone's access from here.",
    ],
  },
  {
    route: "/team",
    target: "account",
    title: "Your profile",
    body: "Set your name, role and photo from Profile. Settings and Sign out are here too.",
  },
  {
    route: "/",
    target: "guide",
    title: "That's the tour",
    body: "Come back to this guide any time from here. Happy planning!",
  },
]

const GAP = 14
const MARGIN = 16

/** The app-wide guide. Steps aside on pages that have their own (the Lab). */
export function OnboardingTour() {
  const pathname = usePathname()
  return <GuidedTour steps={MAIN_STEPS} storageKey={seenKey} active={!pathname.startsWith("/lab") && !pathname.startsWith("/social")} />
}

/**
 * A spotlight tour: walks through `steps`, opening automatically the first
 * time (remembered per user under `storageKey`) and on the Guide button while
 * `active`.
 */
export function GuidedTour({ steps, storageKey, active, closeWhenInactive = false, autoOpen = "first-visit" }: {
  steps: Step[]
  storageKey: (userId: string) => string
  active: boolean
  /** Hide (without marking it seen) when `active` turns false, e.g. another tab's guide takes over */
  closeWhenInactive?: boolean
  /** "first-visit": once per person; "every-time": whenever `active` turns on; "never": only from the Guide button */
  autoOpen?: "first-visit" | "every-time" | "never"
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentUser } = useStore()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<Element | null>(null)
  const [resolved, setResolved] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)
  const [navigating, setNavigating] = useState(false)
  /** Another dialog or popover is open (e.g. a card the presenter clicked) — step aside until it closes */
  const [paused, setPaused] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  const step = steps[index]
  const offRoute = pathname !== step.route

  // The Guide button resumes where you left off; "Start over" goes back to step 1
  const resume = useCallback(() => setOpen(true), [])
  const restart = useCallback(() => { setIndex(0); setOpen(true) }, [])

  const userId = currentUser?.id
  const markSeen = useCallback(() => {
    if (!userId) return
    try { localStorage.setItem(storageKey(userId), new Date().toISOString()) } catch {}
  }, [userId, storageKey])

  const close = useCallback(() => { setOpen(false); markSeen() }, [markSeen])

  // First visit: open automatically, once, for anyone who hasn't seen it.
  // "every-time": open from step 1 each time `active` turns on.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!active) { if (autoOpen === "every-time") autoOpened.current = false; return }
    if (!userId || autoOpened.current || autoOpen === "never") return
    autoOpened.current = true
    if (autoOpen === "every-time") { restart(); return }
    let seen = true
    try { seen = !!localStorage.getItem(storageKey(userId)) } catch {}
    if (!seen) restart()
  }, [userId, active, storageKey, restart, autoOpen])

  useEffect(() => { if (closeWhenInactive && !active) setOpen(false) }, [closeWhenInactive, active])

  // Guide button
  useEffect(() => {
    if (!active) return
    window.addEventListener(OPEN_GUIDE_EVENT, resume)
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, resume)
  }, [active, resume])

  useEffect(() => { if (open) steps[index].onEnter?.() }, [open, index, steps])

  // Moving to a step takes you to its page. Only on step change, so clicking
  // to another page mid-tour isn't fought.
  useEffect(() => {
    if (!open) return
    if (pathRef.current !== steps[index].route) {
      setNavigating(true)
      router.push(steps[index].route)
    }
  }, [open, index, router])
  useEffect(() => { if (!offRoute) setNavigating(false) }, [offRoute])

  useEffect(() => {
    if (!open) return
    const check = () => setPaused(!!document.querySelector('[role="dialog"]:not([data-guide]), [role="alertdialog"]'))
    check()
    const id = window.setInterval(check, 250)
    return () => window.clearInterval(id)
  }, [open])

  // Wait for the step's element to appear
  useEffect(() => {
    if (!open) return
    setTarget(null); setRect(null); setResolved(false)
    if (offRoute) { if (!navigating) setResolved(true); return }
    if (!step.target) { setResolved(true); return }

    let tries = 0
    const find = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      const r = el?.getBoundingClientRect()
      if (el && r && r.width > 0 && r.height > 0) {
        el.scrollIntoView({ block: "center", behavior: "smooth" })
        setTarget(el); setResolved(true)
        return true
      }
      return false
    }
    if (find()) return
    const id = window.setInterval(() => {
      if (find() || ++tries > 30) { window.clearInterval(id); setResolved(true) }
    }, 100)
    return () => window.clearInterval(id)
  }, [open, index, offRoute, navigating, step.target])

  // Coming back from a dialog or a closed guide: bring the element back into view
  useEffect(() => {
    if (open && !paused && target) target.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [open, paused, target])

  // Follow the element as the page scrolls, resizes or re-renders
  useEffect(() => {
    if (!open || !target) return
    let frame = 0
    let last = ""
    const tick = () => {
      const r = target.getBoundingClientRect()
      const key = `${r.top},${r.left},${r.width},${r.height}`
      if (key !== last) { last = key; setRect(r) }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [open, target])

  // Place the card below the element, else above, else bottom-right
  useLayoutEffect(() => {
    if (!open || !resolved || !cardRef.current) return
    const { width: w, height: h } = cardRef.current.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    if (!rect && offRoute) { setCardPos({ top: vh - h - MARGIN, left: vw - w - MARGIN }); return }
    if (!rect) { setCardPos({ top: Math.max(MARGIN, (vh - h) / 2), left: (vw - w) / 2 }); return }
    let top: number
    if (rect.bottom + GAP + h <= vh - MARGIN) top = rect.bottom + GAP
    else if (rect.top - GAP - h >= MARGIN) top = rect.top - GAP - h
    else top = vh - h - MARGIN
    const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, MARGIN), vw - w - MARGIN)
    setCardPos({ top, left })
  }, [open, resolved, rect, index, offRoute])

  const next = useCallback(() => {
    if (index === steps.length - 1) { close(); setIndex(0) }
    else setIndex(i => i + 1)
  }, [index, close])
  const back = useCallback(() => setIndex(i => Math.max(0, i - 1)), [])

  useEffect(() => {
    if (!open || paused) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") back()
      else if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, paused, next, back, close])

  if (!open || paused) return null
  const last = index === steps.length - 1
  const pad = 6

  return (
    <>
      {/* Spotlight: dims everything except the element; clicks pass through */}
      {offRoute ? null : rect ? (
        <div
          aria-hidden="true"
          className="fixed z-[60] pointer-events-none rounded-2xl ring-2 ring-white transition-all duration-300"
          style={{
            top: rect.top - pad, left: rect.left - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(20,20,20,0.45)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-[60] bg-black/45" />
      )}

      <div
        ref={cardRef}
        data-guide
        role="dialog"
        aria-label={step.title}
        className={cx(
          "fixed z-[61] w-[min(400px,calc(100vw-32px))] bg-background rounded-2xl shadow-2xl border border-border p-5 flex flex-col gap-3 transition-[top,left,opacity] duration-300",
          resolved && cardPos ? "opacity-100" : "opacity-0",
        )}
        style={{ top: cardPos?.top ?? -9999, left: cardPos?.left ?? 0 }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-on-surface-variant tabular-nums">
            {index + 1} of {steps.length}
          </span>
          <button onClick={close} aria-label="Close guide" className="p-1 -m-1 rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 rounded-full bg-surface-container-high overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <h2 className="text-[19px] font-semibold text-on-surface leading-snug">{step.title}</h2>
        {step.body && <p className="text-sm text-on-surface-variant leading-relaxed">{step.body}</p>}
        {step.bullets && (
          <ul className="flex flex-col gap-1.5 text-sm text-on-surface leading-relaxed">
            {step.bullets.map(b => (
              <li key={b} className="flex gap-2">
                <span className="mt-[9px] h-1 w-1 rounded-full bg-on-surface flex-shrink-0" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {last ? <span /> : (
            <button onClick={index === 0 ? close : restart} className="text-[13px] text-on-surface-variant hover:text-on-surface transition-colors">
              {index === 0 ? "Skip tour" : "Start over"}
            </button>
          )}
          <div className="flex items-center gap-2">
            {index > 0 && <Button variant="secondary" size="sm" onClick={back}>Back</Button>}
            <Button size="sm" onClick={next}>{last ? "Finish" : "Next"}</Button>
          </div>
        </div>
      </div>
    </>
  )
}
