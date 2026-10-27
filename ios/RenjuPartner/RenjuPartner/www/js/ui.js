/* 界面层：棋盘渲染、手势、题库管理、进度保存 */
(function () {
  "use strict";

  var R = window.Renju;
  var Game = window.RenjuGame;

  // ---------------------------------------------------------------- 存储
  var STORE_KEY = "renju.store.v1";

  function defaultStore() {
    return {
      progress: {}, // setId -> [puzzleIndex...]
      imported: [], // [{id,name,puzzles}]
      ui: { agreed: false, skin: 0, lastSet: null, lastPuzzle: 0 },
      resume: null, // {setId, puzzleIndex, moves:[[x,y]...]}
    };
  }

  var store = defaultStore();
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        store.progress = parsed.progress || {};
        store.imported = Array.isArray(parsed.imported) ? parsed.imported : [];
        store.ui = Object.assign(defaultStore().ui, parsed.ui || {});
        store.resume = parsed.resume || null;
      }
    }
  } catch (e) {
    /* 存储不可用时静默降级 */
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* 忽略配额错误 */
    }
  }

  // ---------------------------------------------------------------- 状态
  var sets = [];
  var state = {
    setIndex: 0,
    puzzleIndex: 0,
    game: null,
    thinking: false,
  };

  function makeSet(def, builtin) {
    return {
      id: def.id,
      name: def.name,
      puzzles: def.puzzles,
      builtin: !!builtin,
    };
  }

  function loadSets() {
    sets = (window.BUILTIN_SETS || []).map(function (s) {
      return makeSet(s, true);
    });
    (store.imported || []).forEach(function (s) {
      if (s && s.id && Array.isArray(s.puzzles)) sets.push(makeSet(s, false));
    });
  }

  function solvedOf(set) {
    var arr = store.progress[set.id];
    return Array.isArray(arr) ? arr : [];
  }

  function isSolved(set, idx) {
    return solvedOf(set).indexOf(idx) !== -1;
  }

  function markSolved(set, idx) {
    var arr = store.progress[set.id] || (store.progress[set.id] = []);
    if (arr.indexOf(idx) === -1) arr.push(idx);
    save();
  }

  // ---------------------------------------------------------------- 元素
  var $ = function (id) {
    return document.getElementById(id);
  };
  var canvas = $("board");
  var ctx = canvas.getContext("2d");
  var stage = $("stage");
  var toastEl = $("toast");

  // ---------------------------------------------------------------- 棋盘绘制
  var geo = { size: 300, cell: 19, pad: 18, dpr: 1 };

  var SKINS = [
    {
      bg1: "#ecceA0".toLowerCase(),
      bg2: "#d8ae78",
      line: "rgba(92,62,30,0.5)",
      star: "rgba(92,62,30,0.7)",
      text: "rgba(92,62,30,0.72)",
      grain: "rgba(150,110,66,0.05)",
    },
    {
      bg1: "#5c6674",
      bg2: "#39414d",
      line: "rgba(228,236,248,0.34)",
      star: "rgba(228,236,248,0.45)",
      text: "rgba(228,236,248,0.6)",
      grain: "rgba(255,255,255,0.035)",
    },
  ];

  function currentSkin() {
    return SKINS[store.ui.skin % SKINS.length] || SKINS[0];
  }

  function resize() {
    var cs = window.getComputedStyle(stage);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var availW = stage.clientWidth - padX;
    var availH = stage.clientHeight - padY;
    var size = Math.floor(Math.min(availW, availH));
    if (!isFinite(size) || size < 160) size = Math.max(160, Math.floor(availW) || 160);
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    var cell = size / 15.8;
    geo = { size: size, cell: cell, pad: cell * 0.9, dpr: dpr };
    draw();
  }

  function cellXY(gx, gy) {
    return [geo.pad + gx * geo.cell, geo.pad + (14 - gy) * geo.cell];
  }

  function drawBoardBg(skin) {
    var g = ctx.createLinearGradient(0, 0, geo.size, geo.size);
    g.addColorStop(0, skin.bg1);
    g.addColorStop(1, skin.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, geo.size, geo.size);

    // 木纹
    ctx.strokeStyle = skin.grain;
    ctx.lineWidth = Math.max(1, geo.cell * 0.09);
    for (var i = 0; i < 22; i++) {
      var y = (i + 0.5) * (geo.size / 22) + Math.sin(i * 1.7) * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(geo.size * 0.3, y + 5, geo.size * 0.7, y - 5, geo.size, y + 2);
      ctx.stroke();
    }
    // 顶部柔光
    var glow = ctx.createRadialGradient(geo.size * 0.3, geo.size * 0.15, 10, geo.size * 0.3, geo.size * 0.15, geo.size * 0.9);
    glow.addColorStop(0, "rgba(255,255,255,0.16)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, geo.size, geo.size);
  }

  function drawGrid(skin) {
    var pad = geo.pad;
    var end = pad + 14 * geo.cell;
    ctx.strokeStyle = skin.line;
    ctx.lineWidth = Math.max(1, geo.cell * 0.035);
    ctx.beginPath();
    for (var k = 0; k < 15; k++) {
      var p = pad + k * geo.cell;
      ctx.moveTo(pad, p);
      ctx.lineTo(end, p);
      ctx.moveTo(p, pad);
      ctx.lineTo(p, end);
    }
    ctx.stroke();

    // 外框略粗
    ctx.lineWidth = Math.max(1.4, geo.cell * 0.06);
    ctx.strokeRect(pad, pad, end - pad, end - pad);

    // 星位
    var stars = [
      [3, 3],
      [11, 3],
      [3, 11],
      [11, 11],
      [7, 7],
    ];
    ctx.fillStyle = skin.star;
    stars.forEach(function (s) {
      var xy = cellXY(s[0], s[1]);
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], Math.max(1.6, geo.cell * 0.075), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCoords(skin) {
    var letters = "ABCDEFGHIJKLMNO";
    ctx.fillStyle = skin.text;
    ctx.font =
      "500 " + Math.max(8, Math.round(geo.cell * 0.42)) + "px -apple-system, 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (var x = 0; x < 15; x++) {
      var p = cellXY(x, 0);
      ctx.fillText(letters[x], p[0], geo.pad * 0.5);
    }
    ctx.textAlign = "center";
    for (var y = 0; y < 15; y++) {
      var q = cellXY(0, y);
      ctx.fillText(String(y + 1), geo.pad * 0.5, q[1]);
    }
  }

  function drawStone(cx, cy, r, isBlack, skin) {
    ctx.save();
    ctx.shadowColor = "rgba(40,26,10,0.35)";
    ctx.shadowBlur = r * 0.55;
    ctx.shadowOffsetY = r * 0.16;

    var g = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.4, r * 0.12, cx, cy, r * 1.02);
    if (isBlack) {
      g.addColorStop(0, "#6f7180");
      g.addColorStop(0.42, "#2c2d35");
      g.addColorStop(1, "#0e0e12");
    } else {
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.55, "#f6f3ec");
      g.addColorStop(1, "#cfc7b8");
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(0.6, r * 0.055);
    ctx.strokeStyle = isBlack ? "rgba(0,0,0,0.45)" : "rgba(120,108,90,0.5)";
    ctx.stroke();

    // 高光
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.36, r * 0.34, r * 0.22, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = isBlack ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.85)";
    ctx.fill();
  }

  function draw() {
    if (!geo.size) return;
    var skin = currentSkin();
    var dpr = geo.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, geo.size, geo.size);
    drawBoardBg(skin);
    drawGrid(skin);
    drawCoords(skin);

    var game = state.game;
    if (!game) return;
    var cells = game.board.cells;
    var r = geo.cell * 0.43;
    var last = game.lastMove();

    for (var i = 0; i < 225; i++) {
      var v = cells[i];
      if (!v) continue;
      var xy = cellXY(i % 15, (i / 15) | 0);
      drawStone(xy[0], xy[1], r, v === 1, skin);
    }

    if (last >= 0) {
      var lp = cellXY(last % 15, (last / 15) | 0);
      ctx.beginPath();
      ctx.arc(lp[0], lp[1], r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "#e0552e";
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- 状态栏
  var turnDot = $("turnDot");

  function setStatus(text, dotColor) {
    $("statusText").textContent = text;
    turnDot.classList.toggle("hidden", !dotColor);
    turnDot.classList.toggle("white", dotColor === "white");
  }

  function sideName(c) {
    return c === 1 ? "黑" : "白";
  }

  function updateChrome() {
    var set = sets[state.setIndex];
    if (!set) return;
    $("setName").textContent = set.name;
    $("puzzleNo").textContent = "第 " + (state.puzzleIndex + 1) + " 题";
    $("solvedInfo").textContent = "已解 " + solvedOf(set).length;

    var game = state.game;
    var canSwitch = !game || game.moves === 0 || game.isOver();
    $("prevBtn").disabled = !canSwitch;
    $("nextBtn").disabled = !canSwitch;
    $("undoBtn").disabled = !game || game.moves === 0;

    if (!game) return;
    if (game.isOver()) {
      if (game.status === "won") setStatus("恭喜，你赢了！", null);
      else if (game.status === "draw") setStatus("和棋", null);
      else if (game.reason && game.reason.indexOf("forbidden") === 0) {
        var t = game.reason.split(":")[1];
        setStatus("禁手判负：" + (Game.FORBIDDEN_TEXT[t] || "禁手"), null);
      } else setStatus("遗憾，你输了。", null);
      return;
    }
    if (state.thinking) {
      setStatus("陪练思考中…", game.sideToMove() === 1 ? "black" : "white");
      return;
    }
    if (game.isPlayerTurn()) {
      setStatus("轮到你落子（" + sideName(game.sideToMove()) + "）", game.sideToMove() === 1 ? "black" : "white");
    } else {
      setStatus("等待陪练落子…", null);
    }
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2100);
  }

  // ---------------------------------------------------------------- 对局
  function startPuzzle(setIndex, puzzleIndex, resumeMoves) {
    state.setIndex = setIndex;
    state.puzzleIndex = puzzleIndex;
    var set = sets[setIndex];
    if (!set) return;
    var flat = set.puzzles[puzzleIndex] || [];
    state.game = new Game(flat, { aiTimeMs: aiBudget(), aiDepth: 6 });
    if (resumeMoves && resumeMoves.length) {
      resumeMoves.forEach(function (m) {
        if (state.game.isOver()) return;
        state.game.playAt(m[0], m[1]);
      });
    }
    store.ui.lastSet = set.id;
    store.ui.lastPuzzle = puzzleIndex;
    store.resume = null;
    save();
    state.thinking = false;
    draw();
    updateChrome();
    if (!state.game.isOver() && !state.game.isPlayerTurn()) scheduleAI();
    if (state.game.isOver()) showResult(true);
  }

  function aiBudget() {
    // 老设备上适当收缩，保证响应速度
    var t = 380;
    if (typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 4) <= 4) t = 300;
    return t;
  }

  function scheduleAI() {
    if (!state.game || state.game.isOver() || state.game.isPlayerTurn() || state.thinking) return;
    state.thinking = true;
    updateChrome();
    setTimeout(function () {
      var g = state.game;
      if (!g || g.isOver() || g.isPlayerTurn()) {
        state.thinking = false;
        updateChrome();
        return;
      }
      var mv = g.aiMove();
      state.thinking = false;
      draw();
      updateChrome();
      if (mv && g.isOver()) showResult();
      if (!g.isOver()) persistResume();
    }, 60);
  }

  function persistResume() {
    var g = state.game;
    if (!g || g.moves === 0) {
      store.resume = null;
      save();
      return;
    }
    var moves = [];
    // 由历史推回：只记录对局中玩家与 AI 的落子
    g.board.history.forEach(function (i) {
      moves.push([i % 15, (i / 15) | 0]);
    });
    store.resume = {
      setId: sets[state.setIndex].id,
      puzzleIndex: state.puzzleIndex,
      moves: moves,
    };
    save();
  }

  function onPlayerTap(gx, gy) {
    var g = state.game;
    if (!g) return;
    if (g.isOver()) {
      toast("本题已结束，可重来或切换题目");
      return;
    }
    if (!g.isPlayerTurn()) {
      toast("请等待陪练落子");
      return;
    }
    var res = g.playAt(gx, gy);
    if (!res.ok) {
      toast("这里已经有子了");
      return;
    }
    draw();
    updateChrome();
    if (g.isOver()) {
      showResult();
      return;
    }
    scheduleAI();
  }

  function restart() {
    var set = sets[state.setIndex];
    if (!set) return;
    startPuzzle(state.setIndex, state.puzzleIndex);
  }

  function undo() {
    var g = state.game;
    if (!g || g.moves === 0) return;
    g.undo();
    state.thinking = false;
    draw();
    updateChrome();
    persistResume();
  }

  function canSwitchPuzzle() {
    var g = state.game;
    return !g || g.moves === 0 || g.isOver();
  }

  function goPuzzle(delta) {
    var set = sets[state.setIndex];
    if (!set) return;
    if (!canSwitchPuzzle()) {
      toast("未落一子或已胜利时，可左右滑屏切换题目。");
      return;
    }
    var n = set.puzzles.length;
    var idx = state.puzzleIndex + delta;
    if (idx < 0) {
      toast("已经是第一题");
      return;
    }
    if (idx >= n) {
      toast("已经是最后一题");
      return;
    }
    startPuzzle(state.setIndex, idx);
  }

  // ---------------------------------------------------------------- 结果弹窗
  function showResult(isResume) {
    var g = state.game;
    if (!g) return;
    var icon = $("resultIcon");
    var title = $("resultTitle");
    var text = $("resultText");
    var set = sets[state.setIndex];

    if (g.status === "won") {
      icon.textContent = "✓";
      icon.classList.remove("lose");
      title.textContent = "恭喜，你赢了！";
      text.textContent = "请继续挑战下一题。";
      if (!isSolved(set, state.puzzleIndex)) {
        markSolved(set, state.puzzleIndex);
        updateChrome();
      }
      $("resultNext").classList.remove("hidden");
    } else if (g.status === "draw") {
      icon.textContent = "—";
      icon.classList.add("lose");
      title.textContent = "和棋";
      text.textContent = "棋盘已满，重新挑战这一题吧。";
      $("resultNext").classList.remove("hidden");
    } else {
      icon.textContent = "×";
      icon.classList.add("lose");
      if (g.reason && g.reason.indexOf("forbidden") === 0) {
        var t = g.reason.split(":")[1];
        title.textContent = "禁手判负";
        text.textContent = "黑棋 " + (Game.FORBIDDEN_TEXT[t] || "禁手") + "，本局判负。可以悔棋或重来。";
      } else {
        title.textContent = "遗憾，你输了。";
        text.textContent = "请重新挑战这一题。";
      }
      $("resultNext").classList.remove("hidden");
    }
    $("resultModal").classList.remove("hidden");
    // 已分胜负的棋局不再续局，避免下次打开时又弹出结算框
    store.resume = null;
    save();
  }

  function hideResult() {
    $("resultModal").classList.add("hidden");
  }

  // ---------------------------------------------------------------- 习题集面板
  function renderSetList() {
    var list = $("setList");
    list.innerHTML = "";
    sets.forEach(function (set, i) {
      var solved = solvedOf(set).length;
      var total = set.puzzles.length;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "set-item" + (i === state.setIndex ? " current" : "");
      var pct = total ? Math.round((solved / total) * 100) : 0;
      btn.innerHTML =
        '<div class="info">' +
        '<div class="name"></div>' +
        '<div class="sub">' +
        total +
        " 题 · 已解 " +
        solved +
        "</div>" +
        '<div class="progress"><i style="width:' +
        pct +
        '%"></i></div>' +
        "</div>";
      btn.querySelector(".name").textContent = set.name;
      btn.addEventListener("click", function () {
        openSet(i);
      });
      if (!set.builtin) {
        var del = document.createElement("button");
        del.type = "button";
        del.className = "del";
        del.textContent = "×";
        del.setAttribute("aria-label", "删除题库");
        del.addEventListener("click", function (ev) {
          ev.stopPropagation();
          deleteSet(i);
        });
        btn.appendChild(del);
      }
      list.appendChild(btn);
    });
  }

  function openSheet() {
    renderSetList();
    $("sheetBackdrop").classList.remove("hidden");
  }

  function closeSheet() {
    $("sheetBackdrop").classList.add("hidden");
  }

  function openSet(i) {
    closeSheet();
    var set = sets[i];
    if (!set) return;
    var solved = solvedOf(set);
    var start = 0;
    for (var k = 0; k < set.puzzles.length; k++) {
      if (solved.indexOf(k) === -1) {
        start = k;
        break;
      }
    }
    startPuzzle(i, start);
  }

  function deleteSet(i) {
    var set = sets[i];
    if (!set || set.builtin) return;
    if (!window.confirm("删除习题集「" + set.name + "」？解题进度也会一并删除。")) return;
    sets.splice(i, 1);
    store.imported = store.imported.filter(function (s) {
      return s.id !== set.id;
    });
    delete store.progress[set.id];
    if (state.setIndex >= sets.length) state.setIndex = 0;
    save();
    renderSetList();
    if (sets.length) {
      startPuzzle(Math.min(state.setIndex, sets.length - 1), 0);
    }
  }

  // ---------------------------------------------------------------- 导入
  function parsePuzzles(data) {
    if (!Array.isArray(data)) throw new Error("格式错误");
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var q = data[i];
      if (!Array.isArray(q)) continue;
      var flat = [];
      for (var j = 0; j < q.length; j++) {
        var tok = q[j];
        if (typeof tok !== "string") continue;
        var parts = tok.split(",");
        if (parts.length !== 2) continue;
        var xy = parts[0].trim().toUpperCase();
        var col = parts[1].trim();
        if (xy.length < 2) continue;
        var x = xy.charCodeAt(0) - 65;
        var y = parseInt(xy.slice(1), 10) - 1;
        if (!(x >= 0 && x < 15 && y >= 0 && y < 15)) continue;
        if (col !== "1" && col !== "2") continue;
        flat.push(x, y, col === "1" ? 1 : 2);
      }
      if (flat.length >= 6) out.push(flat);
    }
    return out;
  }

  function handleImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        var puzzles = parsePuzzles(data);
        if (!puzzles.length) throw new Error("无有效题目");
        var name = file.name.replace(/\.json$/i, "") || "自定义题库";
        if (
          sets.some(function (s) {
            return s.name === name;
          })
        ) {
          toast("已有同名习题集!");
          return;
        }
        var id = "imp_" + Date.now().toString(36);
        var def = { id: id, name: name, puzzles: puzzles };
        store.imported.push(def);
        sets.push(makeSet(def, false));
        save();
        renderSetList();
        toast("已导入「" + name + "」共 " + puzzles.length + " 题");
      } catch (e) {
        toast("习题集数据错误!");
      }
    };
    reader.onerror = function () {
      toast("文件读取失败");
    };
    reader.readAsText(file, "utf-8");
  }

  // ---------------------------------------------------------------- 手势
  var pointer = null;

  function stagePoint(ev) {
    var rect = canvas.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  }

  function pxToCell(px, py) {
    var gx = Math.round((px - geo.pad) / geo.cell);
    var srow = Math.round((py - geo.pad) / geo.cell);
    var gy = 14 - srow;
    if (gx < 0 || gx > 14 || gy < 0 || gy > 14) return null;
    var c = cellXY(gx, gy);
    if (Math.hypot(px - c[0], py - c[1]) > geo.cell * 0.66) return null;
    return [gx, gy];
  }

  canvas.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    pointer = { x: ev.clientX, y: ev.clientY, moved: false, id: ev.pointerId };
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (e) {
      /* 忽略 */
    }
  });

  canvas.addEventListener("pointermove", function (ev) {
    if (!pointer) return;
    if (Math.hypot(ev.clientX - pointer.x, ev.clientY - pointer.y) > 10) pointer.moved = true;
  });

  canvas.addEventListener("pointerup", function (ev) {
    if (!pointer) return;
    var dx = ev.clientX - pointer.x;
    var dy = ev.clientY - pointer.y;
    var dist = Math.hypot(dx, dy);
    var wasMoved = pointer.moved;
    pointer = null;

    if (!wasMoved && dist < 12) {
      var p = stagePoint(ev);
      var cell = pxToCell(p[0], p[1]);
      if (cell) onPlayerTap(cell[0], cell[1]);
      return;
    }
    if (dist < 40) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      goPuzzle(dx < 0 ? 1 : -1);
    } else {
      toggleSkin();
    }
  });

  canvas.addEventListener("pointercancel", function () {
    pointer = null;
  });

  function toggleSkin() {
    store.ui.skin = (store.ui.skin + 1) % SKINS.length;
    save();
    draw();
    toast(store.ui.skin === 0 ? "棋盘背景：原木" : "棋盘背景：墨玉");
  }

  // ---------------------------------------------------------------- 按钮绑定
  $("setBtn").addEventListener("click", openSheet);
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheetBackdrop").addEventListener("click", function (ev) {
    if (ev.target === $("sheetBackdrop")) closeSheet();
  });
  $("prevBtn").addEventListener("click", function () {
    goPuzzle(-1);
  });
  $("nextBtn").addEventListener("click", function () {
    goPuzzle(1);
  });
  $("restartBtn").addEventListener("click", function () {
    hideResult();
    restart();
  });
  $("undoBtn").addEventListener("click", function () {
    hideResult();
    undo();
  });
  $("resultRetry").addEventListener("click", function () {
    hideResult();
    restart();
  });
  $("resultNext").addEventListener("click", function () {
    hideResult();
    if (canSwitchPuzzle()) goPuzzle(1);
    else {
      restart();
    }
  });
  $("aboutBtn").addEventListener("click", function () {
    $("aboutPage").classList.remove("hidden");
  });
  $("aboutClose").addEventListener("click", function () {
    $("aboutPage").classList.add("hidden");
  });
  $("importInput").addEventListener("change", function (ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (file) handleImport(file);
  });

  // 隐私政策
  function showPrivacy() {
    $("privacyModal").classList.remove("hidden");
  }
  $("agreeBtn").addEventListener("click", function () {
    store.ui.agreed = true;
    save();
    $("privacyModal").classList.add("hidden");
  });
  $("declineBtn").addEventListener("click", function () {
    toast("需要同意隐私政策才能使用本应用");
  });

  // 快捷键（桌面调试用）
  window.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowLeft") goPuzzle(-1);
    else if (ev.key === "ArrowRight") goPuzzle(1);
    else if (ev.key === "z" && (ev.metaKey || ev.ctrlKey)) undo();
  });

  window.addEventListener("resize", function () {
    resize();
  });
  window.addEventListener("orientationchange", function () {
    setTimeout(resize, 260);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      resize();
    });
  }

  // ---------------------------------------------------------------- 启动
  function boot() {
    loadSets();
    if (!sets.length) {
      document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">题库载入失败</p>';
      return;
    }
    $("aboutBody").innerHTML = window.ABOUT_HTML || "";

    var startSet = 0;
    if (store.ui.lastSet) {
      var found = sets.findIndex(function (s) {
        return s.id === store.ui.lastSet;
      });
      if (found >= 0) startSet = found;
    }
    var startPuzzleIdx = store.ui.lastPuzzle || 0;
    var r = store.resume;
    if (r && r.setId === sets[startSet].id && typeof r.puzzleIndex === "number") {
      startPuzzleIdx = r.puzzleIndex;
    }
    if (startPuzzleIdx >= sets[startSet].puzzles.length) startPuzzleIdx = 0;

    resize();
    var resumeMoves = null;
    if (r && r.setId === sets[startSet].id && r.puzzleIndex === startPuzzleIdx) resumeMoves = r.moves;
    startPuzzle(startSet, startPuzzleIdx, resumeMoves);
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () {
        resize();
      });
    }

    if (!store.ui.agreed) showPrivacy();

    // Service Worker：仅在 http(s) 下注册
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }

    setupInstallHint();
  }

  // iOS Safari 里提示「添加到主屏幕」；已装到桌面或用户关过一次就不再显示
  function setupInstallHint() {
    var bar = document.getElementById("installBar");
    if (!bar) return;
    var ua = navigator.userAgent || "";
    var isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var standalone =
      navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    var KEY = "kaibao.installHint";
    var dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch (e) {}
    if (!isIOS || standalone || dismissed) return;
    bar.hidden = false;
    document.getElementById("installClose").addEventListener("click", function () {
      bar.hidden = true;
      try {
        localStorage.setItem(KEY, "1");
      } catch (e) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // 调试/自动化测试句柄
  window.__renjuApp = {
    state: state,
    get sets() {
      return sets;
    },
    get geo() {
      return geo;
    },
    cellXY: cellXY,
    pxToCell: function (px, py) {
      return pxToCell(px, py);
    },
    store: store,
    startPuzzle: startPuzzle,
    goPuzzle: goPuzzle,
    toggleSkin: toggleSkin,
    draw: draw,
    updateChrome: updateChrome,
    resize: resize,
    scheduleAI: scheduleAI,
    undo: undo,
    restart: restart,
  };
})();
