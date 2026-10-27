/* 打印某道题的棋盘与双方威胁点，用于人工核对 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const R = require("../web/js/engine.js");

const src = fs.readFileSync(path.join(__dirname, "../web/js/puzzles.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const SETS = sandbox.window.BUILTIN_SETS;

const setName = process.argv[2] || "三手胜1";
const idx = parseInt(process.argv[3] || "0", 10);
const set = SETS.find((s) => s.name.includes(setName));
if (!set) {
  console.log("找不到题库", setName, "可选：", SETS.map((s) => s.name).join(", "));
  process.exit(1);
}
const flat = set.puzzles[idx];

const b = new R.Board();
for (let i = 0; i < flat.length; i += 3) b.place(flat[i], flat[i + 1], flat[i + 2]);
b.refreshAll();

let black = 0;
let white = 0;
for (let i = 2; i < flat.length; i += 3) {
  if (flat[i] === 1) black++;
  else white++;
}
const side = black === white ? 1 : 2;
console.log(`${set.name} 第 ${idx + 1} 题  黑 ${black} 白 ${white}  →  ${side === 1 ? "黑" : "白"}先`);
console.log("   " + "ABCDEFGHIJKLMNO".split("").map((c) => c.padStart(2)).join(""));
for (let y = 14; y >= 0; y--) {
  let row = String(y + 1).padStart(2) + " ";
  for (let x = 0; x < 15; x++) {
    const v = b.cells[y * 15 + x];
    row += (v === 1 ? " ●" : v === 2 ? " ○" : x === 7 && y === 7 ? " ＋" : " ·");
  }
  console.log(row);
}

function pts(color, label) {
  const f = b.fivePoints(color).map((i) => `${"ABCDEFGHIJKLMNO"[i % 15]}${((i / 15) | 0) + 1}`);
  console.log(`${label} 成五点: ${f.length ? f.join(" ") : "无"}`);
}
pts(1, "黑");
pts(2, "白");
console.log(`黑 fourCount=${b.fourCountB} 白 fourCount=${b.fourCountW}`);

// 列出所有能形成冲四/活三的点
for (const c of [1, 2]) {
  const label = c === 1 ? "黑" : "白";
  const out = [];
  for (let i = 0; i < 225; i++) {
    if (b.cells[i] !== 0) continue;
    const x = i % 15;
    const y = (i / 15) | 0;
    if (c === 1 && R.forbiddenType(b.cells, x, y, 3) !== 0) continue;
    b.cells[i] = c;
    const five = R.makesFive(b.cells, x, y, c);
    b.cells[i] = 0;
    // 落子后产生的四与活三
    b.place(x, y, c);
    let fours = 0;
    let threes = 0;
    for (let d = 0; d < 4; d++) {
      const sh = R.forbiddenType ? null : null;
      void sh;
    }
    const myFive = b.fivePoints(c).length;
    const oppFive = b.fivePoints(3 - c).length;
    b.undo();
    if (five || myFive >= 2 || (myFive === 1 && oppFive === 0)) {
      out.push(`${"ABCDEFGHIJKLMNO"[x]}${y + 1}[${five ? "成五" : myFive >= 2 ? "活四" : "冲四"}]`);
    }
  }
  console.log(`${label} 可成四/五点: ${out.length ? out.join(" ") : "无"}`);
}
