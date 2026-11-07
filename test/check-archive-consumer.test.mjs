import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { tmp, rm, run, write, config } from './helpers.mjs';

const HOME = process.env.DOC_IT_PILOT_HOME;
// Identity of the unclosed programs without naming them: sha256 of the sorted, newline-joined package names.
const EXPECT_SHA = process.env.DOC_IT_PILOT_EXPECT_UNCLOSED_SHA256;
const idHash = (paths) => crypto.createHash('sha256').update(paths.map((p) => path.basename(p)).sort().join('\n')).digest('hex');
const snapshot = (d) => fs.readdirSync(d, { recursive: true }).sort().map((f) => { const s = fs.statSync(path.join(d, f)); return `${f}:${s.size}:${s.mtimeMs}`; }).join('\n');
const top = (d) => fs.readdirSync(d).sort().map((f) => `${f}:${fs.statSync(path.join(d, f)).mtimeMs}`).join('\n');

test('T-K1-02 [REAL] check archive on a read-only copy of a consumer plan home: 3 done_unclosed, nothing written', { skip: HOME ? false : 'IMPLEMENTED-NOT-VERIFIED: DOC_IT_PILOT_HOME not set' }, () => {
  const copy = tmp();
  const realBefore = top(HOME);
  const doneBefore = snapshot(path.join(HOME, '0-done'));
  try {
    // Copy only what the check reads: per-package board and closeout, plus top-level names.
    for (const name of fs.readdirSync(path.join(HOME, '0-done'))) {
      const src = path.join(HOME, '0-done', name);
      if (!fs.statSync(src).isDirectory()) continue;
      for (const f of ['status.json', 'CLOSEOUT.md']) {
        if (fs.existsSync(path.join(src, f))) write(path.join(copy, '0-done', name, f), fs.readFileSync(path.join(src, f)));
      }
      fs.mkdirSync(path.join(copy, '0-done', name), { recursive: true });
    }
    config(copy, { roles: { program: ['.'] } });
    const copyBefore = snapshot(copy);
    const r = run(['check', 'archive', '--root', copy, '--json']);
    { const j0 = JSON.parse(r.out); console.log(`done_unclosed=${j0.done_unclosed.length} done_without_closeout=${j0.done_without_closeout.length} stale_active=${j0.stale_active.length} unowned=${j0.unowned.length}`); }
    assert.equal(r.code, 1, r.err);
    const j = JSON.parse(r.out);
    assert.equal(j.done_unclosed.length, 3, `count ${j.done_unclosed.length}`);
    if (EXPECT_SHA) assert.equal(idHash(j.done_unclosed), EXPECT_SHA, 'the done_unclosed programs are not the expected ones (sha256 of sorted names differs)');
    else console.log('note: DOC_IT_PILOT_EXPECT_UNCLOSED_SHA256 not set: count asserted, identity NOT checked');
    assert.equal(snapshot(copy), copyBefore, 'copy changed');
    assert.equal(top(HOME), realBefore, 'real home top level changed');
    assert.equal(snapshot(path.join(HOME, '0-done')), doneBefore, 'real archive changed');
  } finally { rm(copy); }
});
