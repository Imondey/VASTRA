"""Generates the editorial flat-lay SVG artwork used for demo products.

    python scripts/generate_product_art.py

Reads backend/seed_catalog.py and writes frontend/images/products/<slug>--<colour>[--detail].svg.
Replace these with real photography at any time from the admin panel.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from seed_catalog import PRODUCTS  # noqa: E402

OUT = ROOT / "frontend" / "images" / "products"


# ------------------------------------------------------------ colour helpers
def _rgb(hex_code: str) -> tuple[int, int, int]:
    h = hex_code.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex(rgb) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02x}" for c in rgb)


def mix(a: str, b: str, t: float) -> str:
    ra, rb = _rgb(a), _rgb(b)
    return _hex(tuple(x + (y - x) * t for x, y in zip(ra, rb)))


def luminance(hex_code: str) -> float:
    r, g, b = _rgb(hex_code)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


# ------------------------------------------------------------ shapes
def mirror(points):
    return [(800 - x, y) for x, y in points]


def poly(points) -> str:
    return "M" + " L".join(f"{x} {y}" for x, y in points) + " Z"


LONG_SLEEVE_CUFFS = [poly([(100, 640), (170, 660), (177, 620), (107, 600)]),
                     poly(mirror([(100, 640), (170, 660), (177, 620), (107, 600)]))]


def shape(art: str, slug: str) -> dict:
    """Return {'body': path, 'fills': [(path, tone)], 'lines': [(path, width, dashed)], 'dots': [(x,y,r)]}.
    tone: 'dark' | 'darker' | 'light' | 'inner'."""
    s = {"body": "", "fills": [], "lines": [], "dots": [], "stitch": False}
    if art in {"tee", "polo"}:
        s["body"] = ("M310 175 C340 250 460 250 490 175 L640 240 L700 380 L610 415 L575 340 "
                     "L575 860 L225 860 L225 340 L190 415 L100 380 L160 240 Z")
        s["lines"] += [("M235 215 C245 270 235 310 225 340", 2, False),
                       ("M565 215 C555 270 565 310 575 340", 2, False),
                       ("M225 838 L575 838", 2, True),
                       ("M110 360 L195 392", 2, True), ("M690 360 L605 392", 2, True)]
        if art == "tee":
            s["lines"].append(("M310 175 C340 250 460 250 490 175", 10, False))
        else:
            s["fills"] += [(poly([(315, 172), (400, 215), (365, 268)]), "dark"),
                           (poly([(485, 172), (400, 215), (435, 268)]), "dark"),
                           ("M385 215 L415 215 L415 335 L385 335 Z", "dark")]
            s["dots"] += [(400, 262, 6), (400, 305, 6)]
    elif art == "tank":
        s["body"] = ("M330 160 L360 160 C365 290 435 290 440 160 L470 160 C480 260 540 300 560 330 "
                     "L560 860 L240 860 L240 330 C260 300 320 260 330 160 Z")
        s["lines"] += [("M360 160 C365 290 435 290 440 160", 8, False), ("M240 838 L560 838", 2, True)]
        for x in range(262, 545, 22):
            s["lines"].append((f"M{x} 330 L{x} 860", 1, False))
    elif art in {"shirt", "kurta"}:
        hem = 920 if art == "kurta" else 850
        if art == "shirt":
            s["body"] = (f"M320 165 L480 165 L630 225 L700 640 L630 660 L580 360 L580 {hem} "
                         f"C500 885 300 885 220 {hem} L220 360 L170 660 L100 640 L170 225 Z")
            s["fills"] += [("M320 165 C360 150 440 150 480 165 L470 180 C430 168 370 168 330 180 Z", "darker"),
                           (poly([(320, 165), (400, 215), (360, 270), (300, 185)]), "dark"),
                           (poly([(480, 165), (400, 215), (440, 270), (500, 185)]), "dark")]
            s["lines"] += [("M400 215 L400 875", 2, False),
                           ("M450 330 L530 330 L530 420 L490 435 L450 420 Z", 2, False)]
            s["dots"] += [(400, y, 5) for y in (290, 380, 470, 560, 650, 740, 830)]
        else:
            s["body"] = ("M320 170 L480 170 L620 225 L690 600 L625 620 L585 360 L600 920 "
                         "L200 920 L215 360 L175 620 L110 600 L180 225 Z")
            s["fills"].append(("M330 165 C360 150 440 150 470 165 L470 188 C440 175 360 175 330 188 Z", "darker"))
            s["lines"] += [("M400 188 L400 380", 2, False), ("M592 760 L600 920", 3, False),
                           ("M208 760 L200 920", 3, False)]
            s["dots"] += [(400, y, 5) for y in (230, 280, 330)]
            s["dots"] += [(x, 895, 3) for x in range(220, 590, 18)]
            s["dots"] += [(x, 870, 2) for x in range(229, 580, 18)]
            s["dots"] += [(340 + i * 10, 200 + abs(i - 6) * -4 + 30, 2) for i in range(13)]
        s["fills"] += [(c, "dark") for c in LONG_SLEEVE_CUFFS]
    elif art in {"hoodie", "sweater"}:
        s["body"] = ("M300 200 L500 200 L640 250 L700 660 L630 680 L585 380 L585 860 L215 860 "
                     "L215 380 L170 680 L100 660 L160 250 Z")
        s["fills"] += [("M215 820 L585 820 L585 860 L215 860 Z", "dark")]
        s["fills"] += [(poly([(100, 660), (170, 680), (177, 640), (107, 620)]), "dark"),
                       (poly(mirror([(100, 660), (170, 680), (177, 640), (107, 620)])), "dark")]
        if art == "hoodie":
            s["fills"] += [("M300 205 C290 120 340 80 400 80 C460 80 510 120 500 205 C470 250 330 250 300 205 Z", "dark"),
                           ("M330 205 C330 140 360 115 400 115 C440 115 470 140 470 205 C450 235 350 235 330 205 Z", "inner")]
            s["lines"] += [("M290 600 L510 600 L560 760 L240 760 Z", 2, False),
                           ("M375 232 L370 360", 4, False), ("M425 232 L430 360", 4, False)]
            if "zip" in slug:
                s["lines"].append(("M400 232 L400 820", 3, False))
        else:
            s["lines"].append(("M320 200 C350 255 450 255 480 200", 14, False))
            for x in range(225, 580, 14):
                s["lines"].append((f"M{x} 822 L{x} 858", 1, False))
            if "cardigan" in slug:
                s["lines"].append(("M400 240 L400 860", 3, False))
                s["dots"] += [(412, y, 6) for y in (300, 400, 500, 600, 700)]
            if "cable" in slug:
                for x in (290, 510):
                    s["lines"].append((f"M{x} 260 C{x - 25} 320 {x + 25} 380 {x} 440 C{x - 25} 500 {x + 25} 560 {x} 620 "
                                       f"C{x - 25} 680 {x + 25} 740 {x} 800", 4, False))
    elif art in {"trousers", "jeans", "joggers"}:
        if art == "joggers":
            s["body"] = "M280 185 L520 185 L540 600 L510 860 L420 860 L400 330 L380 860 L290 860 L260 600 Z"
            s["fills"] += [("M290 820 L380 820 L380 860 L290 860 Z", "dark"),
                           ("M420 820 L510 820 L510 860 L420 860 Z", "dark")]
            s["lines"] += [("M380 190 L370 260", 3, False), ("M420 190 L430 260", 3, False)]
        else:
            s["body"] = "M280 185 L520 185 L545 870 L420 870 L400 330 L380 870 L255 870 Z"
            s["lines"] += [("M335 260 L318 860", 1, False), ("M465 260 L482 860", 1, False)]
        s["fills"].append(("M278 150 L522 150 L522 187 L278 187 Z", "dark"))
        s["lines"] += [("M400 187 L400 320", 2, False),
                       ("M290 195 C310 240 335 255 352 255", 2, False),
                       ("M510 195 C490 240 465 255 448 255", 2, False)]
        if "dungaree" in slug:
            s["fills"] += [("M320 40 L480 40 L480 150 L320 150 Z", "base"),
                           ("M330 0 L350 0 L345 40 L325 40 Z", "dark"), ("M470 0 L450 0 L455 40 L475 40 Z", "dark")]
            s["lines"].append(("M355 70 L445 70 L445 130 L355 130 Z", 2, True))
        if art == "jeans" or "denim" in slug or "jeans" in slug or "dungaree" in slug:
            s["stitch"] = True
            s["dots"] += [(352, 255, 4), (448, 255, 4)]
    elif art == "shorts":
        s["body"] = "M270 335 L530 335 L560 620 L420 640 L400 450 L380 640 L240 620 Z"
        s["fills"].append(("M268 300 L532 300 L532 337 L268 337 Z", "dark"))
        s["lines"] += [("M400 337 L400 440", 2, False), ("M282 345 C300 390 325 400 345 400", 2, False),
                       ("M518 345 C500 390 475 400 455 400", 2, False),
                       ("M244 600 L380 620", 2, True), ("M556 600 L420 620", 2, True)]
    elif art == "dress":
        s["body"] = ("M330 260 C370 290 430 290 470 260 L490 420 C560 600 620 760 640 880 "
                     "C480 900 320 900 160 880 C180 760 240 600 310 420 Z")
        s["lines"] += [("M340 120 L338 265", 4, False), ("M460 120 L462 265", 4, False),
                       ("M310 420 C370 435 430 435 490 420", 3, False),
                       ("M360 440 C340 600 300 760 280 885", 1, False),
                       ("M440 440 C460 600 500 760 520 885", 1, False),
                       ("M400 440 L400 893", 1, False)]
        if "tulle" in slug or "party-dress" in slug:
            s["fills"].append(("M330 410 C380 450 420 450 470 410 L455 380 C420 405 380 405 345 380 Z", "light"))
    elif art == "skirt":
        s["fills"].append(("M290 250 L510 250 L512 285 L288 285 Z", "dark"))
        s["body"] = "M288 285 L512 285 L620 820 C480 845 320 845 180 820 Z"
        for i in range(1, 12):
            top = 288 + i * (224 / 12)
            bottom = 180 + i * (440 / 12)
            s["lines"].append((f"M{top:.0f} 287 L{bottom:.0f} {820 + 18 * (1 - abs(i - 6) / 6):.0f}", 1, False))
    elif art in {"blazer", "jacket"}:
        hem = 880 if art == "blazer" else 840
        s["body"] = (f"M310 170 L490 170 L630 220 L690 650 L625 670 L585 380 L590 {hem} "
                     f"L210 {hem} L215 380 L175 670 L110 650 L170 220 Z")
        s["fills"] += [(c, "dark") for c in LONG_SLEEVE_CUFFS]
        if art == "blazer":
            s["fills"] += [("M340 172 L460 172 L400 420 Z", "shirt"),
                           (poly([(330, 172), (400, 420), (372, 432), (300, 300), (330, 262), (298, 232)]), "dark"),
                           (poly(mirror([(330, 172), (400, 420), (372, 432), (300, 300), (330, 262), (298, 232)])), "dark"),
                           ("M250 640 L350 640 L350 658 L250 658 Z", "dark"),
                           ("M450 640 L550 640 L550 658 L450 658 Z", "dark"),
                           ("M455 330 L525 325 L525 340 L455 345 Z", "dark")]
            s["lines"].append(("M400 420 L400 880", 2, False))
            s["dots"] += [(415, 520, 8), (415, 600, 8)]
            if "double" in slug:
                s["dots"] += [(345, 520, 8), (345, 600, 8)]
        else:
            s["fills"] += [(poly([(310, 170), (400, 210), (490, 170), (525, 215), (400, 255), (275, 215)]), "dark"),
                           (f"M210 {hem - 40} L590 {hem - 40} L590 {hem} L210 {hem} Z", "dark")]
            s["lines"].append(("M400 255 L400 840", 3, False))
            if "puffer" in slug:
                for y in range(320, hem - 40, 70):
                    s["lines"].append((f"M215 {y} L585 {y}", 3, False))
                    s["lines"].append((f"M{180 if y < 650 else 190} {y + 20} L{220} {y + 20}", 2, False))
            elif "track" in slug:
                s["lines"] += [("M630 222 L690 650", 10, False), ("M170 222 L110 650", 10, False)]
            else:
                s["fills"] += [("M270 330 L360 330 L360 380 L315 395 L270 380 Z", "dark"),
                               ("M440 330 L530 330 L530 380 L485 395 L440 380 Z", "dark")]
                s["dots"] += [(412, y, 7) for y in (300, 400, 500, 600, 700)]
                s["stitch"] = True
    elif art == "vest":
        s["body"] = ("M330 170 L470 170 L560 230 C540 300 545 360 565 400 L590 880 L210 880 L235 400 "
                     "C255 360 260 300 240 230 Z")
        s["fills"] += [("M335 160 C365 148 435 148 465 160 L465 185 C435 172 365 172 335 185 Z", "darker"),
                       ("M270 600 L350 600 L350 615 L270 615 Z", "dark"),
                       ("M450 600 L530 600 L530 615 L450 615 Z", "dark"),
                       ("M455 340 L520 340 L520 352 L455 352 Z", "dark")]
        s["lines"].append(("M400 185 L400 880", 2, False))
        s["dots"] += [(412, y, 6) for y in range(240, 840, 90)]
    return s


# ------------------------------------------------------------ rendering
def render(product: dict, color_name: str, hex_code: str, detail: bool) -> str:
    art = product["art"]
    s = shape(art, product["slug"])
    light = luminance(hex_code) > 0.62
    bg_top, bg_bottom = ("#ebe6dd", "#ddd6ca") if light else ("#f5f2ec", "#e9e3d8")
    if detail:
        bg_top, bg_bottom = ("#e4ddd1", "#d5ccbd") if light else ("#efe9df", "#e2d9cb")
    edge = mix(hex_code, "#000000", 0.28)
    tones = {
        "dark": mix(hex_code, "#000000", 0.14),
        "darker": mix(hex_code, "#000000", 0.26),
        "inner": mix(hex_code, "#000000", 0.42),
        "light": mix(hex_code, "#ffffff", 0.35),
        "shirt": "#f3f0ea" if not light else "#ffffff",
        "base": hex_code,
    }
    line_color = mix(hex_code, "#000000", 0.32) if luminance(hex_code) > 0.25 else mix(hex_code, "#ffffff", 0.22)
    stitch_color = "#c9a45c"
    view = "200 110 400 500" if detail else "40 50 720 900"

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="800" height="1000" '
        f'preserveAspectRatio="xMidYMid slice" role="img" aria-label="{product["name"]} in {color_name}">',
        "<defs>",
        f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg_top}"/>'
        f'<stop offset="1" stop-color="{bg_bottom}"/></linearGradient>',
        '<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0.3">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".22"/>'
        '<stop offset=".45" stop-color="#fff" stop-opacity="0"/>'
        '<stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>',
        '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#2b2418" flood-opacity=".18"/></filter>',
        "</defs>",
        '<rect x="-400" y="-400" width="1600" height="1800" fill="url(#bg)"/>',
        '<ellipse cx="400" cy="935" rx="300" ry="26" fill="#2b2418" opacity=".08"/>',
        '<g filter="url(#soft)">',
    ]
    # fills that sit behind the body (hood, collar stand, dungaree bib)
    behind = [f for f in s["fills"] if f[1] in {"inner"} or "C290 120" in f[0] or f[0].startswith("M320 40")
              or f[0].startswith("M330 0") or f[0].startswith("M470 0")]
    front = [f for f in s["fills"] if f not in behind]
    for d, tone in behind:
        if tone == "inner":
            continue
        parts.append(f'<path d="{d}" fill="{tones[tone]}" stroke="{edge}" stroke-width="2" stroke-linejoin="round"/>')
    parts.append(f'<path d="{s["body"]}" fill="{hex_code}" stroke="{edge}" stroke-width="2.5" stroke-linejoin="round"/>')
    for d, tone in [f for f in behind if f[1] == "inner"]:
        parts.append(f'<path d="{d}" fill="{tones[tone]}"/>')
    parts.append("</g>")
    parts.append(f'<path d="{s["body"]}" fill="url(#shade)"/>')
    for d, tone in front:
        parts.append(f'<path d="{d}" fill="{tones[tone]}" stroke="{edge}" stroke-width="1.5" stroke-linejoin="round"/>')
    for d, width, dashed in s["lines"]:
        dash = ' stroke-dasharray="6 6"' if dashed else ""
        parts.append(f'<path d="{d}" fill="none" stroke="{line_color}" stroke-width="{width}" '
                     f'stroke-linecap="round" opacity=".75"{dash}/>')
    if s["stitch"]:
        parts.append(f'<path d="{s["body"]}" fill="none" stroke="{stitch_color}" stroke-width="2" '
                     f'stroke-dasharray="5 6" opacity=".8" transform="translate(400 500) scale(.965) translate(-400 -500)"/>')
    button = mix(hex_code, "#ffffff", 0.55) if not light else "#e8e2d6"
    for x, y, r in s["dots"]:
        parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{button}" stroke="{edge}" stroke-width="1"/>')
    if not detail:
        parts.append('<text x="70" y="935" font-family="Georgia, \'Times New Roman\', serif" font-size="18" '
                     'letter-spacing="8" fill="#8a7f6e" opacity=".55">VASTRA</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0
    for product in PRODUCTS:
        for index, (color, hex_code) in enumerate(product["colors"]):
            stem = f"{product['slug']}--{color.lower().replace(' ', '-')}"
            (OUT / f"{stem}.svg").write_text(render(product, color, hex_code, False), encoding="utf-8")
            count += 1
            if index == 0:
                (OUT / f"{stem}--detail.svg").write_text(render(product, color, hex_code, True), encoding="utf-8")
                count += 1
    print(f"Wrote {count} SVG files to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
