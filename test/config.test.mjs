import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tmp, rm, run, write, config } from './helpers.mjs';

test('T-K1-04 no config: check archive exits 2 "run doc-it init"; unmapped notes/ is reported unowned', () => {
  const root = tmp();
  try {
    write(path.join(root, 'plans/0-done/a/CLOSEOUT.md'), '#');
    write(path.join(root, 'notes/n.md'), 'n');
    const r1 = run(['check', 'archive', '--root', root]);
    assert.equal(r1.code, 2);
    assert.match(r1.err, /run doc-it init/);
    config(root, { roles: { program: ['plans'] } });
    const r2 = run(['check', 'archive', '--root', root, '--json']);
    assert.deepEqual(JSON.parse(r2.out).unowned, ['notes/']);
    assert.equal(r2.code, 1);
    config(root, { roles: { program: ['plans'], pointer: ['notes'] } });
    assert.equal(run(['check', 'archive', '--root', root]).code, 0);
  } finally { rm(root); }
});

test('T-K1-04 init writes config non-interactively; refuses to overwrite without --force; bad config is exit 2', () => {
  const root = tmp();
  try {
    const r = run(['init', '--root', root, '--yes', '--program', 'docs/plans', '--durable', 'docs/ref', '--expiry-days', '30']);
    assert.equal(r.code, 0, r.err);
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.doc-it/config.json'), 'utf8'));
    assert.deepEqual(cfg.roles.program, ['docs/plans']);
    assert.deepEqual(cfg.roles.archive, ['docs/plans/0-done']);
    assert.equal(cfg.expiry_days, 30);
    assert.equal(run(['init', '--root', root, '--yes']).code, 2);
    assert.equal(run(['init', '--root', root, '--yes', '--force', '--program', 'p']).code, 0);
    write(path.join(root, '.doc-it/config.json'), '{ nope');
    assert.equal(run(['check', 'expiry', '--root', root]).code, 2);
    config(root, { roles: { bogus: ['x'] } });
    assert.equal(run(['check', 'archive', '--root', root]).code, 2);
  } finally { rm(root); }
});

test('T-K1-04 init interview reads answers from stdin', () => {
  const root = tmp();
  try {
    // order: program, archive, durable, generated, rules, pointer, code, live
    const r = run(['init', '--root', root], { input: 'plans\n\nref\n\n\nmem\n\n\n' });
    assert.equal(r.code, 0, r.err);
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.doc-it/config.json'), 'utf8'));
    assert.deepEqual(cfg.roles, { program: ['plans'], durable: ['ref'], pointer: ['mem'], archive: ['plans/0-done'] });
  } finally { rm(root); }
});
