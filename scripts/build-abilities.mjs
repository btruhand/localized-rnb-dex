// Merges ability text into the ability data, because Pokémon Showdown stopped doing so in its served
// data/abilities.js (client commit fccc266fe, 2026-09-13). The dex reads ability.desc / ability.shortDesc.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadExports(file) {
	const context = { exports: {} };
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
	return context.exports;
}

export function mergeAbilityText(abilities, abilityText) {
	const merged = {};
	for (const [id, ability] of Object.entries(abilities)) {
		const text = abilityText[id] || {};
		const shortDesc = text.shortDesc || text.desc || '';
		const desc = text.desc || shortDesc;
		merged[id] = { ...ability, desc, shortDesc };
	}
	return merged;
}

export function serialize(abilities) {
	return `exports.BattleAbilities = ${JSON.stringify(abilities)};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { BattleAbilities } = loadExports(path.join(root, 'upstream/data_abilities.js'));
	const { BattleText } = loadExports(path.join(root, 'upstream/data_text_en.js'));
	const merged = mergeAbilityText(BattleAbilities, BattleText.en.Abilities);
	const out = path.join(root, 'public/data/abilities.js');
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, serialize(merged));
	const missing = Object.entries(merged).filter(([, a]) => !a.shortDesc).map(([id]) => id);
	console.log(`Wrote ${Object.keys(merged).length} abilities to ${path.relative(root, out)}; ${missing.length} without text: ${missing.join(', ')}`);
}
