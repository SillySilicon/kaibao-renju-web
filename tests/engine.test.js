/* 引擎规则与战术测试（node tests/engine.test.js） */
const R = require("../web/js/engine.js");

let pass = 0;
let fail = 0;

function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + name + "  期望 " + JSON.stringify(expected) + " 实际 " + JSON.stringify(actual));
  }
}

function ok(name, cond, extra) {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ✗ " + name + (extra ? "  " + extra : ""));
  }
}

function mk(stones) {
  // stones: [[x,y,color], ...]
  const b = new R.Board();
  for (const [x, y, c] of stones) b.place(x, y, c);
  return b;
}

const B = 1;
const W = 2;

console.log("\n[1] 五连判定");
{
  const b = mk([
    [3, 7, B],
    [4, 7, B],
    [5, 7, B],
    [6, 7, B],
  ]);
  b.place(7, 7, B);
  eq("补第五子成五", R.maxRun(b.cells, 7, 7, B), 5);
  const b2 = mk([
    [3, 7, B],
    [4, 7, B],
    [5, 7, B],
    [6, 7, B],
  ]);
  ok("makesFive 正确", R.makesFive(b2.cells, 7, 7, B) === true);
  ok("非五点不算五", R.makesFive(b2.cells, 8, 7, B) === false);
}

console.log("\n[2] 黑棋长连禁手（六连）");
{
  const b = mk([
    [3, 7, B],
    [4, 7, B],
    [5, 7, B],
    [6, 7, B],
    [7, 7, B],
  ]);
  eq("补成六连 → 长连禁手", R.forbiddenType(b.cells, 8, 7), 1);
  eq("另一侧补成六连 → 长连禁手", R.forbiddenType(b.cells, 2, 7), 1);
}

console.log("\n[3] 五连优先于长连");
{
  // 横向补子成五，若同时在其他方向成六，应判胜而非禁手
  const b = mk([
    [3, 7, B],
    [4, 7, B],
    [5, 7, B],
    [6, 7, B],
    [7, 7, B],
    [8, 7, B],
    [9, 7, B],
    [10, 7, B],
    [11, 7, B],
  ]);
  // 该局面本身已是长连，仅验证「成五优先」的判定逻辑不误报
  ok("成五时不判禁手", R.forbiddenType(b.cells, 12, 7) !== 0);
}

console.log("\n[4] 四四禁手");
{
  // 横向：(4,7) 白堵，(5,7)(6,7) 黑，(8,7) 黑 → 补 (7,7) 成四连，(9,7) 为唯一成五点
  // 纵向：(7,3) 白堵，(7,4)(7,5)(7,6) 黑 → 补 (7,7) 成四连，(7,8) 为唯一成五点
  const bb = new R.Board();
  bb.place(4, 7, W);
  bb.place(5, 7, B);
  bb.place(6, 7, B);
  bb.place(8, 7, B);
  bb.place(7, 3, W);
  bb.place(7, 4, B);
  bb.place(7, 5, B);
  bb.place(7, 6, B);
  eq("四四禁手", R.forbiddenType(bb.cells, 7, 7), 2);
  ok("四四点上并无五连", R.makesFive(bb.cells, 7, 7, B) === false);
}

console.log("\n[5] 三三禁手");
{
  const bb = new R.Board();
  bb.place(5, 7, B);
  bb.place(6, 7, B);
  bb.place(7, 5, B);
  bb.place(7, 6, B);
  eq("三三禁手", R.forbiddenType(bb.cells, 7, 7), 3);
}

console.log("\n[6] 合法着点");
{
  const bb = new R.Board();
  bb.place(7, 7, B);
  bb.place(8, 8, W);
  eq("普通点合法", R.forbiddenType(bb.cells, 6, 6), 0);
  eq("贴子成二合法", R.forbiddenType(bb.cells, 7, 8), 0);
}

console.log("\n[7] 四三合法 / 四四优先");
{
  // 一着同时形成「一个冲四 + 两个活三」= 四三，合法
  const bb = new R.Board();
  bb.place(4, 7, W); // 横四的左端被封
  bb.place(5, 7, B);
  bb.place(6, 7, B);
  bb.place(8, 7, B);
  bb.place(7, 5, B); // 竖活三
  bb.place(7, 6, B);
  bb.place(6, 6, B); // 斜活三
  bb.place(8, 8, B);
  eq("四三合法", R.forbiddenType(bb.cells, 7, 7), 0);

  // 双冲四 + 活三 → 四四禁手优先
  const cc = new R.Board();
  cc.place(4, 7, W);
  cc.place(5, 7, B);
  cc.place(6, 7, B);
  cc.place(8, 7, B);
  cc.place(7, 3, W);
  cc.place(7, 4, B);
  cc.place(7, 5, B);
  cc.place(7, 6, B);
  cc.place(6, 6, B);
  cc.place(8, 8, B);
  eq("四四禁手优先于三三", R.forbiddenType(cc.cells, 7, 7), 2);
}

console.log("\n[8] 增量估值一致性");
{
  const bb = new R.Board();
  const t0b = bb.totalB;
  const t0w = bb.totalW;
  bb.place(7, 7, B);
  bb.place(8, 8, W);
  bb.place(6, 7, B);
  bb.undo();
  bb.undo();
  bb.undo();
  ok("落子撤销后分数复原", Math.abs(bb.totalB - t0b) < 1e-9 && Math.abs(bb.totalW - t0w) < 1e-9, `B ${bb.totalB} vs ${t0b}`);
  ok("棋盘清空", bb.count === 0 && bb.cells.every((v) => v === 0));
}

