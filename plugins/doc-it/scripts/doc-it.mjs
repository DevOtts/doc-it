#!/usr/bin/env node
// doc-it CLI. Zero dependencies. Read-only checks except `init`, which writes .doc-it/config.json.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
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
  archive: `doc-it check archive [--root <dir>] [--stale-hours N] [--summary] [--json]
--summary: counts per finding kind, done_unclosed, done_closed_unverified and done_board_mismatch in full, at most 10 entries of every other list ("+N more"). JSON keeps all lists.
Config field archive_since (YYYY-MM-DD, default unset): archive packages with no board and no CLOSEOUT whose last commit (or newest file mtime outside git) predates it are counted in legacy_count instead of done_without_closeout; a date later than today is a config error (exit 2). done_unclosed and done_closed_unverified are never hidden.
Read-only. Reports done_unclosed (archive package whose status.json has closed:false), done_closed_unverified (closed:true that the board writer's freeze does not back: no close history entry by conclude-it, no board_sha256, or a board changed after the close), done_board_mismatch (an archived status.json whose implementation names another package, e.g. a copy of another package's closed board), done_without_closeout (no status.json and no CLOSEOUT.md), stale_active (active package whose board updated_at is older than --stale-hours while newer files exist) and unowned (top-level paths with no role).
Exit 0 clean, 1 findings, 2 config missing ("run doc-it init") or usage error.`,
  closeout: `doc-it check closeout <file> [--root <dir>] [--repos name=path[,name=path]] [--json]
Lints a CLOSEOUT.md table: one row per piece; shipped needs evidence, dropped needs a reason, carried needs a backlog link: an existing relative path (from the CLOSEOUT's folder or the repo root) or an http(s) URL. Failure names the row. Exit 0 / 1 / 2.
shipped evidence must cite at least one checkable thing: a PR or issue reference (#12, owner/repo#12), an http(s) URL with a dotted host and a path (https://host/x; a bare host is refused), repo@sha (7-40 hex) that resolves, an existing file path, or a bare commit sha (7-40 hex) that exists in the --root repo (outside a git repo: 7-40 hex with a digit). "yes", "done", "merged" alone are refused.
repo@sha resolves in: the --root repo when <repo> is its folder or origin name, a sibling folder <root>/../<repo> that is a repo, or --repos <repo>=<path>. An unknown repo or a sha that is not a commit there fails the row, even next to other evidence.
#n must be a positive number, no leading zero, at most 6 digits (#0 is refused). doc-it is offline: #n and URLs are format-checked only, and a sha that resolves is not proof that it shipped (it is not checked to be on the default branch).
dropped reason must have at least 3 distinct words of 2+ letters ("." or "no no no" are refused).`,
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
      const put = (k, v) => { flags[k] = (k === 'repos' && typeof flags[k] === 'string' && typeof v === 'string') ? `${flags[k]},${v}` : v; };
      if (eq > 0) { put(a.slice(2, eq), a.slice(eq + 1)); continue; }
      const k = a.slice(2);
      const next = argv[i + 1];
      if (['json', 'yes', 'force', 'help', 'no-fetch', 'summary'].includes(k) || next === undefined || next.startsWith('--')) put(k, true);
      else { put(k, next); i++; }
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
  if (cfg.archive_since !== undefined && cfg.archive_since !== null && (typeof cfg.archive_since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cfg.archive_since) || Number.isNaN(Date.parse(cfg.archive_since + 'T00:00:00Z')))) throw new Usage('archive_since in config.json must be YYYY-MM-DD');
  // CP-03 R2-L9: a date in the future would move every boardless archive package into legacy_count.
  if (cfg.archive_since && Date.parse(cfg.archive_since + 'T00:00:00Z') > Date.now()) throw new Usage(`archive_since ${cfg.archive_since} in config.json is later than today; it would hide every archive package without a board or CLOSEOUT`);
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
  // A status.json that is not a JSON object (empty, `null`, a number) is still a board file: invalid, never "no board".
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j !== null && typeof j === 'object' && !Array.isArray(j) ? j : { __invalid: true }; } catch { return { __invalid: true }; }
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

