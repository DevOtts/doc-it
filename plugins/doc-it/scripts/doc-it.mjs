#!/usr/bin/env node
// doc-it CLI. Zero dependencies. Read-only checks except `init`, which writes .doc-it/config.json.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(HERE, '..', 'templates');

const ROLES = ['live', 'code', 'generated', 'durable', 'program', 'archive', 'rules', 'pointer'];
// STANDARD §2: six tiers, one per evidence role.
const TIERS = [
  { id: 'live', format: 'live@<date>', role: 'live', aliases: ['live@<date>', 'local'], fact_ok: true },
  { id: 'code', format: 'code@<repo>@<sha>:<path>:<line>', role: 'code', aliases: ['code@<ref>', 'git'], fact_ok: true },
  { id: 'generated', format: 'generated', role: 'generated', aliases: [], fact_ok: true },
  { id: 'durable', format: 'durable@<verified-date>', role: 'durable', aliases: ['durable@<verified-date>', 'durable-doc'], fact_ok: true },
  { id: 'program', format: 'program', role: 'program', aliases: ['program-doc'], fact_ok: false },
  { id: 'pointer', format: 'pointer', role: 'pointer', aliases: ['transcript'], fact_ok: false },
];
const ALIASES = Object.fromEntries(TIERS.flatMap((t) => [[t.id, t.id], ...t.aliases.map((a) => [a, t.id])]));
// `base@anything` resolves when base is a canonical tier that takes a qualifier.
function resolveTier(spelling) {
  if (ALIASES[spelling]) return ALIASES[spelling];
  const m = spelling.match(/^(live|code|durable)@\S+$/);
  return m ? m[1] : null;
}
function resolveCell(cell) {
  const bare = cell.replace(/\([^)]*\)/g, ' ').trim();
  const parts = bare.split('+').map((x) => x.trim());
  const res = []; const unknown = [];
  for (const sp of parts) {
    const id = sp ? resolveTier(sp) : null;
    if (!id) { unknown.push(sp); continue; }
    res.push({ spelling: sp, id, fact_ok: TIERS.find((t) => t.id === id).fact_ok });
  }
  return { parts: res, unknown };
}

const DEFAULTS = { expiry_days: 60, stale_hours: 72 };

const HELP = {
  main: `doc-it: documentation standard and checks

Usage: doc-it <command> [options]

Commands:
  init                       write .doc-it/config.json (interview, or flags)
  check archive              DS-3: unclosed / uncloseout'd archive packages, stale boards, unowned paths
  check closeout <file>      DS-3: lint a CLOSEOUT.md
  check checkout <repo...>   DS-6: compare HEAD and working tree with origin/<default>
  check expiry               DS-4: durable docs whose verified: date is too old (report only)
  tiers --json               the source tier enum (STANDARD section 2)
  template closeout          print the CLOSEOUT template

Every command accepts --help. Exit: 0 clean, 1 findings, 2 config or usage error.`,
  init: `doc-it init [--root <dir>] [--yes] [--force] [--<role> <path,path>]... [--expiry-days N] [--stale-hours N]
Roles: ${ROLES.join(', ')}. Without flags, asks a short interview (plans/archive/durable first). With --yes or any role flag, runs non-interactively.
The plans role is "program". Archive defaults to <program path>/0-done when not given.`,
  archive: `doc-it check archive [--root <dir>] [--stale-hours N] [--json]
Read-only. Reports done_unclosed (archive package whose status.json has closed:false), done_without_closeout (no status.json and no CLOSEOUT.md), stale_active (active package whose board updated_at is older than --stale-hours while newer files exist) and unowned (top-level paths with no role).
Exit 0 clean, 1 findings, 2 config missing ("run doc-it init") or usage error.`,
  closeout: `doc-it check closeout <file> [--json]
Lints a CLOSEOUT.md table: one row per piece; shipped needs evidence, dropped needs a reason, carried needs a backlog link. Failure names the row. Exit 0 / 1 / 2.`,
  checkout: `doc-it check checkout <repo...> [--no-fetch] [--json]
For each repo: fetch origin (unless --no-fetch), compare HEAD with origin/<default>. Exit 1 when behind, naming the local and remote sha. Also reports uncommitted changes in the working tree.`,
  expiry: `doc-it check expiry [--root <dir>] [--today YYYY-MM-DD] [--expiry-days N] [--json]
Report only; never rewrites. Scans markdown under the durable role for verified: older than expiry_days (default 60) and docs with no verified:. Exit 0 / 1 / 2.`,
  tiers: `doc-it tiers [--json]   print the six source tiers with aliases and fact_ok.\ndoc-it tiers resolve "<cell>"   resolve a ledger Tier cell ('+'-joined parts, optional (qualifier)); exit 1 naming an unknown part.`,
  template: `doc-it template closeout   print the CLOSEOUT template.`,
};

