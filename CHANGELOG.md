# Changelog

## 0.1.0 (2026-11-06)

- Plugin: marketplace `doc-it`, plugin `doc-it`, skill `doc-it`, zero-dependency CLI `scripts/doc-it.mjs` (D11).
- Standard v0.1: owner questions 1-5 applied with their recommendations (D13); each rule DS-1..DS-8 marked `checked` or `not yet checked` (D12).
- Checks in 0.1.0 (D12): `check archive` (DS-3, board-age half of DS-2), `check closeout`, `check checkout` (DS-6), `check expiry` (DS-4), `tiers --json`, `template closeout`, `init` with `.doc-it/config.json`.
- CP-03 A1-H1: `check archive` reports `done_closed_unverified`, an archived board whose `closed: true` the board writer's freeze does not back (no close history entry by conclude-it, no `board_sha256`, or a board edited after its close). A hand-set `closed: true` no longer reads as clean.
- CP-03 A1-M2: `check closeout` makes `shipped` evidence cite something checkable (#PR or issue, http(s) URL, `repo@sha`, an existing path, or a commit sha that exists in the `--root` repo) and a `dropped` reason have at least 3 words. Rule in STANDARD §5 and `check closeout --help`.
- CP-03 R2-A1-M4: `check closeout` resolves `repo@sha` evidence (the `--root` repo by folder or origin name, a sibling folder `<root>/../<repo>`, or `--repos name=path`); an unknown repo or a missing sha fails the row, naming it. `#0`, a leading zero and numbers over 6 digits are refused. `#n` stays format-only (offline; documented limit in STANDARD §5).
- CP-03 R2-L4: a `dropped` reason needs 3 distinct words (`no no no`, `it is it` are refused).
- CP-03 R2-L9: `archive_since` later than today is a config error (exit 2) instead of a clean archive.
- CP-03 R2-L3: the `board_sha256` check covers the close entry (without its digest field), in step with build-it status-write, so a rewritten owner note is `done_closed_unverified`.
- CP-03 R3-L1: a `shipped` URL needs a path after the host (`http://a.b` is refused; `https://a.b/x` still passes on format). `#n` stays format-only and the sha-is-not-shipping limit (R3-L2) is documented in STANDARD §5.
- CP-03 R4-A1-M7: `check archive` reports `done_board_mismatch`, an archived `status.json` whose `implementation` names another package (a copy of another package's closed board passes the freeze check, so its name is what gives it away). A `status.json` that is not a JSON object (`null`) is `done_unclosed`, never read as "no board".
- CP-03 R6-A1-M9: git output doc-it reads keeps its exact bytes: a repo top from `rev-parse --show-toplevel` loses only git's trailing newline (a repo folder ending in a space resolved to a missing folder), every call runs with `core.quotePath=false`, `check checkout` counts `status --porcelain=v1 -z` entries (a rename's source field is not counted twice), and the last-touched query uses `--literal-pathspecs` (a folder named `a*` no longer also matches `ab`).
- Consumers that find doc-it missing print `[skip] doc-it not installed: <what was not checked>` and never PASS that check (D14).

## 0.0.0 (design only)

- 2026-11-06: standard v0 draft, learnings L1-L8, owner questions. No code.
