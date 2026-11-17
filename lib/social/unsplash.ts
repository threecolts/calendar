/**
 * Unsplash for the Social tab: port of social/code/later/unsplash.py.
 *
 * Guidelines we follow (https://unsplash.com/documentation#guidelines--crediting):
 * - Hotlinking: the app shows and renders photos from Unsplash's own image URLs
 *   (urls.small / urls.raw); we don't re-host the original photo.
 * - Download tracking: links.download_location is called for every photo we use.
 * - Attribution: "Photo by <name> on Unsplash", linked with utm parameters, in the
 *   app and in photo-credits.md.
 * - Not a replacement for Unsplash: search runs per post for one team's own posts.
 */

const API = "https://api.unsplash.com"
const UTM = "utm_source=threecolts_content_calendar&utm_medium=referral"
/** Shortest acceptable long side, in px (BUILD-SPEC: skip photos under 2400) */
export const MIN_LONG_SIDE = 2400

/**
 * The Access Key, under whatever name it was saved: UNSPLASH_ACCESS_KEY is the
 * documented one, but any variable with UNSPLASH in its name works, except
 * the Secret Key, which is never sent.
 */
export function unsplashKey(): string | null {
  const named = process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY || process.env.UNSPLASH_KEY
  if (named?.trim()) return named.trim()
  const found = Object.entries(process.env).find(([k, v]) => /unsplash/i.test(k) && !/secret/i.test(k) && !!v?.trim())
  return found?.[1]?.trim() || null
}

export interface Candidate {
  id: string
  query: string
  w: number
  h: number
  orientation: "portrait" | "landscape" | "square"
  color: string | null
  plus: boolean
  description: string
  alt: string
  tags: string[]
  photographer: string
  photographer_url: string
  page: string
  thumb: string
  raw: string
  download_location: string
}

export class UnsplashError extends Error {}

let remaining: number | null = null
export const rateLimitRemaining = () => remaining

async function get<T>(url: string): Promise<T> {
  const key = unsplashKey()
  if (!key) throw new UnsplashError("No Unsplash key: set UNSPLASH_ACCESS_KEY.")
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }, cache: "no-store" })
  const left = res.headers.get("X-Ratelimit-Remaining")
  if (left !== null) remaining = Number(left)
  if (res.status === 401) throw new UnsplashError("Unsplash rejected the key (401). Check UNSPLASH_ACCESS_KEY.")
  if (res.status === 403 || res.status === 429) throw new UnsplashError("Unsplash's hourly limit is used up (demo apps get 50 requests an hour). Try again later, or upload a photo.")
  if (!res.ok) throw new UnsplashError(`Unsplash returned ${res.status}.`)
  return res.json() as Promise<T>
}

interface ApiPhoto {
  id: string; width: number; height: number; color?: string; premium?: boolean; plus?: boolean
  description?: string | null; alt_description?: string | null; tags?: { title?: string }[]
  user: { name: string; links: { html: string } }
  links: { html: string; download_location: string }
  urls: { small: string; raw: string }
}

function slim(p: ApiPhoto, query: string): Candidate {
  return {
    id: p.id,
    query,
    w: p.width,
    h: p.height,
    orientation: p.height > p.width * 1.05 ? "portrait" : p.width > p.height * 1.05 ? "landscape" : "square",
    color: p.color ?? null,
    plus: !!(p.premium || p.plus),
    description: p.description ?? "",
    alt: p.alt_description ?? "",
    tags: (p.tags ?? []).map(t => t.title).filter((t): t is string => !!t),
    photographer: p.user.name,
    photographer_url: `${p.user.links.html}?${UTM}`,
    page: `${p.links.html}?${UTM}`,
    thumb: p.urls.small,
    raw: p.urls.raw,
    download_location: p.links.download_location,
  }
}

/**
 * Search each term (portrait, high content filter, 30 per page), merge and
 * de-duplicate, interleaving terms so one query doesn't crowd out the rest.
 * Drops Unsplash+ photos (TO-CONFIRM TC-04) and anything under 2400 px.
 */
export async function searchPhotos(terms: string[], exclude: Set<string> = new Set()): Promise<{ candidates: Candidate[]; perTerm: Record<string, number> }> {
  const results = await Promise.all(terms.map(async term => {
    const params = new URLSearchParams({ query: term, per_page: "30", content_filter: "high", orientation: "portrait", order_by: "relevant" })
    const data = await get<{ total: number; results: ApiPhoto[] }>(`${API}/search/photos?${params}`)
    return { term, total: data.total, photos: data.results.map(p => slim(p, term)) }
  }))
  const seen = new Map<string, Candidate>()
  const longest = Math.max(0, ...results.map(r => r.photos.length))
  for (let i = 0; i < longest; i++) {
    for (const r of results) {
      const c = r.photos[i]
      if (!c || seen.has(c.id) || exclude.has(c.id)) continue
      if (c.plus || Math.max(c.w, c.h) < MIN_LONG_SIDE) continue
      seen.set(c.id, c)
    }
  }
  return { candidates: [...seen.values()], perTerm: Object.fromEntries(results.map(r => [r.term, r.photos.length])) }
}

/** Unsplash's guidelines: call download_location for every photo used */
export async function trackDownload(c: Pick<Candidate, "download_location">) {
  await get(c.download_location)
}

/** The image URL we render from (hotlinked, 2400 px) */
export const renderUrl = (raw: string) => `${raw}${raw.includes("?") ? "&" : "?"}w=2400&q=86&fm=jpg&fit=max`
/** A sharper thumbnail for judging than urls.small */
export const judgeUrl = (raw: string) => `${raw}${raw.includes("?") ? "&" : "?"}w=640&q=75&fm=jpg&fit=max`
