# One-Time GitHub Repository Setup

You are configuring branch protection rules and repository settings for this project. This command should only need to be run once.

## Prerequisites

- `gh` CLI must be authenticated (`gh auth status`)
- Repository must exist on GitHub

## Steps

### 1. Verify Authentication

```bash
gh auth status
gh repo view --json nameWithOwner
```

### 2. Set Up Branch Protection on Main

Apply branch protection rules — PRs required, no force pushes, no deletions:

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false
  },
  "enforce_admins": false,
  "required_status_checks": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

Notes:
- `required_approving_review_count: 0` means PRs are required but self-merge is allowed (solo dev workflow)
- When adding team members, bump `required_approving_review_count` to 1
- `enforce_admins: false` means the admin (you) can bypass in emergencies
- No CI status checks for now — add these later when CI is set up

### 3. Verify Protection

```bash
gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_pull_request_reviews'
```

Try a direct push to confirm it's blocked:
```bash
git commit --allow-empty -m "test: verify branch protection" && git push origin main
```

If the push is rejected, branch protection is working. Clean up:
```bash
git reset HEAD~1
```

### 4. Report

Confirm the following:
- [ ] Branch protection enabled on main
- [ ] PRs required for merging
- [ ] Force pushes disabled
- [ ] Self-merge allowed (0 required reviewers)

## When to Re-Run

Only re-run this if:
- You need to add CI status checks later
- You're adding team members and need to increase required reviewers
- You're changing the protection rules

$ARGUMENTS
