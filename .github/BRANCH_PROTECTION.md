# Branch Protection Rules

The `main` branch is protected with the following rules:

- **Require a pull request before merging** — no direct pushes to `main`
- **Require approvals** — at least 1 approving review
- **Require status checks to pass** — CI must be green before merge
- **Require branches to be up-to-date** — must be current with `main`
- **No force pushes** — force pushing is disabled
- **No branch deletion** — `main` cannot be deleted
- **Require conversation resolution** — all review threads must be resolved

## Branch Naming Convention

- `main` — production branch (protected)
- `feature/<name>` — new features
- `fix/<name>` — bug fixes
- `hotfix/<name>` — critical production fixes
- `release/<version>` — release preparation
- `chore/<name>` — maintenance tasks
- `docs/<name>` — documentation changes
- `dependabot/*` — automated dependency updates
