# CLOSEOUT: <package name>

Closed: <YYYY-MM-DD> · By: <who> · Lint: `doc-it check closeout CLOSEOUT.md`

One row per piece of the program. No piece is left out; folder location never means "shipped".

| Piece | Disposition | Evidence or reason | Backlog link |
|---|---|---|---|
| <piece name> | shipped | <merged PR, sha reachable from the default branch, or deploy record> | |
| <piece name> | dropped | <why it was stopped> | |
| <piece name> | carried | <what remains> | <path or URL of the backlog item> |

Rules (STANDARD DS-3):
- `shipped` needs evidence that cites something checkable: #PR or issue, URL, repo@sha (the repo must be this one, a sibling folder, or passed with --repos, and the sha must exist there), a commit sha in this repo, or an existing path.
- `dropped` needs a reason of at least 3 words.
- `carried` needs a backlog link.
