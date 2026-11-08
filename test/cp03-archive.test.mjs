// CP-03 adversarial review regressions (do-it 1.1, archive A1, G-2). Each case replays the reviewer's attack and
// asserts doc-it reports or refuses it. Authored by DevOtts (https://github.com/DevOtts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmp, rm, run, write, config } from './helpers.mjs';

// A board closed by the real board writer (build-it status-write close, with board_sha256 in its close entry).
const CLOSED = JSON.parse(fs.readFileSync(new URL('./fixtures/closed-board.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(CLOSED));
function archiveWith(boards) {
  const root = tmp();
  config(root, { roles: { program: ['plans'] } });
  for (const [name, doc] of Object.entries(boards)) write(path.join(root, 'plans/0-done', name, 'status.json'), JSON.stringify(doc, null, 2));
  return root;
}

test('A1-H1 check archive reports a hand-set closed:true (no close history entry) as done_closed_unverified', () => {
  const forged = clone(); forged.history = forged.history.filter((h) => h.task !== '*'); // T-1 not started, closed:true by hand
  const root = archiveWith({ demo: forged });
  try {
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 1, r.out);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.done_closed_unverified, ['plans/0-done/demo']);
    assert.deepEqual(j.done_unclosed, []);
    const t = run(['check', 'archive', '--root', root]);
    assert.match(t.out, /board says closed but no writer freeze backs it[^\n]*\(1\):\n\s+plans\/0-done\/demo/);
    const s = run(['check', 'archive', '--root', root, '--summary']);
    assert.match(s.out, /done_closed_unverified=1/);
  } finally { rm(root); }
});

test('A1-H1 a forged close entry without board_sha256, a close entry by another role, and an edit after the close are all reported', () => {
  const noDigest = clone(); delete noDigest.history.at(-1).board_sha256;
  const otherRole = clone(); otherRole.history.at(-1).by = 'build-it';
  const edited = clone(); edited.waves[0].tasks[0].status = 'verified'; // edited after the freeze
  const reopened = clone(); reopened.history.push({ at: reopened.updated_at, task: '*', from: 'closed', to: 'open', by: 'conclude-it', note: 'x' });
  const root = archiveWith({ a: noDigest, b: otherRole, c: edited, d: reopened, ok: clone() });
  try {
    const j = JSON.parse(run(['check', 'archive', '--root', root, '--json']).out);
    assert.deepEqual(j.done_closed_unverified, ['plans/0-done/a', 'plans/0-done/b', 'plans/0-done/c', 'plans/0-done/d']);
    assert.ok(!j.done_closed_unverified.includes('plans/0-done/ok'), 'a writer-closed board is clean');
  } finally { rm(root); }
});

test('A1-H1 a writer-closed board is clean, also with rechecks appended and updated_at bumped after the close', () => {
  const later = clone(); later.updated_at = '2026-11-09T00:00:00Z';
  later.rechecks = [{ at: '2026-11-09T00:00:00Z', task: 'T-1', sha: 'abcdef1', command_sha: 'x', result: 'pass' }];
  const root = archiveWith({ ok: clone(), later });
  try {
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 0, r.out);
  } finally { rm(root); }
});
