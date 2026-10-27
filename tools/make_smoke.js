/* 生成端到端交互测试页：模拟真实触摸事件，检查 UI 行为 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const singleFile = path.join(root, "单文件版", "开宝五子棋陪练.html");
const src = fs.readFileSync(singleFile, "utf8");

const smoke = `
<script>
(function(){
  var results = [];
  function chk(name, cond, extra){ results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : '')); }
  function report(){
    var pre = document.createElement('pre'); pre.id = 'SMOKE';
    pre.textContent = 'SMOKE_BEGIN\\n' + results.join('\\n') + '\\nSMOKE_END';
    document.body.appendChild(pre);
  }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function waitFor(cond, timeout){
    var t0 = Date.now();
    return new Promise(function(resolve){
      (function loop(){
        var ok = false;
        try { ok = cond(); } catch(e) { ok = false; }
        if (ok || Date.now() - t0 > (timeout || 4000)) resolve(ok);
        else setTimeout(loop, 40);
      })();
    });
  }
  function tapCell(x, y){
    var app = window.__renjuApp;
    var p = app.cellXY(x, y);
    var r = document.getElementById('board').getBoundingClientRect();
    var cx = r.left + p[0], cy = r.top + p[1];
    var opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, buttons: 1 };
    var cv = document.getElementById('board');
    cv.dispatchEvent(new PointerEvent('pointerdown', opts));
    cv.dispatchEvent(new PointerEvent('pointerup', opts));
  }
  function swipe(dx, dy){
    var cv = document.getElementById('board');
    var r = cv.getBoundingClientRect();
    var cx = r.left + r.width/2, cy = r.top + r.height/2;
    function ev(type, x, y, buttons){
      return new PointerEvent(type, { bubbles:true, cancelable:true, pointerId:2, pointerType:'touch', isPrimary:true, clientX:x, clientY:y, buttons:buttons||1 });
    }
    cv.dispatchEvent(ev('pointerdown', cx, cy));
    cv.dispatchEvent(ev('pointermove', cx + dx*0.5, cy + dy*0.5));
    cv.dispatchEvent(ev('pointermove', cx + dx, cy + dy));
    cv.dispatchEvent(ev('pointerup', cx + dx, cy + dy, 0));
  }
  function statusText(){ return document.getElementById('statusText').textContent; }

  window.addEventListener('load', function(){
    setTimeout(async function(){
      var app = window.__renjuApp;
      app.store.ui.agreed = true;
      document.getElementById('privacyModal').classList.add('hidden');
      app.startPuzzle(0, 0);
      await wait(120);

      chk('初始状态提示', /轮到你落子（黑）/.test(statusText()), statusText());
      var before = app.state.game.board.count;

      // 找一个合法空点（贴近棋子）
      var target = null;
      for (var i = 0; i < 225 && !target; i++) {
        if (app.state.game.board.cells[i] !== 0) continue;
        var x = i % 15, y = (i/15)|0;
        if (app.state.game.isForbiddenPoint(x, y)) continue;
        // 需要靠近已有棋子
        var near = false;
        for (var dy=-1; dy<=1 && !near; dy++) for (var dx=-1; dx<=1; dx++) {
          var nx=x+dx, ny=y+dy;
          if (nx<0||nx>14||ny<0||ny>14) continue;
          if (app.state.game.board.cells[ny*15+nx] !== 0) { near = true; break; }
        }
        if (!near) continue;
        target = [x, y];
      }
      chk('找到可落子点', !!target, JSON.stringify(target));

      tapCell(target[0], target[1]);
      await wait(50);
      chk('点击后落子成功', app.state.game.board.count === before + 1, 'count=' + app.state.game.board.count);
      chk('轮到陪练', /陪练思考中|等待陪练/.test(statusText()), statusText());

      // 等 AI 应手
      await wait(1400);
      chk('陪练已应手', app.state.game.board.count === before + 2, 'count=' + app.state.game.board.count);
      chk('回合回到玩家', app.state.game.isPlayerTurn() || app.state.game.isOver(), statusText());

      // 悔棋
      var c1 = app.state.game.board.count;
      app.undo();
      await wait(80);
      chk('悔棋减少两步', app.state.game.board.count === c1 - 2, 'count=' + app.state.game.board.count);
      chk('悔棋后轮到玩家', app.state.game.isPlayerTurn(), statusText());

      // 滑屏换题（未落子时才允许）：先重来
      app.restart();
      await wait(80);
      var idx0 = app.state.puzzleIndex;
      swipe(-120, 0);
      await wait(120);
      chk('左滑切到下一题', app.state.puzzleIndex === idx0 + 1, idx0 + '->' + app.state.puzzleIndex);

      swipe(120, 0);
      await wait(120);
      chk('右滑切回上一题', app.state.puzzleIndex === idx0, 'now=' + app.state.puzzleIndex);

      // 上下滑切换棋盘背景
      var skin0 = app.store.ui.skin;
      swipe(0, -120);
      await wait(80);
      chk('竖滑切换棋盘背景', app.store.ui.skin !== skin0, skin0 + '->' + app.store.ui.skin);

      // 有落子时不允许滑屏换题
      var t2 = null;
      for (var i2 = 0; i2 < 225 && !t2; i2++) {
        if (app.state.game.board.cells[i2] === 0 && !app.state.game.isForbiddenPoint(i2%15,(i2/15)|0)) t2 = [i2%15, (i2/15)|0];
      }
      tapCell(t2[0], t2[1]);
      await wait(1300);
      var idxBefore = app.state.puzzleIndex;
      // 此时若对局未结束，滑屏应被拒绝
      if (!app.state.game.isOver()) {
        swipe(-120, 0);
        await wait(120);
        chk('对局中禁止滑屏换题', app.state.puzzleIndex === idxBefore, 'still ' + app.state.puzzleIndex);
      } else {
        chk('对局中禁止滑屏换题（已终局跳过）', true);
      }

      // 题目集面板
      document.getElementById('setBtn').click();
      await wait(120);
      chk('习题集面板打开', !document.getElementById('sheetBackdrop').classList.contains('hidden'));
      chk('面板列出全部题库', document.querySelectorAll('#setList .set-item').length >= 8,
          'n=' + document.querySelectorAll('#setList .set-item').length);
      document.getElementById('sheetClose').click();

      // 关于页
      document.getElementById('aboutBtn').click();
      await wait(100);
      chk('关于页打开且有内容', !document.getElementById('aboutPage').classList.contains('hidden') &&
          document.getElementById('aboutBody').textContent.length > 500);
      document.getElementById('aboutClose').click();

      // 导入题库：合法 JSON
      var beforeSets = app.sets.length;
      var good = JSON.stringify([
        ["F10,1","H10,2","G9,1","I9,2","J9,1"],
        ["H6,2","I6,1","J6,1","K6,2"]
      ]);
      var dt = new DataTransfer();
      dt.items.add(new File([good], '测试题库.json', { type: 'application/json' }));
      var input = document.getElementById('importInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(function(){ return app.sets.length > beforeSets; }, 6000);
      chk('合法题库导入成功', app.sets.length === beforeSets + 1, app.sets.length + ' sets');
      var imported = app.sets[app.sets.length - 1];
      chk('导入题库名称正确', imported.name === '测试题库', imported.name);
      chk('导入题目数量正确', imported.puzzles.length === 2, 'n=' + imported.puzzles.length);
      chk('导入题目坐标解析正确', imported.puzzles[0][0] === 5 && imported.puzzles[0][1] === 9 && imported.puzzles[0][2] === 1,
          JSON.stringify(imported.puzzles[0].slice(0,3)));

      // 重复同名
      var dt2 = new DataTransfer();
      dt2.items.add(new File([good], '测试题库.json', { type: 'application/json' }));
      input.files = dt2.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(function(){ return /已有同名习题集/.test(document.getElementById('toast').textContent); }, 6000);
      chk('同名题库被拒绝', app.sets.length === beforeSets + 1, app.sets.length + ' sets');
      chk('提示同名', /已有同名习题集/.test(document.getElementById('toast').textContent));

      // 非法 JSON
      var dt3 = new DataTransfer();
      dt3.items.add(new File(['不是 JSON'], '坏题库.json', { type: 'application/json' }));
      input.files = dt3.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(function(){ return /习题集数据错误/.test(document.getElementById('toast').textContent); }, 6000);
      chk('非法题库被拒绝', app.sets.length === beforeSets + 1, app.sets.length + ' sets');
      chk('提示数据错误', /习题集数据错误/.test(document.getElementById('toast').textContent));

      // 切换到导入的题库并可玩
      document.getElementById('setBtn').click();
      await wait(100);
      var items = document.querySelectorAll('#setList .set-item');
      items[items.length - 1].click();
      await wait(150);
      chk('切换到导入题库', app.sets[app.state.setIndex].name === '测试题库');
      chk('导入题可正常开局', app.state.game.board.count === 5, 'count=' + app.state.game.board.count);

      report();
    }, 200);
  });
})();
</script>
</body>`;

fs.writeFileSync(
  path.join(root, "_smoke.html"),
  src.replace("</body>", smoke),
  "utf8",
);
console.log("smoke 页已生成:", path.join(root, "_smoke.html"));


