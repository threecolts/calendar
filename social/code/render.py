#!/usr/bin/env python3
"""Render Threecolts static posts from a week spec (JSON) to PNG.

Usage:
  python3 code/render.py week.json --out out/            # render everything
  python3 code/render.py week.json --out out/ --only p01  # one post
  python3 code/render.py week.json --out out/ --sheet     # also write a contact sheet per post

week.json shape: see templates/week-spec.example.json and system/layouts.md.
Each post has 1-3 "options" (A, B, C); each option lists the formats to export.
A carousel option has "slides" instead of a single headline.
"""
import argparse, json, os, sys, pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
PAGE = (HERE / "post.html").as_uri()


def abs_photo(p, base):
    if not p:
        return None
    if p.startswith(("http://", "https://", "file://", "data:")):
        return p
    path = pathlib.Path(p)
    if not path.is_absolute():
        path = (base / path).resolve()
    if not path.exists():
        sys.exit(f"Photo not found: {path}")
    return path.as_uri()


def frames_for(post, opt, base):
    """Yield (filename_stem, spec) for every frame an option produces."""
    shared = {k: post[k] for k in ("product",) if k in post}
    formats = opt.get("formats", ["square"])
    letter = opt["option"]
    if opt.get("slides"):
        n = len(opt["slides"])
        for fmt in formats:
            for i, slide in enumerate(opt["slides"], 1):
                spec = {**shared, **slide, "format": fmt}
                spec["photo"] = abs_photo(slide.get("photo"), base)
                yield f"{post['id']}_{letter}_carousel_{fmt}_{i:02d}of{n:02d}", spec
    else:
        for fmt in formats:
            spec = {**shared, **{k: v for k, v in opt.items() if k not in ("formats", "option", "why")}, "format": fmt}
            spec["photo"] = abs_photo(opt.get("photo"), base)
            yield f"{post['id']}_{letter}_{opt.get('layout','fullbleed')}_{fmt}", spec


def contact_sheet(paths, out):
    from PIL import Image
    ims = [Image.open(p).convert("RGB") for p in paths]
    h = 540
    ims = [im.resize((int(im.width * h / im.height), h)) for im in ims]
    gap = 16
    W = sum(im.width for im in ims) + gap * (len(ims) + 1)
    sheet = Image.new("RGB", (W, h + 2 * gap), (230, 230, 230))
    x = gap
    for im in ims:
        sheet.paste(im, (x, gap)); x += im.width + gap
    sheet.save(out, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", default="out")
    ap.add_argument("--only")
    ap.add_argument("--sheet", action="store_true")
    a = ap.parse_args()
    spec_path = pathlib.Path(a.spec).resolve()
    week = json.loads(spec_path.read_text())
    base = spec_path.parent
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    made = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--allow-file-access-from-files"])
        page = browser.new_page(device_scale_factor=1)
        page.goto(PAGE)
        for post in week["posts"]:
            if a.only and post["id"] != a.only:
                continue
            post_dir = out / post["id"]; post_dir.mkdir(exist_ok=True)
            post_files = []
            for opt in post["options"]:
                for stem, spec in frames_for(post, opt, base):
                    size = page.evaluate("s => window.render(s)", spec)
                    page.set_viewport_size({"width": size["W"], "height": size["H"]})
                    page.evaluate("s => window.render(s)", spec)  # re-fit at final viewport
                    path = post_dir / f"{stem}.png"
                    page.locator(".frame").screenshot(path=str(path))
                    post_files.append(path); made.append(path)
                    print("rendered", path)
            if a.sheet and post_files:
                contact_sheet(post_files, post_dir / f"{post['id']}_contact-sheet.jpg")
        browser.close()
    print(f"{len(made)} frames")


if __name__ == "__main__":
    main()
