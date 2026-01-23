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

### 2. Get the Full Diff

```bash
# Get the complete diff against base branch
gh pr diff
```

### 3. Review the Diff

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

### 4. Output Format

```
## Code Review: PR #<number> — <title>

### Verdict: APPROVE | CHANGES REQUESTED | NEEDS DISCUSSION

### Critical Issues (must fix before merge)
| File | Line(s) | Issue |
|------|---------|-------|
| ... | ... | ... |

### Warnings (should fix, not blocking)
| File | Line(s) | Issue |
|------|---------|-------|
| ... | ... | ... |

### Suggestions (optional improvements)
- ...

### What Looks Good
- [Acknowledge solid patterns or good decisions — be specific]

### Summary
[2-3 sentences: overall quality, biggest concern, recommendation]
```

### 5. If No Issues Found

If the code is clean, say so clearly with a short explanation of what you checked. Don't invent issues to seem thorough.

## Rules

- Be direct. Don't soften criticism with praise sandwiches.
- Only flag real issues — not style preferences or nitpicks.
- If unsure whether something is a bug, read the surrounding code to verify before flagging.
- Reference specific line numbers from the diff.
- Don't suggest refactors that aren't related to the PR's purpose.

$ARGUMENTS
