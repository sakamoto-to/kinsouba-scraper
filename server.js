require('dotenv').config({ path: '.env.local.example' });

const http = require('http');
const fs   = require('fs');
const path = require('path');

const API_ROUTES = {
  '/api/scrape': require('./api/scrape'),
  '/api/setup':  require('./api/setup'),
};

// POST ボディを JSON としてパースして req.body に格納
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.method !== 'POST') return resolve({});
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
  });
}

// Vercel の res.status().json() を Node.js 標準の res に追加するシム
function addCompatibility(res) {
  res.status = (code) => {
    res.statusCode = code;
    return {
      end:  ()     => res.end(),
      json: (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      },
    };
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
};

const server = http.createServer(async (req, res) => {
  addCompatibility(res);

  // API リクエスト
  if (req.url.startsWith('/api/')) {
    const handler = API_ROUTES[req.url.split('?')[0]];
    if (!handler) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }
    try {
      req.body = await parseBody(req);
      await handler(req, res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 静的ファイルの配信
  const urlPath   = req.url === '/' ? '/index.html' : req.url;
  const filePath  = path.join(__dirname, 'public', urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`開発サーバー起動: http://localhost:${PORT}`);
});
