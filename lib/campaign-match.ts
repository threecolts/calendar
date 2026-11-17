/**
 * "This campaign may already exist": a cheap, instant word-overlap match on
 * campaign names (no AI call), used while someone types a new campaign.
 * "UniCon webinar Dec" finds "UniCon Peace of Mind webinar".
 */

const STOP = new Set([
  "the", "and", "for", "with", "campaign", "campaigns", "new", "our", "of", "to", "in", "on", "a", "an",
  "q1", "q2", "q3", "q4", "2025", "2026", "2027", "launch", "series", "content", "post", "posts",
])

const words = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 2 && !STOP.has(w)))

export function similarCampaigns<T extends { id: string; title: string; objective?: string | null }>(title: string, campaigns: T[], max = 3): T[] {
  const mine = words(title)
  if (!mine.size) return []
  return campaigns
    .map(c => {
      const theirs = words(`${c.title} ${c.objective ?? ""}`)
      const titleWords = words(c.title)
      let shared = 0
      for (const w of mine) if (theirs.has(w)) shared++
      // Most of what you typed, or a distinctive shared name word (e.g. a product)
      const score = shared / Math.min(mine.size, Math.max(1, titleWords.size))
      return { c, score, shared }
    })
    .filter(x => x.shared > 0 && (x.score >= 0.5 || [...mine].some(w => w.length >= 5 && words(x.c.title).has(w))))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.c)
}
