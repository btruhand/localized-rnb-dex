// Fails when index.html or a stylesheet depends on another host, or references a local file that is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const problems = [];

function checkRef(from, ref) {
	if (/^(https?:)?\/\//.test(ref)) { problems.push(`${from}: remote asset ${ref}`); return; }
	if (/^(data:|#|mailto:)/.test(ref)) return;
	const file = path.join(pub, ref.startsWith('/') ? ref : path.join(path.dirname(from), ref)).split(/[?#]/)[0];
	if (!fs.existsSync(file)) problems.push(`${from}: missing local file ${ref}`);
}

const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)) checkRef('index.html', ref);

function* cssFiles(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* cssFiles(full);
		else if (entry.name.endsWith('.css')) yield full;
	}
}
for (const file of [...cssFiles(path.join(pub, 'theme')), ...cssFiles(path.join(pub, 'style'))]) {
	const css = fs.readFileSync(file, 'utf8');
	for (const [, ref] of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
		checkRef(path.relative(pub, file), path.join(path.dirname(path.relative(pub, file)), ref).replace(/^/, '/'));
	}
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('index.html and stylesheets reference only local, existing files');
