"""校验手写的 project.pbxproj：括号配对、对象引用完整性、必需字段。"""
import re, sys, os

p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "ios", "RenjuPartner", "RenjuPartner.xcodeproj", "project.pbxproj")
text = open(p, encoding="utf-8").read()

problems = []

# 1) 去掉注释后检查括号配对
stripped = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
stack = []
pairs = {")": "(", "}": "{"}
for ch in stripped:
    if ch in "({":
        stack.append(ch)
    elif ch in ")}":
        if not stack or stack[-1] != pairs[ch]:
            problems.append(f"括号不匹配: 遇到 {ch}")
            break
        stack.pop()
if stack:
    problems.append(f"括号未闭合: {stack}")

# 2) 引号配对（逐行检查，pbxproj 字符串不跨行）
for i, line in enumerate(stripped.split("\n"), 1):
    if line.count('"') % 2 != 0:
        problems.append(f"第 {i} 行引号不配对: {line.strip()[:80]}")

# 3) 收集定义的对象 ID
defined = set(re.findall(r"^\s*([0-9A-F]{24})\b", stripped, flags=re.M))

# 4) 收集所有引用
refs = set(re.findall(r"\b([0-9A-F]{24})\b", stripped))
undefined = refs - defined
if undefined:
    problems.append(f"引用了未定义的对象: {sorted(undefined)}")

# 5) 必需对象检查
required = ["PBXProject", "PBXNativeTarget", "PBXSourcesBuildPhase", "PBXResourcesBuildPhase",
            "PBXGroup", "XCBuildConfiguration", "XCConfigurationList", "PBXFileReference", "PBXBuildFile"]
for r in required:
    if f"isa = {r};" not in stripped:
        problems.append(f"缺少对象类型 {r}")

# 6) 根对象存在
root = re.search(r"rootObject = ([0-9A-F]{24})", stripped)
if not root or root.group(1) not in defined:
    problems.append("rootObject 无效")
if "isa = PBXProject;" not in stripped:
    problems.append("缺少 PBXProject")

# 7) 每个 target 的构建阶段都存在
target_phases = re.findall(r"buildPhases = \((.*?)\);", stripped, flags=re.S)
for tp in target_phases:
    for pid in re.findall(r"([0-9A-F]{24})", tp):
        if pid not in defined:
            problems.append(f"buildPhases 引用了未定义对象 {pid}")

# 8) 配置列表成员存在
config_lists = re.findall(r"buildConfigurations = \((.*?)\);", stripped, flags=re.S)
if len(config_lists) != 2:
    problems.append(f"应有 2 个 XCConfigurationList，实际 {len(config_lists)}")
for cl in config_lists:
    ids = re.findall(r"([0-9A-F]{24})", cl)
    if len(ids) != 2:
        problems.append(f"配置列表成员数异常: {ids}")
    for cid in ids:
        if cid not in defined:
            problems.append(f"配置列表引用未定义 {cid}")

print("对象数:", len(defined), " 引用数:", len(refs))
if problems:
    print("发现问题:")
    for x in problems:
        print("  -", x)
    sys.exit(1)
print("pbxproj 结构校验通过 ✓")

# 9) 检查磁盘上的文件是否与工程引用一致
base = os.path.dirname(os.path.dirname(p))
expected = [
    "RenjuPartner/RenjuPartnerApp.swift",
    "RenjuPartner/ContentView.swift",
    "RenjuPartner/Info.plist",
    "RenjuPartner/Assets.xcassets",
    "RenjuPartner/www",
]
for e in expected:
    full = os.path.join(base, e)
    if not os.path.exists(full):
        print("  ✗ 缺少文件:", e)
        sys.exit(1)
print("工程引用的文件均存在 ✓")
