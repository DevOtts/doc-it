// CP-03 round 2 adversarial regressions (do-it 1.1, archive A1, G-2 / G-10). Each case replays the reviewer's exact
// evidence strings and asserts doc-it refuses them, naming the row. Authored by DevOtts (https://github.com/DevOtts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmp, rm, run, write, config, git } from './helpers.mjs';

const HEAD = '# CLOSEOUT: demo\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n';
const lint = (dir, rows, extra = []) => { const f = path.join(dir, 'CLOSEOUT.md'); write(f, HEAD + rows.map((r) => `| ${r.join(' | ')} | |`).join('\n') + '\n'); return run(['check', 'closeout', f, '--root', dir, ...extra]); };
// <parent>/<name> as a git repo with one commit; returns its full sha.
function repoAt(dir) { fs.mkdirSync(dir, { recursive: true }); git(dir, 'init', '-q'); write(path.join(dir, 'a.txt'), dir); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'a'); return git(dir, 'rev-parse', 'HEAD'); }

test('R2-A1-M4 shipped "foo@deadbee1" (no repo foo, no such sha) is refused, naming the row and the repo', () => {
  const p = tmp(); const root = path.join(p, 'proj');
  try {
    repoAt(root);
    const r = lint(root, [['Core', 'shipped', 'foo@deadbee1']]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /row "Core": shipped evidence foo@deadbee1 does not resolve: no repo "foo"/);
    // also outside any git repo
    const plain = tmp();
    try { const q = lint(plain, [['Core', 'shipped', 'foo@deadbee1']]); assert.equal(q.code, 1, q.out); assert.match(q.out, /no repo "foo"/); } finally { rm(plain); }
  } finally { rm(p); }
});

test('R2-A1-M4 repo@sha resolves in the --root repo, a sibling folder, or --repos; a missing sha there is refused', () => {
  const p = tmp(); const root = path.join(p, 'proj'); const sib = path.join(p, 'lib'); const far = path.join(tmp(), 'elsewhere');
  try {
    const rootSha = repoAt(root); const sibSha = repoAt(sib); const farSha = repoAt(far);
    assert.equal(lint(root, [['Core', 'shipped', `proj@${rootSha.slice(0, 9)}`]]).code, 0, 'the --root repo by folder name');
    git(root, 'remote', 'add', 'origin', 'git@example.invalid:owner/renamed.git');
    assert.equal(lint(root, [['Core', 'shipped', `owner/renamed@${rootSha.slice(0, 9)}`]]).code, 0, 'the --root repo by origin name');
    assert.equal(lint(root, [['Core', 'shipped', `lib@${sibSha.slice(0, 7)}`]]).code, 0, 'a sibling folder');
    assert.equal(lint(root, [['Core', 'shipped', `far@${farSha.slice(0, 7)}`]], ['--repos', `far=${far}`]).code, 0, '--repos name=path');
    // a sha of ANOTHER repo cited under a known repo name: refused
    const wrong = lint(root, [['Core', 'shipped', `lib@${farSha.slice(0, 9)}`]]);
    assert.equal(wrong.code, 1, wrong.out); assert.match(wrong.out, /row "Core": shipped evidence lib@[0-9a-f]{9} does not resolve: [0-9a-f]{9} is not a commit in /);
    // unknown repo name next to a valid citation still fails the row
    const mixed = lint(root, [['Core', 'shipped', `PR #12 and foo@deadbee1`]]);
    assert.equal(mixed.code, 1, mixed.out); assert.match(mixed.out, /foo@deadbee1 does not resolve/);
    // --repos pointing at a subfolder of a repo is not that repo (git -C would walk up)
    fs.mkdirSync(path.join(root, 'sub'));
    const walk = lint(root, [['Core', 'shipped', `x@${rootSha.slice(0, 9)}`]], ['--repos', `x=${path.join(root, 'sub')}`]);
    assert.equal(walk.code, 1, walk.out); assert.match(walk.out, /is not a git repository's top folder/);
    assert.equal(run(['check', 'closeout', path.join(root, 'CLOSEOUT.md'), '--repos', 'nameonly']).code, 2, 'a bad --repos entry is a usage error');
  } finally { rm(p); rm(path.dirname(far)); }
});

test('R2-A1-M4 "#0", "#01" and an absurd "#1234567" are refused; "#999999" and "nobody/nothing#1" stay format-only (offline limit)', () => {
  const d = tmp();
  try {
    for (const bad of ['#0', 'PR #0 merged', 'owner/repo#0', '#01', '#1234567']) {
      const r = lint(d, [['Core', 'shipped', bad]]);
      assert.equal(r.code, 1, `"${bad}" must be refused: ${r.out}`);
      assert.match(r.out, /row "Core": shipped evidence \S*#\d+ is not a PR or issue number/);
    }
    // documented limit (STANDARD section 5): doc-it is offline, so a well-formed #n is not looked up
    for (const formatOnly of ['#999999', 'nobody/nothing#1']) assert.equal(lint(d, [['Core', 'shipped', formatOnly]]).code, 0, formatOnly);
  } finally { rm(d); }
});

