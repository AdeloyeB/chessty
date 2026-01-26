# Run Tests

Run the test suite to verify code quality before committing or pushing.

## Steps

### 1. Run Server Tests

```bash
cd apps/server && bun test
```

### 2. Report Results

After tests complete, provide a summary:
- Total tests passed/failed
- Any failing test names and errors
- Recommendations if tests fail

### 3. If Tests Fail

- List each failing test with its error message
- Suggest potential fixes based on the error
- Do NOT proceed with commits or PRs until tests pass

### 4. If Tests Pass

Report success and confirm the codebase is ready for:
- Committing (tests will also run via Husky pre-commit hook)
- Creating a PR with `/pr`

## Usage

Run this skill anytime to verify test status:
- Before starting work on a feature
- After making changes
- Before creating a PR (though `/pr` should also run tests)

## Notes

- Tests use Bun's built-in test runner (`bun:test`)
- Redis tests require a running Redis instance (will skip gracefully if unavailable)
- Current coverage: 238 tests across 14 files
