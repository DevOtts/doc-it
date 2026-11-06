import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { REPO, git } from './helpers.mjs';

// Names built from fragments so this file does not contain them.
const BANNED = [['En', 'gine'], ['gro', 'kbot'], ['obran', 'inja'], ['he', 'r0'], ['reden', 'tia'], ['prax', 'ya'], ['aivi', 'vum'], ['bida', 'rra']].map((p) => p.join(''));

const files = () => git(REPO, 'ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean).filter((f) => fs.existsSync(path.join(REPO, f)));

test('T-K1-07 no project name appears in any repo file (R3)', () => {
  const hits = [];
  for (const f of files()) {
    const text = fs.readFileSync(path.join(REPO, f), 'utf8').toLowerCase();
    for (const b of BANNED) if (new RegExp(`\\b${b.toLowerCase()}\\b`).test(text)) hits.push(`${f}: ${b}`);
  }
  assert.deepEqual(hits, []);
});

test('T-K1-07 SKILL has author fields and the DevOtts footer', () => {
  const s = fs.readFileSync(path.join(REPO, 'plugins/doc-it/skills/doc-it/SKILL.md'), 'utf8');
  assert.match(s, /^author: DevOtts$/m);
  assert.match(s, /^author_url: https:\/\/github\.com\/DevOtts$/m);
  const lines = s.trimEnd().split('\n');
  assert.equal(lines.at(-1), '_Authored by [DevOtts](https://github.com/DevOtts)._');
  assert.equal(lines.at(-2), '---');
});

test('T-K1-07 STANDARD marks every rule DS-1..DS-8 checked or not yet checked', () => {
  const s = fs.readFileSync(path.join(REPO, 'docs/STANDARD.md'), 'utf8');
  for (let i = 1; i <= 8; i++) {
    const row = s.split('\n').find((l) => l.startsWith(`| DS-${i} |`));
    assert.ok(row, `DS-${i} row`);
    assert.match(row, /checked|not yet checked/);
  }
});

test('T-K1-07 manifests: versions 0.1.0, marketplace name doc-it', () => {
  const m = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin/marketplace.json'), 'utf8'));
  const p = JSON.parse(fs.readFileSync(path.join(REPO, 'plugins/doc-it/.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(m.name, 'doc-it');
  assert.equal(m.plugins[0].version, '0.1.0');
  assert.equal(p.version, '0.1.0');
});