class Usage extends Error {}

function parseArgs(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2);
      const next = argv[i + 1];
      if (['json', 'yes', 'force', 'help', 'no-fetch'].includes(k) || next === undefined || next.startsWith('--')) flags[k] = true;
      else { flags[k] = next; i++; }
    } else pos.push(a);
  }
  return { flags, pos };
}

const out = (s) => process.stdout.write(s + '\n');
const err = (s) => process.stderr.write(s + '\n');
const abs = (root, p) => path.resolve(root, p);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Usage(`${name} must be a non-negative number`); return n; };

// ---------- config ----------
function loadConfig(root) {
  const f = path.join(root, '.doc-it', 'config.json');
  if (!isFile(f)) throw new Usage(`no .doc-it/config.json under ${root}: run doc-it init`);
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Usage(`invalid .doc-it/config.json (${e.message}): run doc-it init --force`); }
  if (!cfg || typeof cfg !== 'object' || typeof cfg.roles !== 'object' || cfg.roles === null) throw new Usage('config.json has no "roles" map: run doc-it init --force');
  for (const [r, v] of Object.entries(cfg.roles)) {
    if (!ROLES.includes(r)) throw new Usage(`unknown role "${r}" in config.json (roles: ${ROLES.join(', ')})`);
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Usage(`role "${r}" must be an array of paths`);
  }
  return { expiry_days: DEFAULTS.expiry_days, stale_hours: DEFAULTS.stale_hours, ...cfg };
}
const rolePaths = (cfg, role) => (cfg.roles[role] || []);
function archivePaths(cfg) {
  if (cfg.roles.archive && cfg.roles.archive.length) return cfg.roles.archive;
  return rolePaths(cfg, 'program').map((p) => path.join(p, '0-done'));
}

// ---------- init ----------
async function cmdInit(flags) {
  const root = path.resolve(flags.root || process.cwd());
  const file = path.join(root, '.doc-it', 'config.json');
  if (isFile(file) && !flags.force) throw new Usage(`${file} exists; pass --force to overwrite`);
  const roles = {};
  const split = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);
  for (const r of ROLES) if (flags[r] && flags[r] !== true) roles[r] = split(flags[r]);
  if (flags.plans && flags.plans !== true) roles.program = split(flags.plans);
  const interactive = !flags.yes && !ROLES.some((r) => flags[r]) && !flags.plans && process.stdin.isTTY !== false;
  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    const it = rl[Symbol.asyncIterator]();
    const ask = async (q) => { process.stderr.write(q); const n = await it.next(); return n.done ? '' : n.value; };
    err('doc-it init: map each role to paths relative to the repo root (comma separated, blank to skip).');
    const descr = { program: 'plans / studies / designs', archive: 'finished programs (blank = <plans>/0-done)', durable: 'reference docs with verified:', generated: 'rendered docs and boards', rules: 'agent-instruction files', pointer: 'memory, notes, session cards', code: 'source', live: 'running system' };
    for (const r of ['program', 'archive', 'durable', 'generated', 'rules', 'pointer', 'code', 'live']) {
      const a = (await ask(`${r} (${descr[r]}): `)).trim();
      if (a) roles[r] = split(a);
    }
    rl.close();
  }
  if (!roles.archive && roles.program) roles.archive = roles.program.map((p) => path.join(p, '0-done'));
  const cfg = {
    version: 1,
    roles,
    expiry_days: flags['expiry-days'] ? num(flags['expiry-days'], '--expiry-days') : DEFAULTS.expiry_days,
    stale_hours: flags['stale-hours'] ? num(flags['stale-hours'], '--stale-hours') : DEFAULTS.stale_hours,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  out(`wrote ${file}`);
  return 0;
}

