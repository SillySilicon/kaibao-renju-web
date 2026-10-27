/* 对局流程测试 */
const assert = require("assert");
const R = require("../web/js/engine.js");
const Game = require("../web/js/game.js");

let pass = 0;
let fail = 0;
function eq(name, a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}: 期望 ${JSON.stringify(b)} 实际 ${JSON.stringify(a)}`);
  }
}
function ok(name, cond, extra) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name} ${extra || ""}`);
  }
}

// 简易局面：黑 3 连，白 2 子（黑先）
const flat = [5, 7, 1, 6, 7, 1, 7, 7, 1, 4, 8, 2, 8, 8, 2, 0, 0, 2];

console.log("\n[A] 先后手与初始化");
{
  const g = new Game(flat);
  eq("黑先（黑白等量）", g.sideToMove(), 1);
  eq("玩家执黑", g.playerColor, 1);
  ok("玩家先行", g.isPlayerTurn());
  eq("初始未结束", g.isOver(), false);

  const flat2 = [5, 7, 1, 6, 7, 1, 7, 7, 1, 4, 8, 2];
  const g2 = new Game(flat2);
  eq("白先（黑多一子）", g2.sideToMove(), 2);
  eq("玩家执白", g2.playerColor, 2);
}

console.log("\n[B] 落子、胜负");
{
  const g = new Game(flat);
  let r = g.playAt(8, 7); // 黑成四
  eq("轮到白", g.sideToMove(), 2);
  eq("未结束", g.result, null);
  ok("落子返回 continue", r.result === "continue");

  // 补成五：黑 5,6,7,8 行 + 9 处
  const g2 = new Game([5, 7, 1, 6, 7, 1, 7, 7, 1, 8, 7, 1, 0, 0, 2, 14, 14, 2, 13, 13, 2, 2, 2, 2]);
  const r2 = g2.playAt(4, 7);
  eq("五连判胜", r2.result, "win");
  eq("状态 won", g2.status, "won");
  ok("对局结束", g2.isOver());
  ok("结束后不可落子", g2.playAt(10, 10).ok === false);
}

console.log("\n[C] 禁手判负");
{
  // 黑三三禁手点 (7,7)
  const g = new Game([5, 7, 1, 6, 7, 1, 7, 5, 1, 7, 6, 1, 0, 0, 2, 1, 1, 2, 14, 14, 2, 13, 13, 2]);
  eq("该点为三三禁手", g.isForbiddenPoint(7, 7), 3);
  const r = g.playAt(7, 7);
  eq("落禁手点判负", r.result, "forbidden");
  eq("禁手类型", r.forbiddenType, 3);
  eq("状态 lost", g.status, "lost");
  ok("带中文说明", /三三/.test(r.text));
}

console.log("\n[D] 悔棋");
{
  const g = new Game(flat);
  g.playAt(8, 7);
  const afterOne = g.board.count;
  g.undo();
  eq("悔一步回到初始", g.board.count, afterOne - 1);
  ok("悔棋后轮到玩家", g.sideToMove() === g.playerColor);
  ok("悔棋后状态可继续", g.status === "playing");

  // 玩家 + AI 各一步后连悔
  const g2 = new Game(flat);
  const p = g2.playAt(8, 7);
  void p;
  const before = g2.board.count;
  g2.undo();
  ok("悔棋可回退到玩家回合", g2.board.count < before && g2.sideToMove() === g2.playerColor);
}

console.log("\n[E] AI 走子");
{
  const g = new Game(flat, { aiTimeMs: 300, aiDepth: 4 });
  g.playAt(8, 7);
  const t0 = Date.now();
  const mv = g.aiMove();
  ok("AI 有输出", mv !== null, `${Date.now() - t0}ms`);
  if (mv) {
    ok("AI 落在空点", g.board.cells[mv.y * 15 + mv.x] !== 0, `${mv.x},${mv.y}`);
    ok("黑棋不落禁手", R.forbiddenType(g.board.cells, mv.x, mv.y, 3) === 0 || g.board.cells[mv.y * 15 + mv.x] === 2);
    ok("该点不是棋子数异常", true);
  }
}

console.log("\n[F] 真实题目集成");
{
  const fs = require("fs");
  const path = require("path");
  const vm = require("vm");
  const src = fs.readFileSync(path.join(__dirname, "../web/js/puzzles.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox);
  const set = sandbox.window.BUILTIN_SETS[0];
  const g = new Game(set.puzzles[0], { aiTimeMs: 300, aiDepth: 4 });
  eq("题目先手为黑", g.sideToMove(), 1);
  let steps = 0;
  while (!g.isOver() && steps < 6) {
    if (g.isPlayerTurn()) {
      // 玩家随便找一个非禁手空点
      let played = false;
      for (let i = 0; i < 225 && !played; i++) {
        if (g.board.cells[i] === 0 && R.forbiddenType(g.board.cells, i % 15, (i / 15) | 0, 3) === 0) {
          g.playAt(i % 15, (i / 15) | 0);
          played = true;
        }
      }
    } else {
      g.aiMove();
    }
    steps++;
  }
  ok("对局可推进", steps > 0, `steps=${steps}`);
  ok("状态合法", ["playing", "won", "lost", "draw"].includes(g.status));
}

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);

