#!/usr/bin/env python3
"""Generate the territory hero snapshots from free Esri tiles (no key).

Renders TWO maps (each: full-res original for design + a downscaled web JPEG):
  desktop — wide regional, satellite + roads + place-names, town labels
            -> docs/land/territory-snapshot-hires.jpg, public/territory-snapshot.jpg
  mobile  — portrait framing (covers a phone without over-zoom/clipping), clean
            satellite + territory + pins, NO text labels
            -> docs/land/territory-snapshot-mobile-hires.jpg,
               public/territory-snapshot-mobile.jpg

Repeatable: `pnpm --filter @skintyee/website-web snapshot:territory`
Requires: Python 3 + Pillow  (`pip install -r scripts/requirements.txt`)
Coords mirror website/web/lib/territory.ts + docs/land/territory.md — keep in sync.
"""
import math, io, os, time, urllib.request
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
P = lambda *a: os.path.normpath(os.path.join(HERE, *a))
UA = "skintyee-territory-snapshot/1.0 (https://skintyee.ca)"
IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
ROADS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
PLACES = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"

TERRITORY = [
    (54.55, -127.10), (54.48, -126.55), (54.33, -125.75), (54.10, -124.80),
    (54.02, -123.98), (53.55, -124.30), (53.20, -125.20), (53.15, -126.30),
    (53.25, -127.10), (53.90, -127.25),
]
MARKERS = [
    (53.93, -125.95, "Skin Tyee Band Office"),
    (54.40, -126.65, "Houston"), (54.23, -125.76, "Burns Lake"),
    (54.78, -127.17, "Smithers"), (54.52, -128.60, "Terrace"), (54.05, -128.65, "Kitimat"),
    (54.06, -125.66, "Francois Lake"), (54.06, -124.85, "Fraser Lake"), (54.01, -124.01, "Vanderhoof"),
]

# minlat, maxlat, minlon, maxlon
DESKTOP = dict(z=10, bbox=(53.00, 54.95, -128.85, -123.70), overlays=[ROADS, PLACES], labels=True,
               web_width=3200, hires=P("..", "..", "..", "docs", "land", "territory-snapshot-hires.jpg"),
               web=P("..", "public", "territory-snapshot.jpg"))
MOBILE = dict(z=10, bbox=(52.85, 54.85, -126.85, -124.40), overlays=[], labels=False,
              web_width=1400, hires=P("..", "..", "..", "docs", "land", "territory-snapshot-mobile-hires.jpg"),
              web=P("..", "public", "territory-snapshot-mobile.jpg"))


def num(lat, lon, z):
    n = 2 ** z
    return (lon + 180.0) / 360.0 * n, (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n


def fetch(url):
    return Image.open(io.BytesIO(urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=25).read()))


def render(cfg):
    z = cfg["z"]
    minlat, maxlat, minlon, maxlon = cfg["bbox"]
    x0f, ytopf = num(maxlat, minlon, z)
    x1f, ybotf = num(minlat, maxlon, z)
    xt0, xt1, yt0, yt1 = math.floor(x0f), math.floor(x1f), math.floor(ytopf), math.floor(ybotf)
    print(f"[{cfg['web'].split('/')[-1]}] z{z}: {xt1-xt0+1}x{yt1-yt0+1} tiles")

    canvas = Image.new("RGB", ((xt1 - xt0 + 1) * 256, (yt1 - yt0 + 1) * 256), (40, 55, 45))
    for xt in range(xt0, xt1 + 1):
        for yt in range(yt0, yt1 + 1):
            pos = ((xt - xt0) * 256, (yt - yt0) * 256)
            try:
                canvas.paste(fetch(IMAGERY.format(z=z, x=xt, y=yt)).convert("RGB"), pos)
                for tpl in cfg["overlays"]:
                    ov = fetch(tpl.format(z=z, x=xt, y=yt)).convert("RGBA")
                    canvas.paste(ov, pos, ov.split()[3])
            except Exception as e:
                print("FAIL", xt, yt, e)
            time.sleep(0.05)

    img = canvas.crop((round((x0f - xt0) * 256), round((ytopf - yt0) * 256),
                       round((x1f - xt0) * 256), round((ybotf - yt0) * 256)))
    draw = ImageDraw.Draw(img, "RGBA")
    px = lambda la, lo: tuple((c - o) * 256 for c, o in zip(num(la, lo, z), (x0f, ytopf)))

    pts = [px(la, lo) for la, lo in TERRITORY]
    draw.polygon(pts, fill=(0, 184, 236, 34))
    for i in range(len(pts)):
        draw.line([pts[i], pts[(i + 1) % len(pts)]], fill=(0, 200, 255, 255), width=10)

    def gpin(cx, tipy, r, fill, hole=None):  # google-style pin
        d = int(2.4 * r); hcy = tipy - d
        a = math.acos(max(-1.0, min(1.0, r / d)))
        draw.polygon([(cx - r * math.sin(a), hcy + r * math.cos(a)),
                      (cx + r * math.sin(a), hcy + r * math.cos(a)), (cx, tipy)], fill=fill)
        draw.ellipse([cx - r, hcy - r, cx + r, hcy + r], fill=fill)
        if hole:
            ir = int(r * 0.42)
            draw.ellipse([cx - ir, hcy - ir, cx + ir, hcy + ir], fill=hole)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 40)
    except Exception:
        font = ImageFont.load_default()
    W, H = img.size
    for lat, lon, label in MARKERS:
        fx, fy = px(lat, lon)
        if not (0 <= fx <= W and 0 <= fy <= H):
            continue  # marker outside this frame
        mx, my = int(round(fx)), int(round(fy))
        if label == "Skin Tyee Band Office":
            R = 34
            draw.ellipse([mx - int(R * 0.85), my - int(R * 0.3), mx + int(R * 0.85), my + int(R * 0.16)], fill=(0, 0, 0, 95))
            gpin(mx, my, R + 4, (255, 255, 255, 255))
            gpin(mx, my, R, (0, 184, 236, 255), hole=(255, 255, 255, 255))
            if cfg["labels"]:
                draw.text((mx + R + 12, my - int(2.4 * R) - 22), label, font=font, fill=(255, 255, 255, 255),
                          stroke_width=5, stroke_fill=(10, 40, 80, 235))
        else:
            r = 11
            draw.ellipse([mx - r, my - r, mx + r, my + r], fill=(236, 106, 55, 255), outline=(255, 255, 255, 255), width=4)
            if cfg["labels"]:
                draw.text((mx + r + 9, my - 20), label, font=font, fill=(255, 255, 255, 255),
                          stroke_width=4, stroke_fill=(0, 0, 0, 210))

    img.save(cfg["hires"], "JPEG", quality=92)
    print("  hires", os.path.relpath(cfg["hires"]), img.size)
    web = img.resize((cfg["web_width"], round(img.height * cfg["web_width"] / img.width)), Image.LANCZOS) \
        if img.width > cfg["web_width"] else img
    web.save(cfg["web"], "JPEG", quality=88)
    print("  web", os.path.relpath(cfg["web"]), web.size)


if __name__ == "__main__":
    render(DESKTOP)
    render(MOBILE)
