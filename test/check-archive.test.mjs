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
    write(path.join(root, 'plans/0-done/closed/status.json'), JSON.stringify({ closed: true }));
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
