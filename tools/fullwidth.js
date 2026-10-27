/* 对指定题目做全宽度搜索，判断是否真有必胜，并给出最佳着手 */
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
const depth = parseInt(process.argv[4] || "4", 10);
const timeMs = parseInt(process.argv[5] || "20000", 10);

const set = SETS.find((s) => s.name.includes(setName));
const flat = set.puzzles[idx];
const b = new R.Board();
for (let i = 0; i < flat.length; i += 3) b.place(flat[i], flat[i + 1], flat[i + 2]);
b.refreshAll();
let black = 0;
let white = 0;
for (let i = 2; i < flat.length; i += 3) flat[i] === 1 ? black++ : white++;
const side = black === white ? 1 : 2;

const s = new R.Search(b, { maxCandidates: 500 });
const t0 = Date.now();
const r = s.search(side, { timeMs, maxDepth: depth });
console.log(
  `全宽度 depth=${depth} → 落点 ${"ABCDEFGHIJKLMNO"[r.move % 15]}${((r.move / 15) | 0) + 1} ` +
    `分数 ${r.score} win=${r.win} 到达深度 ${r.depth} 节点 ${r.nodes} 用时 ${Date.now() - t0}ms`,
);
