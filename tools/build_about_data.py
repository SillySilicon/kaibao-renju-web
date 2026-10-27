import json

src = r"E:\DeepSee_Harness\work\五子棋ios\renju\about.html"
out = r"E:\DeepSee_Harness\work\五子棋ios\renju\js\about-data.js"

html = open(src, encoding="utf-8").read()
js = "/* 「关于」页面文案（由 APK 内 about.htm 转换生成） */\nwindow.ABOUT_HTML = "
js += json.dumps(html, ensure_ascii=False)
js += ";\n"
open(out, "w", encoding="utf-8").write(js)
print("bytes:", len(js.encode("utf-8")))
