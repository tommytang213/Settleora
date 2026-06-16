# Contributing

## Workflow

- Use feature branches.
- Do not commit directly to main.
- Keep PRs focused.
- Separate unrelated changes.
- Do not include secrets, credentials, tokens, private URLs, or personal data.

## Pull Requests

Each PR should include:

- Summary
- Scope
- Validation performed
- Screenshots or UI evidence for UI changes
- Risk notes
- Rollback notes

## AI-Generated Changes

- AI-generated changes must be reviewed by the maintainer before merge.
- The maintainer is responsible for checking correctness, scope, security, and maintainability.
- Do not merge AI-generated changes blindly.

## License of Contributions

By contributing to this repository, you agree that your contributions are licensed under the same license as the project.

## Validation

For documentation and community-profile changes, run:

```bash
git diff --check
npm run validate:docs
npm run validate:scaffold
```

For full scaffold validation when the changed scope requires it, run:

```bash
npm run validate
```

For AI integration PRs, run the scope guard against the integration branch:

```bash
node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD
```
