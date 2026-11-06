# doc-it

The documentation companion of the DevOtts *-it harness (do-it, prompt-it, plan-it, build-it, review-it, conclude-it, init-it). doc-it owns the rules that decide which doc a reader or an agent may trust, and ships them as checks that run, not as conventions that rot.

| Field | Value |
|---|---|
| Status | **design, not built.** Standard v0 drafted 2026-11-06; plugin designed after the pilot answers its owner questions |
| Repo | `DevOtts/doc-it` (planned; this folder is local and has no remote yet) |
| Owner rulings | do-it 1.1 DECISIONS R2, R4, R5 (2026-11-06) |

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

## Files

- `docs/STANDARD.md`: the standard (v0, draft). Project-neutral.
- `docs/LEARNINGS.md`: the lessons the standard comes from. Append-only.
- `docs/OWNER-QUESTIONS.md`: what the owner must ratify before v1.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
