const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 8000;
const ROOT = path.join(__dirname, 'pages');

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
};

http.createServer((req, res) => {
    const rawPath = (req.url || '/').split('?')[0];
    const decoded = decodeURIComponent(rawPath);
    const resolved = path.resolve(ROOT, '.' + decoded);

    if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(resolved, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        const ext = path.extname(resolved).toLowerCase();
        res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, 'localhost');
