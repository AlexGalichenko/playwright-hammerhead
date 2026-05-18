import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
};

export interface LocalServerOptions {
    port?: number;
    hostname?: string;
}

export class LocalServer {
    private _server: http.Server;
    private _port: number;
    private _hostname: string;
    private _rootDir: string;

    constructor(rootDir: string, options: LocalServerOptions = {}) {
        this._rootDir = path.resolve(rootDir);
        this._port = options.port ?? 7777;
        this._hostname = options.hostname ?? 'localhost';
        this._server = http.createServer(this._handle.bind(this));
    }

    private _handle(req: http.IncomingMessage, res: http.ServerResponse): void {
        const rawPath = (req.url ?? '/').split('?')[0];
        const decoded = decodeURIComponent(rawPath);
        // Prevent path traversal
        const resolved = path.resolve(this._rootDir, `.${decoded}`);
        if (!resolved.startsWith(this._rootDir)) {
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
            const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._server.once('error', reject);
            this._server.listen(this._port, this._hostname, () => {
                this._server.off('error', reject);
                resolve();
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._server.close((err) => (err ? reject(err) : resolve()));
        });
    }

    url(filePath: string = '/'): string {
        const p = filePath.startsWith('/') ? filePath : `/${filePath}`;
        return `http://${this._hostname}:${this._port}${p}`;
    }

    get port(): number {
        return this._port;
    }

    get rootDir(): string {
        return this._rootDir;
    }
}
