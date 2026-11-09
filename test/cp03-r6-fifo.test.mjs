// CP-03 round 6 adversarial regressions (do-it 1.1, archive A1, G-2). FIFO class: a FIFO, a device or a /dev symlink as a board, CLOSEOUT, config or page must not hang doc-it. Every run
// has a timeout, so a hang fails the case instead of the suite. Authored by DevOtts (https://github.com/DevOtts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmp, rm, run as run0, write, config } from './helpers.mjs';

const CLOSED_TEXT = fs.readFileSync(new URL('./fixtures/closed-board.json', import.meta.url), 'utf8');
const run = (args) => { const r = run0(args, { timeout: 20000, input: '' }); assert.notEqual(r.code, null, `doc-it hung or was killed: ${r.out}${r.err}`); return r; };
const mkfifo = (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); const r = spawnSync('mkfifo', [p]); assert.equal(r.status, 0, `mkfifo: ${r.stderr}`); };
const head = '# CLOSEOUT: p\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n';

for (const [label, make] of [
  ['a FIFO', (p) => mkfifo(p)],
  ['a symlink to /dev/zero', (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.symlinkSync('/dev/zero', p); }],
  ['a symlink to /dev/stdin', (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.symlinkSync('/dev/stdin', p); }],
  ['a dangling symlink', (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.symlinkSync('/nonexistent/status.json', p); }],
]) {
  test(`CP03 R6 FIFO class doc-it: ${label} as a 0-done board is done_unclosed (never "no board"), and as an active board is skipped; no hang`, () => {
    const root = tmp();
    try {
      config(root, { roles: { program: ['plans'] } });
      make(path.join(root, 'plans/0-done/demo/status.json'));
      write(path.join(root, 'plans/0-done/demo/CLOSEOUT.md'), head + '| a | dropped | superseded by the other piece entirely | |\n');
      make(path.join(root, 'plans/live/status.json'));
      const r = run(['check', 'archive', '--root', root, '--json']);
      assert.equal(r.code, 1, r.out + r.err);
      const j = JSON.parse(r.out);
      assert.deepEqual(j.done_unclosed, ['plans/0-done/demo']);
      assert.deepEqual(j.stale_active, []);
    } finally { rm(root); }
  });
}

test('CP03 R6 FIFO class doc-it: a symlink to a real closed board in 0-done is done_unclosed (a board is never read through a link)', () => {
  const root = tmp();
  try {
    config(root, { roles: { program: ['plans'] } });
    write(path.join(root, 'elsewhere/status.json'), CLOSED_TEXT);
    fs.mkdirSync(path.join(root, 'plans/0-done/closed'), { recursive: true });
    fs.symlinkSync(path.join(root, 'elsewhere/status.json'), path.join(root, 'plans/0-done/closed/status.json'));
    const r = run(['check', 'archive', '--root', root, '--json']);
    assert.equal(r.code, 1, r.out + r.err);
    assert.deepEqual(JSON.parse(r.out).done_unclosed, ['plans/0-done/closed']);
  } finally { rm(root); }
});

test('CP03 R6 FIFO class doc-it: check closeout on a FIFO or a /dev/zero link is a usage error at once; a FIFO config.json too; a FIFO page is missing_verified', () => {
  const d = tmp();
  try {
    mkfifo(path.join(d, 'fifo.md'));
    fs.symlinkSync('/dev/zero', path.join(d, 'zero.md'));
    for (const f of ['fifo.md', 'zero.md']) {
      const r = run(['check', 'closeout', path.join(d, f)]);
      assert.equal(r.code, 2, r.out + r.err);
      assert.match(r.err, /not a (readable )?file/);
    }
    const root = path.join(d, 'cfg'); mkfifo(path.join(root, '.doc-it', 'config.json'));
    const c = run(['check', 'archive', '--root', root]);
    assert.equal(c.code, 2, c.out + c.err);
    const root2 = path.join(d, 'pages');
    config(root2, { roles: { durable: ['docs'] } });
    write(path.join(root2, 'docs/ok.md'), '---\nverified: 2026-11-01\n---\n# ok\n');
    mkfifo(path.join(root2, 'docs/pipe.md'));
    const e = run(['check', 'expiry', '--root', root2, '--today', '2026-11-09', '--json']);
    assert.deepEqual(JSON.parse(e.out).missing_verified, ['docs/pipe.md'], e.out + e.err);
  } finally { rm(d); }
});
