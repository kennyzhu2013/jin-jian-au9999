#!/usr/bin/env python3
"""Draw the 金鉴 home-screen icons. No third-party assets."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
BG = (14, 12, 10, 255)
GOLD = (230, 179, 92, 255)
GOLD_DIM = (230, 179, 92, 150)


def draw(size: int, maskable: bool) -> Image.Image:
    image = Image.new("RGBA", (size, size), BG)
    pen = ImageDraw.Draw(image)
    pad = int(size * (0.18 if maskable else 0.08))
    ring = max(2, size // 40)
    pen.ellipse((pad, pad, size - pad - 1, size - pad - 1), outline=GOLD, width=ring)
    inner = pad + int(size * 0.045)
    pen.ellipse(
        (inner, inner, size - inner - 1, size - inner - 1),
        outline=GOLD_DIM,
        width=max(1, size // 96),
    )
    font = ImageFont.truetype(FONT, int(size * (0.36 if maskable else 0.46)))
    text = "金"
    box = pen.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    x = (size - width) / 2 - box[0]
    y = (size - height) / 2 - box[1] - size * 0.015
    pen.text((x, y), text, font=font, fill=GOLD)
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = {
        "icon-192.png": (192, False),
        "icon-512.png": (512, False),
        "icon-maskable-512.png": (512, True),
        "apple-touch-icon.png": (180, False),
    }
    for name, (size, maskable) in specs.items():
        draw(size, maskable).save(OUT / name, "PNG")
        print(OUT / name)


if __name__ == "__main__":
    main()