// ---------- check archive ----------
function readBoard(dir) {
  const f = path.join(dir, 'status.json');
  if (!isFile(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { __invalid: true }; }
}
function newestMtime(dir, skip) {
  let newest = 0;
  const walk = (d, depth) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 6) walk(p, depth + 1); }
      else if (p !== skip) { try { newest = Math.max(newest, fs.statSync(p).mtimeMs); } catch { /* gone */ } }
    }
  };
  walk(dir, 0);
  return newest;
}
const subdirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { return []; } };

function topLevelUnowned(root, cfg) {
  const owned = Object.values(cfg.roles).flat().map((p) => path.relative(root, abs(root, p)));
  if (owned.some((p) => p === '' || p === '.')) return [];
  const unowned = [];
  let ents; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (!e.isDirectory()) continue;
    const rel = e.name;
    const covered = owned.some((o) => o === rel || o.startsWith(rel + path.sep) || rel.startsWith(o + path.sep));
    if (!covered) unowned.push(rel + '/');
  }
  return unowned;
}

function checkArchive(root, cfg, staleHours) {
  const res = { done_unclosed: [], done_without_closeout: [], stale_active: [], unowned: [] };
  const archives = archivePaths(cfg).map((p) => abs(root, p));
  for (const a of archives) {
    for (const name of subdirs(a)) {
      const dir = path.join(a, name);
      const rel = path.relative(root, dir);
      const board = readBoard(dir);
      if (board) { if (board.__invalid || board.closed !== true) res.done_unclosed.push(rel); }
      else if (!isFile(path.join(dir, 'CLOSEOUT.md'))) res.done_without_closeout.push(rel);
    }
  }
  const archiveSet = new Set(archives);
  const nowMs = Date.now();
  for (const p of rolePaths(cfg, 'program')) {
    const base = abs(root, p);
    if (archiveSet.has(base)) continue;
    for (const name of subdirs(base)) {
      const dir = path.join(base, name);
      if (archiveSet.has(dir) || /^\d+-(done|backlog)$/.test(name)) continue;
      const board = readBoard(dir);
      if (!board || board.__invalid || board.closed === true || !board.updated_at) continue;
      const upd = Date.parse(board.updated_at);
      if (Number.isNaN(upd)) continue;
      const ageH = (nowMs - upd) / 3600000;
      if (ageH <= staleHours) continue;
      if (newestMtime(dir, path.join(dir, 'status.json')) > upd) res.stale_active.push(path.relative(root, dir));
    }
  }
  res.unowned = topLevelUnowned(root, cfg);
  return res;
}

function cmdCheckArchive(flags) {
  const root = path.resolve(flags.root || process.cwd());
  const cfg = loadConfig(root);
  const staleHours = flags['stale-hours'] ? num(flags['stale-hours'], '--stale-hours') : cfg.stale_hours;
  const res = checkArchive(root, cfg, staleHours);
  const n = Object.values(res).reduce((s, a) => s + a.length, 0);
  if (flags.json) out(JSON.stringify(res, null, 2));
  else {
    const sect = (k, title) => { if (res[k].length) { out(`${title} (${res[k].length}):`); res[k].forEach((x) => out(`  ${x}`)); } };
    sect('done_unclosed', 'archived but board not closed');
    sect('done_without_closeout', 'archived with no board and no CLOSEOUT.md');
    sect('stale_active', 'active board older than stale limit while newer files exist');
    sect('unowned', 'paths with no role (unowned)');
    if (!n) out('clean');
  }
  return n ? 1 : 0;
}

