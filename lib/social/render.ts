import path from "path"
import { existsSync } from "fs"
import { pathToFileURL } from "url"
import { chromium as playwright, type Browser, type Page } from "playwright-core"

/**
 * Server-side port of social/code/render.py: a week spec in, PNG frames out.
 * The page is social/code/post.html, loaded from disk so its relative brand/
 * and fonts/ paths resolve exactly as they do for render.py.
 */

// Files are bundled for Vercel via outputFileTracingIncludes in next.config.mjs
export const SOCIAL_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "social")
const PAGE_URL = pathToFileURL(path.join(SOCIAL_DIR, "code", "post.html")).href

export type Format = "square" | "portrait" | "story" | "landscape"
export const FORMAT_SIZES: Record<Format, { W: number; H: number }> = {
  square: { W: 1080, H: 1080 },
  portrait: { W: 1080, H: 1350 },
  story: { W: 1080, H: 1920 },
  landscape: { W: 1200, H: 628 },
}

/** One frame's fields, as post.html's window.render(spec) reads them (system/formats.md) */
export interface FrameSpec {
  layout?: "fullbleed" | "framed" | "type" | "close"
  photo?: string | null
  focus?: string
  headline?: string
  sub?: string
  eyebrow?: string
  prompt?: string
  stat?: { value: string; label: string } | null
  cta?: string
  dark?: boolean
  anchor?: "bottom"
  mark?: boolean
  logo?: boolean
  product?: string
  format?: Format
}

export interface OptionSpec extends FrameSpec {
  option: string
  why?: string
  formats: Format[]
  slides?: FrameSpec[]
}

export interface PostSpec {
  id: string
  product?: string
  options: OptionSpec[]
}

export interface RenderedFrame {
  name: string
  postId: string
  option: string
  format: Format
  png: Buffer
}

/** Keys that describe the option rather than the frame; never sent to the page */
const OPTION_ONLY = new Set(["formats", "option", "why", "slides", "search_terms", "alt_text", "photo_slots"])

/** Same naming and frame order as render.py's frames_for() */
export function framesFor(post: PostSpec, opt: OptionSpec, photo: (p: string | null | undefined) => string | null = p => p ?? null) {
  const shared: FrameSpec = post.product ? { product: post.product } : {}
  const formats = opt.formats?.length ? opt.formats : (["square"] as Format[])
  const out: { name: string; format: Format; spec: FrameSpec }[] = []
  if (opt.slides?.length) {
    const n = opt.slides.length
    const pad = (i: number) => String(i).padStart(2, "0")
    for (const fmt of formats) {
      opt.slides.forEach((slide, i) => {
        out.push({
          name: `${post.id}_${opt.option}_carousel_${fmt}_${pad(i + 1)}of${pad(n)}`,
          format: fmt,
          spec: { ...shared, ...slide, format: fmt, photo: photo(slide.photo) },
        })
      })
    }
  } else {
    const fields = Object.fromEntries(Object.entries(opt).filter(([k]) => !OPTION_ONLY.has(k))) as FrameSpec
    for (const fmt of formats) {
      out.push({
        name: `${post.id}_${opt.option}_${opt.layout ?? "fullbleed"}_${fmt}`,
        format: fmt,
        spec: { ...shared, ...fields, format: fmt, photo: photo(opt.photo) },
      })
    }
  }
  return out
}

const LOCAL_CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean) as string[]

export async function launchBrowser(): Promise<Browser> {
  const extra = ["--allow-file-access-from-files"]
  // On Vercel (Linux, no system Chrome) use the packaged Chromium build
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default
    return playwright.launch({ args: [...chromium.args, ...extra], executablePath: await chromium.executablePath(), headless: true })
  }
  const exe = LOCAL_CHROME.find(p => existsSync(p))
  if (!exe) throw new Error("No local Chrome found for rendering. Install Google Chrome or set CHROME_PATH.")
  return playwright.launch({ args: extra, executablePath: exe, headless: true })
}

async function openRenderer(browser: Browser): Promise<Page> {
  // render.py: new_page(device_scale_factor=1) at Playwright's default 1280×720 viewport
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1280, height: 720 } })
  await page.goto(PAGE_URL)
  return page
}

async function renderOne(page: Page, spec: FrameSpec): Promise<Buffer> {
  const size = await page.evaluate(s => (window as unknown as { render: (s: unknown) => Promise<{ W: number; H: number }> }).render(s), spec)
  await page.setViewportSize({ width: size.W, height: size.H })
  await page.evaluate(s => (window as unknown as { render: (s: unknown) => Promise<unknown> }).render(s), spec) // re-fit at final viewport
  return page.locator(".frame").screenshot({ type: "png" })
}

/** Render every frame of the given posts. Pass a browser to reuse one across calls. */
export async function renderPosts(
  posts: PostSpec[],
  opts: { photo?: (p: string | null | undefined) => string | null; only?: (post: PostSpec, opt: OptionSpec) => boolean; browser?: Browser } = {},
): Promise<RenderedFrame[]> {
  const browser = opts.browser ?? (await launchBrowser())
  try {
    const page = await openRenderer(browser)
    const made: RenderedFrame[] = []
    for (const post of posts) {
      for (const opt of post.options) {
        if (opts.only && !opts.only(post, opt)) continue
        for (const f of framesFor(post, opt, opts.photo)) {
          made.push({ name: f.name, postId: post.id, option: opt.option, format: f.format, png: await renderOne(page, f.spec) })
        }
      }
    }
    await page.close()
    return made
  } finally {
    if (!opts.browser) await browser.close()
  }
}

/** A contact sheet of frames side by side (540 px tall, 16 px gaps), like render.py's --sheet. JPEG. */
export async function contactSheet(frames: Buffer[], browser?: Browser): Promise<Buffer> {
  const b = browser ?? (await launchBrowser())
  try {
    const page = await b.newPage({ deviceScaleFactor: 1, viewport: { width: 1280, height: 600 } })
    const imgs = frames.map(f => `<img src="data:image/png;base64,${f.toString("base64")}">`).join("")
    await page.setContent(`<!doctype html><style>*{margin:0}body{background:#e6e6e6;display:inline-flex;gap:16px;padding:16px}img{height:540px;width:auto;display:block}</style><body>${imgs}</body>`)
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))))
    const width = await page.evaluate(() => document.body.scrollWidth)
    await page.setViewportSize({ width, height: 572 })
    const jpg = await page.screenshot({ type: "jpeg", quality: 88, fullPage: true })
    await page.close()
    return jpg
  } finally {
    if (!browser) await b.close()
  }
}
