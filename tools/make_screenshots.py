"""把截图裁成纯手机画面，存到 预览截图/ 目录。"""
import os
from PIL import Image

SRC = r"E:\DeepSee_Harness\work\_renju_build"
OUT = r"E:\DeepSee_Harness\work\五子棋ios\预览截图"
os.makedirs(OUT, exist_ok=True)

# 手机画面在 520x900 视口内是左上角 390x844（截图是 2 倍图）
CROP = (0, 0, 780, 1688)

MAPPING = [
    ("p_main.png", "01-主界面.png"),
    ("p_dark.png", "02-墨玉棋盘.png"),
    ("p_sheet.png", "03-习题集与进度.png"),
    ("p_result.png", "04-胜利结算.png"),
    ("p_privacy.png", "05-隐私政策.png"),
    ("p_about.png", "06-关于.png"),
]

for src, dst in MAPPING:
    p = os.path.join(SRC, src)
    if not os.path.exists(p):
        print("跳过（不存在）:", src)
        continue
    im = Image.open(p).convert("RGB")
    w, h = im.size
    box = (CROP[0], CROP[1], min(CROP[2], w), min(CROP[3], h))
    im.crop(box).save(os.path.join(OUT, dst))
    print("生成", dst)

print("输出目录:", OUT)
