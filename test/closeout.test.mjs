import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmp, rm, run, write } from './helpers.mjs';

const head = '# CLOSEOUT: p\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n';

test('T-K1-03 carried row without a backlog link fails naming the row; complete one passes', () => {
  const d = tmp();
  try {
    const bad = path.join(d, 'bad.md'); const good = path.join(d, 'good.md');
    write(bad, head + '| alpha | shipped | PR #4 merged | |\n| beta-piece | carried | rest of it | |\n');
    write(good, head + '| alpha | shipped | PR #4 merged | |\n| beta-piece | carried | rest of it | docs/backlog/beta.md |\n| gamma | dropped | superseded | |\n');
    write(path.join(d, 'docs/backlog/beta.md'), '# beta');
    const r1 = run(['check', 'closeout', bad]);
    assert.equal(r1.code, 1);
    assert.match(r1.out, /beta-piece/);
    assert.match(r1.out, /carried needs a backlog link/);
    assert.doesNotMatch(r1.out, /alpha/);
    const r2 = run(['check', 'closeout', good]);
    assert.equal(r2.code, 0, r2.out);
  } finally { rm(d); }
});

test('T-K1-03 shipped without evidence and dropped without reason fail; empty table fails', () => {
  const d = tmp();
  try {
    const f = path.join(d, 'c.md');
    write(f, head + '| a | shipped | | |\n| b | dropped | <why> | |\n| c | weird | x | |\n');
    const r = run(['check', 'closeout', f]);
    assert.equal(r.code, 1);
    assert.match(r.out, /"a": shipped needs evidence/);
    assert.match(r.out, /"b": dropped needs a reason/);
    assert.match(r.out, /"c": disposition/);
    write(f, '# nothing');
    assert.equal(run(['check', 'closeout', f]).code, 1);
    assert.equal(run(['check', 'closeout', path.join(d, 'missing.md')]).code, 2);
  } finally { rm(d); }
});

test('T-K1-03 the shipped template, unfilled, does not pass as a closeout; `template closeout` prints it', () => {
  const d = tmp();
  try {
    const t = run(['template', 'closeout']);
    assert.equal(t.code, 0);
    assert.match(t.out, /Piece \| Disposition/);
    const f = path.join(d, 't.md'); write(f, t.out);
    assert.equal(run(['check', 'closeout', f]).code, 1);
  } finally { rm(d); }
});

test('T-K1-03 carried link must be an existing relative path or an http(s) URL; n/a, TBD/x, # are refused naming the row', () => {
  const d = tmp();
  try {
    write(path.join(d, 'backlog/real.md'), '# r');
    write(path.join(d, 'pkg/sibling.md'), '# s');
    const f = path.join(d, 'pkg/CLOSEOUT.md');
    const row = (name, link) => `| ${name} | carried | rest | ${link} |\n`;
    for (const [name, link] of [['r-na', 'n/a'], ['r-tbd', 'TBD/x'], ['r-hash', '#'], ['r-missing', 'backlog/nope.md'], ['r-ftp', 'ftp://x/y']]) {
      write(f, head + row(name, link));
      const r = run(['check', 'closeout', f, '--root', d]);
      assert.equal(r.code, 1, `${link}: ${r.out}`);
      assert.match(r.out, new RegExp(name));
    }
    write(f, head + row('ok-root', 'backlog/real.md') + row('ok-rel', 'sibling.md') + row('ok-url', 'https://example.com/issues/4') + row('ok-anchor', 'backlog/real.md#top'));
    const ok = run(['check', 'closeout', f, '--root', d]);
    assert.equal(ok.code, 0, ok.out);
  } finally { rm(d); }
});
