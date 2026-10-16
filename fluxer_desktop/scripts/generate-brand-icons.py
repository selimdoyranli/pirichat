# SPDX-License-Identifier: AGPL-3.0-or-later
"""Regenerate desktop and web icons from the pirichat logo (build_resources/pirichat_logo.png).

Run with Python + Pillow 12: python fluxer_desktop/scripts/generate-brand-icons.py
The source is an opaque square: a dark rounded tile on pure black. The tile is cut out with a rounded
alpha mask so icons get transparent corners. Stable, canary and development share artwork.
Besides the app icon this writes every icon the main process loads at runtime:
- macOS menu bar: FluxerTrayTemplate.png / @2x (black + alpha template of the mark)
- Windows colour tray: PirichatTray.png / @2x (the logo without its tile: white bubble and R, red square)
- Windows and Linux monochrome tray: tray-glyph.png (+ @1.25x, @1.5x, @2x) and tray-glyph-256x256.png, the white
  mark on transparent; DesktopTray repaints it white or black and adds the unread dot at runtime
- Windows taskbar overlay: badges/badge-N.ico and badges/badge-dark-N.ico (N = 1..9, 10 = "9+", 11 = dot)
"""

import base64
import io
import json
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

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
CHANNELS = ("stable", "canary", "development")
TRAY_GLYPHS = {
    "tray-glyph.png": 16, "tray-glyph@1.25x.png": 20, "tray-glyph@1.5x.png": 24, "tray-glyph@2x.png": 32,
    "tray-glyph-256x256.png": 256,
}
BADGE_FONT = Path(__file__).resolve().parents[2] / "packages/fonts/files/FluxerSans/FluxerSans-SemiBold.woff2"
BADGE_FRAME_SIZES = (16, 20, 24, 32, 40, 48)
BADGE_SUPERSAMPLE = 8
BADGE_COUNT = 11
# pirichat: logo red for the default badge, the logo's dark tile for the dark variant.
BADGE_VARIANTS = (("badge", (0xFD, 0x01, 0x2D)), ("badge-dark", (0x26, 0x25, 0x2D)))
ICNS_SIZES = {
    "icp4": 16, "icp5": 32, "icp6": 64, "ic07": 128, "ic08": 256,
    "ic09": 512, "ic10": 1024, "ic11": 32, "ic12": 64, "ic13": 256, "ic14": 512,
}
SQUARE_LOGOS = (30, 44, 71, 89, 107, 142, 150, 284, 310)


def fit_mark(mark, size, margin):
    """The mark centred vertically, `margin` px from the left and right edges, as an L alpha mask."""
    width = size - 2 * margin
    height = round(mark.height * width / mark.width)
    alpha = Image.new("L", (size, size))
    alpha.paste(mark.resize((width, height), Image.Resampling.LANCZOS), (margin, (size - height) // 2))
    return alpha


def solid(color, alpha):
    image = Image.new("RGBA", alpha.size, (*color, 0))
    image.putalpha(alpha)
    return image


def badge_label(index):
    if index == BADGE_COUNT:
        return None
    return "9+" if index == BADGE_COUNT - 1 else str(index)


def ink_mask(font, label):
    left, top, right, bottom = font.getbbox(label)
    mask = Image.new("L", (right - left + 4, bottom - top + 4))
    ImageDraw.Draw(mask).text((2 - left, 2 - top), label, font=font, fill=255)
    return mask.crop(mask.getbbox())


def render_badge(size, fill, label):
    """Same geometry as upstream's generate-windows-badges.mjs: 87.5% disc, '8' at 49% height, 70% max width."""
    big = size * BADGE_SUPERSAMPLE
    disc = Image.new("L", (big, big))
    inset = big * (1 - 0.875) / 2
    ImageDraw.Draw(disc).ellipse((inset, inset, big - inset, big - inset), fill=255)
    glyph = Image.new("L", (big, big))
    if label is None:
        inset = big * (1 - 0.375) / 2
        ImageDraw.Draw(glyph).ellipse((inset, inset, big - inset, big - inset), fill=255)
    else:
        reference = ink_mask(ImageFont.truetype(str(BADGE_FONT), 1000), "8").height
        font_size = 1000 * big * 0.49 / reference
        ink = ink_mask(ImageFont.truetype(str(BADGE_FONT), round(font_size)), label)
        if ink.width > big * 0.7:
            ink = ink_mask(ImageFont.truetype(str(BADGE_FONT), round(font_size * big * 0.7 / ink.width)), label)
        glyph.paste(ink, ((big - ink.width) // 2, (big - ink.height) // 2))
    image = solid(fill, disc)
    image.paste((255, 255, 255, 255), mask=glyph)
    return image.convert("RGBa").reduce(BADGE_SUPERSAMPLE).convert("RGBA")


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


def tray_mark(tile):
    # The logo without its dark tile: white bubble and R plus the red square, as an alpha mask and its bbox.
    r, g, b, a = tile.split()
    white = ImageChops.darker(ImageChops.darker(r, g), b).point(lambda v: max(0, min(255, (v - 96) * 255 // 159)))
    red = ImageChops.subtract(r, g).point(lambda v: max(0, min(255, (v - 60) * 255 // 120)))
    mark = ImageChops.multiply(ImageChops.lighter(white, red), a)
    return mark, mark.getbbox()


def tray_icon(tile, size, colored):
    # colored: the logo's own white and red (Windows tray); otherwise Apple's black/alpha template format.
    mark, box = tray_mark(tile)
    mark = mark.crop(box)
    width = size - 2
    height = round(mark.height * width / mark.width)
    alpha = Image.new("L", (size, size))
    alpha.paste(mark.resize((width, height), Image.Resampling.LANCZOS), (1, (size - height) // 2))
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if colored:
        icon.paste(tile.crop(box).convert("RGB").resize((width, height), Image.Resampling.LANCZOS), (1, (size - height) // 2))
    icon.putalpha(alpha)
    return icon


def encode_ico(frames):
    """PNG-compressed ICO frames, smallest first, like upstream's badge encoder."""
    header = struct.pack("<HHH", 0, 1, len(frames))
    offset = len(header) + 16 * len(frames)
    entries = b""
    for size, data in frames:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    return header + entries + b"".join(data for _, data in frames)


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
    mark_alpha, mark_box = tray_mark(tile)
    mark = mark_alpha.crop(mark_box)
    badges = {
        f"{prefix}-{index}.ico": encode_ico(
            [(size, png_bytes(render_badge(size, fill, badge_label(index)))) for size in BADGE_FRAME_SIZES]
        )
        for prefix, fill in BADGE_VARIANTS
        for index in range(1, BADGE_COUNT + 1)
    }
    for channel in CHANNELS:
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
        for size, suffix in ((16, ""), (32, "@2x")):
            tray_icon(tile, size, False).save(icon_root / f"FluxerTrayTemplate{suffix}.png", compress_level=9)
            tray_icon(tile, size, True).save(icon_root / f"PirichatTray{suffix}.png", compress_level=9)
        for name, size in TRAY_GLYPHS.items():
            solid((255, 255, 255), fit_mark(mark, size, round(size / 16))).save(icon_root / name, compress_level=9)
        (icon_root / "badges").mkdir(exist_ok=True)
        for name, data in badges.items():
            (icon_root / "badges" / name).write_bytes(data)
        if (WEB / f"icons/desktop/{channel}").is_dir():
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
    print(f"pirichat icons written; ICNS={len(icns)} bytes; badges={len(badges)}")


if __name__ == "__main__":
    main()
