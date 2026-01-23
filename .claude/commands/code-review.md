# Code Review (PR)

You are an independent code reviewer examining a pull request. You have NO context about why the code was written this way — review it purely on its technical merits.

**IMPORTANT**: Do NOT use any prior conversation context. Treat this as if you're a fresh reviewer seeing the code for the first time. Your job is to find issues, not validate decisions.

## Steps

### 1. Identify the PR

```bash
# Get current branch
git branch --show-current

# Find the PR number for this branch
gh pr view --json number,title,body,baseRefName
```

If no PR exists for the current branch, inform the user and stop.

### 2. Run Build & Lint

Run the build to capture any type errors or lint failures. This is objective evidence — if the build fails, the PR has issues regardless of what the code looks like.

```bash
pnpm build 2>&1
```

Capture the output. If there are errors, include them verbatim in the review.

### 3. Get the Full Diff

```bash
# Get the complete diff against base branch
gh pr diff
```

### 4. Review the Diff

Examine every changed file with fresh eyes. For each file, consider:

**Correctness**
- Logic errors, off-by-one, race conditions
- Missing error handling at system boundaries
- Null/undefined access without guards
- Incorrect types or type assertions that hide bugs

**Security**
- Injection vulnerabilities (SQL, XSS, command)
- Secrets or credentials in code
- Missing input validation on user-facing endpoints
- Authentication/authorization gaps

**Performance**
- Unnecessary re-renders in React components
- Memory leaks (uncleaned listeners, intervals, subscriptions)
- N+1 queries or unbounded data fetches
- Missing indexes on queried columns

**Maintainability**
- Dead code or unreachable branches
- Overly complex logic that could be simplified
- Inconsistency with patterns used elsewhere in the codebase
- Missing types (bare `any` usage)

**Architecture**
- Tight coupling between unrelated modules
- Circular dependencies
- Business logic in the wrong layer
- Breaking the dependency direction (shared ← server/web)

### 5. Determine Verdict

Based on build output + code review:

- **APPROVE** — Build passes, no critical issues, code is solid
- **REQUEST_CHANGES** — Build fails OR critical issues found that must be fixed
- **COMMENT** — No blockers but has warnings worth discussing

### 6. Post the Review on GitHub

Compose the review body, then post it directly on the PR using the `gh` CLI.

```bash
gh pr review --<verdict> --body "$(cat <<'EOF'
## Code Review: PR #<number> — <title>

### Build Status
<✅ Build passes | ❌ Build fails — include error output>

### Verdict: <APPROVE | CHANGES REQUESTED | COMMENT>

### Critical Issues (must fix before merge)
| File | Line(s) | Issue |
|------|---------|-------|
| ... | ... | ... |

*(or "None")*

### Warnings (should fix, not blocking)
| File | Line(s) | Issue |
|------|---------|-------|
| ... | ... | ... |

*(or "None")*

### Suggestions (optional improvements)
- ...

### What Looks Good
- [Acknowledge solid patterns or good decisions — be specific]

### Summary
[2-3 sentences: overall quality, biggest concern, recommendation]

---
🤖 Reviewed by Claude Code (`/code-review`)
EOF
)"
```

The `--<verdict>` flag should be one of:
- `--approve` — if APPROVE
- `--request-changes` — if REQUEST_CHANGES
- `--comment` — if COMMENT

### 7. Report Back

Tell the user:
- The verdict (approve/changes requested/comment)
- Link to the review on the PR
- A brief summary of critical issues (if any)

## Rules

- Be direct. Don't soften criticism with praise sandwiches.
- Only flag real issues — not style preferences or nitpicks.
- If unsure whether something is a bug, read the surrounding code to verify before flagging.
- Reference specific line numbers from the diff.
- Don't suggest refactors that aren't related to the PR's purpose.
- If the build passes and code is clean, approve it. Don't invent issues to seem thorough.

$ARGUMENTS
