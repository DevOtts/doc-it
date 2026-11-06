# doc-it standard v0 (draft, 2026-11-06)

Project-neutral. A project adopts it by mapping its own folders to the roles in §1; everything else applies unchanged. Defaults are marked and can be overridden per project in `.doc-it/config.json` (written by doc-it's first-run interview). Each rule cites the lesson it comes from (`LEARNINGS.md`).

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

## 3. Rules

| ID | Rule | From |
|---|---|---|
| DS-1 | **One home per fact kind.** A one-home map names the owning role and path for each kind of fact. Other places link to it and never restate it. A restatement that disagrees with its owner is flagged | L5 |
| DS-2 | **Status is derived.** A board states only what evidence supports (merged PR, sha reachable from the default branch, deploy record), or prints its own age and last-evidence date on its first line | L3 |
| DS-3 | **Archive only through a closeout.** Moving a program to the archive requires a guarded close (board closed with every task verified or an owner note) or a `CLOSEOUT.md` listing every piece as shipped (with evidence), dropped, or carried over (with a backlog link). Folder location alone never means "shipped" | L2 |
| DS-4 | **`current` expires.** A durable doc whose `verified:` is older than the limit (default 60 days) drops to `needs-review` by rule | L1 |
| DS-5 | **Program docs record what they read.** A study or plan lists the `repo@sha` paths it was grounded on; when code at those paths changes, the doc is flagged for review. When a program ships or is superseded it gets a banner pointing to where the truth now lives | L6 |
| DS-6 | **Read current code.** Before analysis, every checkout read is compared with its remote; a checkout that is behind is refused or read through `origin/<default>` | L8 |
| DS-7 | **Measure before redesigning.** A docs task first finds the existing conventions and measures how well they are kept | L7 |
| DS-8 | **Every rule ships as a check.** Each rule above has a script; consumers run them (conclude-it at session close, plan-it at pre-grounding). A rule with no running check is not part of the standard | L1 |

## 4. Not in v0

Thresholds beyond DS-4's default, the config schema, the check scripts and their exit codes, and how pointers (memory) are pruned. These are designed with the plugin.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
