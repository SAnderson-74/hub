"""Generates the app icons in src/client/public. Run: python3 scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "client" / "public"
BASE = (30, 30, 46)       # #1e1e2e
SURFACE = (49, 50, 68)    # #313244
FG = (205, 214, 244)      # #cdd6f4
ACCENT = (34, 211, 238)   # #22d3ee

def draw_icon(size: int, maskable: bool) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGB", (s, s), BASE)
    d = ImageDraw.Draw(img)
    # Maskable icons keep content inside the central 80% safe zone.
    inset = s * (0.18 if maskable else 0.08)
    tile = [inset, inset, s - inset, s - inset]
    d.rounded_rectangle(tile, radius=(s - 2 * inset) * 0.3, fill=SURFACE)
    span = s - 2 * inset
    def p(x, y):  # map 0..32 glyph space into the tile
        return (inset + span * x / 32, inset + span * y / 32)
    width = max(1, int(span * 2.2 / 32))
    center = p(16, 16)
    for end in (p(9.5, 9.5), p(22.5, 9.5), p(16, 24.5)):
        d.line([center, end], fill=ACCENT, width=width)
    def dot(xy, r, color):
        x, y = xy
        rr = span * r / 32
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=color)
    for xy in (p(9.5, 9.5), p(22.5, 9.5), p(16, 24.5)):
        dot(xy, 2.5, FG)
    dot(center, 4.0, ACCENT)
    return img.resize((size, size), Image.LANCZOS)

OUT.mkdir(parents=True, exist_ok=True)
draw_icon(180, False).save(OUT / "apple-touch-icon.png", optimize=True)
draw_icon(192, False).save(OUT / "icon-192.png", optimize=True)
draw_icon(512, False).save(OUT / "icon-512.png", optimize=True)
draw_icon(512, True).save(OUT / "icon-maskable-512.png", optimize=True)
print("icons written to", OUT)
