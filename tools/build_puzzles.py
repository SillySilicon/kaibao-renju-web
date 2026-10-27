import json, os, glob, io

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.join(BASE, "数据", "json")
out_js = os.path.join(BASE, "web", "js", "puzzles.js")

order = [
    "三手胜1-入门题.json",
    "三手胜2-初级题.json",
    "三手胜3-中级题.json",
    "三手胜4-高级题.json",
    "坂田吾朗追诘胜-黑先.json",
    "坂田吾朗追诘胜-白先.json",
    "天狗道场2020-黑先.json",
    "天狗道场2020-白先.json",
]

ids = {
    "三手胜1-入门题": "sanshou1",
    "三手胜2-初级题": "sanshou2",
    "三手胜3-中级题": "sanshou3",
    "三手胜4-高级题": "sanshou4",
    "坂田吾朗追诘胜-黑先": "sakata_b",
    "坂田吾朗追诘胜-白先": "sakata_w",
    "天狗道场2020-黑先": "tengu_b",
    "天狗道场2020-白先": "tengu_w",
}

sets = []
report = []
for fn in order:
    path = os.path.join(src_dir, fn)
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    name = fn[:-5]
    puzzles = []
    skipped = 0
    stars = 0
    for item in raw:
        flat = []
        for tok in item:
            if not tok or "," not in tok:
                if "★" in tok:
                    stars += 1
                continue
            coord, col = tok.split(",")
            if len(coord) < 2:
                continue
            x = ord(coord[0]) - ord("A")
            try:
                y = int(coord[1:]) - 1
            except ValueError:
                continue
            if not (0 <= x < 15 and 0 <= y < 15):
                continue
            c = 1 if col == "1" else 2
            flat.extend([x, y, c])
        if len(flat) < 6:
            skipped += 1
            continue
        puzzles.append(flat)
    sets.append(
        {
            "id": ids[name],
            "name": name,
            "puzzles": puzzles,
        }
    )
    report.append(f"{name}: 原始{len(raw)} 保留{len(puzzles)} 丢弃空题{skipped} 星标{stars}")

os.makedirs(os.path.dirname(out_js), exist_ok=True)
body = json.dumps(sets, ensure_ascii=False, separators=(",", ":"))
with open(out_js, "w", encoding="utf-8") as f:
    f.write("/* 内置题库数据：由原安卓应用 assets/json 提取生成，请勿手工修改。 */\n")
    f.write("window.BUILTIN_SETS = ")
    f.write(body)
    f.write(";\n")

print("\n".join(report))
print("out bytes:", len(body.encode("utf-8")))
print("puzzle counts:", [(s["name"], len(s["puzzles"])) for s in sets])