// ---------- check closeout ----------
const PLACEHOLDER = /^(<[^>]*>|todo|tbd|n\/a|-+|\?+)?$/i;
const blank = (s) => PLACEHOLDER.test(s.trim());
function lintCloseout(text) {
  const problems = []; let rows = 0;
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  let cols = null;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) { if (cols && line.trim() === '') cols = null; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (!cols) {
      const low = cells.map((c) => c.toLowerCase());
      if (low[0] === 'piece' && low.includes('disposition')) cols = { disp: low.indexOf('disposition'), detail: low.findIndex((c) => /evidence|reason/.test(c)), link: low.findIndex((c) => /backlog/.test(c)) };
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const piece = cells[0] || '(no name)';
    const disp = (cells[cols.disp] || '').toLowerCase().replace(/`/g, '');
    const detail = cols.detail >= 0 ? (cells[cols.detail] || '') : '';
    const link = cols.link >= 0 ? (cells[cols.link] || '') : '';
    if (blank(piece) && !cells[0]) { continue; }
    rows++;
    if (disp === 'shipped') { if (blank(detail)) problems.push(`row "${piece}": shipped needs evidence`); }
    else if (disp === 'dropped') { if (blank(detail)) problems.push(`row "${piece}": dropped needs a reason`); }
    else if (disp === 'carried') {
      if (blank(link) || !/[\/#]|\.md|https?:/.test(link)) problems.push(`row "${piece}": carried needs a backlog link`);
    } else problems.push(`row "${piece}": disposition must be shipped, dropped or carried (got "${cells[cols.disp] || ''}")`);
  }
  if (rows === 0) problems.push('no piece rows found (expected a table with columns Piece | Disposition | Evidence or reason | Backlog link)');
  return { rows, problems };
}
function cmdCheckCloseout(flags, pos) {
  if (!pos[0]) throw new Usage('usage: doc-it check closeout <file>');
  if (!isFile(pos[0])) throw new Usage(`not a file: ${pos[0]}`);
  const r = lintCloseout(fs.readFileSync(pos[0], 'utf8'));
  if (flags.json) out(JSON.stringify(r, null, 2));
  else if (r.problems.length) r.problems.forEach((p) => out(`FAIL ${p}`));
  else out(`ok: ${r.rows} piece(s)`);
  return r.problems.length ? 1 : 0;
}

// ---------- check checkout ----------
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function checkoutOne(repo, noFetch) {
  const r = { repo, status: 'ok' };
  try { git(repo, 'rev-parse', '--git-dir'); } catch { return { repo, status: 'error', message: 'not a git repository' }; }
  if (!noFetch) { try { git(repo, 'fetch', '--quiet', 'origin'); } catch (e) { return { repo, status: 'error', message: `fetch failed: ${String(e.stderr || e.message).trim()}` }; } }
  let def;
  try { def = git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, ''); }
  catch {
    for (const c of ['main', 'master']) { try { git(repo, 'rev-parse', '--verify', `origin/${c}`); def = c; break; } catch { /* next */ } }
  }
  if (!def) return { repo, status: 'error', message: 'cannot determine origin default branch' };
  const local = git(repo, 'rev-parse', 'HEAD'); const remote = git(repo, 'rev-parse', `origin/${def}`);
  const behind = Number(git(repo, 'rev-list', '--count', `HEAD..origin/${def}`));
  const ahead = Number(git(repo, 'rev-list', '--count', `origin/${def}..HEAD`));
  const dirty = git(repo, 'status', '--porcelain').split('\n').filter(Boolean).length;
  Object.assign(r, { default_branch: def, local: local.slice(0, 12), remote: remote.slice(0, 12), behind, ahead, uncommitted: dirty });
  if (behind > 0) r.status = 'behind';
  return r;
}
function cmdCheckCheckout(flags, pos) {
  if (!pos.length) throw new Usage('usage: doc-it check checkout <repo...>');
  const results = pos.map((p) => checkoutOne(path.resolve(p), !!flags['no-fetch']));
  if (flags.json) out(JSON.stringify(results, null, 2));
  else for (const r of results) {
    if (r.status === 'error') out(`ERROR ${r.repo}: ${r.message}`);
    else if (r.status === 'behind') out(`BEHIND ${r.repo}: local ${r.local} is ${r.behind} commit(s) behind origin/${r.default_branch} ${r.remote}${r.uncommitted ? `; ${r.uncommitted} uncommitted change(s)` : ''}`);
    else out(`ok ${r.repo}: local ${r.local} = origin/${r.default_branch} ${r.remote}${r.ahead ? ` (+${r.ahead} ahead)` : ''}${r.uncommitted ? `; ${r.uncommitted} uncommitted change(s)` : ''}`);
  }
  if (results.some((r) => r.status === 'error')) return 2;
  return results.some((r) => r.status === 'behind') ? 1 : 0;
}

// ---------- check expiry ----------
function walkMd(dir, acc = []) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, acc); else if (/\.md$/i.test(e.name)) acc.push(p);
  }
  return acc;
}
function cmdCheckExpiry(flags) {
  const root = path.resolve(flags.root || process.cwd());
  const cfg = loadConfig(root);
  const days = flags['expiry-days'] ? num(flags['expiry-days'], '--expiry-days') : cfg.expiry_days;
  const today = flags.today ? Date.parse(flags.today + 'T00:00:00Z') : Date.UTC(...(() => { const d = new Date(); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; })());
  if (Number.isNaN(today)) throw new Usage('--today must be YYYY-MM-DD');
  const res = { expired: [], missing_verified: [], expiry_days: days };
  for (const p of rolePaths(cfg, 'durable')) {
    const base = abs(root, p);
    const files = isFile(base) ? [base] : walkMd(base);
    for (const f of files) {
      const head = fs.readFileSync(f, 'utf8').split('\n').slice(0, 40).join('\n');
      const m = head.match(/^verified:\s*["']?(\d{4}-\d{2}-\d{2})/m);
      const rel = path.relative(root, f);
      if (!m) { res.missing_verified.push(rel); continue; }
      const age = Math.floor((today - Date.parse(m[1] + 'T00:00:00Z')) / 86400000);
      if (age > days) res.expired.push({ path: rel, verified: m[1], age_days: age });
    }
  }
  const n = res.expired.length + res.missing_verified.length;
  if (flags.json) out(JSON.stringify(res, null, 2));
  else {
    res.expired.forEach((e) => out(`needs-review ${e.path}: verified ${e.verified} (${e.age_days} days, limit ${days})`));
    res.missing_verified.forEach((e) => out(`needs-review ${e}: no verified: date`));
    if (!n) out('clean');
  }
  return n ? 1 : 0;
}

// ---------- tiers / template ----------
function cmdTiers(flags, pos) {
  if (pos[0] === 'resolve') {
    if (pos[1] === undefined) throw new Usage('usage: doc-it tiers resolve "<tier cell>"');
    const r = resolveCell(pos[1]);
    if (r.unknown.length) { out(JSON.stringify({ parts: r.parts, unknown: r.unknown })); err(`unknown tier part: ${r.unknown.map((u) => `"${u}"`).join(', ')}`); return 1; }
    out(JSON.stringify({ parts: r.parts }, null, 2));
    return 0;
  }
  if (flags.json) out(JSON.stringify({ version: '0.1.0', tiers: TIERS.map((t) => t.id), details: TIERS, aliases: ALIASES }, null, 2));
  else TIERS.forEach((t) => out(`${t.id}\t${t.format}${t.aliases.length ? `\t(aliases: ${t.aliases.join(', ')})` : ''}`));
  return 0;
}
function cmdTemplate(pos) {
  if (pos[0] !== 'closeout') throw new Usage('usage: doc-it template closeout');
  process.stdout.write(fs.readFileSync(path.join(TEMPLATE_DIR, 'CLOSEOUT.md'), 'utf8'));
  return 0;
}

// ---------- dispatch ----------
async function main(argv) {
  const { flags, pos } = parseArgs(argv);
  const [cmd, sub] = pos;
  const helpFor = (k) => { out(HELP[k]); return 0; };
  if (!cmd) { if (flags.help) return helpFor('main'); err(HELP.main); return 2; }
  if (cmd === 'help') return helpFor('main');
  switch (cmd) {
    case 'init': return flags.help ? helpFor('init') : cmdInit(flags);
    case 'tiers': return flags.help ? helpFor('tiers') : cmdTiers(flags, pos.slice(1));
    case 'template': return flags.help ? helpFor('template') : cmdTemplate(pos.slice(1));
    case 'check':
      if (!sub) { if (flags.help) return helpFor('main'); throw new Usage('usage: doc-it check <archive|closeout|checkout|expiry>'); }
      if (sub === 'archive') return flags.help ? helpFor('archive') : cmdCheckArchive(flags);
      if (sub === 'closeout') return flags.help ? helpFor('closeout') : cmdCheckCloseout(flags, pos.slice(2));
      if (sub === 'checkout') return flags.help ? helpFor('checkout') : cmdCheckCheckout(flags, pos.slice(2));
      if (sub === 'expiry') return flags.help ? helpFor('expiry') : cmdCheckExpiry(flags);
      throw new Usage(`unknown check "${sub}"`);
    default: throw new Usage(`unknown command "${cmd}"`);
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  err(e instanceof Usage ? `doc-it: ${e.message}` : `doc-it: ${e.stack || e}`);
  process.exitCode = 2;
});
