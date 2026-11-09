// CP-03 round 3 adversarial regressions (do-it 1.1, archive A1, G-2 / G-10). Each case replays the reviewer's exact
// evidence strings and asserts doc-it refuses them, naming the row. Authored by DevOtts (https://github.com/DevOtts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmp, rm, run, write } from './helpers.mjs';

const HEAD = '# CLOSEOUT: demo\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n';
const lint = (dir, rows) => { const f = path.join(dir, 'CLOSEOUT.md'); write(f, HEAD + rows.map((r) => `| ${r.join(' | ')} | |`).join('\n') + '\n'); return run(['check', 'closeout', f, '--root', dir]); };

test('R3-L1 shipped evidence "http://a.b" (a bare host) is refused, naming the row; a URL with a path still passes', () => {
  const d = tmp();
  try {
    for (const weak of ['http://a.b', 'https://a.b/', 'http://a.b:8080', 'https://github.com', 'see https://a.b?x=1']) {
      const r = lint(d, [['Core', 'shipped', weak]]);
      assert.equal(r.code, 1, `${weak}: ${r.out}`);
      assert.match(r.out, /row "Core": shipped evidence must cite something checkable \(.*an http\(s\) URL with a path/);
    }
    for (const ok of ['https://github.com/o/r/pull/3', 'deployed, see https://deploy.example.com/runs/42']) {
      const r = lint(d, [['Core', 'shipped', ok]]);
      assert.equal(r.code, 0, `${ok}: ${r.out}`);
    }
    // #1 stays format-only (documented offline limit, STANDARD §5)
    assert.equal(lint(d, [['Core', 'shipped', '#1']]).code, 0);
  } finally { rm(d); }
});
