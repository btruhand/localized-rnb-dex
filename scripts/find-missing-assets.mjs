// Drives the real UI in a Chrome/Brave with a debug port and records every same-origin request that 404s,
// so the asset list comes from what the pages actually ask for instead of from assumptions.
//   1. npm run dev                                   (serves http://localhost:8787)
//   2. start the browser with --remote-debugging-port=9222
//   3. node scripts/find-missing-assets.mjs          (writes upstream/extra-assets.txt)
//   4. npm run fetch:assets                          (downloads what Pokémon Showdown has)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE || 'http://localhost:8787';
const DEBUG = process.env.DEBUG_URL || 'http://127.0.0.1:9222';
const TABS = Number(process.env.TABS || 4);
const SETTLE_MS = Number(process.env.SETTLE_MS || 700);

const spriteData = JSON.parse(fs.readFileSync(path.join(root, 'upstream/species-sprites.json'), 'utf8'));
const routes = Object.keys(spriteData.species).map(id => ({ route: `pokemon/${id}`, flavor: true }));
for (const type of spriteData.types) routes.push({ route: `types/${type}` });
for (const route of process.env.EXTRA_ROUTES ? process.env.EXTRA_ROUTES.split(',') : []) routes.push({ route });

async function openTab() {
	const tab = await (await fetch(`${DEBUG}/json/new?about:blank`, { method: 'PUT' })).json();
	const ws = new WebSocket(tab.webSocketDebuggerUrl);
	await new Promise(resolve => ws.addEventListener('open', resolve));
	let id = 0;
	const pending = new Map();
	const failures = new Set();
	const urlOfRequest = new Map();
	ws.addEventListener('message', event => {
		const m = JSON.parse(event.data);
		if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
		if (m.method === 'Network.requestWillBeSent') urlOfRequest.set(m.params.requestId, m.params.request.url);
		if (m.method === 'Network.responseReceived' && m.params.response.status === 404) failures.add(m.params.response.url);
		if (m.method === 'Network.loadingFailed' && urlOfRequest.has(m.params.requestId)) failures.add(urlOfRequest.get(m.params.requestId));
	});
	const send = (method, params = {}) => new Promise(resolve => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
	await send('Network.enable');
	await send('Network.setCacheDisabled', { cacheDisabled: true });
	await send('Page.navigate', { url: SITE + '/' });
	await new Promise(resolve => setTimeout(resolve, 2500));
	const close = () => { ws.close(); return fetch(`${DEBUG}/json/close/${tab.id}`); };
	return { send, failures, close };
}

async function visit({ send }, { route, flavor }) {
	const script = `(async () => {
		Backbone.history.navigate(${JSON.stringify(route)}, { trigger: true });
		await new Promise(r => setTimeout(r, ${SETTLE_MS}));
		${flavor ? "const tab = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Flavor'); if (tab) tab.click(); await new Promise(r => setTimeout(r, " + SETTLE_MS + "));" : ''}
	})()`;
	await send('Runtime.evaluate', { expression: script, awaitPromise: true });
}

const tabs = await Promise.all(Array.from({ length: TABS }, openTab));
let next = 0, done = 0;
await Promise.all(tabs.map(async tab => {
	while (next < routes.length) {
		await visit(tab, routes[next++]);
		if (++done % 100 === 0) console.log(`${done}/${routes.length} pages visited`);
	}
}));
const missing = new Set();
for (const tab of tabs) for (const url of tab.failures) {
	const { pathname, origin } = new URL(url);
	if (origin === SITE) missing.add(decodeURIComponent(pathname).replace(/^\//, ''));
}
await Promise.all(tabs.map(tab => tab.close()));

const out = path.join(root, 'upstream/extra-assets.txt');
fs.writeFileSync(out, [...missing].sort().join('\n') + '\n');
console.log(`${missing.size} requested paths returned 404 locally; wrote ${path.relative(root, out)}`);
