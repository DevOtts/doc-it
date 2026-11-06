---
name: doc-it
description: Decide which doc an agent may trust, and prove it with scripts. Runs the doc-it checks - archive closeout (DS-3), checkout freshness (DS-6), durable-doc expiry (DS-4) - prints the source tier enum and the CLOSEOUT template. Use when the user says "/doc-it", "which doc is current", "is this archived program really done", "check my docs", "closeout this program", "is my checkout behind", or when conclude-it, plan-it or review-it ask for a tier, a CLOSEOUT template or a docs check. Read-only except `doc-it init`.
author: DevOtts
author_url: https://github.com/DevOtts
---

# doc-it

The standard lives in `docs/STANDARD.md` of the doc-it repo. This skill runs its checks. Locate the CLI as `scripts/doc-it.mjs` in the plugin (`${CLAUDE_PLUGIN_ROOT}/scripts/doc-it.mjs`); zero dependencies, Node 18+.

## Commands

| Need | Run |
|---|---|
| First-time setup for a repo | `node doc-it.mjs init` (asks which paths hold plans, archive, durable docs; `--yes --program docs/plans` for non-interactive) |
| Archived programs that are not really closed | `node doc-it.mjs check archive --json` |
| Lint a CLOSEOUT before archiving | `node doc-it.mjs check closeout <file>` |
| CLOSEOUT template (never copy it, ask for it) | `node doc-it.mjs template closeout` |
| Is my checkout behind its remote | `node doc-it.mjs check checkout <repo...>` |
| Durable docs past their `verified:` limit | `node doc-it.mjs check expiry --json` |
| Source tier of a claim | `node doc-it.mjs tiers --json` |

Exit codes: 0 clean, 1 findings, 2 config or usage error (missing config says "run doc-it init").

## How to act on results

1. Report findings as they are. The checks never fix; do not move, close or rewrite anything because a check flagged it.
2. A claim backed only by a `program` or `pointer` source is not stated as fact.
3. Archiving a program: close its board through the board writer, or write a CLOSEOUT from the template, lint it, then archive. A bare folder move never means "shipped".
4. If a rule is marked `not yet checked` in the standard, say so; do not report it as passing.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
