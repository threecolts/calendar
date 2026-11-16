#!/usr/bin/env python3
"""Number the photos Angela uploaded and make contact sheets for Claude to judge.

  python3 code/photo_sheet.py <folder-of-photos> [--post p01]

Writes work/photos/manifest.json and work/photos/sheet-<n>.jpg (12 per sheet).
Reads the Unsplash id and photographer from Unsplash's download file names
(e.g. "jane-doe-AbC123xYz-unsplash.jpg"), so credits come for free.
Flags photos too small for each format.
"""
import json, re, sys, pathlib, shutil
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "work" / "photos"
EXT = {".jpg", ".jpeg", ".png", ".webp"}
NEED = {"square": (1080, 1080), "portrait": (1080, 1350), "story": (1080, 1920), "landscape": (1200, 628)}


def parse_unsplash(name):
    m = re.match(r"(?P<who>.+)-(?P<id>[A-Za-z0-9_-]{11})-unsplash$", name)
    if not m:
        return None, None
    return m["id"], " ".join(w.capitalize() for w in m["who"].split("-"))


def fits(w, h, fw, fh):
    s = max(fw / w, fh / h)   # cover scale
    return s <= 1.15          # allow up to 15% upscale


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = pathlib.Path(sys.argv[1])
    post = sys.argv[sys.argv.index("--post") + 1] if "--post" in sys.argv else None
    files = sorted(p for p in src.rglob("*") if p.suffix.lower() in EXT and not p.name.startswith("."))
    if not files:
        sys.exit(f"No photos in {src}")
    OUT.mkdir(parents=True, exist_ok=True)
    man = json.loads((OUT / "manifest.json").read_text()) if (OUT / "manifest.json").exists() else []
    start = len(man)
    for i, f in enumerate(files, start + 1):
        im = ImageOps.exif_transpose(Image.open(f))
        w, h = im.size
        uid, who = parse_unsplash(f.stem)
        dest = OUT / f"{i:03d}{f.suffix.lower()}"
        shutil.copy(f, dest)
        man.append({"n": i, "file": str(dest.relative_to(ROOT)), "original": f.name, "post": post,
                    "w": w, "h": h, "unsplash_id": uid, "photographer": who,
                    "ok_for": [k for k, (fw, fh) in NEED.items() if fits(w, h, fw, fh)]})
    (OUT / "manifest.json").write_text(json.dumps(man, indent=1))

    new = man[start:]
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    cell, cols = 440, 4
    for s in range(0, len(new), 12):
        batch = new[s:s + 12]
        rows = (len(batch) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * (cell + 40)), (232, 232, 232))
        d = ImageDraw.Draw(sheet)
        for k, m in enumerate(batch):
            im = ImageOps.exif_transpose(Image.open(ROOT / m["file"])).convert("RGB")
            im.thumbnail((cell - 12, cell - 12))
            x, y = (k % cols) * cell, (k // cols) * (cell + 40)
            sheet.paste(im, (x + (cell - im.width) // 2, y + 6 + (cell - 12 - im.height) // 2))
            small = "" if len(m["ok_for"]) == 4 else "  too small for: " + ",".join(sorted(set(NEED) - set(m["ok_for"])))
            d.text((x + 8, y + cell + 4), f"#{m['n']}  {m['w']}x{m['h']}{small}", fill=(20, 20, 20), font=font)
        p = OUT / f"sheet-{(start + s)//12 + 1:02d}.jpg"
        sheet.save(p, quality=86)
        print("sheet", p)
    print(f"{len(new)} photos numbered #{start+1}-#{len(man)} -> {OUT/'manifest.json'}")


if __name__ == "__main__":
    main()
