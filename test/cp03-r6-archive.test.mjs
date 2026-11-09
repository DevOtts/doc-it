// CP-03 round 6 adversarial regressions (do-it 1.1, archive A1, G-2). R6-A1-M9: git output that doc-it
// parses (a repo top, a status entry count) must survive non-ASCII, space, tab, newline and `"` names. Authored by DevOtts (https://github.com/DevOtts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmp, rm, run as run0, write, git } from './helpers.mjs';

const run = (args) => { const r = run0(args, { timeout: 20000, input: '' }); assert.notEqual(r.code, null, `doc-it hung or was killed: ${r.out}${r.err}`); return r; };
const head = '# CLOSEOUT: p\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n';

test('CP03 R6-A1-M9 doc-it: check closeout without --root finds the repo root of a repo whose folder ends in a space (rev-parse output is not trimmed)', () => {
  const d = tmp();
  try {
    const repo = path.join(d, 'repo ');
    fs.mkdirSync(repo); git(repo, 'init', '-q');
    write(path.join(repo, 'backlog/beta.md'), '# beta\n');
    const f = path.join(repo, 'plans/0-done/x/CLOSEOUT.md');
    write(f, head + '| alpha | dropped | superseded by the beta piece entirely | |\n| beta | carried | rest of it | backlog/beta.md |\n');
    const r = run(['check', 'closeout', f]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /^ok: 2 piece/);
  } finally { rm(d); }
});

test('CP03 R6-A1-M9 doc-it: check checkout counts uncommitted entries NUL-separated: a rename, a non-ASCII, a tab, a newline and a "-led name', () => {
  const d = tmp();
  try {
    const repo = path.join(d, 'r'); fs.mkdirSync(repo); git(repo, 'init', '-q', '-b', 'main');
    write(path.join(repo, 'a.txt'), 'a\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
    git(repo, 'remote', 'add', 'origin', repo); git(repo, 'fetch', '-q', 'origin');
    git(repo, 'mv', 'a.txt', 'b.txt');
    for (const n of ['migração.md', 'ta\tb.md', 'nl\nx.md', '"q.md']) write(path.join(repo, n), 'x\n');
    const r = run(['check', 'checkout', repo, '--no-fetch', '--json']);
    const j = JSON.parse(r.out);
    const one = Array.isArray(j) ? j[0] : (j.results || j)[0] || j;
    assert.equal(one.uncommitted, 5, r.out);
  } finally { rm(d); }
});
