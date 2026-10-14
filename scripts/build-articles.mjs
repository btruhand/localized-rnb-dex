// Renders content/articles/*.md to public/articles-cached/*.html. Port of the original PHP-era cms/build.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import showdown from 'showdown';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const converter = new showdown.Converter({
	tables: true,
	simpleLineBreaks: true,
	requireSpaceBeforeHeadingText: true,
	simplifiedAutoLink: true,
	literalMidWordUnderscores: true,
	literalMidWordAsterisks: true,
	openLinksInNewWindow: true,
});

const searchContext = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/search-index.js'), 'utf8'), searchContext);
const searchIndexTable = {};
for (const [id, type, more] of searchContext.exports.BattleSearchIndex) {
	if (more) continue;
	(searchIndexTable[id] ||= []).push(type);
}

const idCanBe = (id, type) => id.endsWith(type) && !!searchIndexTable[id.slice(0, -type.length)]?.includes(type);
const toID = text => (typeof text === 'string' || typeof text === 'number' ? ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '') : '');
const PLURALS = {
	move: 'moves', ability: 'abilities', item: 'items', type: 'types', category: 'categories',
	egggroup: 'egggroups', tier: 'tiers', article: 'articles',
};
const pluralType = type => PLURALS[type] || type;

export function renderArticle(markdown, name) {
	let buf = markdown;
	const nlIndex = buf.indexOf('\n');
	const secondHashIndex = buf.indexOf('\n# ');
	if (secondHashIndex > 0 && buf.slice(nlIndex, secondHashIndex).trim() === '') buf = buf.slice(secondHashIndex + 1);
	buf = converter.makeHtml(buf);
	buf = buf.replace(`<a href="/${name}">`, `<a href="/${name}" class="cur">`);
	buf = buf.replace(/é/g, '&eacute;');

	buf = buf.replace(/\[\[([^\]]+)\]\]/g, (match, submatch) => {
		let id = toID(submatch);
		let types = searchIndexTable[id];
		for (const suffix of ['type', 'move', 'egggroup']) {
			if (idCanBe(id, suffix)) {
				id = id.slice(0, -suffix.length);
				types = [suffix];
			}
		}
		if (!types) return `${submatch} (?)`;
		if (types.length === 1) return `<a href="/${pluralType(types[0])}/${id}" data-target="push">${submatch}</a>`;
		return `${submatch} (` + types.map(type => `<a href="/${pluralType(type)}/${id}" data-target="push">${type}</a>`).join(', ') + ')';
	});

	buf = buf.replace(/>Past gens<\/h3>([^]*)/, (match, submatch) => {
		let subBuf = '>Past gens</h3>\n<dl>\n';
		let isFirst = true;
		for (const line of submatch.split('\n')) {
			if (line.endsWith(':</p>')) {
				if (!isFirst) subBuf += '</dd>';
				isFirst = false;
				subBuf += '<dt>' + line.slice(3, -4) + '</dt><dd>\n';
			} else {
				subBuf += line + '\n';
			}
		}
		if (!isFirst) subBuf += '</dd>';
		return subBuf + '\n</dl>';
	});

	return buf.replace(/\n/g, '\n\t\t').replace(/\n\t\t\n/g, '\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const srcDir = path.join(root, 'content/articles');
	const outDir = path.join(root, 'public/articles-cached');
	fs.mkdirSync(outDir, { recursive: true });
	let count = 0;
	for (const file of fs.readdirSync(srcDir)) {
		if (!file.endsWith('.md') || /[A-Z]/.test(file)) continue;
		const name = file.slice(0, -3);
		fs.writeFileSync(path.join(outDir, name + '.html'), renderArticle(fs.readFileSync(path.join(srcDir, file), 'utf8'), name));
		count++;
	}
	console.log(`Rendered ${count} articles to ${path.relative(root, outDir)}`);
}
