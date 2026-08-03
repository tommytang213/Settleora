#!/usr/bin/bash
# Source-owned, owner-reviewed first instruction under sudo. This file must be
# pasted from the independently authenticated exact GitHub blob; it must never
# be executed by pathname from an unprivileged checkout.
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked: exact source, blob, and correlation required' >&2
  exit 1
fi

source_commit="$1"
bootstrap_blob="$2"
task_correlation="$3"
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

checkout_root="$(/usr/bin/mktemp -d /var/tmp/settleora-native-install-git.XXXXXXXXXXXX)"
case "$checkout_root" in
  /var/tmp/settleora-native-install-git.[A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]) ;;
  *) /usr/bin/printf '%s\n' 'native installation bootstrap blocked: private root invalid' >&2; exit 1 ;;
esac
/usr/bin/chown 0:0 "$checkout_root"
/usr/bin/chmod 0700 "$checkout_root"

cleanup() {
  /usr/bin/chmod -R 0000 "$checkout_root" 2>/dev/null || true
  /usr/bin/rm -rf -- "$checkout_root"
}
trap cleanup EXIT HUP INT TERM

/usr/bin/git -c core.hooksPath=/dev/null -c credential.helper= -c http.followRedirects=false \
  -c transfer.fsckObjects=true -c fetch.fsckObjects=true -C "$checkout_root" init --quiet
/usr/bin/git -c core.hooksPath=/dev/null -c credential.helper= -c http.followRedirects=false \
  -c transfer.fsckObjects=true -c fetch.fsckObjects=true -C "$checkout_root" \
  fetch --quiet --no-tags --depth=1 "$repository_url" "$source_commit"

if [[ "$(/usr/bin/git -C "$checkout_root" rev-parse 'FETCH_HEAD^{commit}')" != "$source_commit" ]]; then
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked: fetched commit mismatch' >&2
  exit 1
fi

/usr/bin/git -C "$checkout_root" remote add origin "$repository_url"
/usr/bin/git -c core.hooksPath=/dev/null -C "$checkout_root" checkout --quiet --detach --force FETCH_HEAD
/usr/bin/git -C "$checkout_root" fsck --full --strict --no-dangling >/dev/null

bootstrap_path='tools/auto-runner/semantic-recovery-native-install-bootstrap.sh'
controller_path='tools/auto-runner/semantic-recovery-native-install.mjs'
if [[ "$(/usr/bin/git -C "$checkout_root" rev-parse "${source_commit}:${bootstrap_path}")" != "$bootstrap_blob" ]] \
    || [[ "$(/usr/bin/git -C "$checkout_root" hash-object "$bootstrap_path")" != "$bootstrap_blob" ]] \
    || ! /usr/bin/git -C "$checkout_root" diff --quiet --no-ext-diff "$source_commit" -- \
    || [[ -n "$(/usr/bin/git -C "$checkout_root" status --porcelain=v1 --untracked-files=all)" ]]; then
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked: checkout or bootstrap identity mismatch' >&2
  exit 1
fi

/usr/bin/chown -R 0:0 "$checkout_root"
/usr/bin/chmod -R go-rwx "$checkout_root"

/usr/bin/printf '{"contract":"settleora_semantic_recovery_native_install_source","repository":"%s","sourceCommit":"%s","taskCorrelation":"%s","version":1}\n' \
  "$repository" "$source_commit" "$task_correlation" \
  | /usr/bin/node "$checkout_root/$controller_path" --root-bootstrap
