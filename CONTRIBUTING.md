# Contributing

## Workflow

* Use feature branches.
* Do not commit directly to main.
* Keep changes focused.
* Separate unrelated changes.
* Do not include secrets, credentials, tokens, private URLs, or personal data.

## External Contributions

This project is not currently accepting external code contributions or pull requests.

You may clone or fork the repository and modify it for your own personal, private, educational, hobby, family/friend, or other noncommercial use, subject to the project license.

Bug reports, feature requests, security reports, and documentation suggestions are welcome.

Pull requests from forks, unsolicited code changes, large patches, dependency changes, generated code, copied code, or third-party assets may be closed without review.

Ideas, bug reports, and feature requests may be independently implemented by the maintainer in separate maintainer-authored changes.

Do not request commercial use through public issues. Commercial use requires written permission from the copyright holder.

## Pull Requests

Pull requests are intended for maintainer-authored changes or changes explicitly requested by the maintainer.

Each accepted PR should include:

* Summary
* Scope
* Validation performed
* Screenshots or UI evidence for UI changes
* Risk notes
* Rollback notes

## AI-Generated Changes

* AI-generated changes must be reviewed by the maintainer before merge.
* The maintainer is responsible for checking correctness, scope, security, and maintainability.
* Do not merge AI-generated changes blindly.

## License of Contributions

This project is not currently accepting external code contributions.

If the maintainer explicitly requests and accepts a contribution, you agree that your contribution is licensed under the same license as the project.

You also grant the maintainer a perpetual, worldwide, royalty-free, non-exclusive right to use, modify, distribute, sublicense, relicense, and commercially use your contribution as part of this project and related offerings.

## Validation

For documentation and community-profile changes, run:

```bash
git diff --check
npm run validate:docs
npm run validate:scaffold
```

For OpenAPI metadata changes, also run:

```bash
npm run validate:openapi
```

For full scaffold validation when the changed scope requires it, run:

```bash
npm run validate
```

For AI integration PRs, run the scope guard against the integration branch:

```bash
node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD
```
