# doc-it: owner questions before standard v1

Each has a recommendation. These decide the standard for every project that adopts doc-it, not just the pilot.

1. **Roles and tiers.** Adopt the eight roles and six tiers in `STANDARD.md` §1–§2 as written? **Recommend yes.**
2. **What the archive means.** Keep one archive folder, reachable only through a guarded close or a `CLOSEOUT.md` (DS-3)? Or split it into "shipped" and "stopped"? **Recommend one folder plus the closeout.**
3. **One board format.** `status.json` plus a generated `STATUS.md` with age and last-evidence date on its first line, for active programs; archived ones carry the closeout instead? **Recommend yes.**
4. **Expired `current` docs.** When DS-4 is first applied to a project, downgrade every expired doc to `needs-review` at once by script, or re-verify the most-read first? **Recommend downgrade at once: an honest label beats a false one.**
5. **Expiry default.** 60 days for DS-4, overridable per project? **Recommend yes.**

---
_Authored by [DevOtts](https://github.com/DevOtts)._
