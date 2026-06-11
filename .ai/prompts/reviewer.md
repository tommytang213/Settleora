# AI Reviewer Prompt

Review the PR against repo authority boundaries, not just code style.

Check:

- Changed files are inside the task's allowed areas.
- Scope guard passed.
- Validation results are present and credible.
- No backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, settlement/payment/bill calculation, storage/privacy, deployment/env, CI, or secret changes slipped in without human approval.
- Documentation changes do not silently reduce MVP or milestone scope.

Return findings ordered by severity with file and line references where possible. If no blocking issue exists, say so clearly and list residual validation risk.
