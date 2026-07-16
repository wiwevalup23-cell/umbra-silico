#!/usr/bin/env python3
"""Prepare the skeuomorphic empty-state player asset for the web app.

The script uses a deterministic Pillow edge flood-fill by default. It can opt
into rembg when installed, then crops transparent pixels and exports optimized
WebP.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat


APP_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SOURCE = WORKSPACE_ROOT / "elements" / "elements.png"
DEFAULT_OUTPUT = APP_ROOT / "public" / "assets" / "player-bg.webp"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare player-bg.webp")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--tolerance",
        type=float,
        default=48,
        help="RGB distance tolerance for the Pillow edge-removal fallback.",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=12,
        help="Minimum alpha retained when cropping the transparent bounds.",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=6,
        help="Transparent padding retained around the cropped object.",
    )
    parser.add_argument("--use-rembg", action="store_true", help="Use rembg if it is installed.")
    parser.add_argument(
        "--keep-display-text",
        action="store_true",
        help="Keep baked copy inside the player display instead of clearing it.",
    )
    parser.add_argument(
        "--clear-speaker-icon",
        action="store_true",
        help="Clear the baked speaker glyph when a web overlay should replace it.",
    )
    parser.add_argument(
        "--keep-cast-shadow",
        action="store_true",
        help="Keep the original external cast shadow around the player.",
    )
    return parser.parse_args()


def border_pixels(image: Image.Image, band: int = 12) -> Image.Image:
    width, height = image.size
    top = image.crop((0, 0, width, band))
    bottom = image.crop((0, height - band, width, height))
    left = image.crop((0, 0, band, height))
    right = image.crop((width - band, 0, width, height))

    sample = Image.new("RGB", (top.width + bottom.width + left.width + right.width, band))
    x = 0
    for region in (top, bottom):
        sample.paste(region.resize((region.width, band)), (x, 0))
        x += region.width
    for region in (left, right):
        sample.paste(region.resize((region.width, band)), (x, 0))
        x += region.width
    return sample


def background_color(image: Image.Image) -> tuple[int, int, int]:
    stat = ImageStat.Stat(border_pixels(image))
    return tuple(int(channel) for channel in stat.median[:3])


def rgb_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return sum((a[index] - b[index]) ** 2 for index in range(3)) ** 0.5


def edge_points(width: int, height: int) -> Iterable[tuple[int, int]]:
    for x in range(width):
        yield x, 0
        yield x, height - 1
    for y in range(height):
        yield 0, y
        yield width - 1, y


def remove_background_with_pillow(image: Image.Image, tolerance: float) -> Image.Image:
    rgb = image.convert("RGB")
    width, height = rgb.size
    bg = background_color(rgb)
    pixels = rgb.load()
    removable = Image.new("L", (width, height), 0)
    mask_pixels = removable.load()
    queue: deque[tuple[int, int]] = deque()

    for point in edge_points(width, height):
        x, y = point
        if mask_pixels[x, y] == 0 and rgb_distance(pixels[x, y], bg) <= tolerance:
            mask_pixels[x, y] = 255
            queue.append(point)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            if mask_pixels[nx, ny] != 0:
                continue
            if rgb_distance(pixels[nx, ny], bg) <= tolerance:
                mask_pixels[nx, ny] = 255
                queue.append((nx, ny))

    feathered = removable.filter(ImageFilter.GaussianBlur(radius=1.15))
    alpha = Image.eval(feathered, lambda value: 255 - value)
    result = image.convert("RGBA")
    result.putalpha(alpha)
    return result


def remove_background(image: Image.Image, tolerance: float, use_rembg: bool) -> Image.Image:
    if use_rembg:
        try:
            from rembg import remove

            return remove(image.convert("RGBA")).convert("RGBA")
        except ImportError:
            pass

    return remove_background_with_pillow(image, tolerance)


def clear_display_text(image: Image.Image) -> Image.Image:
    width, height = image.size
    rgba = image.convert("RGBA")
    sample_box = (
        int(width * 0.36),
        int(height * 0.28),
        int(width * 0.64),
        int(height * 0.33),
    )
    fill = tuple(int(channel) for channel in ImageStat.Stat(rgba.crop(sample_box)).median[:3])
    patch = Image.new("RGBA", rgba.size, (*fill, 255))
    mask = Image.new("L", rgba.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (
            int(width * 0.29),
            int(height * 0.33),
            int(width * 0.72),
            int(height * 0.51),
        ),
        radius=int(width * 0.018),
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(radius=12))
    return Image.composite(patch, rgba, mask)


def clear_speaker_icon(image: Image.Image) -> Image.Image:
    width, height = image.size
    rgba = image.convert("RGBA")
    glyph_box = (
        int(width * 0.134),
        int(height * 0.823),
        int(width * 0.172),
        int(height * 0.865),
    )
    glyph_region = rgba.crop(glyph_box)
    fill = tuple(int(channel) for channel in ImageStat.Stat(glyph_region).median[:3])
    patch = Image.new("RGBA", rgba.size, (*fill, 255))
    mask = Image.new("L", rgba.size, 0)
    glyph = glyph_region.convert("L")
    background_value = int(ImageStat.Stat(glyph).median[0])
    glyph_mask = glyph.point(
        lambda value: 255 if value < 120 or abs(value - background_value) > 13 else 0,
    )
    glyph_mask = glyph_mask.filter(ImageFilter.MaxFilter(5))
    glyph_mask = glyph_mask.filter(ImageFilter.GaussianBlur(radius=1.2))
    mask.paste(glyph_mask, glyph_box[:2])
    return Image.composite(patch, rgba, mask)


def retouch_aligned_speaker_grille(image: Image.Image, source_image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    source_rgba = source_image.convert("RGBA")
    width, height = rgba.size

    speaker_box = (
        int(width * 0.128),
        int(height * 0.054),
        int(width * 0.27),
        int(height * 0.106),
    )

    source_crop = source_rgba.crop(speaker_box)
    luma = source_crop.convert("L")
    old_holes = luma.point(lambda value: 255 if value < 118 else 0)
    old_holes = old_holes.filter(ImageFilter.MaxFilter(9))
    old_holes = old_holes.filter(ImageFilter.GaussianBlur(radius=2.0))

    # Median filtering removes the warped original holes while preserving the
    # broad brushed-metal light falloff under the replacement grille.
    cleaned_crop = source_crop.filter(ImageFilter.MedianFilter(13))
    cleaned_crop = cleaned_crop.filter(ImageFilter.GaussianBlur(radius=0.45))
    metal_base = Image.composite(cleaned_crop, source_crop, old_holes)

    base_layer = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    base_layer.paste(metal_base, speaker_box[:2])
    base_mask = Image.new("L", rgba.size, 0)
    base_mask.paste(old_holes, speaker_box[:2])
    base_layer.putalpha(base_mask)
    rgba = Image.alpha_composite(rgba, base_layer)

    scale = 5
    holes = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
    holes_draw = ImageDraw.Draw(holes)
    cols = 14
    rows = 4
    start_x = width * 0.145
    start_y = height * 0.067
    gap_x = width * 0.0084
    gap_y = height * 0.0086
    radius = width * 0.00166

    for row in range(rows):
        for col in range(cols):
            cx = (start_x + col * gap_x) * scale
            cy = (start_y + row * gap_y) * scale
            r = radius * scale

            holes_draw.ellipse(
                (cx - r * 1.16, cy - r * 1.06, cx + r * 1.16, cy + r * 1.22),
                fill=(0, 0, 0, 32),
            )
            holes_draw.ellipse(
                (cx - r * 0.88, cy - r * 0.88, cx + r * 0.88, cy + r * 0.88),
                fill=(9, 10, 10, 255),
            )

    holes = holes.resize((width, height), Image.Resampling.LANCZOS)
    return Image.alpha_composite(rgba, holes)


def restore_top_cap_from_source(image: Image.Image, source_image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    source_rgba = source_image.convert("RGBA")
    width, height = rgba.size
    scale = 4
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)

    left = int(width * 0.1145 * scale)
    top = int(height * 0.0378 * scale)
    right = int(width * 0.884 * scale)
    bottom = int(height * 0.116 * scale)
    radius = int(width * 0.018 * scale)

    draw.rounded_rectangle((left, top, right, bottom), radius=radius, fill=255)
    draw.rectangle((left, top + radius, right, bottom), fill=255)

    mask = mask.resize((width, height), Image.Resampling.LANCZOS)
    restored = source_rgba.copy()
    restored.putalpha(mask)
    rgba = Image.alpha_composite(rgba, restored)

    alpha = rgba.getchannel("A")
    alpha = ImageChops.lighter(alpha, mask)
    rgba.putalpha(alpha)
    return rgba


def remove_cast_shadow(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    scale = 4
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)

    # Hard-clip to the player body so the source's paper/background shadow
    # does not get baked into the exported transparent asset.
    draw.rounded_rectangle(
        (
            int(width * 0.1145 * scale),
            int(height * 0.0378 * scale),
            int(width * 0.884 * scale),
            int(height * 0.938 * scale),
        ),
        radius=int(width * 0.018 * scale),
        fill=255,
    )

    mask = mask.resize((width, height), Image.Resampling.LANCZOS)
    # Replace the flood-filled alpha with a clean body silhouette. Preserving the
    # partially transparent edge-removal alpha makes CSS drop-shadows inherit
    # broken softness around the machined corners.
    rgba.putalpha(mask)
    return rgba


def crop_alpha(image: Image.Image, alpha_threshold: int, padding: int) -> Image.Image:
    alpha = image.getchannel("A")
    thresholded = alpha.point(lambda value: 255 if value > alpha_threshold else 0)
    bbox = thresholded.getbbox()
    if bbox is None:
        return image

    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(source)
    if not args.keep_display_text:
        image = clear_display_text(image)
    if args.clear_speaker_icon:
        image = clear_speaker_icon(image)
    transparent = remove_background(image, args.tolerance, args.use_rembg)
    transparent = restore_top_cap_from_source(transparent, image)
    transparent = retouch_aligned_speaker_grille(transparent, image)
    if not args.keep_cast_shadow:
        transparent = remove_cast_shadow(transparent)
    cropped = crop_alpha(transparent, args.alpha_threshold, args.padding)
    cropped.save(output, "WEBP", quality=100, method=6, lossless=True)

    print(f"source: {source}")
    print(f"output: {output}")
    print(f"size: {cropped.width}x{cropped.height}")


if __name__ == "__main__":
    main()