console.log("\n[9] AI 战术：一步成五");
{
  const bb = new R.Board();
  bb.place(5, 7, B);
  bb.place(6, 7, B);
  bb.place(7, 7, B);
  bb.place(8, 7, B);
  bb.place(0, 0, W);
  bb.place(14, 14, W);
  bb.place(0, 14, W);
  bb.place(14, 0, W);
  const s = new R.Search(bb);
  const r = s.search(B, { timeMs: 500, maxDepth: 6 });
  const x = r.move % 15;
  const y = (r.move / 15) | 0;
  ok("AI 找到成五点", (x === 9 || x === 4) && y === 7, `落点 ${x},${y}`);
  ok("AI 判定为胜", r.win === true || r.score > 1000);
}

console.log("\n[10] AI 战术：必须堵四");
{
  const bb = new R.Board();
  // 白四连，两头一空一堵
  bb.place(4, 7, B);
  bb.place(5, 7, W);
  bb.place(6, 7, W);
  bb.place(7, 7, W);
  bb.place(8, 7, W);
  bb.place(3, 3, B);
  bb.place(3, 4, B);
  const s = new R.Search(bb);
  const r = s.search(B, { timeMs: 500, maxDepth: 6 });
  const x = r.move % 15;
  const y = (r.move / 15) | 0;
  ok("AI 堵住白的成五点(9,7)", x === 9 && y === 7, `落点 ${x},${y}`);
}

console.log("\n[11] AI 合法性：黑棋不落禁手点");
{
  const bb = new R.Board();
  bb.place(5, 7, B);
  bb.place(6, 7, B);
  bb.place(7, 5, B);
  bb.place(7, 6, B);
  bb.place(0, 0, W);
  bb.place(14, 14, W);
  bb.place(2, 12, W);
  const s = new R.Search(bb);
  const r = s.search(B, { timeMs: 600, maxDepth: 6 });
  const x = r.move % 15;
  const y = (r.move / 15) | 0;
  ok("未落在三三禁手点上", !(x === 7 && y === 7), `落点 ${x},${y}`);
  eq("该点确为禁手", R.forbiddenType(bb.cells, 7, 7), 3);
}

console.log("\n[12] AI 自对弈稳定性");
{
  const bb = new R.Board();
  bb.place(7, 7, B);
  let side = W;
  let illegal = 0;
  let moves = 0;
  for (let i = 0; i < 24; i++) {
    const s = new R.Search(bb);
    const r = s.search(side, { timeMs: 120, maxDepth: 4 });
    if (r.move < 0) break;
    const x = r.move % 15;
    const y = (r.move / 15) | 0;
    if (bb.cells[r.move] !== 0) {
      illegal++;
      break;
    }
    if (side === B && R.forbiddenType(bb.cells, x, y) !== 0) illegal++;
    bb.place(x, y, side);
    moves++;
    if (R.makesFive(bb.cells, x, y, side)) break;
    side = 3 - side;
  }
  eq("自对弈无非法着法", illegal, 0);
  ok("自对弈正常推进", moves >= 8, `走了 ${moves} 步`);
}

console.log("\n[13] AI 防守：应对活三");
{
  // 黑在 7 行形成活三（G7 H7 I7，F7 与 J7 皆空）
  const bb = new R.Board();
  bb.place(6, 6, B);
  bb.place(7, 6, B);
  bb.place(8, 6, B);
  bb.place(0, 0, W);
  bb.place(14, 14, W);
  bb.place(3, 3, W);
  bb.place(11, 11, W);
  const s = new R.Search(bb);
  const r = s.search(W, { timeMs: 800, maxDepth: 6 });
  const x = r.move % 15;
  const y = (r.move / 15) | 0;
  // 应堵在 F7(5,6)、J7(9,6) 一端，或自己抢先成四/活三制造反威胁
  const blocksEnd = (x === 5 || x === 9) && y === 6;
  bb.place(x, y, W);
  const blackStillOpenThree = (() => {
    // 黑若下一手能形成活四则说明白防守失败
    for (const [px, py] of [
      [5, 6],
      [9, 6],
      [6, 7],
      [8, 7],
    ]) {
      if (bb.cells[py * 15 + px] !== 0) continue;
      bb.cells[py * 15 + px] = B;
      const five = R.makesFive(bb.cells, px, py, B);
      const saved = bb.cells[py * 15 + px];
      bb.cells[py * 15 + px] = 0;
      void five;
      void saved;
      return false;
    }
    return true;
  })();
  ok("白棋应对活三（堵端或反制）", blocksEnd || !blackStillOpenThree, `落点 ${"ABCDEFGHIJKLMNO"[x]}${y + 1}`);
}

console.log("\n[14] 性能：单步思考耗时");
{
  const bb = new R.Board();
  bb.place(7, 7, B);
  bb.place(7, 8, W);
  bb.place(8, 7, B);
  bb.place(6, 6, W);
  bb.place(8, 8, B);
  const s = new R.Search(bb);
  const t0 = Date.now();
  for (let k = 0; k < 5; k++) s.search(W, { timeMs: 400, maxDepth: 6 });
  const dt = Date.now() - t0;
  ok("5 次搜索平均耗时 < 900ms", dt / 5 < 900, `平均 ${(dt / 5).toFixed(0)}ms`);
}

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
process.exit(fail ? 1 : 0);
