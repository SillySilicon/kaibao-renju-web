/* 用真实题库验证引擎：检查每套题的先手方是否存在必胜手段，并测速 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const R = require("../web/js/engine.js");

const src = fs.readFileSync(path.join(__dirname, "../web/js/puzzles.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const SETS = sandbox.window.BUILTIN_SETS;

function buildBoard(flat) {
  const b = new R.Board();
  // flat = [x,y,c, x,y,c, ...]
  for (let i = 0; i < flat.length; i += 3) {
    b.place(flat[i], flat[i + 1], flat[i + 2]);
  }
  b.refreshAll();
  return b;
}

function sideToMove(flat) {
  let black = 0;
  let white = 0;
  for (let i = 2; i < flat.length; i += 3) {
    if (flat[i] === 1) black++;
    else white++;
  }
  return black === white ? 1 : 2;
}

const only = process.argv[2] || null;
let totalN = 0;
let solved = 0;
let totalMs = 0;
let totalNodes = 0;
let worst = 0;

for (const set of SETS) {
  if (only && !set.name.includes(only)) continue;
  let setSolved = 0;
  const t0 = Date.now();
  for (let pi = 0; pi < set.puzzles.length; pi++) {
    const flat = set.puzzles[pi];
    const board = buildBoard(flat);
    const side = sideToMove(flat);
    const s = new R.Search(board, { maxCandidates: 14 });
    const t1 = Date.now();
    const r = s.search(side, { timeMs: 1500, maxDepth: 8 });
    const dt = Date.now() - t1;
    totalMs += dt;
    totalNodes += r.nodes;
    if (dt > worst) worst = dt;
    if (r.win) setSolved++;
    totalN++;
    if (process.argv.includes("--verbose")) {
      console.log(
        `  ${set.id} #${pi + 1} 先手=${side === 1 ? "黑" : "白"} ${r.win ? "有杀" : "未见杀"} 深度${r.depth} 节点${r.nodes} ${dt}ms`,
      );
    }
  }
  solved += setSolved;
  console.log(`${set.name}: ${setSolved}/${set.puzzles.length} 题找到必胜（${Date.now() - t0}ms）`);
}

console.log(
  `\n合计: ${solved}/${totalN} 题找到先手必胜，平均 ${(totalMs / totalN).toFixed(0)}ms/题，最慢 ${worst}ms，` +
    `节点/毫秒 ${(totalNodes / totalMs).toFixed(1)}`,
);
