# Fetch Code Rabbit AI Review

You are fetching and presenting Code Rabbit's automated code review for a pull request. Your job is to parse the review comments, explain each issue in plain language, and offer to fix them.

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
  - `⚠️` or "Potential issue" → MAJOR
  - `🛠️` or "suggestion" or "nitpick" → SUGGESTION
  - Anything else → MINOR
- **Description**: The main text explaining the issue
- **Suggested fix**: Look for code blocks (especially ```diff blocks or ```suggestion blocks)
- **AI Agent prompt**: Look for content inside `<details><summary>🤖 Prompt for AI Agents</summary>` blocks

### 6. Present the Review

Format your output like this:

```
## Code Rabbit Review — PR #<number> (<title>)
🔗 <pr_url>

### Walkthrough
<Summarize the walkthrough comment in 2-3 sentences — what does this PR do?>

### Issues (<count>)

1. <severity_icon> <SEVERITY> — <file_path>:<line_number>
   <description of the issue>

   **What this means:** <2-3 sentence plain-language explanation of WHY this matters,
   written for someone learning software engineering. Explain the consequence of NOT
   fixing it — what could go wrong?>

   **Fix:**
   ```diff
   <the suggested fix if available>
   ```
   🤖 "<AI agent prompt if available>"

2. ...

---
Which issues would you like me to fix? (e.g., "fix 1 and 3", "fix all", "skip")
```

### Severity Icons
- MAJOR: ⚠️
- MINOR: 🟡
- SUGGESTION: 💡

### 7. Wait for User Response

After presenting the issues, wait for the user to tell you which to fix.

- **"fix all"** → Fix every issue that has a suggested fix
- **"fix 1 and 3"** or **"fix 1, 3"** → Fix only those numbered issues
- **"skip"** → Do nothing, just end

### 8. Apply Fixes

For each issue the user wants fixed:

1. Read the file at the specified path
2. Find the code at/near the specified line number
3. Apply the suggested fix (use the diff or AI agent prompt as guidance)
4. Show the user what you changed

If a suggested fix isn't in a clean diff format, use the AI agent prompt or description to understand what change is needed and implement it yourself.

### 9. Offer to Commit

After applying all fixes, ask:

"All fixes applied. Would you like me to commit and push these changes?"

If yes, create a commit with message format:
```
fix: address Code Rabbit review feedback

- <brief description of fix 1>
- <brief description of fix 2>
...

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Edge Cases

- **No Code Rabbit comments found**: Say "Code Rabbit hasn't reviewed this PR yet. It may still be processing, or the PR may not have Code Rabbit enabled."
- **Comments exist but no actionable issues**: Say "Code Rabbit reviewed this PR but found no actionable issues. The review was clean!"
- **Suggested fix doesn't match current code**: The file may have changed since the review. Read the current file, understand the intent of the fix, and adapt it to the current code. Tell the user if the fix needed adaptation.
- **Multiple review rounds**: Code Rabbit may have left comments across multiple pushes. Fetch all of them — they accumulate. If an issue was already fixed (the code no longer matches), note it as "Already resolved" and skip it.

## Rules

- Always explain issues in plain language. The developer is learning.
- Don't silently skip issues. If you can't parse a comment, show its raw body.
- Reference specific file paths and line numbers.
- When applying fixes, always read the file first to understand context.
- Don't fix issues the user didn't ask for.
- If a fix could introduce new issues, warn the user before applying.

$ARGUMENTS