// Last-touched time of a package: last commit when tracked in git, else newest file mtime.
function lastTouchedMs(root, dir) {
  try {
    const t = execFileSync('git', ['log', '-1', '--format=%ct', '--', dir], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (t) return Number(t) * 1000;
  } catch { /* not a git repo */ }
  return newestMtime(dir, null);
}

// A closed board must be backed by the writer's freeze (CP-03 A1-H1): the last "*" history entry is a close by
// conclude-it carrying board_sha256, and that digest still matches the board. The digest is the board writer's
// (build-it status-write >= 4.2.0): sha256 of the board as canonical JSON (keys sorted at every depth), leaving out
// updated_at, rechecks and every history entry after the close entry; the close entry itself is covered without its
// board_sha256 field (CP-03 R2-L3: its owner note cannot be rewritten). Returns the reason it is not backed, or null.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const canonical = (v) => (Array.isArray(v) ? v.map(canonical) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
function unprovenClose(board) {
  const h = Array.isArray(board.history) ? board.history : [];
  let ci = -1;
  for (let i = h.length - 1; i >= 0; i--) if (isObj(h[i]) && h[i].task === '*') { ci = h[i].to === 'closed' ? i : -2; break; }
  if (ci < 0) return 'closed:true but no close history entry backs it';
  const e = h[ci];
  if (e.by !== 'conclude-it') return `close entry by "${e.by}", not conclude-it`;
  if (typeof e.board_sha256 !== 'string') return 'close entry has no board_sha256 (not frozen by the board writer)';
  const { updated_at: _u, rechecks: _r, ...rest } = board;
  const { board_sha256: _d, ...entry } = e;
  rest.history = [...h.slice(0, ci), entry];
  if (crypto.createHash('sha256').update(JSON.stringify(canonical(rest))).digest('hex') !== e.board_sha256) return 'board changed after its close (board_sha256 mismatch)';
  return null;
}

function checkArchive(root, cfg, staleHours) {
  const res = { done_unclosed: [], done_without_closeout: [], stale_active: [], unowned: [], done_closed_unverified: [], done_board_mismatch: [] };
  const since = cfg.archive_since ? Date.parse(cfg.archive_since + 'T00:00:00Z') : null;
  let legacy = 0;
  const archives = archivePaths(cfg).map((p) => abs(root, p));
  for (const a of archives) {
    for (const name of subdirs(a)) {
      const dir = path.join(a, name);
      const rel = path.relative(root, dir);
      const board = readBoard(dir);
      // An open board in the archive is always a finding: archive_since never hides done_unclosed.
      if (board) {
        // CP-03 R4-A1-M7: a board names its package in `implementation`; one that names another package (a copy of
        //   someone else's closed board) does not belong to this folder. A placeholder with no name or no JSON object
        //   is already done_unclosed.
        if (!board.__invalid && 'implementation' in board && board.implementation !== name) res.done_board_mismatch.push(rel);
        if (board.__invalid || board.closed !== true) res.done_unclosed.push(rel);
        else if (unprovenClose(board)) res.done_closed_unverified.push(rel);
        continue;
      }
      if (isFile(path.join(dir, 'CLOSEOUT.md'))) continue;
      if (since !== null && lastTouchedMs(root, dir) < since) { legacy++; continue; }
      res.done_without_closeout.push(rel);
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
  if (since !== null) res.legacy_count = legacy;
  return res;
}

function cmdCheckArchive(flags) {
  const root = path.resolve(flags.root || process.cwd());
  const cfg = loadConfig(root);
  const staleHours = flags['stale-hours'] ? num(flags['stale-hours'], '--stale-hours') : cfg.stale_hours;
  const res = checkArchive(root, cfg, staleHours);
  const n = Object.values(res).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
  if (flags.json) out(JSON.stringify(res, null, 2));
  else {
    const cap = (k) => (flags.summary && !['done_unclosed', 'done_closed_unverified', 'done_board_mismatch'].includes(k) ? 10 : Infinity);
    const sect = (k, title) => {
      if (!res[k].length) return;
      out(`${title} (${res[k].length}):`);
      res[k].slice(0, cap(k)).forEach((x) => out(`  ${x}`));
      if (res[k].length > cap(k)) out(`  +${res[k].length - cap(k)} more`);
    };
    if (flags.summary) out(`summary: ${Object.keys(res).filter((k) => Array.isArray(res[k])).map((k) => `${k}=${res[k].length}`).join(' ')}${res.legacy_count !== undefined ? ` legacy_count=${res.legacy_count}` : ''}`);
    else if (res.legacy_count) out(`legacy_count=${res.legacy_count} (before archive_since ${cfg.archive_since})`);
    sect('done_unclosed', 'archived but board not closed');
    sect('done_closed_unverified', 'archived, board says closed but no writer freeze backs it (set by hand or edited after close)');
    sect('done_without_closeout', 'archived with no board and no CLOSEOUT.md');
    sect('done_board_mismatch', "archived board whose implementation is not its folder's name (a copy of another package's board)");
    sect('stale_active', 'active board older than stale limit while newer files exist');
    sect('unowned', 'paths with no role (unowned)');
    if (!n) out('clean');
  }
  return n ? 1 : 0;
}

// ---------- check closeout ----------
const PLACEHOLDER = /^(<[^>]*>|todo|tbd|n\/a|-+|\?+)?$/i;
const blank = (s) => PLACEHOLDER.test(s.trim());
// A backlog link is an http(s) URL or a relative path that exists (from the CLOSEOUT's folder or the repo root).
function validLink(raw, bases) {
  let l = raw.trim().replace(/`/g, '');
  const md = l.match(/^\[[^\]]*\]\(([^)]+)\)$/);
  if (md) l = md[1].trim();
  // A URL needs a dotted host (https://x is not a backlog item).
  if (/^https?:\/\//i.test(l)) return /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(l);
  l = l.split('#')[0];
  if (!l || /^[a-z][a-z0-9+.-]*:/i.test(l) || path.isAbsolute(l)) return false;
  // A path must name an existing FILE inside one of the bases: not `.`, `..`, a bare directory, or an escape.
  return bases.some((b) => {
    try {
      const f = path.resolve(b, l); const rel = path.relative(path.resolve(b), f);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
      return fs.statSync(f).isFile();
    } catch { return false; }
  });
}
// CP-03 A1-M2: `shipped` evidence must cite something a reader can check, and a `dropped` reason must say why.
// Evidence counts when it contains at least one of: a PR or issue reference (`#12`, `owner/repo#12`), an http(s) URL
// with a dotted host and a path (R3-L1), `repo@sha` (7-40 hex) that resolves, an existing file path (same bases as backlog links), or a
// bare commit sha (7-40 hex) that resolves to a commit in the repo under --root (outside a git repo: 7-40 hex with at
// least one digit).
// CP-03 R2-A1-M4: a citation that is present but false fails the row even when another citation passes:
//   - `repo@sha` must resolve: the repo is the --root repo (name = its folder or its origin's repo name), a sibling
//     folder `<root>/../<repo>` that is a repo of its own, or one named by `--repos name=path`; the sha must be a
//     commit there. An unknown repo or a missing sha is refused, naming the row.
//   - `#n` / `owner/repo#n` must be a positive number with no leading zero and at most 6 digits (`#0` is refused).
//     doc-it is offline, so `#n` is format-only (STANDARD section 5, documented limit).
// A reason counts when it has at least 3 DISTINCT words of 2+ letters and is not a placeholder (R2-L4).
const HEX = /^[0-9a-f]{7,40}$/i;
const MAX_REF_DIGITS = 6;
function gitOk(cwd, ...args) {
  try { execFileSync('git', args, { cwd, stdio: 'ignore' }); return true; } catch { return false; }
}
function gitOut(cwd, ...args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
function commitResolves(gitRoot, sha) {
  if (!gitRoot) return /\d/.test(sha);
  return gitOk(gitRoot, 'cat-file', '-e', `${sha}^{commit}`);
}
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return null; } };
// A folder counts as a repo only when it IS a repo's top level: `git -C` would otherwise walk up into an enclosing repo.
function isRepoTop(dir) {
  const r = real(dir); if (!r || !isDir(r)) return false;
  const top = gitOut(r, 'rev-parse', '--show-toplevel');
  return !!top && real(top) === r;
}
const repoKey = (name) => name.replace(/\.git$/i, '').split('/').filter(Boolean).pop()?.toLowerCase() || '';
// --repos name=path[,name=path...] (repeatable). A bad entry is a usage error.
function parseRepos(v) {
  const m = new Map();
  if (v === undefined) return m;
  if (v === true) throw new Usage('--repos needs name=path');
  for (const ent of String(v).split(',').map((x) => x.trim()).filter(Boolean)) {
    const eq = ent.indexOf('=');
    const name = eq > 0 ? ent.slice(0, eq).trim() : ''; const p = eq > 0 ? ent.slice(eq + 1).trim() : '';
    if (!name || !p) throw new Usage(`--repos entry "${ent}" must be name=path`);
    m.set(repoKey(name), path.resolve(p));
  }
  return m;
}
// Where `<name>@sha` lives: { dir } or { why } (why the repo could not be found).
function resolveRepo(name, ctx) {
  const key = repoKey(name);
  const pinned = ctx.repos.get(key);
  if (pinned) return isRepoTop(pinned) ? { dir: pinned } : { why: `--repos ${key}=${pinned} is not a git repository's top folder` };
  const top = ctx.gitTop;
  if (top) {
    if (path.basename(top).toLowerCase() === key) return { dir: top };
    const origin = gitOut(top, 'remote', 'get-url', 'origin');
    if (origin && repoKey(origin.replace(/^.*[:/]([^:/]+\/[^:/]+)$/, '$1')) === key) return { dir: top };
  }
  const sib = path.join(path.dirname(top || ctx.root), key);
  if (isRepoTop(sib)) return { dir: sib };
  return { why: `no repo "${key}": not the --root repo (folder or origin name), no sibling folder ../${key}, not in --repos name=path` };
}
// Returns { cited, bad: [why...] }.
function evidenceCites(detail, bases, gitRoot, ctx) {
  const t = detail.replace(/`/g, ' ');
  let cited = false; const bad = [];
  for (const m of t.matchAll(/(^|[\s(\[,;:])((?:[\w.-]+\/[\w.-]+)?#(\d+))\b/g)) {
    const n = m[3];
    if (/^0/.test(n) || n.length > MAX_REF_DIGITS) bad.push(`${m[2]} is not a PR or issue number (positive, no leading zero, at most ${MAX_REF_DIGITS} digits)`);
    else cited = true;
  }
  const tokens = t.split(/\s+/).map((x) => x.replace(/^[(\[<"']+|[)\]>"'.,;:!?]+$/g, '')).filter(Boolean);
  for (let tok of tokens) {
    const md = tok.match(/^\[[^\]]*\]\(([^)]+)\)$/); if (md) tok = md[1];
    // CP-03 R3-L1: a URL counts only with a path after the host (`http://a.b` names no PR, commit or record).
    if (/^https?:\/\//i.test(tok)) { if (/^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?\/[^\s/?#]\S*$/i.test(tok)) cited = true; continue; }
    const at = tok.match(/^([\w./-]+)@([0-9a-f]{7,40})$/i);
    if (at) {
      const repo = resolveRepo(at[1], ctx);
      if (repo.why) bad.push(`${tok} does not resolve: ${repo.why}`);
      else if (!gitOk(repo.dir, 'cat-file', '-e', `${at[2]}^{commit}`)) bad.push(`${tok} does not resolve: ${at[2]} is not a commit in ${repo.dir}`);
      else cited = true;
      continue;
    }
    if (HEX.test(tok)) { if (commitResolves(gitRoot, tok)) cited = true; continue; }
    if (/[/.]/.test(tok) && validLink(tok, bases)) cited = true;
  }
  return { cited, bad };
}
function reasonSays(detail) {
  if (blank(detail)) return false;
  const words = detail.split(/\s+/).filter((w) => (w.match(/\p{L}/gu) || []).length >= 2).map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  return new Set(words).size >= 3;
}
function lintCloseout(text, bases = [], gitRoot = null, ctx = { root: process.cwd(), gitTop: null, repos: new Map() }) {
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
    if (disp === 'shipped') {
      if (blank(detail)) problems.push(`row "${piece}": shipped needs evidence`);
      else {
        const ev = evidenceCites(detail, bases, gitRoot, ctx);
        if (ev.bad.length) for (const b of ev.bad) problems.push(`row "${piece}": shipped evidence ${b}; got "${detail}"`);
        else if (!ev.cited) problems.push(`row "${piece}": shipped evidence must cite something checkable (a #PR or issue, an http(s) URL with a path, repo@sha that resolves, a commit sha that exists in this repo, or an existing path); got "${detail}"`);
      }
    } else if (disp === 'dropped') {
      if (blank(detail)) problems.push(`row "${piece}": dropped needs a reason`);
      else if (!reasonSays(detail)) problems.push(`row "${piece}": dropped needs a reason of at least 3 distinct words; got "${detail}"`);
    }
    else if (disp === 'carried') {
      if (blank(link) || !validLink(link, bases)) problems.push(`row "${piece}": carried needs a backlog link (an existing relative path or an http(s) URL; got "${link}")`);
    } else problems.push(`row "${piece}": disposition must be shipped, dropped or carried (got "${cells[cols.disp] || ''}")`);
  }
  if (rows === 0) problems.push('no piece rows found (expected a table with columns Piece | Disposition | Evidence or reason | Backlog link)');
  return { rows, problems };
}
function repoRoot(dir) {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return process.cwd(); }
}
function cmdCheckCloseout(flags, pos) {
  if (!pos[0]) throw new Usage('usage: doc-it check closeout <file>');
  if (!isFile(pos[0])) throw new Usage(`not a file: ${pos[0]}`);
  const file = path.resolve(pos[0]);
  const root = path.resolve(flags.root || repoRoot(path.dirname(file)));
  const bases = [path.dirname(file), root];
  let gitRoot = null;
  try { execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: root, stdio: 'ignore' }); gitRoot = root; } catch { /* not a git repo, or no commits */ }
  const repos = parseRepos(flags.repos);
  const gitTop = gitOut(root, 'rev-parse', '--show-toplevel');
  const r = lintCloseout(fs.readFileSync(file, 'utf8'), bases, gitRoot, { root, gitTop: gitTop ? (real(gitTop) || gitTop) : null, repos });
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
