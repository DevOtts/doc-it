# doc-it

The documentation companion of the DevOtts *-it harness (do-it, prompt-it, plan-it, build-it, review-it, conclude-it, init-it). doc-it owns the rules that decide which doc a reader or an agent may trust, and ships them as checks that run, not as conventions that rot.

| Field | Value |
|---|---|
| Status | **0.1.0.** Standard v0.1 and the first checks (DS-3, DS-4, DS-6, board age of DS-2) |
| Repo | `DevOtts/doc-it` |
| Owner rulings | do-it 1.1 DECISIONS D11-D14, R2, R4, R5 (2026-11-06) |

## What doc-it is for

An analysis is only as good as the docs it reads. When old studies, stale boards, memory notes and code all count the same, an agent states stale things as fact and a reader cannot tell. doc-it gives every project the same answer to "which source wins", derived from evidence and checked by script.

## How the family uses it

| Consumer | Uses doc-it for |
|---|---|
| conclude-it | the debrief's "where does this fact live" and the supersession sweep; the archive move (guarded close, never a bare `git mv`) |
| plan-it | pre-grounding: source tiers, shipped-layer reads, stale-checkout refusal |
| review-it | the tier of each claim's source in the claim ledger |
| build-it | board freshness (status derived from evidence) |

A consumer that finds doc-it missing says so in its report. It never skips silently.

## Install

```
/plugin marketplace add DevOtts/doc-it
/plugin install doc-it@doc-it
```

Or run the CLI directly: `node scripts/doc-it.mjs <command>` (Node 18+, no dependencies).

## CLI reference

| Command | Does | Exit |
|---|---|---|
| `doc-it init [--yes] [--program p,..] [--archive p,..] [--durable p,..] ...` | writes `.doc-it/config.json` (interview, or flags) | 0 |
| `doc-it check archive [--root R] [--stale-hours N] [--summary] [--json]` | `done_unclosed`, `done_without_closeout`, `stale_active`, `unowned` (DS-3, DS-2 age) | 0 / 1 / 2 |
| `doc-it check closeout <file>` | lint a CLOSEOUT: shipped needs evidence, dropped a reason, carried a backlog link | 0 / 1 / 2 |
| `doc-it check checkout <repo...>` | HEAD vs `origin/<default>`; behind names both shas (DS-6) | 0 / 1 / 2 |
| `doc-it check expiry [--root R] [--json]` | durable docs with `verified:` older than `expiry_days` (default 60); report only (DS-4) | 0 / 1 / 2 |
| `doc-it tiers --json` | the six source tiers with `aliases`, `fact_ok` and a top-level alias map | 0 |
| `doc-it tiers resolve "<cell>"` | resolve a ledger Tier cell (`+`-joined, optional qualifier); unknown part exits 1 | 0 / 1 |
| `doc-it template closeout` | prints the CLOSEOUT template | 0 |

Exit 0 clean, 1 findings, 2 config or usage error (missing config: "run doc-it init"). Every command takes `--help`. Consumers call `doc-it template closeout`; they never copy the template.

## For consumers

Find the CLI in this order, and invoke it as `node <path> <args>`:

1. env `DOC_IT_CLI`: absolute path to `doc-it.mjs`.
2. the newest installed copy: `~/.claude/plugins/cache/<any marketplace>/doc-it/<version>/scripts/doc-it.mjs` (HOME-relative).
3. neither found: print exactly `[skip] doc-it not installed: <what was not checked>`. Never report that check as PASS and never fail because of it.

Stable names: `check archive --json`, `check closeout <file>`, `check checkout`, `check expiry`, `tiers --json`, `template closeout`. Never copy doc-it's rules, tier list or template.

## Files

- `docs/STANDARD.md`: the standard (v0.1). Project-neutral.
- `docs/LEARNINGS.md`: the lessons the standard comes from. Append-only.
- `docs/OWNER-QUESTIONS.md`: what the owner must ratify before v1.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
