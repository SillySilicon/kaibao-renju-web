/* 把 renju/ 目录打包成单个 HTML 文件（可离线打开、可发给手机直接用） */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "web");
const distDir = path.join(root, "单文件版");
fs.mkdirSync(distDir, { recursive: true });

let html = fs.readFileSync(path.join(srcDir, "index.html"), "utf8");

function read(rel) {
  return fs.readFileSync(path.join(srcDir, rel), "utf8");
}

// 1) 内联 CSS
html = html.replace(/<link rel="stylesheet" href="css\/app\.css"\s*\/?>/, () => {
  return "<style>\n" + read("css/app.css") + "\n</style>";
});

// 2) 内联脚本
html = html.replace(/<script src="js\/([^"]+)"><\/script>/g, (m, file) => {
  const code = read("js/" + file);
  if (/<\/script/i.test(code)) throw new Error("脚本中含有 </script：" + file);
  return "<script>\n" + code + "\n</script>";
});

// 3) 单文件版不需要 manifest / 外部图标引用，改为内联图标
const iconB64 = fs.readFileSync(path.join(srcDir, "icons/icon-192.png")).toString("base64");
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, "");
html = html.replace(
  /<link rel="apple-touch-icon"[^>]*>/,
  `<link rel="apple-touch-icon" href="data:image/png;base64,${iconB64}">`,
);
html = html.replace(
  /<link rel="icon"[^>]*>/,
  `<link rel="icon" href="data:image/png;base64,${iconB64}">`,
);

// 4) 标注为单文件版本
html = html.replace(
  "<title>开宝五子棋陪练</title>",
  "<title>开宝五子棋陪练</title>\n    <!-- 单文件离线版：所有资源已内联，可直接本地打开 -->",
);

const outFile = path.join(distDir, "开宝五子棋陪练.html");
fs.writeFileSync(outFile, html, "utf8");
const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
console.log("已生成:", outFile, kb + " KB");
