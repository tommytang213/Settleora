#!/usr/bin/bash
# Authenticated second-stage bootstrap. The fixed, owner-reviewed shell literal
# fetches and Git-blob-verifies these bytes before root executes this file.
set -euo pipefail

if [[ "$#" -ne 4 ]]; then
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked: exact checkout, source, blob, and correlation required' >&2
  exit 1
fi

checkout_root="$1"
source_commit="$2"
bootstrap_blob="$3"
task_correlation="$4"
repository='tommytang213/Settleora'
repository_url='https://github.com/tommytang213/Settleora.git'

if [[ ! "$source_commit" =~ ^[a-f0-9]{40}$ ]] \
    || [[ ! "$bootstrap_blob" =~ ^[a-f0-9]{40}$ ]] \
    || [[ ! "$task_correlation" =~ ^[a-z0-9][a-z0-9._:-]{7,127}$ ]] \
    || [[ "$(/usr/bin/id -u)" != 0 ]] \
    || [[ "$(/usr/bin/id -g)" != 0 ]]; then
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked: closed identity invalid' >&2
  exit 1
fi

case "$checkout_root" in
  /var/tmp/settleora-native-install-git.[A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]) ;;
  *) /usr/bin/printf '%s\n' 'native installation bootstrap blocked: private root invalid' >&2; exit 1 ;;
esac

bootstrap_path='tools/auto-runner/semantic-recovery-native-install-bootstrap.sh'
controller_path='tools/auto-runner/semantic-recovery-native-install.mjs'
if [[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a' -- "$checkout_root")" != 'directory:0:0:700' ]] \
    || [[ "$(/usr/bin/readlink -f -- "$checkout_root")" != "$checkout_root" ]] \
    || [[ "$(/usr/bin/git -C "$checkout_root" remote get-url origin)" != "$repository_url" ]] \
    || [[ "$(/usr/bin/git -C "$checkout_root" rev-parse 'HEAD^{commit}')" != "$source_commit" ]] \
    || [[ "$(/usr/bin/git -C "$checkout_root" rev-parse "${source_commit}:${bootstrap_path}")" != "$bootstrap_blob" ]] \
    || [[ "$(/usr/bin/git -C "$checkout_root" hash-object "$bootstrap_path")" != "$bootstrap_blob" ]] \
    || [[ ! "$(/usr/bin/git -C "$checkout_root" rev-parse "${source_commit}:${controller_path}")" =~ ^[a-f0-9]{40}$ ]] \
    || [[ "$(/usr/bin/git -C "$checkout_root" hash-object "$controller_path")" != "$(/usr/bin/git -C "$checkout_root" rev-parse "${source_commit}:${controller_path}")" ]] \
    || ! /usr/bin/git -C "$checkout_root" diff --quiet --no-ext-diff "$source_commit" -- \
    || [[ -n "$(/usr/bin/git -C "$checkout_root" status --porcelain=v1 --untracked-files=all)" ]]; then
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked: checkout or bootstrap identity mismatch' >&2
  exit 1
fi
/usr/bin/git -C "$checkout_root" fsck --full --strict --no-dangling >/dev/null

/usr/bin/printf '{"contract":"settleora_semantic_recovery_native_install_source","repository":"%s","sourceCommit":"%s","taskCorrelation":"%s","version":1}\n' \
  "$repository" "$source_commit" "$task_correlation" \
  | /usr/bin/node "$checkout_root/$controller_path" --root-bootstrap
