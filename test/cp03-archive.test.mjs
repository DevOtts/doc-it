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
  // The fixture board's implementation is "closed", so it sits in a folder of that name (R4-A1-M7: a board belongs to
  // the package it names).
  const root = archiveWith({ closed: clone() });
  const root2 = archiveWith({ closed: later });
  try {
    for (const r of [run(['check', 'archive', '--root', root, '--json']), run(['check', 'archive', '--root', root2, '--json'])]) assert.equal(r.code, 0, r.out);
  } finally { rm(root); rm(root2); }
});

const HEAD = '# CLOSEOUT: demo\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n';
const lint = (dir, rows, root) => { const f = path.join(dir, 'CLOSEOUT.md'); write(f, HEAD + rows.map((r) => `| ${r.join(' | ')} | |`).join('\n') + '\n'); return run(['check', 'closeout', f, ...(root ? ['--root', root] : [])]); };

test('A1-M2 shipped evidence "yes" and dropped reason "." are refused, naming the row', () => {
  const d = tmp();
  try {
    const a = lint(d, [['Core', 'shipped', 'yes']]);
    assert.equal(a.code, 1, a.out); assert.match(a.out, /"Core": shipped evidence must cite something checkable/);
    const b = lint(d, [['Core', 'dropped', '.']]);
    assert.equal(b.code, 1, b.out); assert.match(b.out, /"Core": dropped needs a reason/);
    for (const weak of ['merged', 'done and shipped', 'abcdefg', 'see #', 'https://x']) {
      const r = lint(d, [['Core', 'shipped', weak]]);
      assert.equal(r.code, 1, `"${weak}" must be refused: ${r.out}`);
    }
    for (const weak of ['no', 'not needed', 'x y z']) {
      const r = lint(d, [['Core', 'dropped', weak]]);
      assert.equal(r.code, 1, `reason "${weak}" must be refused: ${r.out}`);
    }
  } finally { rm(d); }
});

test('A1-M2 checkable evidence passes: #PR, URL, repo@sha, existing path, a sha that resolves in --root', async () => {
  const { git } = await import('./helpers.mjs');
  const d = tmp();
  try {
    write(path.join(d, 'deploy/record.md'), '# deployed');
    // R2-A1-M4: repo@sha must resolve, so the sibling repo build-it exists next to --root with that commit.
    const sib = tmp(); const bi = path.join(sib, 'build-it'); const root = path.join(sib, 'proj');
    fs.mkdirSync(bi); fs.mkdirSync(root);
    git(bi, 'init', '-q'); write(path.join(bi, 'a.txt'), 'a'); git(bi, 'add', '-A'); git(bi, 'commit', '-q', '-m', 'a');
    const bsha = git(bi, 'rev-parse', '--short=7', 'HEAD');
    write(path.join(root, 'deploy/record.md'), '# deployed');
    for (const ok of ['PR #12 merged', 'owner/repo#7', 'https://github.com/o/r/pull/3', `build-it@${bsha}`, 'deploy/record.md']) {
      const r = lint(root, [['Core', 'shipped', ok]], root);
      assert.equal(r.code, 0, `"${ok}" should pass: ${r.out}`);
    }
    rm(sib);
    assert.equal(lint(d, [['Core', 'dropped', 'superseded by the vendor API']]).code, 0);
  } finally { rm(d); }
});

test('A1-M2 inside a git repo a bare sha must exist as a commit there', async () => {
  const { git } = await import('./helpers.mjs');
  const d = tmp();
  try {
    git(d, 'init', '-q'); write(path.join(d, 'a.txt'), 'a'); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'a');
    const sha = git(d, 'rev-parse', 'HEAD');
    assert.equal(lint(d, [['Core', 'shipped', `sha ${sha.slice(0, 9)} on main`]], d).code, 0);
    const fake = lint(d, [['Core', 'shipped', 'sha 1234567 on main']], d);
    assert.equal(fake.code, 1, fake.out); assert.match(fake.out, /must cite something checkable/);
  } finally { rm(d); }
});
