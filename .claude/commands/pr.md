### Git Branching (GitHub Flow)

All work happens on feature branches. `main` is protected — no direct pushes, PRs required.

**Branch naming:**

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New functionality | `feature/spectator-chat` |
| `fix/` | Bug fixes | `fix/clock-timeout-leak` |
| `refactor/` | Code restructuring | `refactor/extract-redis` |
| `docs/` | Documentation only | `docs/api-reference` |
| `chore/` | Deps, config, CI | `chore/add-github-actions` |


# Open Pull Request

You are creating a pull request for changes on the current feature branch. Follow the steps below exactly.

## Steps

### 1. Assess Current State

Run these commands to understand what's being submitted:

```bash
git status
git diff --stat
git log --oneline main..HEAD
```

If there are uncommitted changes, **lint before committing**:

```bash
# Auto-fix lint errors on all staged TypeScript files
npx eslint --fix $(git diff --cached --name-only --diff-filter=d | grep -E '\.(ts|tsx)$' | tr '\n' ' ')
# Re-stage any auto-fixed files
git diff --cached --name-only --diff-filter=d | grep -E '\.(ts|tsx)$' | xargs git add
```

Then stage and commit them following the commit message format:

```
<type>: <concise summary line>

<Detailed explanation paragraph — what was done and WHY. Explain the problem
that existed, the approach taken to solve it, and any important decisions made.
Someone reading this months later should fully understand the change without
needing to look at the diff.>

Changes:
- <Every file or component modified and what specifically changed>
- <Be specific: "Replace inline backgroundColor styles with Tailwind classes" not "Update styles">
- <Include root causes of bugs fixed: "Status bar used absolute positioning which removed it from document flow, overlapping sidebar buttons">
- <Note any side effects or related fixes bundled in>
```

Type prefixes: `feat:` (new functionality), `fix:` (bug fix), `chore:` (deps/config/cleanup), `refactor:` (restructuring), `docs:` (documentation only)

**Commit messages must be highly detailed.** Anyone reading the commit history should understand exactly what happened, why it happened, and what was affected — without needing to read the diff. Think of commit messages as a changelog entry for future developers.

**If the commit is blocked by the pre-commit hook (lint errors):**

1. Read the error output — it shows the exact file, line, and rule that failed
2. Fix the errors in the source files (the hook already ran `--fix` for auto-fixable issues, so remaining errors need manual fixes)
3. Re-stage the fixed files: `git add <fixed-files>`
4. Reattempt the commit with the same message
5. Repeat until the commit succeeds — do NOT use `--no-verify` to skip the hook

### 2. Determine Branch and Feature

- Identify the current branch name (it should follow the naming convention: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`)
- Derive the feature name from the branch name
- If on `main`, create an appropriate feature branch first

### 3. Push to Remote

```bash
git push -u origin <branch-name>
```

### 4. Open the PR

Use the `gh` CLI to create the PR with this exact format:

Title must start with a type prefix:
- `feat:` — New functionality
- `fix:` — Bug fixes
- `chore:` — Deps, config, cleanup, CI

```bash
PR_URL=$(gh pr create --title "<type>: <concise title>" --body "$(cat <<'EOF'
## Feature
<Feature name derived from branch, 1 sentence description>

## Changes
- <Bullet list of key changes made>
- <Focus on what was added/modified/removed>
- <Be specific enough for a reviewer to understand scope>

## Bugs / Known Issues
- <Any known issues, edge cases, or limitations>
- <Write "None" if no known issues>

## Testing
- [ ] `pnpm build` passes
- [ ] Server starts without errors
- [ ] Manually tested the affected feature

EOF
)" )
echo "PR created: $PR_URL"
```

### 5. Open in Browser

After creating the PR, immediately open it in the user's browser:

```bash
# Open PR in browser (cross-platform)
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$PR_URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  xdg-open "$PR_URL"
fi
```

### 6. Report Back

Output the PR URL and a brief summary of what was submitted.

## Important

- Never force push
- Never push directly to main
- **Never use `--no-verify` to skip pre-commit hooks** — fix the lint errors instead
- If the pre-commit hook blocks a commit, fix the errors and retry (never bypass)
- If the branch doesn't exist on remote yet, push with `-u` to set upstream
- Base all PRs against `main` unless told otherwise
- Use squash merge strategy (the reviewer will handle this)

$ARGUMENTS
