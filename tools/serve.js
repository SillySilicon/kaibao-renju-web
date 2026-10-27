#!/usr/bin/env node
/*
 * 本地预览服务器：在电脑上启动后，同一 Wi-Fi 下的 iPhone 可直接访问试玩。
 *   用法: node tools/serve.js [端口]
 * 说明: 这是 HTTP 服务，Service Worker（离线缓存）不会注册，
 *       但棋局、题库、AI 全部功能都能正常使用。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..", "web");
const PORT = Number(process.argv[2] || 8000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("403");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 未找到: " + urlPath);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  console.log("五子棋陪练 本地预览服务已启动\n");
  console.log("  本机访问:   http://localhost:" + PORT + "/");
  for (const ip of lanAddresses()) {
    console.log("  iPhone 访问: http://" + ip + ":" + PORT + "/   （需与电脑同一 Wi-Fi）");
  }
  console.log("\n按 Ctrl+C 停止。");
});
