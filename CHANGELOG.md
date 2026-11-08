# Changelog

## 0.1.0 (2026-11-06)

- Plugin: marketplace `doc-it`, plugin `doc-it`, skill `doc-it`, zero-dependency CLI `scripts/doc-it.mjs` (D11).
- Standard v0.1: owner questions 1-5 applied with their recommendations (D13); each rule DS-1..DS-8 marked `checked` or `not yet checked` (D12).
- Checks in 0.1.0 (D12): `check archive` (DS-3, board-age half of DS-2), `check closeout`, `check checkout` (DS-6), `check expiry` (DS-4), `tiers --json`, `template closeout`, `init` with `.doc-it/config.json`.
- CP-03 A1-H1: `check archive` reports `done_closed_unverified`, an archived board whose `closed: true` the board writer's freeze does not back (no close history entry by conclude-it, no `board_sha256`, or a board edited after its close). A hand-set `closed: true` no longer reads as clean.
- CP-03 A1-M2: `check closeout` makes `shipped` evidence cite something checkable (#PR or issue, http(s) URL, `repo@sha`, an existing path, or a commit sha that exists in the `--root` repo) and a `dropped` reason have at least 3 words. Rule in STANDARD §5 and `check closeout --help`.
- Consumers that find doc-it missing print `[skip] doc-it not installed: <what was not checked>` and never PASS that check (D14).

## 0.0.0 (design only)

- 2026-11-06: standard v0 draft, learnings L1-L8, owner questions. No code.
