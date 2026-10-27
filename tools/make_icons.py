"""生成应用图标（Pillow），输出 180/192/512/maskable 四个 PNG。"""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "icons")
os.makedirs(OUT, exist_ok=True)

S = 1024  # 高分辨率绘制后缩放


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(maskable=False):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = 0 if maskable else int(S * 0.225)
    # 木色渐变底
    top = (238, 208, 158)
    bottom = (206, 158, 100)
    bg = Image.new("RGBA", (S, S))
    bd = ImageDraw.Draw(bg)
    for y in range(S):
        bd.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S) + (255,))
    if radius:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=radius, fill=255)
        img.paste(bg, (0, 0), mask)
    else:
        img.paste(bg, (0, 0))

    d = ImageDraw.Draw(img)

    # 棋盘网格
    pad = int(S * (0.20 if maskable else 0.16))
    n = 5
    step = (S - 2 * pad) / (n - 1)
    line_col = (138, 98, 54, 130)
    lw = max(2, int(S * 0.006))
    for i in range(n):
        p = pad + i * step
        d.line([(pad, p), (S - pad, p)], fill=line_col, width=lw)
        d.line([(p, pad), (p, S - pad)], fill=line_col, width=lw)

    def stone(cx, cy, r, black):
        # 阴影
        sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse(
            [cx - r, cy - r + r * 0.16, cx + r, cy + r + r * 0.16], fill=(60, 38, 16, 90)
        )
        sh = sh.filter(ImageFilter.GaussianBlur(r * 0.16))
        img.alpha_composite(sh)
        dd = ImageDraw.Draw(img)
        if black:
            for k in range(int(r), 0, -1):
                t = k / r
                col = lerp((14, 14, 18), (98, 100, 114), (1 - t) ** 1.6)
                dd.ellipse([cx - k, cy - k, cx + k, cy + k], fill=col + (255,))
            dd.ellipse(
                [cx - r * 0.42, cy - r * 0.52, cx - r * 0.02, cy - r * 0.16],
                fill=(255, 255, 255, 60),
            )
        else:
            for k in range(int(r), 0, -1):
                t = k / r
                col = lerp((206, 198, 184), (255, 253, 248), (1 - t) ** 1.2)
                dd.ellipse([cx - k, cy - k, cx + k, cy + k], fill=col + (255,))
            dd.ellipse(
                [cx - r * 0.45, cy - r * 0.55, cx + r * 0.05, cy - r * 0.05],
                fill=(255, 255, 255, 150),
            )
        dd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(70, 50, 30, 90), width=max(2, int(r * 0.05)))

    r = step * 0.46
    stone(pad + step * 1, pad + step * 1, r, True)
    stone(pad + step * 3, pad + step * 3, r, False)
    stone(pad + step * 3, pad + step * 1, r * 0.92, False)

    # 最后一手标记
    cx, cy = pad + step * 3, pad + step * 3
    d.ellipse(
        [cx - r * 0.2, cy - r * 0.2, cx + r * 0.2, cy + r * 0.2],
        fill=(224, 85, 46, 255),
    )
    return img


base = make_icon(False)
mask = make_icon(True)

for size, name in [(180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    base.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))

mask.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-maskable-512.png"))
base.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, "icon-1024.png"))

print("icons written to", OUT)
for f in sorted(os.listdir(OUT)):
    print(" ", f, os.path.getsize(os.path.join(OUT, f)))
