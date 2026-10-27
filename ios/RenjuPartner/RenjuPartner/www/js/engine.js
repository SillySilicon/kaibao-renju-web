/*
 * 五子棋（有禁手）规则引擎 + AI
 * ------------------------------------------------
 * 纯 JavaScript 实现，同时可用于浏览器（window.Renju）与 Node（module.exports）。
 *
 * 规则要点（标准连珠／五子棋禁手规则）：
 *  - 棋盘 15×15，黑先。
 *  - 黑棋五连为胜；黑棋出现「长连」（六连及以上）为禁手，判负。
 *  - 黑棋「四四禁手」「三三禁手」判负。
 *  - 白棋无禁手，五连及以上均为胜。
 *  - 五连优先：若一着同时成五与长连，判胜而非禁手。
 *
 * 坐标系：x 为列（0..14，对应 A..O），y 为行（0..14，对应 1..15）。
 * 数组下标 i = y * 15 + x。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Renju = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var N = 15;
  var NN = 225;
  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;

  // 四个方向：横、竖、右下、左下
  var DIRS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  // ---------------------------------------------------------------- 形状分值
  var S_FIVE = 10000000;
  var S_OPEN_FOUR = 260000;
  var S_FOUR = 48000;
  var S_OPEN_THREE = 22000;
  var S_THREE = 1100;
  var S_OPEN_TWO = 700;
  var S_TWO = 110;
  var S_ONE = 6;
  var WIN_SCORE = 8000000;

  // ------------------------------------------------------------ 线路预计算
  // LINES[d] = [[i0, i1, ...], ...] 每条线上按顺序的格子下标（长度 >= 5）
  // LINE_ID[d][i] = 线序号，LINE_POS[d][i] = 在该线上的位置
  var LINES = [];
  var LINE_ID = [];
  var LINE_POS = [];
  (function buildLines() {
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0];
      var dy = DIRS[d][1];
      var lines = [];
      var ids = new Int16Array(NN).fill(-1);
      var pos = new Int16Array(NN).fill(-1);
      for (var y = 0; y < N; y++) {
        for (var x = 0; x < N; x++) {
          var px = x - dx;
          var py = y - dy;
          if (px >= 0 && px < N && py >= 0 && py < N) continue; // 不是线首
          var cells = [];
          var cx = x;
          var cy = y;
          while (cx >= 0 && cx < N && cy >= 0 && cy < N) {
            cells.push(cy * N + cx);
            cx += dx;
            cy += dy;
          }
          if (cells.length >= 5) {
            var li = lines.length;
            lines.push(cells);
            for (var k = 0; k < cells.length; k++) {
              ids[cells[k]] = li;
              pos[cells[k]] = k;
            }
          }
        }
      }
      LINES.push(lines);
      LINE_ID.push(ids);
      LINE_POS.push(pos);
    }
  })();

  // ---------------------------------------------------------------- 工具函数
  function inBoard(x, y) {
    return x >= 0 && x < N && y >= 0 && y < N;
  }

  // 经过 (x, y) 且该点为 c 色时，该方向连续同色子数
  function runThrough(cells, x, y, d, c) {
    var dx = DIRS[d][0];
    var dy = DIRS[d][1];
    var n = 1;
    var nx = x + dx;
    var ny = y + dy;
    while (nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny * N + nx] === c) {
      n++;
      nx += dx;
      ny += dy;
    }
    nx = x - dx;
    ny = y - dy;
    while (nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny * N + nx] === c) {
      n++;
      nx -= dx;
      ny -= dy;
    }
    return n;
  }

  // 在 (x,y) 放 c 后是否成「正好五连」（长连不算）
  function makesFive(cells, x, y, c) {
    for (var d = 0; d < 4; d++) {
      if (runThrough(cells, x, y, d, c) === 5) return true;
    }
    return false;
  }

  function maxRun(cells, x, y, c) {
    var m = 0;
    for (var d = 0; d < 4; d++) {
      var r = runThrough(cells, x, y, d, c);
      if (r > m) m = r;
    }
    return m;
  }

  // ------------------------------------------------------------ 五连点判定
  // 在长度 15 的窗口 seq 中，统计「补一子即成正好五连」的空点。
  // 要求该五连窗口同时包含 around 与 also 两个下标（用于限定与本次落子相关）。
  function countFivePoints(seq, around, also, c) {
    var lo = Math.max(1, around - 4);
    var hi = Math.min(9, around);
    var cnt = 0;
    for (var s = lo; s <= hi; s++) {
      if (also < s || also > s + 4) continue;
      var empties = 0;
      var ok = true;
      for (var k = s; k <= s + 4; k++) {
        var v = seq[k];
        if (v === c) continue;
        if (v === 0) {
          empties++;
          if (empties > 1) {
            ok = false;
            break;
          }
        } else {
          ok = false;
          break;
        }
      }
      if (!ok || empties !== 1) continue;
      if (seq[s - 1] === c || seq[s + 5] === c) continue; // 会成长连，不算五
      cnt++;
    }
    return cnt;
  }

  // 构造以 (x,y) 为中心、沿方向 d 的 15 格窗口（越界记 3）
  // 禁手判定会递归调用，故按递归深度各用一块缓冲区，避免互相覆盖。
  var SEQ_POOL = [];
  function buildSeq(cells, x, y, d, slot) {
    var buf = SEQ_POOL[slot];
    if (!buf) buf = SEQ_POOL[slot] = new Int8Array(15);
    var dx = DIRS[d][0];
    var dy = DIRS[d][1];
    for (var k = 0; k < 15; k++) {
      var o = k - 7;
      var nx = x + dx * o;
      var ny = y + dy * o;
      buf[k] = nx >= 0 && nx < N && ny >= 0 && ny < N ? cells[ny * N + nx] : 3;
    }
    return buf;
  }

  var CENTER = 7;

  // 分析 (x,y) 刚落下的 c 子在方向 d 上形成的形状
  // 返回 { four, openFour, openThree }
  function analyzeShapes(cells, x, y, d, c, depth) {
    var slot = typeof depth === "number" ? depth : 0;
    var seq = buildSeq(cells, x, y, d, slot);
    var fours = countFivePoints(seq, CENTER, CENTER, c);
    if (fours > 0) {
      return { four: true, openFour: fours >= 2, openThree: false };
    }
    // 活三：存在空点 i，补子后形成活四（两个成五点），且该补点本身不是禁手
    var dx = DIRS[d][0];
    var dy = DIRS[d][1];
    for (var i = CENTER - 4; i <= CENTER + 4; i++) {
      if (seq[i] !== 0) continue;
      seq[i] = c;
      var pts = countFivePoints(seq, i, CENTER, c);
      seq[i] = 0;
      if (pts >= 2) {
        var ex = x + dx * (i - CENTER);
        var ey = y + dy * (i - CENTER);
        if (c === BLACK && depth > 0 && forbiddenType(cells, ex, ey, depth - 1) !== 0) {
          continue; // 补点本身是禁手，则不算活三
        }
        return { four: false, openFour: false, openThree: true };
      }
    }
    return { four: false, openFour: false, openThree: false };
  }

  // 禁手判定（仅黑棋）。返回 0=合法, 1=长连, 2=四四, 3=三三
  // 调用前 cells[i] 必须为空且轮到黑棋。
  function forbiddenType(cells, x, y, depth) {
    if (depth === undefined) depth = 3;
    var i0 = y * N + x;
    if (cells[i0] !== 0) return 0;
    cells[i0] = BLACK;
    var five = false;
    var overline = false;
    for (var d = 0; d < 4; d++) {
      var r = runThrough(cells, x, y, d, BLACK);
      if (r === 5) five = true;
      else if (r >= 6) overline = true;
    }
    if (five) {
      cells[i0] = 0;
      return 0; // 五连优先
    }
    if (overline) {
      cells[i0] = 0;
      return 1;
    }
    var fours = 0;
    var threes = 0;
    for (var d2 = 0; d2 < 4; d2++) {
      var s = analyzeShapes(cells, x, y, d2, BLACK, depth);
      if (s.four) fours++;
      else if (s.openThree) threes++;
    }
    cells[i0] = 0;
    if (fours >= 2) return 2;
    // 四三为合法棋形：只要本着形成了一个四中的「四」，就不构成三三禁手
    if (fours === 0 && threes >= 2) return 3;
    return 0;
  }

  // ------------------------------------------------------------ 单线估值
  // 对一条线分别计算黑白两色得分，并回传五连点信息
  function evalLineInto(cells, lineCells, out) {
    var L = lineCells.length;
    var vals = out.vals || (out.vals = new Int8Array(20));
    var k;
    for (k = 0; k < L; k++) vals[k] = cells[lineCells[k]];

    var sB = 0;
    var sW = 0;
    var bFives = [];
    var wFives = [];

    // 连续段
    var i = 0;
    while (i < L) {
      var v = vals[i];
      if (v === EMPTY) {
        i++;
        continue;
      }
      var j = i;
      while (j < L && vals[j] === v) j++;
      var len = j - i;
      var openL = i > 0 && vals[i - 1] === EMPTY;
      var openR = j < L && vals[j] === EMPTY;
      var sc = 0;
      if (len >= 5) sc = S_FIVE;
      else if (len === 4) sc = openL && openR ? S_OPEN_FOUR : S_FOUR;
      else if (len === 3) sc = openL && openR ? S_OPEN_THREE : S_THREE;
      else if (len === 2) sc = openL && openR ? S_OPEN_TWO : S_TWO;
      else sc = S_ONE;
      if (v === BLACK) sB += sc;
      else sW += sc;
      i = j;
    }

    // 五格窗口：补一子成五（冲四/活四）与成五点
    // 窗口是 [s, s+4]，必须完整落在 [0, L-1] 内，因此 s 最大为 L-5。
    // （原先写成 L-4 会读到线外一格，而缓冲区复用会读到上一条线的残留数据，
    //   导致凭空多出「成五点」，进而误判胜负。）
    var MAXS = L - 5;
    for (var s = 0; s <= MAXS; s++) {
      var cntB = 0;
      var cntW = 0;
      var emp = -1;
      var bad = false;
      for (k = s; k <= s + 4; k++) {
        var x2 = vals[k];
        if (x2 === BLACK) cntB++;
        else if (x2 === WHITE) cntW++;
        else if (x2 === EMPTY) {
          if (emp >= 0) {
            bad = true;
            break;
          }
          emp = k;
        }
      }
      if (bad || emp < 0) continue;
      // 边界只要求「不是同色」，对手子或空都能形成正好五连
      var okBefore = !(s > 0 && vals[s - 1] === BLACK);
      var okAfter = !(s + 5 < L && vals[s + 5] === BLACK);
      var wOkBefore = !(s > 0 && vals[s - 1] === WHITE);
      var wOkAfter = !(s + 5 < L && vals[s + 5] === WHITE);
      var outsideOk = okBefore && okAfter;
      var wOutsideOk = wOkBefore && wOkAfter;
      if (cntB === 4 && cntW === 0) {
        // 黑在此窗口四子 + 一空
        if (outsideOk) {
          bFives.push(lineCells[emp]);
          sB += S_FOUR * 0.9;
        } else {
          sB += S_THREE; // 被堵，仅作厚度
        }
      } else if (cntW === 4 && cntB === 0) {
        if (wOutsideOk) {
          wFives.push(lineCells[emp]);
          sW += S_FOUR * 0.9;
        } else {
          sW += S_THREE;
        }
      } else if (cntB === 3 && cntW === 0) {
        sB += 600; // 含断点的三
      } else if (cntW === 3 && cntB === 0) {
        sW += 600;
      } else if (cntB === 2 && cntW === 0) {
        sB += 40;
      } else if (cntW === 2 && cntB === 0) {
        sW += 40;
      }
    }

    out.scoreB = sB;
    out.scoreW = sW;
    out.fivesB = bFives;
    out.fivesW = wFives;
    return out;
  }

  // ---------------------------------------------------------------- 棋盘
  function Board() {
    this.cells = new Int8Array(NN);
    this.history = [];
    this.count = 0;
    this.lastMove = -1;
    // 邻近标记（距离 2 内存在棋子）
    this.near = new Uint8Array(NN);
    this.active = [];
    this.listed = new Uint8Array(NN);
    // 增量线路得分
    this.lineB = [];
    this.lineW = [];
    this.fivesB = [];
    this.fivesW = [];
    for (var d = 0; d < 4; d++) {
      var n = LINES[d].length;
      this.lineB.push(new Float64Array(n));
      this.lineW.push(new Float64Array(n));
      this.fivesB.push(new Array(n));
      this.fivesW.push(new Array(n));
      for (var i = 0; i < n; i++) {
        this.fivesB[d][i] = [];
        this.fivesW[d][i] = [];
      }
    }
    this.totalB = 0;
    this.totalW = 0;
    this.fourCountB = 0;
    this.fourCountW = 0;
    this._scratch = {};
  }

  Board.prototype.clone = function () {
    var b = new Board();
    b.cells.set(this.cells);
    b.count = this.count;
    b.lastMove = this.lastMove;
    b.near.set(this.near);
    b.active = this.active.slice();
    b.listed.set(this.listed);
    b.totalB = this.totalB;
    b.totalW = this.totalW;
    b.fourCountB = this.fourCountB;
    b.fourCountW = this.fourCountW;
    for (var d = 0; d < 4; d++) {
      b.lineB[d].set(this.lineB[d]);
      b.lineW[d].set(this.lineW[d]);
    }
    b.history = this.history.slice();
    return b;
  };

  Board.prototype.get = function (x, y) {
    return this.cells[y * N + x];
  };

  Board.prototype.refreshAll = function () {
    // 全量重算（用于载入残局）：先把每条线的旧值清零，再逐行重算，
    // 否则 _updateLine 里的「减去旧值」会把分数抵消掉。
    this.totalB = 0;
    this.totalW = 0;
    this.fourCountB = 0;
    this.fourCountW = 0;
    for (var d = 0; d < 4; d++) {
      var lines = LINES[d];
      for (var li = 0; li < lines.length; li++) {
        this.lineB[d][li] = 0;
        this.lineW[d][li] = 0;
        this.fivesB[d][li] = [];
        this.fivesW[d][li] = [];
        this._updateLine(d, li);
      }
    }
  };

  Board.prototype._updateLine = function (d, li) {
    var lineCells = LINES[d][li];
    var out = evalLineInto(this.cells, lineCells, this._scratch);
    this.totalB -= this.lineB[d][li];
    this.totalW -= this.lineW[d][li];
    if (this.fivesB[d][li].length) this.fourCountB--;
    if (this.fivesW[d][li].length) this.fourCountW--;
    this.lineB[d][li] = out.scoreB;
    this.lineW[d][li] = out.scoreW;
    this.fivesB[d][li] = out.fivesB;
    this.fivesW[d][li] = out.fivesW;
    this.totalB += out.scoreB;
    this.totalW += out.scoreW;
    if (out.fivesB.length) this.fourCountB++;
    if (out.fivesW.length) this.fourCountW++;
    this._scratch.fivesB = null;
    this._scratch.fivesW = null;
  };

  Board.prototype._touch = function (i, delta) {
    var x = i % N;
    var y = (i / N) | 0;
    for (var dy = -2; dy <= 2; dy++) {
      var ny = y + dy;
      if (ny < 0 || ny >= N) continue;
      for (var dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        var nx = x + dx;
        if (nx < 0 || nx >= N) continue;
        var j = ny * N + nx;
        if (delta > 0) {
          this.near[j]++;
          if (!this.listed[j]) {
            this.listed[j] = 1;
            this.active.push(j);
          }
        } else {
          this.near[j]--;
        }
      }
    }
  };

  Board.prototype.place = function (x, y, c) {
    var i = y * N + x;
    if (this.cells[i] !== 0) return false;
    this.cells[i] = c;
    this.history.push(i);
    this.count++;
    this.lastMove = i;
    this._touch(i, 1);
    this._updateAround(i);
    return true;
  };

  Board.prototype.undo = function () {
    if (!this.history.length) return false;
    var i = this.history.pop();
    this.cells[i] = 0;
    this.count--;
    this.lastMove = this.history.length ? this.history[this.history.length - 1] : -1;
    this._touch(i, -1);
    this._updateAround(i);
    return true;
  };

  Board.prototype._updateAround = function (i) {
    var x = i % N;
    var y = (i / N) | 0;
    for (var d = 0; d < 4; d++) {
      var li = LINE_ID[d][i];
      if (li >= 0) this._updateLine(d, li);
    }
  };

  // 空且邻近有子，作为候选
  Board.prototype.candidateList = function () {
    var res = [];
    var act = this.active;
    var cells = this.cells;
    for (var k = 0; k < act.length; k++) {
      var i = act[k];
      if (this.near[i] > 0 && cells[i] === 0) res.push(i);
    }
    return res;
  };

  // 某色「成五点」：补一子即正好五连的空点
  Board.prototype.fivePoints = function (c) {
    var arr = c === BLACK ? this.fivesB : this.fivesW;
    var res = [];
    var seen = {};
    for (var d = 0; d < 4; d++) {
      for (var li = 0; li < arr[d].length; li++) {
        var f = arr[d][li];
        for (var k = 0; k < f.length; k++) {
          var i = f[k];
          if (this.cells[i] !== 0) continue;
          if (!seen[i]) {
            seen[i] = 1;
            res.push(i);
          }
        }
      }
    }
    return res;
  };

  Board.prototype.hasFour = function (c) {
    return c === BLACK ? this.fourCountB > 0 : this.fourCountW > 0;
  };

  // 静态估值（黑视角）
  Board.prototype.evaluate = function (side) {
    var diff = this.totalB - this.totalW * 1.12;
    return side === BLACK ? diff : -diff;
  };

  // ------------------------------------------------------------ 着点评分
  // 用于走子排序的局部形状评分（含断点形状的粗估）
  Board.prototype.moveScore = function (x, y, c) {
    var cells = this.cells;
    var opp = 3 - c;
    var s = 0;
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0];
      var dy = DIRS[d][1];
      var a = 0;
      var nx = x + dx;
      var ny = y + dy;
      while (nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny * N + nx] === c) {
        a++;
        nx += dx;
        ny += dy;
      }
      var openR = nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny * N + nx] === EMPTY;
      var b = 0;
      nx = x - dx;
      ny = y - dy;
      while (nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny * N + nx] === c) {
        b++;
        nx -= dx;
        ny -= dy;
      }
      var openL = nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny * N + nx] === EMPTY;
      var len = a + b + 1;
      var o = (openL ? 1 : 0) + (openR ? 1 : 0);
      if (len >= 5) s += S_FIVE;
      else if (len === 4) s += o === 2 ? S_OPEN_FOUR : o === 1 ? S_FOUR : 0;
      else if (len === 3) s += o === 2 ? S_OPEN_THREE : o === 1 ? S_THREE : 0;
      else if (len === 2) s += o === 2 ? S_OPEN_TWO : o === 1 ? S_TWO : 0;

      // 断点形状粗估：统计两侧 4 格内的同色子
      var near = 0;
      for (var t = 1; t <= 4; t++) {
        var ax = x + dx * t;
        var ay = y + dy * t;
        if (ax < 0 || ax >= N || ay < 0 || ay >= N) break;
        if (cells[ay * N + ax] === c) near++;
        else if (cells[ay * N + ax] === opp) break;
        var bx = x - dx * t;
        var by = y - dy * t;
        if (bx < 0 || bx >= N || by < 0 || by >= N) break;
        if (cells[by * N + bx] === c) near++;
        else if (cells[by * N + bx] === opp) break;
      }
      s += near * 25;
    }
    return s;
  };

  // ---------------------------------------------------------------- 搜索
  function Search(board, opts) {
    this.board = board;
    this.opts = opts || {};
    this.nodes = 0;
    this.deadline = 0;
    this.stopped = false;
    this.tt = new Map();
    this.maxCandidates = this.opts.maxCandidates || 12;
  }

  Search.prototype._timeUp = function () {
    if (this.stopped) return true;
    if ((this.nodes & 255) === 0 && Date.now() > this.deadline) {
      this.stopped = true;
      return true;
    }
    return false;
  };

  // 生成候选着点并按价值排序
  Search.prototype._genMoves = function (c, limit) {
    var board = this.board;
    var cells = board.cells;
    var cand = board.candidateList();
    if (cand.length === 0) {
      // 空盘
      return [7 * N + 7];
    }
    var opp = 3 - c;
    var scored = [];
    for (var k = 0; k < cand.length; k++) {
      var i = cand[k];
      var x = i % N;
      var y = (i / N) | 0;
      if (c === BLACK && forbiddenType(cells, x, y, 2) !== 0) continue;
      var sc = board.moveScore(x, y, c) + board.moveScore(x, y, opp) * 0.9;
      scored.push([sc, i]);
    }
    scored.sort(function (p, q) {
      return q[0] - p[0];
    });
    var out = [];
    var n = Math.min(scored.length, limit || this.maxCandidates);
    for (var j = 0; j < n; j++) out.push(scored[j][1]);
    return out;
  };

  Search.prototype._eval = function (c) {
    return this.board.evaluate(c);
  };

  Search.prototype._negamax = function (depth, alpha, beta, c, ply) {
    this.nodes++;
    if (this._timeUp()) return 0;
    var board = this.board;
    var cells = board.cells;
    var opp = 3 - c;

    // 自己能否立即成五
    if (board.hasFour(c)) {
      var myFive = board.fivePoints(c);
      if (myFive.length) return WIN_SCORE - ply;
    }

    // 对方有冲四，必须堵（或自己成五，上面已判）
    var blockList = null;
    if (board.hasFour(opp)) {
      var oppFive = board.fivePoints(opp);
      if (oppFive.length >= 2) return -WIN_SCORE + ply; // 双四无法全堵
      if (oppFive.length === 1) blockList = oppFive;
    }

    if (depth <= 0) return this._eval(c);

    var moves;
    if (blockList) {
      moves = blockList;
      // 堵点若本身是黑棋禁手，则无法堵
      if (c === BLACK) {
        var bx = moves[0] % N;
        var by = (moves[0] / N) | 0;
        if (forbiddenType(cells, bx, by, 2) !== 0) return -WIN_SCORE + ply;
      }
    } else {
      moves = this._genMoves(c, this.maxCandidates);
      if (!moves.length) return this._eval(c);
    }

    var best = -Infinity;
    var first = true;
    for (var k = 0; k < moves.length; k++) {
      var i = moves[k];
      var x = i % N;
      var y = (i / N) | 0;
      if (cells[i] !== 0) continue;
      if (c === BLACK && forbiddenType(cells, x, y, 2) !== 0) continue;
      board.place(x, y, c);
      var val;
      if (makesFive(cells, x, y, c)) {
        val = WIN_SCORE - ply - 1;
      } else {
        if (first) {
          val = -this._negamax(depth - 1, -beta, -alpha, opp, ply + 1);
        } else {
          val = -this._negamax(depth - 1, -alpha - 1, -alpha, opp, ply + 1);
          if (val > alpha && val < beta && !this.stopped) {
            val = -this._negamax(depth - 1, -beta, -alpha, opp, ply + 1);
          }
        }
      }
      board.undo();
      if (this.stopped) return best === -Infinity ? 0 : best;
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
      first = false;
    }
    if (best === -Infinity) return this._eval(c);
    return best;
  };

  Search.prototype.search = function (c, opts) {
    opts = opts || {};
    var timeMs = opts.timeMs || 600;
    var maxDepth = opts.maxDepth || 8;
    this.deadline = Date.now() + timeMs;
    this.stopped = false;
    this.nodes = 0;
    this.tt.clear();
    var board = this.board;
    var cells = board.cells;

    // 空盘
    if (board.count === 0) return { move: 7 * N + 7, score: 0, depth: 0, nodes: 0 };

    // 1) 自己能成五，直接赢
    var myFive = board.fivePoints(c);
    if (myFive.length) {
      return { move: myFive[0], score: WIN_SCORE, depth: 0, nodes: 0, win: true };
    }

    // 对方成五点：必须堵
    var opp = 3 - c;
    var oppFive = board.fivePoints(opp);
    var forced = null;
    if (oppFive.length) {
      if (oppFive.length > 1) {
        // 已无法全堵，仍返回一个堵点
        return { move: oppFive[0], score: -WIN_SCORE, depth: 0, nodes: 0, lost: true };
      }
      forced = oppFive[0];
      if (c === BLACK) {
        var fx = forced % N;
        var fy = (forced / N) | 0;
        if (forbiddenType(cells, fx, fy, 2) !== 0) {
          return { move: forced, score: -WIN_SCORE, depth: 0, nodes: 0, lost: true };
        }
      }
    }

    var bestMove = forced !== null ? forced : -1;
    var bestScore = forced !== null ? 0 : -Infinity;
    var reachedDepth = 0;

    var rootMoves;
    if (forced !== null) {
      rootMoves = [forced];
    } else {
      rootMoves = this._genMoves(c, Math.max(this.maxCandidates, 10));
    }

    for (var depth = 2; depth <= maxDepth; depth += 2) {
      var alpha = -Infinity;
      var beta = Infinity;
      var localBest = -Infinity;
      var localMove = rootMoves[0];
      for (var k = 0; k < rootMoves.length; k++) {
        var i = rootMoves[k];
        var x = i % N;
        var y = (i / N) | 0;
        if (cells[i] !== 0) continue;
        if (c === BLACK && forbiddenType(cells, x, y, 2) !== 0) continue;
        board.place(x, y, c);
        var val;
        if (makesFive(cells, x, y, c)) val = WIN_SCORE;
        else val = -this._negamax(depth - 1, -beta, -alpha, opp, 1);
        board.undo();
        if (this.stopped) break;
        if (val > localBest) {
          localBest = val;
          localMove = i;
        }
        if (val > alpha) alpha = val;
      }
      if (this.stopped) break;
      if (localBest > -Infinity) {
        bestMove = localMove;
        bestScore = localBest;
        reachedDepth = depth;
        // 找到必胜/必败即可提前结束
        if (Math.abs(bestScore) > WIN_SCORE / 2) break;
      }
    }

    if (bestMove < 0) {
      var fallback = this._genMoves(c, 1);
      bestMove = fallback.length ? fallback[0] : -1;
      bestScore = 0;
    }
    return {
      move: bestMove,
      score: bestScore,
      depth: reachedDepth,
      nodes: this.nodes,
      win: bestScore > WIN_SCORE / 2,
      lost: bestScore < -WIN_SCORE / 2,
    };
  };

  return {
    N: N,
    NN: NN,
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    DIRS: DIRS,
    WIN_SCORE: WIN_SCORE,
    Board: Board,
    Search: Search,
    runThrough: runThrough,
    makesFive: makesFive,
    maxRun: maxRun,
    forbiddenType: forbiddenType,
    evalLineInto: evalLineInto,
    LINES: LINES,
    idx: function (x, y) {
      return y * N + x;
    },
  };
});
