import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmp, rm, run, write, config } from './helpers.mjs';

test('T-K1-01 check archive lists done_unclosed and done_without_closeout, omits the clean one', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] }, expiry_days: 60 });
    write(path.join(root, 'plans/0-done/x/status.json'), JSON.stringify({ closed: false, updated_at: '2026-01-01T00:00:00Z' }));
    write(path.join(root, 'plans/0-done/y/README.md'), 'no board');
    write(path.join(root, 'plans/0-done/clean/CLOSEOUT.md'), '# c');
    // A board the writer closed (real fixture from status-write close; CP-03 A1-H1: a bare {closed:true} no longer counts).
    write(path.join(root, 'plans/0-done/closed/status.json'), fs.readFileSync(new URL('./fixtures/closed-board.json', import.meta.url)));
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 1, r.err);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.done_unclosed, ['plans/0-done/x']);
    assert.deepEqual(j.done_without_closeout, ['plans/0-done/y']);
    assert.ok(!r.out.includes('clean') && !r.out.includes('plans/0-done/closed'));
    assert.deepEqual(j.stale_active, []);
  } finally { rm(root); }
});

test('T-K1-01 clean archive exits 0', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] } });
    write(path.join(root, 'plans/0-done/ok/CLOSEOUT.md'), '# c');
    assert.equal(run(['check', 'archive', '--root', root]).code, 0);
  } finally { rm(root); }
});

test('T-K1-01 stale_active: old board with newer files is flagged, fresh or untouched is not; never writes', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] } });
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    write(path.join(root, 'plans/stale/status.json'), JSON.stringify({ closed: false, updated_at: old }));
    write(path.join(root, 'plans/stale/notes.md'), 'newer work');
    write(path.join(root, 'plans/quiet/status.json'), JSON.stringify({ closed: false, updated_at: old }));
    const longAgo = new Date(Date.now() - 20 * 86400000);
    fs.utimesSync(path.join(root, 'plans/quiet/status.json'), longAgo, longAgo);
    write(path.join(root, 'plans/fresh/status.json'), JSON.stringify({ closed: false, updated_at: new Date().toISOString() }));
    write(path.join(root, 'plans/fresh/a.md'), 'x');
    const before = fs.readdirSync(path.join(root, 'plans'), { recursive: true }).sort().join();
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 1);
    assert.deepEqual(JSON.parse(r.out).stale_active, ['plans/stale']);
    assert.equal(run(['check', 'archive', '--root', root, '--json', '--stale-hours', '100000']).code, 0);
    assert.equal(fs.readdirSync(path.join(root, 'plans'), { recursive: true }).sort().join(), before);
  } finally { rm(root); }
});

test('T-K1-01 --help exits 0 on every command', () => {
  for (const a of [[], ['init'], ['tiers'], ['template'], ['check'], ['check', 'archive'], ['check', 'closeout'], ['check', 'checkout'], ['check', 'expiry']]) {
    const r = run([...a, '--help']);
    assert.equal(r.code, 0, a.join(' '));
    assert.ok(r.out.length > 20);
  }
});

function legacyFixture(root, { extra = 0 } = {}) {
  config(root, { roles: { program: ['plans'] }, archive_since: '2026-01-01' });
  const old = new Date('2025-06-01T00:00:00Z');
  for (let i = 0; i < 12 + extra; i++) {
    const f = path.join(root, `plans/0-done/old${i}/PLAN.md`);
    write(f, 'x'); fs.utimesSync(f, old, old);
    fs.utimesSync(path.dirname(f), old, old);
  }
  write(path.join(root, 'plans/0-done/recent-unclosed/status.json'), JSON.stringify({ closed: false }));
  write(path.join(root, 'plans/0-done/recent-bare/README.md'), 'x');
}

test('T-K1-01 archive_since moves packages older than the date into legacy_count, out of the lists', () => {
  const root = tmp();
  try {
    legacyFixture(root);
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 1, r.err);
    const j = JSON.parse(r.out);
    assert.equal(j.legacy_count, 12);
    assert.deepEqual(j.done_without_closeout, ['plans/0-done/recent-bare']);
    assert.deepEqual(j.done_unclosed, ['plans/0-done/recent-unclosed']);
    const bad = tmp();
    try { config(bad, { roles: { program: ['plans'] }, archive_since: 'last week' }); assert.equal(run(['check', 'archive', '--root', bad]).code, 2); } finally { rm(bad); }
  } finally { rm(root); }
});

test('T-K1-01 without archive_since there is no legacy_count and every package is listed', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] } });
    for (let i = 0; i < 3; i++) write(path.join(root, `plans/0-done/p${i}/README.md`), 'x');
    const j = JSON.parse(run(['check', 'archive', '--root', root, '--json']).out);
    assert.equal(j.legacy_count, undefined);
    assert.equal(j.done_without_closeout.length, 3);
  } finally { rm(root); }
});

test('T-K1-01 --summary: counts per kind, done_unclosed in full, other lists capped at 10 with "+N more"; JSON keeps all', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] } });
    for (let i = 0; i < 25; i++) write(path.join(root, `plans/0-done/b${String(i).padStart(2, '0')}/README.md`), 'x');
    for (let i = 0; i < 12; i++) write(path.join(root, `plans/0-done/u${String(i).padStart(2, '0')}/status.json`), JSON.stringify({ closed: false }));
    const r = run(['check', 'archive', '--root', root, '--summary']);
    assert.equal(r.code, 1);
    assert.match(r.out, /summary: done_unclosed=12 done_without_closeout=25 stale_active=0 unowned=0/);
    assert.equal(r.out.split('\n').filter((l) => /plans\/0-done\/u\d+/.test(l)).length, 12);
    assert.equal(r.out.split('\n').filter((l) => /plans\/0-done\/b\d+/.test(l)).length, 10);
    assert.match(r.out, /\+15 more/);
    const j = JSON.parse(run(['check', 'archive', '--root', root, '--summary', '--json']).out);
    assert.equal(j.done_without_closeout.length, 25);
  } finally { rm(root); }
});

test('T-K1-01 archive_since never hides an open board: an OLD done_unclosed package is still listed (CP-01 N4)', () => {
  const root = tmp();
  try {
    legacyFixture(root);
    const old = new Date('2025-06-01T00:00:00Z');
    const f = path.join(root, 'plans/0-done/old-unclosed/status.json');
    write(f, JSON.stringify({ closed: false }));
    fs.utimesSync(f, old, old); fs.utimesSync(path.dirname(f), old, old);
    const j = JSON.parse(run(['check', 'archive', '--root', root, '--json']).out);
    assert.deepEqual(j.done_unclosed.sort(), ['plans/0-done/old-unclosed', 'plans/0-done/recent-unclosed']);
    assert.equal(j.legacy_count, 12);
  } finally { rm(root); }
});
