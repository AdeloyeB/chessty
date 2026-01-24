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

If there are uncommitted changes, stage and commit them following the commit message format:

```
<type>: <concise description of what changed>

- <bullet point details if needed>
- <additional context>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Type prefixes: `feat:` (new functionality), `fix:` (bug fix), `chore:` (deps/config/cleanup), `refactor:` (restructuring), `docs:` (documentation only)

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
gh pr create --title "<type>: <concise title>" --body "$(cat <<'EOF'
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
)"
```

### 5. Report Back

Output the PR URL and a brief summary of what was submitted.

## Important

- Never force push
- Never push directly to main
- If the branch doesn't exist on remote yet, push with `-u` to set upstream
- Base all PRs against `main` unless told otherwise
- Use squash merge strategy (the reviewer will handle this)

$ARGUMENTS
