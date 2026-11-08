# doc-it standard v0.1 (2026-11-06)

Project-neutral. Version 0.1 applies the owner rulings D13 (OWNER-QUESTIONS 1-5, each with its recommendation). A project adopts it by mapping its own folders to the roles in §1; everything else applies unchanged. Defaults are marked and can be overridden per project in `.doc-it/config.json` (written by doc-it's first-run interview). Each rule cites the lesson it comes from (`LEARNINGS.md`).

## 1. Roles

| Role | Holds | Trust |
|---|---|---|
| **live** | the running system, read at a date | highest, for that date |
| **code** | source at `repo@sha` | truth for behaviour |
| **generated** | docs rendered from code or data (catalogs, boards rendered from `status.json`) | as fresh as their generator run |
| **durable** | reference docs meant to stay true, with `verified:` and cited evidence | true while not expired (§3.4) |
| **program** | plans, studies, designs | intent, never truth about what shipped |
| **archive** | finished or stopped programs | historical; reachable only through a closeout (§3.3) |
| **rules** | binding instructions for agents (e.g. a project's agent-instructions file) | binding, not evidence |
| **pointer** | agent memory, notes vaults, session cards, subagent reports | where to look, never evidence |

A project maps each role to one or more paths. A path with no role is reported as unowned.

## 2. Source tiers

Every factual claim an analysis makes carries the tier of its source, from the table above: `live@date` · `code@repo@sha:path:line` · `generated` · `durable@verified` · `program` · `pointer`. A claim backed only by `program` or `pointer` may not be stated as fact (L4).

### Ledger spellings (aliases)

The six tiers are canonical. Claim ledgers written against the CONTRACT spelling stay valid: each spelling below resolves to one tier. A ledger Tier cell may join tiers with `+` and add a parenthetical qualifier (`code + local`, `code (absence)`); every part must resolve, and an unknown part is refused. `doc-it tiers --json` and `doc-it tiers resolve "<cell>"` are the source; consumers keep no copy.

| Tier | Accepted spellings | May be stated as fact |
|---|---|---|
| live | `live`, `live@<date>`, `local` | yes |
| code | `code`, `code@...`, `git` | yes |
| generated | `generated` | yes |
| durable | `durable`, `durable@...`, `durable-doc` | yes |
| program | `program`, `program-doc` | no |
| pointer | `pointer`, `transcript` | no |

## 3. Rules

| ID | Rule | From | In 0.1.0 |
|---|---|---|---|
| DS-1 | **One home per fact kind.** A one-home map names the owning role and path for each kind of fact. Other places link to it and never restate it. A restatement that disagrees with its owner is flagged | L5 | not yet checked |
| DS-2 | **Status is derived.** A board states only what evidence supports (merged PR, sha reachable from the default branch, deploy record), or prints its own age and last-evidence date on its first line | L3 | half checked: board age (`check archive` stale_active); evidence derivation not yet checked |
| DS-3 | **Archive only through a closeout.** Moving a program to the archive requires a guarded close (board closed with every task verified or an owner note) or a `CLOSEOUT.md` listing every piece as shipped (with evidence), dropped, or carried over (with a backlog link). Folder location alone never means "shipped" | L2 | checked (`check archive`, `check closeout`) |
| DS-4 | **`current` expires.** A durable doc whose `verified:` is older than the limit (default 60 days) drops to `needs-review` by rule | L1 | checked (`check expiry`) |
| DS-5 | **Program docs record what they read.** A study or plan lists the `repo@sha` paths it was grounded on; when code at those paths changes, the doc is flagged for review. When a program ships or is superseded it gets a banner pointing to where the truth now lives | L6 | not yet checked |
| DS-6 | **Read current code.** Before analysis, every checkout read is compared with its remote; a checkout that is behind is refused or read through `origin/<default>` | L8 | checked (`check checkout`) |
| DS-7 | **Measure before redesigning.** A docs task first finds the existing conventions and measures how well they are kept | L7 | not yet checked (a practice, no script) |
| DS-8 | **Every rule ships as a check.** Each rule above has a script; consumers run them (conclude-it at session close, plan-it at pre-grounding). A rule with no running check is not part of the standard | L1 | not yet checked (meta rule; holds only for rules marked checked) |

## 4. Decisions applied in 0.1 (D13)

1. **Roles and tiers.** The eight roles (§1) and six tiers (§2) are adopted as written. The tier enum is `live`, `code`, `generated`, `durable`, `program`, `pointer`, printed by `doc-it tiers --json`.
2. **One archive.** One archive folder, reachable only through a guarded close or a `CLOSEOUT.md` (DS-3). No split into "shipped" and "stopped"; the closeout row dispositions (`shipped`, `dropped`, `carried`) carry that distinction.
3. **One board format.** `status.json` plus a generated `STATUS.md` whose first line shows age and last-evidence date, for active programs. Archived programs carry the closeout instead. A board is *closed* when its `status.json` has `"closed": true`.
4. **Expired docs.** When DS-4 is first applied to a project, every expired doc is downgraded to `needs-review` at once. `doc-it check expiry` only reports; the downgrade is a separate, deliberate edit.
5. **Expiry default.** 60 days, overridable per project (`expiry_days`).

## 5. Config and exit codes (0.1)

`.doc-it/config.json`, written by `doc-it init`:

```json
{ "version": 1,
  "roles": { "program": ["docs/plans"], "archive": ["docs/plans/0-done"], "durable": ["docs/reference"] },
  "expiry_days": 60, "stale_hours": 72 }
```

- `roles` maps a role (§1) to paths relative to the repo root. `archive` defaults to `<program path>/0-done`. A top-level folder that no role covers is reported as **unowned**.
- `archive_since` (optional, `YYYY-MM-DD`, default unset): archive packages with no board and no `CLOSEOUT.md` whose last commit (last file mtime outside git) predates it are counted in `legacy_count` instead of `done_without_closeout`. An open board in the archive (`done_unclosed`) is always listed. Use it so a long legacy archive does not bury the real findings.
- All checks exit 0 clean, 1 findings, 2 config or usage error. A missing config is exit 2 with "run doc-it init".

### Check semantics

- **Archive (DS-3).** Each direct subfolder of an archive path is a package. `status.json` with `closed` not `true` is `done_unclosed`. No `status.json` and no `CLOSEOUT.md` is `done_without_closeout`. A `status.json` with `closed: true` that the board writer's freeze does not back is `done_closed_unverified`: the last `*` history entry must be a close by `conclude-it` carrying `board_sha256`, and that digest must still match the board (sha256 of the board as canonical JSON, keys sorted at every depth, leaving out `updated_at`, `rechecks` and the history from the close entry on; written by build-it `status-write close` >= 4.2.0). A hand-set `closed: true`, a close entry without a digest, or an edit after the close is reported; a board closed by an older writer is re-frozen with `reopen` and `close`. A package with a writer-closed board, or a CLOSEOUT, is clean (lint the CLOSEOUT separately with `check closeout`).
- **Stale board (DS-2, board-age half).** An active package (direct subfolder of a program path, outside the archive, not a numbered `N-done` or `N-backlog` bucket) with an open board is `stale_active` when its `updated_at` is older than `stale_hours` (default 72) *and* some other file in the package is newer than `updated_at`. The board claims nothing it cannot support, so work after the last update means the board is behind. Evidence derivation (merged PR, sha reachable) is not checked in 0.1.0.
- **CLOSEOUT (DS-3).** A table `Piece | Disposition | Evidence or reason | Backlog link`, one row per piece: `shipped` needs evidence, `dropped` a reason, `carried` a backlog link (path or URL). Template: `doc-it template closeout`.
  - `shipped` evidence must cite at least one checkable thing: a PR or issue reference (`#12`, `owner/repo#12`), an http(s) URL with a dotted host, `repo@sha` (7-40 hex) that resolves, an existing file path (from the CLOSEOUT's folder or the repo root), or a bare commit sha (7-40 hex) that exists in the `--root` repo. Outside a git repo a bare sha is format-checked only (7-40 hex with a digit). Text such as `yes`, `done` or `merged` alone is refused.
  - `repo@sha` must resolve. The repo is found as the `--root` repo (when `<repo>` is its folder name or its `origin` repo name), as a sibling folder `<root>/../<repo>` that is a repo's own top folder, or through `--repos <repo>=<path>` (comma-separated or repeated). An unknown repo, or a sha that is not a commit in that repo, fails the row even when the row also cites something valid: a false citation is worse than none.
  - `#n` and `owner/repo#n` must be a positive number with no leading zero and at most 6 digits; `#0` is refused.
  - **Documented limit:** doc-it is offline, so `#n`, `owner/repo#n` and URLs are checked for format only. A well-formed `#999999` or `nobody/nothing#1` passes; a reviewer who needs more opens the link.
  - A `dropped` reason needs at least 3 distinct words of 2+ letters; `.`, `no`, `no no no` or a placeholder is refused.
  - Not yet checked: that the rows cover every piece the program lists.
- **Checkout (DS-6).** `origin` is fetched, then HEAD is compared with `origin/<default>`; behind is exit 1 naming both shas. Uncommitted working-tree changes are reported, not failed.
- **Expiry (DS-4).** Markdown under the durable role with `verified: YYYY-MM-DD` older than `expiry_days` is reported, as is any doc with no `verified:`. Never rewrites.

## 6. Not yet in the standard

Checks for DS-1, DS-5, the evidence half of DS-2, and how pointers (memory) are pruned.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
