"use client"

import { useMemo } from "react"
import { Compass } from "lucide-react"
import { SocialStudio } from "@/components/social-studio"
import { GuidedTour, OPEN_GUIDE_EVENT, type Step } from "@/components/onboarding-tour"
import { Button, PageHeader } from "@/components/kit"

const socialSeenKey = (userId: string) => `content-calendar:social-guide-seen:v1:${userId}`

/** Social: a calendar entry and its brief become ready-to-post graphics. Walks you through itself every visit. */
export function SocialPage() {
  const steps = useMemo<Step[]>(() => {
    return [
      {
        route: "/social",
        title: "Social posts",
        body: "Turn a calendar entry into ready-to-post graphics and captions, in the Threecolts look. A post takes about three minutes, most of it waiting.",
        bullets: [
          "Claude writes three different design options, with captions for each platform.",
          "Real photos come from Unsplash: Jev filters out stock-looking ones, Claude picks. No AI images.",
          "You approve one option and download a zip. Nothing here changes the calendar.",
        ],
      },
      {
        route: "/social",
        target: "social-entry",
        title: "1. Pick the calendar entry",
        body: "Search for the post you planned in the calendar. Its date and channel come with it.",
      },
      {
        route: "/social",
        target: "social-brief",
        title: "2. Give it the brief",
        body: "Upload your Google Doc as a Word file, or paste its text.",
        bullets: [
          "In Google Docs: File → Download → Microsoft Word (.docx), then Upload .docx here.",
          "The whole campaign Doc is fine. Claude uses the part for this entry and tells you which part it used.",
          "Copy you've already written in the Doc (headline, sub-line, offer terms) is kept, not rewritten.",
        ],
      },
      {
        route: "/social",
        target: "social-setup",
        title: "3. Platforms and post type",
        body: "Pick where it's going and whether it's a single image, a carousel or a story. Sizes follow: portrait and square for feed posts, a story for the strongest option, landscape when X or LinkedIn is picked.",
        bullets: ["Direction (optional) is for anything the Doc doesn't say, like which audience block to use or a mood."],
      },
      {
        route: "/social",
        target: "social-generate",
        title: "4. Write three options",
        body: "One click runs everything: Claude writes the options, photos are found on Unsplash, and every size is rendered. Leave the tab open while it works.",
      },
      {
        route: "/social",
        title: "5. Review, approve, download",
        body: "When it's done, each option shows its images and why it exists.",
        bullets: [
          "Read Check before posting first: any claim, number or word that isn't in your brief is listed there.",
          "Don't like a photo? Find another, or Upload my own. Don't like the copy? New copy rewrites one option.",
          "Approve the one you want, edit the captions (character counts are shown), then Download zip: every size, captions.md and photo credits.",
        ],
      },
      {
        route: "/social",
        target: "social-guide",
        title: "That's it",
        body: "This guide opens each time you come to Social. Close it whenever you like, and replay it from this button.",
      },
    ]
  }, [])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Social"
        subtitle="Pick an entry and give it the brief. Claude writes three design options and captions, picks real Unsplash photos (Jev filters out stock first) and renders every size. You approve one, tweak captions and download the zip."
        actions={
          <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_GUIDE_EVENT))} data-tour="social-guide">
            <Compass className="h-3.5 w-3.5" /> How Social works
          </Button>
        }
      />
      <SocialStudio />
      <GuidedTour steps={steps} storageKey={socialSeenKey} active autoOpen="every-time" />
    </div>
  )
}
