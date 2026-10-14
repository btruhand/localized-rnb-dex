// Downloads every remote static asset the dex references from play.pokemonshowdown.com into public/,
// mirroring its path layout (public/sprites, public/audio, public/style). Safe to re-run: existing files are kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://play.pokemonshowdown.com';
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);

const spriteData = JSON.parse(fs.readFileSync(path.join(root, 'upstream/species-sprites.json'), 'utf8'));
const species = Object.values(spriteData.species);
const types = spriteData.types;
const maxNumByGen = { gen1: 151, gen2: 251, gen3: 386, gen4: 493, gen5: 649 };
const variants = ['', '-shiny', '-back', '-back-shiny'];

const tasks = [];
const add = urlPath => tasks.push(urlPath);

for (const f of ['fontawesome-webfont.eot', 'fontawesome-webfont.svg', 'fontawesome-webfont.ttf', 'fontawesome-webfont.woff', 'fontawesome-webfont.woff2']) {
	add(`style/fonts/${f}`);
}
for (const f of ['sprites/pokemonicons-pokeball-sheet.png', 'sprites/itemicons-sheet.png', 'sprites/itemicons/tm-normal.png', 'sprites/tutor.png']) add(f);
for (const type of types) add(`sprites/types/${type[0].toUpperCase()}${type.slice(1)}.png`);
for (const c of ['Physical', 'Special', 'Status']) add(`sprites/categories/${c}.png`);

const bySprite = new Map();
for (const s of species) if (!bySprite.has(s.sprite)) bySprite.set(s.sprite, s.num);
for (const [id, num] of bySprite) {
	for (const v of variants) {
		add(`sprites/ani${v}/${id}.gif`);
		// The page header asks for a gen5 still for every species, so gen5 stills have no cutoff.
		add(`sprites/gen5${v}/${id}.png`);
		for (const [gen, max] of Object.entries(maxNumByGen)) {
			if (num > max) continue;
			if (gen === 'gen5') {
				add(`sprites/gen5ani${v}/${id}.gif`);
			} else if (gen === 'gen1') {
				if (v === '' || v === '-back') add(`sprites/gen1${v}/${id}.png`);
			} else {
				add(`sprites/${gen}${v}/${id}.png`);
			}
		}
	}
	add(`audio/cries/${id}.mp3`);
}

// Paths the browser crawl (scripts/find-missing-assets.mjs) found the pages requesting, beyond the rules above.
const extraFile = path.join(root, 'upstream/extra-assets.txt');
if (fs.existsSync(extraFile)) for (const line of fs.readFileSync(extraFile, 'utf8').split('\n')) if (line.trim()) add(line.trim());

const unique = [...new Set(tasks)];
const missing = [];
let done = 0, downloaded = 0, bytes = 0;

async function fetchOne(urlPath) {
	const dest = path.join(root, 'public', urlPath);
	if (fs.existsSync(dest)) return;
	for (let attempt = 1; attempt <= 4; attempt++) {
		try {
			const res = await fetch(`${BASE}/${urlPath}`);
			if (res.status === 404) { missing.push(urlPath); return; }
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.writeFileSync(dest, buf);
			downloaded++; bytes += buf.length;
			return;
		} catch (err) {
			if (attempt === 4) { missing.push(`${urlPath} (error: ${err.message})`); return; }
			await new Promise(r => setTimeout(r, 500 * attempt));
		}
	}
}

let next = 0;
async function worker() {
	while (next < unique.length) {
		await fetchOne(unique[next++]);
		if (++done % 500 === 0) console.log(`${done}/${unique.length} (${downloaded} new, ${(bytes / 1e6).toFixed(0)} MB)`);
	}
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(path.join(root, 'upstream/missing-assets.txt'), missing.sort().join('\n') + '\n');
console.log(`Done: ${unique.length} candidates, ${downloaded} downloaded (${(bytes / 1e6).toFixed(0)} MB), ${missing.length} not available upstream (see upstream/missing-assets.txt)`);
