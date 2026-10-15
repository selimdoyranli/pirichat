# SPDX-License-Identifier: AGPL-3.0-or-later
"""Regenerate desktop and web icons from the pirichat logo (build_resources/pirichat_logo.png).

Run with Python + Pillow 12: python fluxer_desktop/scripts/generate-brand-icons.py
The source is an opaque square: a dark rounded tile on pure black. The tile is cut out with a rounded
alpha mask so icons get transparent corners. Stable and canary share artwork; development keeps its own.
"""

import base64
import io
import json
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

DESKTOP = Path(__file__).resolve().parents[1]
ROOT = DESKTOP / "build_resources"
WEB = DESKTOP.parent / "fluxer_static/web"
SOURCE = ROOT / "pirichat_logo.png"
# Tile corner radius as a share of the tile width, measured on the source.
CORNER_RATIO = 0.236
# macOS app icons sit at 824/1024 inside a transparent canvas (Apple icon grid).
MAC_TILE = 824
TILE_BACKGROUND = (10, 10, 16, 255)
SIZES = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
ICO_SIZES = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
ICNS_SIZES = {
    "icp4": 16, "icp5": 32, "icp6": 64, "ic07": 128, "ic08": 256,
    "ic09": 512, "ic10": 1024, "ic11": 32, "ic12": 64, "ic13": 256, "ic14": 512,
}
SQUARE_LOGOS = (30, 44, 71, 89, 107, 142, 150, 284, 310)


def png_bytes(image):
    output = io.BytesIO()
    image.save(output, format="PNG", compress_level=9)
    return output.getvalue()


def resized(image, size):
    return image.resize((size, size), Image.Resampling.LANCZOS)


def centered(image, width, height, scale, background=(0, 0, 0, 0)):
    side = round(min(width, height) * scale)
    canvas = Image.new("RGBA", (width, height), background)
    canvas.alpha_composite(resized(image, side), ((width - side) // 2, (height - side) // 2))
    return canvas


def cut_tile(source):
    box = source.convert("L").point(lambda value: 255 if value > 4 else 0).getbbox()
    tile = source.crop(box).convert("RGBA")
    side = max(tile.size)
    tile = tile.resize((side, side), Image.Resampling.LANCZOS)
    # Supersample the mask so the rounded edge is antialiased.
    scale = 4
    mask = Image.new("L", (side * scale, side * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, side * scale - 1, side * scale - 1), radius=round(side * scale * CORNER_RATIO), fill=255
    )
    tile.putalpha(mask.resize((side, side), Image.Resampling.LANCZOS))
    return resized(tile, 1024)


def tray_template(tile, size):
    # White strokes only (bubble and R): Apple's black/alpha template format.
    r, g, b, a = tile.split()
    white = ImageChops.darker(ImageChops.darker(r, g), b).point(lambda v: max(0, min(255, (v - 96) * 255 // 159)))
    mark = ImageChops.multiply(white, a)
    mark = mark.crop(mark.getbbox())
    width = size - 2
    height = round(mark.height * width / mark.width)
    alpha = Image.new("L", (size, size))
    alpha.paste(mark.resize((width, height), Image.Resampling.LANCZOS), (1, (size - height) // 2))
    template = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    template.putalpha(alpha)
    return template


def main():
    source = Image.open(SOURCE).convert("RGB")
    tile = cut_tile(source)
    mac = centered(tile, 1024, 1024, MAC_TILE / 1024)
    pngs = {size: png_bytes(resized(tile, size)) for size in SIZES}
    mac_pngs = {size: png_bytes(resized(mac, size)) for size in set(ICNS_SIZES.values())}
    chunks = b"".join(
        kind.encode("ascii") + struct.pack(">I", 8 + len(mac_pngs[size])) + mac_pngs[size]
        for kind, size in ICNS_SIZES.items()
    )
    icns = b"icns" + struct.pack(">I", 8 + len(chunks)) + chunks
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n'
        f'  <image width="1024" height="1024" href="data:image/png;base64,{base64.b64encode(pngs[1024]).decode()}"/>\n'
        '</svg>\n'
    )
    for channel in ("stable", "canary"):
        icon_root = ROOT / f"icons-{channel}"
        for size, png in pngs.items():
            (icon_root / f"{size}x{size}.png").write_bytes(png)
        (icon_root / "128x128@2x.png").write_bytes(pngs[256])
        (icon_root / "icon.png").write_bytes(pngs[512])
        (icon_root / "_compiled/AppIcon.icns").write_bytes(icns)
        (icon_root / "_compiled/Assets.car").unlink(missing_ok=True)
        (icon_root / "AppIcon.icon/Assets/Vector.svg").write_text(svg, encoding="utf-8", newline="\n")
        metadata_path = icon_root / "AppIcon.icon/icon.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["fill"] = {"solid": "display-p3:0.03922,0.03922,0.06275,1.00000"}
        metadata_path.write_text(json.dumps(metadata, indent="\t") + "\n", encoding="utf-8", newline="\n")
        tile.save(icon_root / "icon.ico", sizes=ICO_SIZES)
        resized(tile, 50).save(icon_root / "StoreLogo.png", compress_level=9)
        for size in SQUARE_LOGOS:
            resized(tile, size).save(icon_root / f"Square{size}x{size}Logo.png", compress_level=9)
        for size, name in ((16, "FluxerTrayTemplate.png"), (32, "FluxerTrayTemplate@2x.png")):
            tray_template(tile, size).save(icon_root / name, compress_level=9)
        tile.save(WEB / f"icons/desktop/{channel}/icon.ico", sizes=ICO_SIZES)
    appx = ROOT / "appx"
    for size in (44, 150):
        resized(tile, size).save(appx / f"Square{size}x{size}Logo.png", compress_level=9)
    resized(tile, 50).save(appx / "StoreLogo.png", compress_level=9)
    centered(tile, 310, 150, 0.9).save(appx / "Wide310x150Logo.png", compress_level=9)

    resized(tile, 16).save(WEB / "favicon-16x16.png", compress_level=9)
    resized(tile, 32).save(WEB / "favicon-32x32.png", compress_level=9)
    tile.save(WEB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
    resized(tile, 150).save(WEB / "mstile-150x150.png", compress_level=9)
    # Opaque icons: iOS and Android draw their own mask, so keep the tile colour edge to edge.
    resized(source, 180).save(WEB / "apple-touch-icon.png", compress_level=9)
    for size in (192, 512):
        centered(tile, size, size, 0.8, TILE_BACKGROUND).convert("RGB").save(
            WEB / f"android-chrome-{size}x{size}.png", compress_level=9
        )
    centered(tile, 1200, 630, 0.7, TILE_BACKGROUND).convert("RGB").save(WEB / "og-image-default.png", compress_level=9)
    print(f"pirichat icons written; ICNS={len(icns)} bytes")


if __name__ == "__main__":
    main()
