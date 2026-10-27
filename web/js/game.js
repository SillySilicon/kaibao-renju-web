/*
 * 对局流程层：题目载入、先后手判定、落子/禁手/胜负判定、悔棋、重来、AI 走子。
 * 不操作 DOM，便于单元测试。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./engine.js"));
  } else {
    root.RenjuGame = factory(root.Renju);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (R) {
  "use strict";

  var N = 15;

  function countColors(flat) {
    var b = 0;
    var w = 0;
    for (var i = 2; i < flat.length; i += 3) {
      if (flat[i] === 1) b++;
      else w++;
    }
    return [b, w];
  }

  function Game(flat, opts) {
    opts = opts || {};
    this.flat = flat || [];
    this.aiTimeMs = opts.aiTimeMs || 420;
    this.aiDepth = opts.aiDepth || 6;
    this.aiCandidates = opts.aiCandidates || 12;
    this.reset();
  }

  Game.prototype.reset = function () {
    this.board = new R.Board();
    var flat = this.flat;
    for (var i = 0; i < flat.length; i += 3) {
      this.board.place(flat[i], flat[i + 1], flat[i + 2]);
    }
    this.board.refreshAll();
    this.board.history = []; // 题目初始摆放不算历史，悔棋时不回退
    this.board.lastMove = -1;
    var c = countColors(flat);
    this.playerColor = c[0] === c[1] ? 1 : 2;
    this.side = this.playerColor;
    this.status = "playing";
    this.result = null;
    this.reason = "";
    this.moves = 0;
  };

  Game.prototype.isPlayerTurn = function () {
    return this.status === "playing" && this.side === this.playerColor;
  };

  Game.prototype.isOver = function () {
    return this.status !== "playing";
  };

  Game.prototype.sideToMove = function () {
    return this.side;
  };

  // 该点是否为「当前行棋方」的禁手点（仅黑棋有意义）
  Game.prototype.isForbiddenPoint = function (x, y) {
    if (this.side !== 1) return 0;
    if (this.board.cells[y * N + x] !== 0) return 0;
    return R.forbiddenType(this.board.cells, x, y, 3);
  };

  var FORBIDDEN_TEXT = {
    1: "长连禁手（六子及以上相连）",
    2: "四四禁手（同时形成两个四）",
    3: "三三禁手（同时形成两个活三）",
  };

  // 返回 { ok, result }
  // result: 'continue' | 'win' | 'lose' | 'draw' | 'occupied' | 'over' | 'forbidden'
  Game.prototype.playAt = function (x, y) {
    if (this.status !== "playing") return { ok: false, result: "over" };
    if (x < 0 || x >= N || y < 0 || y >= N) return { ok: false, result: "occupied" };
    var i = y * N + x;
    if (this.board.cells[i] !== 0) return { ok: false, result: "occupied" };

    var c = this.side;

    // 黑棋禁手：判负（若同时成五，则 five 优先，引擎会返回 0）
    if (c === 1) {
      var ft = R.forbiddenType(this.board.cells, x, y, 3);
      if (ft !== 0) {
        this.board.place(x, y, c);
        this.moves++;
        this.status = c === this.playerColor ? "lost" : "won";
        this.result = c === this.playerColor ? "lose" : "win";
        this.reason = "forbidden:" + ft;
        this.forbiddenAt = i;
        return { ok: true, result: "forbidden", forbiddenType: ft, text: FORBIDDEN_TEXT[ft] };
      }
    }

    this.board.place(x, y, c);
    this.moves++;

    if (R.makesFive(this.board.cells, x, y, c)) {
      if (c === this.playerColor) {
        this.status = "won";
        this.result = "win";
        this.reason = "five";
      } else {
        this.status = "lost";
        this.result = "lose";
        this.reason = "five";
      }
      return { ok: true, result: this.result };
    }

    if (this.board.count >= 225) {
      this.status = "draw";
      this.result = "draw";
      this.reason = "full";
      return { ok: true, result: "draw" };
    }

    this.side = 3 - c;
    return { ok: true, result: "continue" };
  };

  // AI 走一步，返回 { x, y, result, info } 或 null
  Game.prototype.aiMove = function (opts) {
    if (this.status !== "playing") return null;
    opts = opts || {};
    var color = this.side;
    if (color === this.playerColor) return null; // 还没轮到 AI
    var s = new R.Search(this.board, { maxCandidates: this.aiCandidates });
    var info = s.search(color, {
      timeMs: opts.timeMs || this.aiTimeMs,
      maxDepth: opts.maxDepth || this.aiDepth,
    });
    if (info.move < 0) return null;
    var x = info.move % N;
    var y = (info.move / N) | 0;
    var res = this.playAt(x, y);
    return { x: x, y: y, result: res.result, info: info };
  };

  // 悔棋：退回轮到玩家行棋的状态
  Game.prototype.undo = function () {
    if (!this.board.history.length) return false;
    this.status = "playing";
    this.result = null;
    this.reason = "";
    this.forbiddenAt = -1;
    this.board.undo();
    this.moves = Math.max(0, this.moves - 1);
    this.side = this.board.count ? this.sideAfterUndo() : this.playerColor;
    var guard = 0;
    while (this.side !== this.playerColor && this.board.history.length && guard++ < 4) {
      this.board.undo();
      this.moves = Math.max(0, this.moves - 1);
      this.side = this.board.count ? this.sideAfterUndo() : this.playerColor;
    }
    return true;
  };

  Game.prototype.sideAfterUndo = function () {
    // 依据棋子数推断轮次（题目初始局面黑棋数 >= 白棋数）
    var b = 0;
    var w = 0;
    var cells = this.board.cells;
    for (var i = 0; i < 225; i++) {
      if (cells[i] === 1) b++;
      else if (cells[i] === 2) w++;
    }
    return b === w ? 1 : 2;
  };

  Game.prototype.lastMove = function () {
    return this.board.lastMove;
  };

  Game.prototype.moveCount = function () {
    return this.moves;
  };

  Game.FORBIDDEN_TEXT = FORBIDDEN_TEXT;
  return Game;
});
