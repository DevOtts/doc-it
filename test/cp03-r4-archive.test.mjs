// CP-03 round 4 adversarial regressions (do-it 1.1, archive A1, G-2). Each case replays the reviewer's commands and
// asserts doc-it reports them. Authored by DevOtts (https://github.com/DevOtts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmp, rm, run, write, config } from './helpers.mjs';

// A board closed by the real board writer; its implementation is "closed".
const CLOSED_TEXT = fs.readFileSync(new URL('./fixtures/closed-board.json', import.meta.url), 'utf8');

test('R4-A1-M7 V1: a copy of another package\'s writer-closed board in 0-done/demo is done_board_mismatch, exit 1; the original stays clean', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] } });
    // other = a verified package closed through the guarded close into 0-done/ (the fixture's package is "closed")
    write(path.join(root, 'plans/0-done/closed/status.json'), CLOSED_TEXT);
    assert.equal(run(['check', 'archive', '--root', root]).code, 0, 'the original alone is clean');
    // mkdir 0-done/demo; cp 0-done/other/status.json 0-done/demo/
    fs.mkdirSync(path.join(root, 'plans/0-done/demo'));
    fs.copyFileSync(path.join(root, 'plans/0-done/closed/status.json'), path.join(root, 'plans/0-done/demo/status.json'));
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 1, r.out);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.done_board_mismatch, ['plans/0-done/demo']);
    assert.deepEqual(j.done_unclosed, []);
    assert.deepEqual(j.done_closed_unverified, [], 'the copy carries a valid freeze; only its name gives it away');
    const t = run(['check', 'archive', '--root', root]);
    assert.match(t.out, /implementation is not its folder's name[^\n]*\(1\):\n\s+plans\/0-done\/demo/);
    const s = run(['check', 'archive', '--root', root, '--summary']);
    assert.match(s.out, /done_board_mismatch=1/);
  } finally { rm(root); }
});

test('R4-A1-M7 V2/V3 placeholders in 0-done: {}, an empty file and `null` are done_unclosed (never "no board"), exit 1', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] } });
    write(path.join(root, 'plans/0-done/a/status.json'), '{}');
    write(path.join(root, 'plans/0-done/b/status.json'), '');
    write(path.join(root, 'plans/0-done/c/status.json'), 'null');
    write(path.join(root, 'plans/0-done/c/CLOSEOUT.md'), '# x\n');
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(JSON.parse(r.out).done_unclosed, ['plans/0-done/a', 'plans/0-done/b', 'plans/0-done/c']);
  } finally { rm(root); }
});
