# Settleora Auto-Runner Tooling

This directory contains the DevBox-native unattended Codex auto-runner skeleton.
It is issue-label driven and writes all mutable runtime state under
`/workspace/logs/settleora-auto-runner/`.

Dry-run diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once --require-pre-pr-review
```

Bounded real-run mode requires an explicit flag:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --max-iterations 20
node tools/auto-runner/settleora-auto-runner.mjs --run --max-runtime 8h
```

Summary mode:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --write-summary --since 24h
```

Real-run mutation and PR creation stay gated by lane policy, local validation,
and the mandatory pre-PR AI review verdict. Auto-merge is disabled by default.
