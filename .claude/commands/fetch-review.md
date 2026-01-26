# Fetch Code Rabbit AI Review

You are fetching Code Rabbit's automated code review for a pull request and **automatically fixing all issues**. No prompting — just fetch, explain, fix, and commit.

## Steps

### 1. Identify the PR

If `$ARGUMENTS` contains a number, use that as the PR number. Otherwise, detect from the current branch:

```bash
gh pr view --json number,title,url,headRefName 2>/dev/null
```

If no PR exists for the current branch, say: "No PR found for this branch. Push your changes and open a PR first."

Store the PR number, title, and URL for later use.

### 2. Get Repository Info

```bash
gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
```

### 3. Fetch Code Rabbit's Inline Review Comments

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate
```

Filter comments to only those from Code Rabbit (the user login will be `coderabbitai[bot]` or the body will contain Code Rabbit's characteristic formatting like `<!-- This is an auto-generated comment by CodeRabbit -->`).

### 4. Fetch Code Rabbit's Walkthrough Comment

```bash
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate
```

Filter to the Code Rabbit bot comment (same criteria as above). This is the summary/walkthrough comment.

### 5. Parse Each Inline Comment

For each Code Rabbit inline comment, extract:

- **File path**: from the `.path` field
- **Line number**: from the `.line` or `.original_line` field
- **Severity**: Parse from the comment body:
  - `⚠️` or "Potential issue" → CRITICAL
  - `🔒` or "Security" → CRITICAL
  - `🛠️` or "suggestion" or "nitpick" → SUGGESTION
  - Anything else → MINOR
- **Description**: The main text explaining the issue
- **Suggested fix**: Look for code blocks (especially ```diff blocks or ```suggestion blocks)
- **AI Agent prompt**: Look for content inside `<details><summary>🤖 Prompt for AI Agents</summary>` blocks

### 6. Present Summary and Begin Fixing

Output a brief summary:

```
## Code Rabbit Review — PR #<number> (<title>)
🔗 <pr_url>

### Walkthrough
<Summarize the walkthrough comment in 2-3 sentences — what does this PR do?>

### Issues Found: <count>
- ⚠️ Critical: <count>
- 🟡 Minor: <count>
- 💡 Suggestions: <count>

**Automatically fixing all issues...**
```

### 7. Automatically Fix All Issues

For each issue (prioritize CRITICAL first, then MINOR, then SUGGESTIONS):

1. Read the file at the specified path
2. Find the code at/near the specified line number
3. Apply the suggested fix (use the diff or AI agent prompt as guidance)
4. Briefly explain what was fixed:
   ```
   ✓ Fixed: <file_path>:<line_number>
     Issue: <brief description>
     Fix: <what was changed>
   ```

If a suggested fix isn't in a clean diff format, use the AI agent prompt or description to understand what change is needed and implement it yourself.

**Skip conditions:**
- If the code no longer matches (already fixed), note: `⏭️ Skipped: <file> — already resolved`
- If a fix would break other code, note: `⚠️ Skipped: <file> — fix would cause side effects, manual review needed`

### 8. Run Build Verification

After all fixes are applied:

```bash
pnpm build
```

If the build fails, attempt to fix the build errors. If you can't fix them, revert the problematic change and note it.

### 9. Commit and Push

After all fixes are applied and build passes, automatically commit:

```bash
git add -A
git commit -m "fix: address Code Rabbit review feedback

<list each fix as a bullet point>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git push
```

### 10. Final Summary

Output a completion summary:

```
## ✅ Code Rabbit Review Complete

**PR:** #<number> — <title>
**Issues Fixed:** <count>/<total>
**Build:** ✓ Passing

### Changes Made:
- <file1>: <brief description>
- <file2>: <brief description>
...

### Skipped (if any):
- <file>: <reason>

Changes have been committed and pushed.
```

## Edge Cases

- **No Code Rabbit comments found**: Say "Code Rabbit hasn't reviewed this PR yet. It may still be processing, or the PR may not have Code Rabbit enabled."
- **Comments exist but no actionable issues**: Say "Code Rabbit reviewed this PR but found no actionable issues. The review was clean!"
- **Suggested fix doesn't match current code**: The file may have changed since the review. Read the current file, understand the intent of the fix, and adapt it to the current code.
- **Multiple review rounds**: Code Rabbit may have left comments across multiple pushes. Fetch all of them — they accumulate. If an issue was already fixed (the code no longer matches), note it as "Already resolved" and skip it.
- **Build fails after fixes**: Attempt to fix build errors. If unfixable, revert the problematic change and document it.

## Rules

- Always explain issues in plain language. The developer is learning.
- Don't silently skip issues. If you can't parse a comment, show its raw body.
- Reference specific file paths and line numbers.
- When applying fixes, always read the file first to understand context.
- If a fix could introduce new issues, skip it and document why.
- Prioritize security and critical issues first.
- Always verify the build passes before committing.

$ARGUMENTS
