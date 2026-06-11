#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
cd "${repo_root}"

max_iterations="${1:-${SETTLEORA_AI_V3_MAX_ITERATIONS:-8}}"
if ! [[ "${max_iterations}" =~ ^[1-9][0-9]*$ ]]; then
  echo "max iterations must be a positive integer" >&2
  exit 2
fi

current_branch="$(git branch --show-current)"
if [[ "${current_branch}" == "main" ]]; then
  echo "refusing to run the AI V3 milestone controller from main" >&2
  exit 2
fi

integration_branch="$(
  node -e 'const fs=require("fs"); const state=JSON.parse(fs.readFileSync(".ai/state.json","utf8")); process.stdout.write(String(state.integrationBranch || ""));'
)"
if [[ "${integration_branch}" == "main" || -z "${integration_branch}" ]]; then
  echo "refusing to run: .ai/state.json integrationBranch must be set and must not be main" >&2
  exit 2
fi

export PATH="/opt/flutter/bin:${HOME}/bin:${HOME}/.local/bin:/home/tommytang213/bin:${PATH}"

command -v node >/dev/null
command -v codex-vm-full >/dev/null

exec node scripts/ai/v3-controller.mjs \
  --run \
  --allow-auto-merge \
  --max-iterations "${max_iterations}"
