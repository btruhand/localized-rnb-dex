import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeAbilityText } from './build-abilities.mjs';
import { resolveFile } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = file => { const c = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), c); return c.exports; };

test('desc falls back to shortDesc, when an ability has no long description', () => {
	const merged = mergeAbilityText({ noability: { name: 'No Ability' } }, { noability: { shortDesc: 'Does nothing.' } });
	assert.equal(merged.noability.desc, 'Does nothing.');
	assert.equal(merged.noability.shortDesc, 'Does nothing.');
});

test('ability data keeps its other fields, when text is merged in', () => {
	const merged = mergeAbilityText({ intimidate: { name: 'Intimidate', rating: 3.5, num: 22 } }, { intimidate: { desc: 'Long.', shortDesc: 'Short.' } });
	assert.deepEqual(merged.intimidate, { name: 'Intimidate', rating: 3.5, num: 22, desc: 'Long.', shortDesc: 'Short.' });
});

test('every shipped ability has a description, so the ability page never shows "undefined"', () => {
	const { BattleAbilities } = load('public/data/abilities.js');
	const lacking = Object.entries(BattleAbilities).filter(([, a]) => !a.desc || !a.shortDesc).map(([id]) => id);
	assert.deepEqual(lacking, []);
});

test('deep links resolve to index.html, when the path has no file extension', () => {
	assert.equal(resolveFile('/abilities/intimidate'), path.join(root, 'public/index.html'));
});

test('missing assets are not served index.html, when the path has a file extension', () => {
	assert.equal(resolveFile('/sprites/ani/not-a-real-mon.gif'), null);
});
