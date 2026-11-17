"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { User, Settings, LogOut, Compass, FlaskConical, Check, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useStore } from "@/lib/store"
import { NotificationBell } from "@/components/notification-bell"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cx } from "@/components/kit"
import { OPEN_GUIDE_EVENT } from "@/components/onboarding-tour"

const NAV = [
  { label: "Inbox",     href: "/inbox" },
  { label: "Requests",  href: "/requests" },
  { label: "Calendar",  href: "/" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Library",   href: "/library" },
  { label: "Team",      href: "/team" },
]

/**
 * Team view switcher, beside the app name. "Everything" is the main calendar;
 * a team shows only that team's (and its sub-teams') work on every page.
 * Hidden until teams exist (scripts/012).
 */
function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeam, currentUser } = useStore()
  const [open, setOpen] = useState(false)
  if (!teams.length) return null
  const current = teams.find(t => t.id === activeTeam)
  // Top-level teams, each followed by its sub-teams (indented)
  const ordered: { id: string; name: string; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const t of teams.filter(t => t.parent_id === parent)) { ordered.push({ id: t.id, name: t.name, depth }); walk(t.id, depth + 1) }
  }
  walk(null, 0)
  const pick = (v: string) => { setActiveTeam(v); setOpen(false) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-tour="team-switcher"
          aria-label={`Team view: ${current?.name ?? "Everything"}`}
          className={cx(
            "h-8 pl-3 pr-2 inline-flex items-center gap-1 rounded-full border text-[13px] font-medium transition-colors whitespace-nowrap",
            current ? "bg-primary border-primary text-primary-foreground" : "border-outline-variant text-on-surface-variant hover:text-on-surface",
          )}
        >
          {current?.name ?? "Everything"} <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5 rounded-xl">
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-on-surface-variant">View</p>
        <button onClick={() => pick("all")} className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm text-on-surface hover:bg-surface-container-low text-left">
          <span>Everything <span className="text-on-surface-variant">· main calendar</span></span>
          {!current && <Check className="h-4 w-4" />}
        </button>
        {ordered.map(t => (
          <button key={t.id} onClick={() => pick(t.id)} className="w-full flex items-center justify-between gap-2 py-2 pr-2.5 rounded-lg text-sm text-on-surface hover:bg-surface-container-low text-left" style={{ paddingLeft: 10 + t.depth * 14 }}>
            <span>{t.name}{t.id === currentUser?.team_id && <span className="text-on-surface-variant"> · your team</span>}</span>
            {current?.id === t.id && <Check className="h-4 w-4" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** App shell: name on the left, pill tabs in the middle, bell and account on the right. */
export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentUser, teams } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

  const name = currentUser?.full_name || "Account"
  const avatar =
    currentUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`

  const signOut = async () => {
    setSigningOut(true)
    await createClient().auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 grid grid-cols-[auto_1fr] md:grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-2">
        <div className="justify-self-start inline-flex items-center gap-2.5 min-w-0">
          <Link href="/" className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-on-surface whitespace-nowrap">
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            {/* On phones the team pill takes the name's place */}
            <span className={teams.length ? "hidden sm:inline" : undefined}>Content Calendar</span>
          </Link>
          <TeamSwitcher />
        </div>

        <nav
          aria-label="Main"
          data-tour="nav"
          className="col-span-2 row-start-2 md:col-span-1 md:row-start-1 md:col-start-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="inline-flex items-center gap-0.5 p-1 rounded-full border border-outline-variant">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cx(
                  "h-8 px-4 inline-flex items-center rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                  isActive(item.href) ? "bg-primary text-primary-foreground" : "text-on-surface-variant hover:text-on-surface",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="justify-self-end row-start-1 col-start-2 md:col-start-3 flex items-center gap-1">
          <Link
            href="/lab"
            aria-current={pathname.startsWith("/lab") ? "page" : undefined}
            className={cx(
              "h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors",
              pathname.startsWith("/lab")
                ? "bg-primary text-primary-foreground"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low",
            )}
          >
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Lab</span>
          </Link>
          <button
            data-tour="guide"
            onClick={() => window.dispatchEvent(new Event(OPEN_GUIDE_EVENT))}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
          >
            <Compass className="h-4 w-4" />
            <span className="hidden sm:inline">Guide</span>
          </button>
          <span data-tour="bell" className="inline-flex"><NotificationBell /></span>
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                data-tour="account"
                className="h-9 w-9 rounded-full overflow-hidden border border-outline-variant hover:border-on-surface/30 transition-colors"
                aria-label="Account menu"
              >
                <img src={avatar} alt="" className="h-full w-full object-cover bg-surface-container-low" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1.5">
              <div className="px-2.5 py-2 border-b border-border mb-1">
                <p className="text-sm font-medium text-on-surface truncate">{name}</p>
                {currentUser?.role && <p className="text-xs text-on-surface-variant truncate">{currentUser.role}</p>}
              </div>
              {[
                { href: "/profile",  label: "Profile",  icon: User },
                { href: "/settings", label: "Settings", icon: Settings },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <item.icon className="h-4 w-4 text-on-surface-variant" />
                  {item.label}
                </Link>
              ))}
              <button
                onClick={signOut}
                disabled={signingOut}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50"
              >
                <LogOut className="h-4 w-4 text-on-surface-variant" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  )
}
