import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmp, rm, run, write, config } from './helpers.mjs';

test('T-K1-06 verified 61 days old is listed, 10 days old is not; zero files changed', () => {
  const root = tmp();
  try {
    config(root, { roles: { durable: ['ref'] }, expiry_days: 60 });
    write(path.join(root, 'ref/old.md'), '---\nstatus: current\nverified: 2026-09-10\n---\n# old\n');
    write(path.join(root, 'ref/new.md'), '---\nstatus: current\nverified: 2026-11-01\n---\n# new\n');
    const snap = () => fs.readdirSync(root, { recursive: true }).sort().map((f) => { const p = path.join(root, f); return fs.statSync(p).isFile() ? `${f}:${fs.readFileSync(p, 'utf8')}:${fs.statSync(p).mtimeMs}` : f; }).join('|');
    const before = snap();
    // 2026-09-10 + 61 days = 2026-11-10
    const r = run(['check', 'expiry', '--root', root, '--today', '2026-11-10', '--json']);
    assert.equal(r.code, 1);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.expired.map((e) => e.path), ['ref/old.md']);
    assert.equal(j.expired[0].age_days, 61);
    assert.deepEqual(j.missing_verified, []);
    assert.equal(snap(), before);
  } finally { rm(root); }
});

test('T-K1-06 exactly at the limit is clean; --expiry-days overrides; missing verified: is reported', () => {
  const root = tmp();
  try {
    config(root, { roles: { durable: ['ref'] }, expiry_days: 60 });
    write(path.join(root, 'ref/a.md'), 'verified: 2026-09-11\n');
    assert.equal(run(['check', 'expiry', '--root', root, '--today', '2026-11-10']).code, 0);
    assert.equal(run(['check', 'expiry', '--root', root, '--today', '2026-11-10', '--expiry-days', '30']).code, 1);
    write(path.join(root, 'ref/b.md'), '# no date\n');
    const r = run(['check', 'expiry', '--root', root, '--today', '2026-11-10', '--json']);
    assert.deepEqual(JSON.parse(r.out).missing_verified, ['ref/b.md']);
  } finally { rm(root); }
});

test('K1-07 tiers --json prints the six tiers (also T-K1-08 local half)', () => {
  const r = run(['tiers', '--json']);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out).tiers, ['live', 'code', 'generated', 'durable', 'program', 'pointer']);
});
