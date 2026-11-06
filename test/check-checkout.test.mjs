import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmp, rm, run, git, write } from './helpers.mjs';

test('T-K1-05 local main 3 behind remote: exit 1 naming both shas; then up to date: exit 0', () => {
  const d = tmp();
  try {
    const bare = path.join(d, 'remote.git'); const a = path.join(d, 'a'); const b = path.join(d, 'b');
    git(d, 'init', '--bare', '-b', 'main', bare);
    git(d, 'clone', bare, a);
    write(path.join(a, 'f.txt'), '0'); git(a, 'add', '-A'); git(a, 'commit', '-m', 'c0'); git(a, 'branch', '-M', 'main'); git(a, 'push', '-u', 'origin', 'main');
    git(d, 'clone', bare, b);
    for (let i = 1; i <= 3; i++) { write(path.join(b, 'f.txt'), String(i)); git(b, 'commit', '-am', `c${i}`); }
    git(b, 'push', 'origin', 'main');
    const localSha = git(a, 'rev-parse', 'HEAD'); const remoteSha = git(b, 'rev-parse', 'HEAD');
    const r = run(['check', 'checkout', a]);
    assert.equal(r.code, 1, r.out + r.err);
    assert.ok(r.out.includes(localSha.slice(0, 12)), r.out);
    assert.ok(r.out.includes(remoteSha.slice(0, 12)), r.out);
    assert.match(r.out, /3 commit/);
    git(a, 'pull', '--ff-only');
    const r2 = run(['check', 'checkout', a]);
    assert.equal(r2.code, 0, r2.out);
    write(path.join(a, 'dirty.txt'), 'x');
    const r3 = run(['check', 'checkout', a, '--json']);
    assert.equal(r3.code, 0);
    assert.equal(JSON.parse(r3.out)[0].uncommitted, 1);
    assert.equal(run(['check', 'checkout', d]).code, 2);
    assert.equal(run(['check', 'checkout']).code, 2);
  } finally { rm(d); }
});
