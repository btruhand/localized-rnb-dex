// Dependency-free static server with the same SPA fallback Cloudflare applies in production.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 8787);
const TYPES = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.png': 'image/png', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
	'.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.json': 'application/json',
};

export function resolveFile(urlPath) {
	const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
	const file = path.join(root, rel);
	if (!file.startsWith(root)) return null;
	if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
	return path.extname(rel) ? null : path.join(root, 'index.html');
}

export function createServer() {
	return http.createServer((req, res) => {
		const file = resolveFile(new URL(req.url, 'http://x').pathname);
		if (!file) { res.writeHead(404); res.end('Not found'); return; }
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(res);
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	createServer().listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
}
