#!/usr/bin/bash
# Trusted first-stage bootstrap. Before it may be named by sudo, these exact
# bytes must have been installed at the fixed path below by a separately
# authenticated OS/administrator channel. It accepts scalar identities only;
# no program, path, plan, manifest, environment, or authority bytes cross the
# unprivileged/root boundary.
set -euo pipefail
umask 077

trusted_path='/usr/libexec/settleora-semantic-recovery-native-install-bootstrap'
repository='tommytang213/Settleora'
repository_url='https://github.com/tommytang213/Settleora.git'
bootstrap_path='tools/auto-runner/semantic-recovery-native-install-bootstrap.sh'
controller_path='tools/auto-runner/semantic-recovery-native-install.mjs'
owner_journal_root='/workspace/logs/auto-runner/Settleora/manual-root-install-journals'
root_state_root='/etc/settleora-auto-runner/.semantic-recovery-native-install-journals'

block() {
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked' >&2
  exit 1
}

[[ "$#" -eq 6 ]] || block
source_commit="$1"
bootstrap_blob="$2"
task_correlation="$3"
operation_id="$4"
owner_journal_digest="$5"
owner_journal_sha256="$6"

[[ "$source_commit" =~ ^[a-f0-9]{40}$ ]] || block
[[ "$bootstrap_blob" =~ ^[a-f0-9]{40}$ ]] || block
[[ "$task_correlation" =~ ^[a-z0-9][a-z0-9._:-]{7,127}$ ]] || block
[[ "$operation_id" =~ ^[a-f0-9]{64}$ ]] || block
[[ "$owner_journal_digest" =~ ^[a-f0-9]{64}$ ]] || block
[[ "$owner_journal_sha256" =~ ^[a-f0-9]{64}$ ]] || block
[[ "$(/usr/bin/id -u)" == 0 && "$(/usr/bin/id -g)" == 0 ]] || block
[[ "$0" == "$trusted_path" ]] || block
[[ "$(/usr/bin/readlink -f -- "$0")" == "$trusted_path" ]] || block
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a:%h' -- "$trusted_path")" == 'regular file:0:0:555:1' ]] || block
[[ "$(/usr/bin/git hash-object -- "$trusted_path")" == "$bootstrap_blob" ]] || block

# Freeze the exact armed owner transition before any network or source work.
# The owner journal is correlation evidence only; no installation authority is
# read from it. The root-owned copy and receipt make cancellation/restart
# deterministic and prevent a fresh correlation from resetting the one shot.
owner_journal="$owner_journal_root/$operation_id.json"
[[ "$(/usr/bin/readlink -f -- "$owner_journal")" == "$owner_journal" ]] || block
owner_metadata="$(/usr/bin/stat -Lc '%F:%u:%a:%h' -- "$owner_journal")"
[[ "$owner_metadata" =~ ^regular\ file:[1-9][0-9]*:600:1$ ]] || block
[[ "$(/usr/bin/sha256sum -- "$owner_journal" | /usr/bin/cut -d' ' -f1)" == "$owner_journal_sha256" ]] || block

if [[ ! -e /etc/settleora-auto-runner ]]; then
  /usr/bin/mkdir --mode=0755 /etc/settleora-auto-runner
  /usr/bin/chown 0:0 /etc/settleora-auto-runner
  /usr/bin/chmod 0755 /etc/settleora-auto-runner
  /usr/bin/sync -f /etc
fi
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a' /etc/settleora-auto-runner)" == 'directory:0:0:755' ]] || block
if [[ ! -e "$root_state_root" ]]; then
  /usr/bin/mkdir --mode=0700 "$root_state_root"
  /usr/bin/chown 0:0 "$root_state_root"
  /usr/bin/chmod 0700 "$root_state_root"
  /usr/bin/sync -f /etc/settleora-auto-runner
fi
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a' "$root_state_root")" == 'directory:0:0:700' ]] || block

