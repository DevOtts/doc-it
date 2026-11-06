# doc-it learnings

Append-only. Each lesson states what happened, the evidence, and what doc-it does about it. Evidence is from the pilot consumer repo (measured 2026-11-06); its project-specific measurements stay in that repo's own docs program. Lessons are written project-neutral so any adopter can use them.

## L1. A convention without a running check rots silently

- **What:** the pilot made `verified:` mandatory and `status: current` "earned" four months earlier, and planned a spot-check about four weeks later. The spot-check never ran.
- **Evidence:** 159 of 369 `current` docs had `verified:` older than 60 days.
- **doc-it:** ships every rule as a script run at session close or on a schedule (DS-4, DS-8).

## L2. Folder location is not status

- **What:** the archive folder was read as "shipped" but used as "we stopped working on it".
- **Evidence:** 12 archived programs still showed open rows; one was archived with 48 of 48 tasks not started while half of it had merged. Root cause: the harness has a guarded close, but conclude-it's archive step moved folders with a plain `git mv`. 3 of 3 archived programs with a board showed `closed: false`; one disposition lived only in the commit message.
- **doc-it:** the archive is reachable only through a guarded close or a closeout (DS-3).

## L3. Hand-maintained boards drift from the code

- **What:** a board rendered from `status.json` faithfully showed a stale truth because the run never updated it.
- **Evidence:** a board at 0% dated the same day two of its epics merged.
- **doc-it:** status is derived from evidence, or the board shows its age (DS-2).

## L4. Without a source hierarchy, every store counts as truth

- **What:** an architecture analysis quoted an old study, a stale board and a subagent report with the same weight as code, and was corrected four times.
- **Evidence:** the audit found 67 claims: 54 true, 10 partial, 3 unverifiable.
- **doc-it:** every doc has a role and every claim a tier (§1, §2).

## L5. Many stores, no owner per fact

- **What:** the same facts were restated in reference docs, two plan homes, 243 agent-memory files, a notes vault and session cards.
- **doc-it:** a one-home map; others link, never restate (DS-1).

## L6. A study keeps being read as current after the code moves on

- **What:** a study said "fresh browser profile per job"; the fix that made profiles persist was older than the study, and a later analysis cited the study as fact.
- **doc-it:** program docs record the `repo@sha` they read and are flagged when it changes (DS-5).

## L7. Measure before redesigning

- **What:** the first instinct was a new convention; the archive showed a prior program had already designed most of it. The problem was enforcement.
- **doc-it:** measure existing conventions first (DS-7).

## L8. The analyst's own checkout can be the stale source

- **What:** a diagnosis read a local `main` 24 commits behind `origin/main`. The bug was real, the description wrong.
- **doc-it:** compare each checkout with its remote before analysis (DS-6).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
