/* 生成用于截图验证的预览页面（注入脚本模拟各种界面状态） */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const src = fs.readFileSync(path.join(distDir, "开宝五子棋陪练.html"), "utf8");

const scenarios = {
  main: `
    const app = window.__renjuApp;
    app.store.ui.agreed = true;
    document.getElementById('privacyModal').classList.add('hidden');
    // 载入一组棋子，展示棋盘效果
    app.startPuzzle(0, 0);
    const g = app.state.game;
    g.playAt(9, 9); g.playAt(6, 8); g.playAt(8, 7); g.playAt(7, 8);
    g.playAt(7, 6); g.playAt(9, 6); g.playAt(8, 8);
    g.playAt(7, 7);
    app.resize(); app.draw(); app.updateChrome();
  `,
  sheet: `
    const app = window.__renjuApp;
    app.store.ui.agreed = true;
    document.getElementById('privacyModal').classList.add('hidden');
    app.store.progress = { sanshou1: [0,1,2,3,4,5,6,7], sakata_w: [1,2,3] };
    app.startPuzzle(0, 3);
    document.getElementById('setBtn').click();
  `,
  about: `
    const app = window.__renjuApp;
    app.store.ui.agreed = true;
    document.getElementById('privacyModal').classList.add('hidden');
    document.getElementById('aboutBtn').click();
  `,
  result: `
    const app = window.__renjuApp;
    app.store.ui.agreed = true;
    document.getElementById('privacyModal').classList.add('hidden');
    app.startPuzzle(0, 0);
    const g = app.state.game;
    g.status = 'won'; g.result = 'win';
    app.draw(); app.updateChrome();
    document.getElementById('resultIcon').textContent = '✓';
    document.getElementById('resultTitle').textContent = '恭喜，你赢了！';
    document.getElementById('resultText').textContent = '请继续挑战下一题。';
    document.getElementById('resultModal').classList.remove('hidden');
  `,
  privacy: `
    window.__renjuApp.store.ui.agreed = false;
    document.getElementById('privacyModal').classList.remove('hidden');
  `,
  dark: `
    const app = window.__renjuApp;
    app.store.ui.agreed = true;
    document.getElementById('privacyModal').classList.add('hidden');
    app.store.ui.skin = 1;
    app.startPuzzle(4, 0);
    const g = app.state.game;
    g.playAt(9, 9); g.playAt(8, 8); g.playAt(9, 8); g.playAt(7, 8);
    app.resize(); app.draw(); app.updateChrome();
  `,
};

// 无头浏览器默认深色，可强制浅色以便检查浅色主题
const LIGHT = `
    (function(){
      const v = {'--paper':'#f4efe6','--paper-2':'#ece4d6','--ink':'#2c2723','--ink-2':'#6f6558',
        '--ink-3':'#a1968a','--line':'rgba(90,72,52,0.14)','--accent':'#b3542f',
        '--accent-soft':'rgba(179,84,47,0.12)','--card':'#fffdf9'};
      for (const k in v) document.documentElement.style.setProperty(k, v[k]);
    })();
`;
const useLight = { main: true, sheet: true, about: true, result: true, privacy: true, dark: false };

// 无头浏览器会冻结 CSS 动画，截图前统一关掉动画，避免拍到半透明中间态
const NO_ANIM = `
    (function(){
      var s = document.createElement('style');
      s.textContent = '*{animation:none!important;transition:none!important}';
      document.head.appendChild(s);
    })();
`;

for (const [name, code] of Object.entries(scenarios)) {
  const head = useLight[name] ? LIGHT : "";
  const inject =
    "<script>window.addEventListener('load', function(){ setTimeout(function(){" +
    NO_ANIM +
    head +
    code +
    "}, 80); });</script>\n</body>";
  const out = src.replace("</body>", inject);
  fs.writeFileSync(path.join(distDir, "_shot_" + name + ".html"), out, "utf8");
}
console.log("预览页生成:", Object.keys(scenarios).join(", "));
