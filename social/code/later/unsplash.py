#!/usr/bin/env python3
"""Unsplash for the Threecolts static system.

  search   python3 code/unsplash.py search p01 "seller scanning barcode warehouse aisle" "woman phone train window morning"
           -> work/p01/candidates.json (merged, de-duplicated, metadata only)
  sheet    python3 code/unsplash.py sheet p01 [--ids id1 id2 ...] [--top 12]
           -> work/p01/sheet.jpg: numbered thumbnails for Claude to look at
  fetch    python3 code/unsplash.py fetch p01 <photo_id> [<photo_id> ...]
           -> work/p01/photos/<id>.jpg at 2400 px, triggers Unsplash's download endpoint,
              appends the photographer credit to work/credits.json

Key: config.json {"unsplash_access_key": "..."} next to CLAUDE.md, or env UNSPLASH_ACCESS_KEY.
Network: the chat sandbox must allow api.unsplash.com, images.unsplash.com and plus.unsplash.com
(Settings -> organisation network allowlist). Errors below say so plainly.
"""
import json, os, sys, pathlib, urllib.parse, urllib.request, urllib.error, io

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORK = ROOT / "work"
API = "https://api.unsplash.com"


def key():
    k = os.environ.get("UNSPLASH_ACCESS_KEY")
    cfg = ROOT / "config.json"
    if not k and cfg.exists():
        k = json.loads(cfg.read_text()).get("unsplash_access_key")
    if not k:
        sys.exit("No Unsplash key. Put it in config.json as unsplash_access_key.")
    return k


def get(url, auth=True, raw=False):
    req = urllib.request.Request(url, headers={"Accept-Version": "v1", **({"Authorization": f"Client-ID {key()}"} if auth else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            remaining = r.headers.get("X-Ratelimit-Remaining")
            if remaining is not None and int(remaining) < 10:
                print(f"warning: only {remaining} Unsplash requests left this hour", file=sys.stderr)
            data = r.read()
            return data if raw else json.loads(data)
    except urllib.error.HTTPError as e:
        deny = e.headers.get("x-deny-reason")
        if deny:
            sys.exit(f"Blocked by the sandbox network ({deny or e.code}). An organisation owner needs to add "
                     "api.unsplash.com, images.unsplash.com and plus.unsplash.com to Claude's allowed domains.")
        if e.code == 401:
            sys.exit("Unsplash rejected the key (401). Check config.json.")
        if e.code == 403:
            sys.exit("Unsplash rate limit reached (403). Demo apps get 50 requests an hour; apply for production.")
        raise
    except urllib.error.URLError as e:
        sys.exit(f"Can't reach Unsplash ({e.reason}). If this is a proxy error, the domain isn't allowlisted.")


def slim(p, query):
    """Keep only what judging needs: the words, the shape, the photographer, the links."""
    return {
        "id": p["id"],
        "query": query,
        "w": p["width"], "h": p["height"],
        "orientation": "portrait" if p["height"] > p["width"] * 1.05 else "landscape" if p["width"] > p["height"] * 1.05 else "square",
        "color": p.get("color"),
        "likes": p.get("likes"),
        "plus": bool(p.get("premium") or p.get("plus")),
        "description": p.get("description") or "",
        "alt": p.get("alt_description") or "",
        "tags": [t.get("title") for t in p.get("tags", []) if t.get("title")],
        "photographer": p["user"]["name"],
        "photographer_url": p["user"]["links"]["html"] + "?utm_source=threecolts_static&utm_medium=referral",
        "page": p["links"]["html"],
        "thumb": p["urls"]["small"],
        "raw": p["urls"]["raw"],
        "download_location": p["links"]["download_location"],
    }


def cmd_search(post, queries, per_page=30, orientation=None):
    out = WORK / post; out.mkdir(parents=True, exist_ok=True)
    path = out / "candidates.json"
    seen = {c["id"]: c for c in (json.loads(path.read_text()) if path.exists() else [])}
    for q in queries:
        params = {"query": q, "per_page": per_page, "content_filter": "high", "order_by": "relevant"}
        if orientation:
            params["orientation"] = orientation
        res = get(f"{API}/search/photos?{urllib.parse.urlencode(params)}")
        for p in res.get("results", []):
            if p["id"] not in seen:
                seen[p["id"]] = slim(p, q)
        print(f"{q!r}: {res.get('total', 0)} total, {len(res.get('results', []))} returned")
    path.write_text(json.dumps(list(seen.values()), indent=1))
    print(f"{len(seen)} candidates -> {path}")


def cmd_sheet(post, ids=None, top=12):
    from PIL import Image, ImageDraw, ImageFont
    out = WORK / post
    cands = json.loads((out / "candidates.json").read_text())
    ranked = out / "ranked.json"
    if ids:
        pick = [c for i in ids for c in cands if c["id"] == i]
    elif ranked.exists():
        order = [r["id"] for r in json.loads(ranked.read_text())]
        pick = [c for i in order for c in cands if c["id"] == i][:top]
    else:
        pick = cands[:top]
    cell, cols = 420, 4
    rows = (len(pick) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 34)), (236, 236, 236))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for n, c in enumerate(pick):
        im = Image.open(io.BytesIO(get(c["thumb"] + "&w=600", auth=False, raw=True))).convert("RGB")
        im.thumbnail((cell - 12, cell - 12))
        x, y = (n % cols) * cell, (n // cols) * (cell + 34)
        sheet.paste(im, (x + (cell - im.width) // 2, y + 6 + (cell - 12 - im.height) // 2))
        label = f"{n+1}. {c['id']}  {c['orientation']} {c['w']}x{c['h']}{'  PLUS' if c['plus'] else ''}"
        d.text((x + 8, y + cell - 2), label, fill=(30, 30, 30), font=font)
    sheet.save(out / "sheet.jpg", quality=86)
    (out / "sheet.json").write_text(json.dumps([c["id"] for c in pick]))
    print(f"sheet of {len(pick)} -> {out/'sheet.jpg'}")


def cmd_fetch(post, ids):
    out = WORK / post / "photos"; out.mkdir(parents=True, exist_ok=True)
    cands = {c["id"]: c for c in json.loads((WORK / post / "candidates.json").read_text())}
    credits_path = WORK / "credits.json"
    credits = json.loads(credits_path.read_text()) if credits_path.exists() else {}
    for i in ids:
        c = cands[i]
        get(c["download_location"])  # required by Unsplash API guidelines: counts the download
        data = get(c["raw"] + "&w=2400&q=86&fm=jpg&fit=max", auth=False, raw=True)
        (out / f"{i}.jpg").write_bytes(data)
        credits[i] = {"post": post, "photographer": c["photographer"], "photographer_url": c["photographer_url"],
                      "page": c["page"], "plus": c["plus"]}
        print(f"fetched {i} by {c['photographer']} -> {out/(i+'.jpg')}")
    credits_path.write_text(json.dumps(credits, indent=1))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, post, *rest = sys.argv[1:]
    if cmd == "search":
        orient = None
        if rest and rest[0].startswith("--orientation="):
            orient = rest.pop(0).split("=", 1)[1]
        cmd_search(post, rest, orientation=orient)
    elif cmd == "sheet":
        ids, top = None, 12
        if "--ids" in rest:
            ids = rest[rest.index("--ids") + 1:]
        if "--top" in rest:
            top = int(rest[rest.index("--top") + 1])
        cmd_sheet(post, ids, top)
    elif cmd == "fetch":
        cmd_fetch(post, rest)
    else:
        sys.exit(__doc__)
