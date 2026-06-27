#!/usr/bin/env python3
"""Generate the territory hero snapshot from free Esri World Imagery (no key).

Stitches satellite tiles over the Skin Tyee territory, bakes on the territory
polygon + custom markers, and writes TWO files:
  - docs/land/territory-snapshot-hires.jpg  full-res original (design/print uses)
  - web/public/territory-snapshot.jpg       downscaled, used by the hero

Repeatable: `pnpm --filter @skintyee/website-web snapshot:territory`
Requires: Python 3 + Pillow  (`pip install -r scripts/requirements.txt`)

Coords mirror website/web/lib/territory.ts + docs/land/territory.md — keep in sync.
"""
import math, io, os, time, urllib.request
from PIL import Image, ImageDraw, ImageFont

Z = 10                                   # zoom — higher = crisper + more tiles
MINLAT, MAXLAT = 53.00, 54.95            # regional bbox (frames the towns too)
MINLON, MAXLON = -128.85, -123.70
WEB_WIDTH = 3200                         # downscaled web target (~2 MB)
WEB_QUALITY = 88
HIRES_QUALITY = 92

TERRITORY = [
    (54.55, -127.10), (54.48, -126.55), (54.33, -125.75), (54.10, -124.80),
    (54.02, -123.98), (53.55, -124.30), (53.20, -125.20), (53.15, -126.30),
    (53.25, -127.10), (53.90, -127.25),
]
MARKERS = [
    (53.93, -125.95, "Skin Tyee Band Office"),
    (54.40, -126.65, "Houston"),
    (54.23, -125.76, "Burns Lake"),
    (54.78, -127.17, "Smithers"),
    (54.52, -128.60, "Terrace"),
    (54.05, -128.65, "Kitimat"),
    (54.06, -125.66, "Francois Lake"),
    (54.06, -124.85, "Fraser Lake"),
    (54.01, -124.01, "Vanderhoof"),
]
HERE = os.path.dirname(__file__)
HIRES_OUT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "docs", "land", "territory-snapshot-hires.jpg"))
WEB_OUT = os.path.normpath(os.path.join(HERE, "..", "public", "territory-snapshot.jpg"))
UA = "skintyee-territory-snapshot/1.0 (https://skintyee.ca)"
# Base satellite + transparent reference overlays (roads/highways, then place
# names + boundaries) — the rich Esri "hybrid" look.
IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
OVERLAYS = [
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
]


def num(lat, lon, z):
    n = 2 ** z
    return (lon + 180.0) / 360.0 * n, (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n


def main():
    x0f, ytopf = num(MAXLAT, MINLON, Z)
    x1f, ybotf = num(MINLAT, MAXLON, Z)
    xt0, xt1, yt0, yt1 = math.floor(x0f), math.floor(x1f), math.floor(ytopf), math.floor(ybotf)
    print(f"z{Z}: {xt1-xt0+1}x{yt1-yt0+1} = {(xt1-xt0+1)*(yt1-yt0+1)} tiles")

    canvas = Image.new("RGB", ((xt1 - xt0 + 1) * 256, (yt1 - yt0 + 1) * 256), (40, 55, 45))
    ok = fail = 0
    def fetch(url):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=25).read()))

    for xt in range(xt0, xt1 + 1):
        for yt in range(yt0, yt1 + 1):
            pos = ((xt - xt0) * 256, (yt - yt0) * 256)
            try:
                canvas.paste(fetch(IMAGERY.format(z=Z, x=xt, y=yt)).convert("RGB"), pos)
                for tpl in OVERLAYS:  # roads/highways, then place names + boundaries
                    ov = fetch(tpl.format(z=Z, x=xt, y=yt)).convert("RGBA")
                    canvas.paste(ov, pos, ov.split()[3])
                ok += 1
            except Exception as e:
                fail += 1
                print("FAIL", xt, yt, e)
            time.sleep(0.05)
    print(f"tiles ok={ok} fail={fail}")

    img = canvas.crop((round((x0f - xt0) * 256), round((ytopf - yt0) * 256),
                       round((x1f - xt0) * 256), round((ybotf - yt0) * 256)))
    draw = ImageDraw.Draw(img, "RGBA")
    px = lambda la, lo: tuple(((c - o) * 256) for c, o in zip(num(la, lo, Z), (x0f, ytopf)))

    pts = [px(la, lo) for la, lo in TERRITORY]
    draw.polygon(pts, fill=(0, 184, 236, 34))
    for i in range(len(pts)):
        draw.line([pts[i], pts[(i + 1) % len(pts)]], fill=(0, 200, 255, 255), width=10)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 40)
    except Exception:
        font = ImageFont.load_default()
    for lat, lon, label in MARKERS:
        mx, my = px(lat, lon)
        r = 16
        draw.ellipse([mx - r, my - r, mx + r, my + r], fill=(236, 106, 55, 255), outline=(255, 255, 255, 255), width=5)
        draw.text((mx + r + 10, my - 22), label, font=font, fill=(255, 255, 255, 255),
                  stroke_width=4, stroke_fill=(0, 0, 0, 210))

    img.save(HIRES_OUT, "JPEG", quality=HIRES_QUALITY)   # full-res original (design uses)
    print("saved hires", os.path.relpath(HIRES_OUT), img.size)

    web = img.resize((WEB_WIDTH, round(img.height * WEB_WIDTH / img.width)), Image.LANCZOS) if img.width > WEB_WIDTH else img
    web.save(WEB_OUT, "JPEG", quality=WEB_QUALITY)        # downscaled, used by the hero
    print("saved web", os.path.relpath(WEB_OUT), web.size)


if __name__ == "__main__":
    main()
