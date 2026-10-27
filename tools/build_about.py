import re, html

src = r"E:\DeepSee_Harness\work\五子棋ios\_apk_unpacked\about_utf8.txt"
out = r"E:\DeepSee_Harness\work\五子棋ios\renju\about.html"

raw = open(src, encoding="utf-8").read()
raw = re.sub(r"(?s)<script.*?</script>", "", raw)
raw = re.sub(r"(?s)<style.*?</style>", "", raw)
# 链接换成占位符，其余标签转成换行
raw = re.sub(r"(?i)<a\s+href=\"([^\"]+)\"[^>]*>", r"@@LINK@@", raw)
raw = re.sub(r"(?i)</a>", "@@ENDLINK@@", raw)
raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
raw = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n", raw)
raw = re.sub(r"(?i)<[^>]+>", "", raw)
raw = html.unescape(raw).replace("\u00a0", " ")
raw = raw.replace("\r\n", "\n").replace("\r", "\n")

lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in raw.split("\n")]

# 合并成块
blocks = []
buf = []
for ln in lines:
    if not ln:
        if buf:
            blocks.append(" ".join(buf))
            buf = []
        continue
    buf.append(ln)
if buf:
    blocks.append(" ".join(buf))


def inline(t):
    """转义并还原链接占位符。链接文本从占位符位置开始，到 @@ENDLINK@@ 结束。"""
    # 先用占位符切分，逐段转义
    parts = re.split(r"(@@LINK@@|@@ENDLINK@@)", t)
    res = []
    in_link = False
    for p in parts:
        if p == "@@LINK@@":
            in_link = True
            res.append("<a>")
        elif p == "@@ENDLINK@@":
            in_link = False
            res.append("</a>")
        else:
            res.append(html.escape(p, quote=False))
    return "".join(res)


def linkify(t):
    # 形如 <a>https://...</a>：把 URL 提到 href 上
    def rep(m):
        url = m.group(1).strip()
        return f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(url)}</a>'

    return re.sub(r"<a>(https?://[^<\s]+)</a>", rep, t)


out_parts = []
in_code = False
code_buf = []
toc_skipped = False
consecutive_h3 = 0

for b in blocks:
    if b.startswith("#ifdef ANDROID"):
        in_code = True
        code_buf = [b]
        continue
    if in_code:
        code_buf.append(b)
        if b.startswith("#endif"):
            in_code = False
            out_parts.append("<pre class=\"code\">" + html.escape("\n".join(code_buf)) + "</pre>")
        continue

    plain = b.replace("@@LINK@@", "").replace("@@ENDLINK@@", "")
    t = linkify(inline(b))

    if re.match(r"^[一二三四五六]、", plain) and len(plain) < 20:
        consecutive_h3 += 1
        # 开头的目录重复出现，跳过第一批
        if not toc_skipped and consecutive_h3 >= 2:
            continue
        if consecutive_h3 >= 2 and "目录" not in plain:
            pass
        out_parts.append(f"<h3>{html.escape(plain)}</h3>")
        continue
    consecutive_h3 = 0
    if re.match(r"^\d+）", plain):
        out_parts.append(f"<h4>{html.escape(plain)}</h4>")
    else:
        out_parts.append(f"<p>{t}</p>")

body = "\n".join(out_parts)
open(out, "w", encoding="utf-8").write(body)
print("blocks:", len(out_parts), "bytes:", len(body.encode("utf-8")))
