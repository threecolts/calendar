// Render social/examples/demo-week/week.json through the app's renderer and
// compare against the reference renders made by social/code/render.py.
//   npx tsx scripts/social-render-demo.mts [outDir]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { launchBrowser, renderPosts, type PostSpec } from "../lib/social/render.ts"

const demo = path.join(process.cwd(), "social", "examples", "demo-week")
const out = process.argv[2] ?? path.join(process.cwd(), ".social-out")
const week = JSON.parse(readFileSync(path.join(demo, "week.json"), "utf8")) as { posts: PostSpec[] }

const browser = await launchBrowser()
const frames = await renderPosts(week.posts, {
  browser,
  photo: p => (p ? pathToFileURL(path.resolve(demo, p)).href : null),
})

// Pixel diff against the reference PNG, in the same browser
const page = await browser.newPage()
let worst = 0
for (const f of frames) {
  mkdirSync(path.join(out, f.postId), { recursive: true })
  writeFileSync(path.join(out, f.postId, `${f.name}.png`), f.png)
  const ref = path.join(demo, "renders", f.postId, `${f.name}.png`)
  if (!existsSync(ref)) { console.log("no reference for", f.name); continue }
  const a = `data:image/png;base64,${f.png.toString("base64")}`
  const b = `data:image/png;base64,${readFileSync(ref).toString("base64")}`
  // Passed as a string: tsx's helpers don't exist inside the page
  const diff = (await page.evaluate(`(async () => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src })
    const [ia, ib] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})])
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: ia.width + "x" + ia.height + " vs " + ib.width + "x" + ib.height, pct: 100 }
    const px = img => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data }
    const da = px(ia), db = px(ib)
    let off = 0
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) off++
    return { size: "same", pct: 100 * off / (da.length / 4) }
  })()`)) as { size: string; pct: number }
  worst = Math.max(worst, diff.pct)
  console.log(`${f.name}: ${diff.size}, ${diff.pct.toFixed(3)}% pixels differ`)
}
await browser.close()
console.log(`${frames.length} frames → ${out}; worst diff ${worst.toFixed(3)}%`)
