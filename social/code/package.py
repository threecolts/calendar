#!/usr/bin/env python3
"""Package a week for Angela.

  python3 code/package.py <week.json> <render-dir> <captions.md> --name "week-47"

Makes /mnt/user-data/outputs/<name>.zip with:
  <post-id>/  every PNG for that post (option letter in the file name) + contact sheet
  captions.md         captions per post and platform
  photo-credits.md    photographer and Unsplash link for every photo used
  README.txt          what's in the zip and how the files are named
"""
import argparse, json, pathlib, shutil, zipfile, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec"); ap.add_argument("renders"); ap.add_argument("captions")
    ap.add_argument("--name", default="threecolts-posts-" + datetime.date.today().isoformat())
    ap.add_argument("--dest", default="/mnt/user-data/outputs")
    a = ap.parse_args()
    week = json.loads(pathlib.Path(a.spec).read_text())
    man_path = ROOT / "work" / "photos" / "manifest.json"
    manifest = {m["file"]: m for m in json.loads(man_path.read_text())} if man_path.exists() else {}

    # credits for every photo the spec uses
    used = []
    for post in week["posts"]:
        for opt in post["options"]:
            for item in opt.get("slides", [opt]):
                if item.get("photo"):
                    used.append((post["id"], opt["option"], item["photo"]))
    lines = ["# Photo credits", "", "Unsplash's licence doesn't require credit, but crediting is good practice when a photographer is clearly identifiable.", ""]
    for pid, letter, photo in used:
        key = str((pathlib.Path(a.spec).parent / photo).resolve().relative_to(ROOT)) if (pathlib.Path(a.spec).parent / photo).resolve().is_relative_to(ROOT) else photo
        m = manifest.get(key, {})
        who = m.get("photographer") or "unknown (file name had no Unsplash id)"
        link = f"https://unsplash.com/photos/{m['unsplash_id']}" if m.get("unsplash_id") else ""
        lines.append(f"- {pid} option {letter}: {who} {link}".rstrip())

    dest = pathlib.Path(a.dest); dest.mkdir(parents=True, exist_ok=True)
    zpath = dest / f"{a.name}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for d in sorted(pathlib.Path(a.renders).iterdir()):
            if d.is_dir():
                for f in sorted(d.iterdir()):
                    z.write(f, f"{a.name}/{d.name}/{f.name}")
        z.write(a.captions, f"{a.name}/captions.md")
        z.writestr(f"{a.name}/photo-credits.md", "\n".join(lines) + "\n")
        z.writestr(f"{a.name}/README.txt",
            "One folder per post. File names: <post>_<option>_<layout>_<format>.png\n"
            "Options A, B and C are alternatives: pick one per post.\n"
            "Carousels: <post>_<option>_carousel_<format>_01of05.png etc. Upload in number order.\n"
            "Formats: square 1080x1080, portrait 1080x1350 (Instagram and LinkedIn feed),\n"
            "story 1080x1920 (Stories, text kept inside the safe zone), landscape 1200x628 (X, LinkedIn, Facebook).\n"
            "Captions for every post and platform are in captions.md.\n")
    print("packaged", zpath)


if __name__ == "__main__":
    main()
