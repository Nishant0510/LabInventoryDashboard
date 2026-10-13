// Local-only dashboard server. It intentionally exposes one configured workbook only.
const http = require('http');
const fs = require('fs');
const path = require('path');

const host = '127.0.0.1';
const port = 4173;
const workbookPath = 'C:\\Users\\320314137\\OneDrive - Philips\\EquipmentInventory\\ER2248444_SRC Pune_Master List of Equipment & Tools_V_ _.xlsx';
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const send = (res, status, body, type = 'text/plain; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const server = http.createServer((req, res) => {
  if (req.url === '/api/equipment-workbook' && req.method === 'GET') {
    fs.readFile(workbookPath, (error, data) => error ? send(res, 404, `Workbook not found at configured path: ${workbookPath}`) : send(res, 200, data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    return;
  }
  if (req.url === '/api/equipment-workbook' && req.method === 'PUT') {
    const chunks = []; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size <= 30 * 1024 * 1024) chunks.push(chunk); });
    req.on('end', () => size > 30 * 1024 * 1024 ? send(res, 413, 'Workbook is too large.') : fs.writeFile(workbookPath, Buffer.concat(chunks), error => error ? send(res, 500, error.message) : send(res, 200, 'Workbook saved.')));
    return;
  }
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed.');
  const requestPath = req.url === '/' ? 'index.html' : decodeURIComponent(req.url).replace(/^\/+/, '');
  const filePath = path.resolve(root, requestPath);
  if (!filePath.startsWith(root)) return send(res, 403, 'Forbidden.');
  fs.readFile(filePath, (error, data) => error ? send(res, 404, 'Not found.') : send(res, 200, data, types[path.extname(filePath)] || 'application/octet-stream'));
});

server.listen(port, host, () => console.log(`Equipment dashboard: http://${host}:${port}`));
