"""生成 iOS 资源目录（Assets.xcassets）所需的 AppIcon 全套尺寸。"""
import os, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "web", "icons", "icon-1024.png")
ASSETS = os.path.join(ROOT, "ios", "RenjuPartner", "RenjuPartner", "Assets.xcassets")
ICONSET = os.path.join(ASSETS, "AppIcon.appiconset")
os.makedirs(ICONSET, exist_ok=True)

# (文件名, 像素尺寸, idiom, scale, 基础尺寸)
SPECS = [
    ("icon-20@2x.png", 40, "iphone", "2x", "20x20"),
    ("icon-20@3x.png", 60, "iphone", "3x", "20x20"),
    ("icon-29@2x.png", 58, "iphone", "2x", "29x29"),
    ("icon-29@3x.png", 87, "iphone", "3x", "29x29"),
    ("icon-40@2x.png", 80, "iphone", "2x", "40x40"),
    ("icon-40@3x.png", 120, "iphone", "3x", "40x40"),
    ("icon-60@2x.png", 120, "iphone", "2x", "60x60"),
    ("icon-60@3x.png", 180, "iphone", "3x", "60x60"),
    ("icon-1024.png", 1024, "ios-marketing", "1x", "1024x1024"),
]

base = Image.open(SRC).convert("RGBA")

images = []
for name, px, idiom, scale, size in SPECS:
    img = base if px == 1024 else base.resize((px, px), Image.LANCZOS)
    # App Store 图标不能带 alpha 通道
    flat = Image.new("RGB", (px, px), (238, 208, 158))
    flat.paste(img, (0, 0), img)
    flat.save(os.path.join(ICONSET, name))
    images.append({"filename": name, "idiom": idiom, "scale": scale, "size": size})

with open(os.path.join(ICONSET, "Contents.json"), "w", encoding="utf-8") as f:
    json.dump({"images": images, "info": {"author": "xcode", "version": 1}}, f, indent=2)

# 顶层 Contents.json
with open(os.path.join(ASSETS, "Contents.json"), "w", encoding="utf-8") as f:
    json.dump({"info": {"author": "xcode", "version": 1}}, f, indent=2)

print("生成图标", len(images), "个 ->", ICONSET)
