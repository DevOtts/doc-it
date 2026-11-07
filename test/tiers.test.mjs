import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, run } from './helpers.mjs';

test('X13 tiers --json: six tiers, aliases, fact_ok, alias map', () => {
  const j = JSON.parse(run(['tiers', '--json']).out);
  assert.deepEqual(j.tiers, ['live', 'code', 'generated', 'durable', 'program', 'pointer']);
  const d = Object.fromEntries(j.details.map((t) => [t.id, t]));
  assert.equal(d.program.fact_ok, false);
  assert.equal(d.pointer.fact_ok, false);
  for (const id of ['live', 'code', 'generated', 'durable']) assert.equal(d[id].fact_ok, true);
  assert.equal(j.aliases.git, 'code');
  assert.equal(j.aliases.local, 'live');
  assert.equal(j.aliases['durable-doc'], 'durable');
  assert.equal(j.aliases['program-doc'], 'program');
  assert.equal(j.aliases.transcript, 'pointer');
});

test('X13 tiers resolve: plus parts, qualifier, @ forms; unknown part exits 1 naming it', () => {
  const r = run(['tiers', 'resolve', 'code + local']);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out).parts.map((p) => p.id), ['code', 'live']);
  assert.deepEqual(JSON.parse(run(['tiers', 'resolve', 'code (absence)']).out).parts.map((p) => p.id), ['code']);
  assert.deepEqual(JSON.parse(run(['tiers', 'resolve', 'live@2026-11-06']).out).parts.map((p) => p.id), ['live']);
  assert.equal(JSON.parse(run(['tiers', 'resolve', 'transcript']).out).parts[0].fact_ok, false);
  const bad = run(['tiers', 'resolve', 'code + rumor']);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /rumor/);
  assert.equal(run(['tiers', 'resolve']).code, 2);
});

test('X13 every Tier cell of an audited ledger resolves (fixture; env DOC_IT_LEDGER reads a live ledger)', () => {
  const cells = fs.readFileSync(path.join(REPO, 'test/fixtures/ledger-tier-cells.txt'), 'utf8').split('\n').filter(Boolean);
  assert.ok(cells.length >= 8);
  if (process.env.DOC_IT_LEDGER) {
    const rows = fs.readFileSync(process.env.DOC_IT_LEDGER, 'utf8').split('\n').filter((l) => /^\| C\d+/.test(l));
    for (const l of rows) cells.push(l.split('|')[3].trim());
  }
  for (const c of cells) assert.equal(run(['tiers', 'resolve', c]).code, 0, `cell "${c}"`);
});