owner_snapshot="$root_state_root/$operation_id.owner.json"
receipt="$root_state_root/$operation_id.receipt.json"
if [[ ! -e "$owner_snapshot" && ! -e "$receipt" ]]; then
  snapshot_tmp="$root_state_root/.$operation_id.owner.$$.tmp"
  receipt_tmp="$root_state_root/.$operation_id.receipt.$$.tmp"
  /usr/bin/cp --no-dereference --preserve=mode -- "$owner_journal" "$snapshot_tmp"
  /usr/bin/chown 0:0 "$snapshot_tmp"
  /usr/bin/chmod 0400 "$snapshot_tmp"
  [[ "$(/usr/bin/sha256sum -- "$snapshot_tmp" | /usr/bin/cut -d' ' -f1)" == "$owner_journal_sha256" ]] || block
  observed_at="$(/usr/bin/date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
  /usr/bin/printf '{"bootstrapBlob":"%s","contract":"settleora_semantic_recovery_native_install_root_receipt","observedAt":"%s","operationId":"%s","ownerJournalDigest":"%s","ownerJournalSha256":"%s","repository":"%s","sourceCommit":"%s","taskCorrelation":"%s","version":1}\n' \
    "$bootstrap_blob" "$observed_at" "$operation_id" "$owner_journal_digest" "$owner_journal_sha256" "$repository" "$source_commit" "$task_correlation" > "$receipt_tmp"
  /usr/bin/chown 0:0 "$receipt_tmp"
  /usr/bin/chmod 0400 "$receipt_tmp"
  /usr/bin/sync -d "$snapshot_tmp" "$receipt_tmp"
  /usr/bin/mv --no-clobber -- "$snapshot_tmp" "$owner_snapshot"
  /usr/bin/mv --no-clobber -- "$receipt_tmp" "$receipt"
  /usr/bin/sync -f "$root_state_root"
fi
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a:%h' "$owner_snapshot")" == 'regular file:0:0:400:1' ]] || block
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a:%h' "$receipt")" == 'regular file:0:0:400:1' ]] || block
[[ "$(/usr/bin/sha256sum -- "$owner_snapshot" | /usr/bin/cut -d' ' -f1)" == "$owner_journal_sha256" ]] || block

checkout_root="$(/usr/bin/mktemp -d /var/tmp/settleora-native-install-git.XXXXXXXXXXXX)"
trap '/usr/bin/chmod -R 0000 "$checkout_root" 2>/dev/null || true; /usr/bin/rm -rf -- "$checkout_root"' EXIT HUP INT TERM
/usr/bin/chown 0:0 "$checkout_root"
/usr/bin/chmod 0700 "$checkout_root"
/usr/bin/git -c core.hooksPath=/dev/null -c credential.helper= -c http.followRedirects=false -c transfer.fsckObjects=true -c fetch.fsckObjects=true -C "$checkout_root" init --quiet
/usr/bin/git -c core.hooksPath=/dev/null -c credential.helper= -c http.followRedirects=false -c transfer.fsckObjects=true -c fetch.fsckObjects=true -C "$checkout_root" fetch --quiet --no-tags --depth=1 "$repository_url" "$source_commit"
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse 'FETCH_HEAD^{commit}')" == "$source_commit" ]] || block
/usr/bin/git -C "$checkout_root" remote add origin "$repository_url"
/usr/bin/git -C "$checkout_root" checkout --quiet --detach FETCH_HEAD
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$bootstrap_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" hash-object "$bootstrap_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git hash-object -- "$trusted_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$controller_path")" =~ ^[a-f0-9]{40}$ ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" hash-object "$controller_path")" == "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$controller_path")" ]] || block
/usr/bin/git -C "$checkout_root" fsck --full --strict --no-dangling >/dev/null
/usr/bin/chown -R 0:0 "$checkout_root"
/usr/bin/chmod -R go-rwx "$checkout_root"

/usr/bin/printf '{"bootstrapBlob":"%s","contract":"settleora_semantic_recovery_native_install_source","repository":"%s","sourceCommit":"%s","taskCorrelation":"%s","version":1}\n' \
  "$bootstrap_blob" "$repository" "$source_commit" "$task_correlation" \
  | /usr/bin/node "$checkout_root/$controller_path" --root-bootstrap
