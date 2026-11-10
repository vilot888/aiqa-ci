/**
 * server.js —— HTTP 入口
 * 关键设计：把「创建服务」与「监听端口」拆开——
 *   createServer() 只创建（可被 Supertest 直接引入测试，不占用真实端口）；
 *   只有直接运行本文件（require.main === module）时才 listen。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const askRoute = require('./routes/ask');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** 静态资源服务（public 目录） */
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  // 防止路径穿越
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

/**
 * 创建（但不监听）HTTP 服务实例
 * @returns {import('node:http').Server}
 */
function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await askRoute.handler(req, res, url);
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: '接口不存在' }));
        }
        return;
      }
      serveStatic(req, res, url.pathname);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ ok: false, error: `服务内部错误：${err.message}` }));
    }
  });
}

// 仅在「直接运行」时监听端口，被 require 引入时不监听
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    const mode = process.env.LLM_API_KEY ? '大模型模式' : '演示模式（未配置 LLM_API_KEY）';
    console.log(`[aiqa] 答疑助手已启动：http://localhost:${port}  当前模式：${mode}`);
  });
}

module.exports = { createServer };
