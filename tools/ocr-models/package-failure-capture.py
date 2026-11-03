#!/usr/bin/env python3
"""Failure-only package observations. Never grants package/native acceptance.

No package payload is exported on Android. An iOS raw plist is retained only
when its entire encoding is canonical and every decoded value is classified
public bundle metadata. Unknown encodings/values yield hash-only unavailable
observations. Existing verifier failures remain authoritative.
"""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import shutil
import subprocess
import sys
import zipfile

MAX_APK = 400 * 1024 * 1024
MAX_PLIST = 32 * 1024
MAX_JSON = 16 * 1024
MAX_ZIP = 64 * 1024
PRIVACY_PATH = "Frameworks/image_picker_ios.framework/image_picker_ios_privacy.bundle/Info.plist"
INVENTORY = "tools/ocr-models/android-production-entry-inventory.mjs"
IOS_LOCK = "apps/mobile/ios/Podfile.lock"
IOS_DEBUG = "apps/mobile/ios/Flutter/Debug.xcconfig"
IOS_DEBUG_SOURCE = b'#include "Generated.xcconfig"\n'
IOS_DEBUG_PREFIX = b'#include? "Pods/Target Support Files/Pods-Runner/Pods-Runner.debug.xcconfig"\n'
IOS_DEBUG_SOURCE_SHA256 = "a82d7765b37116ee4821d2cd1d65942febf8032353757ffb0826eabde785b4a6"
IOS_DEBUG_PROJECTED_SHA256 = "690b8a8b1ae15ddd29b241429963e971bbc6720ab22f154cf8cf6b085b6d4925"
IOS_COMBINED_STATE = "verified_ios_test_lock_and_debug_projection"
IOS_COMBINED_STATUS = b" M " + IOS_DEBUG.encode() + b"\0 M " + IOS_LOCK.encode() + b"\0"
IOS_LOCK_VERIFIER = "tools/ocr-models/verify-ios-test-podfile-lock.mjs"
WORKFLOW = ".github/workflows/mobile-ocr-native-acceptance.yml"
REPOSITORY = "tommytang213/Settleora"
CONTEXT_KEYS = {"sourceSha", "sourceTree", "sourceTreeFingerprint", "catalogSha256",
                "workflowSha", "workflowRef", "runId", "runAttempt", "job",
                "workspaceState", "workspaceLockSha256"}
CAPTURE_PHASE_LIMIT = 32
CAPTURE_PHASES = frozenset({
    "arguments", "hosted_environment", "repository_identity", "source_head",
    "workspace_status", "workspace_clean", "workspace_rejected_other_state",
    "workspace_lock_projection", "workspace_projection_verify",
    "workspace_projection_recheck", "catalog", "source_tree", "source_fingerprint",
    "source_recheck", "workspace_recheck", "output_root_selector",
    "context_contract", "output_root_contract", "candidate_file", "plist_classification",
    "evidence_encoding", "output_publication", "output_published", "ready_marker",
    "ready_marker_appended", "complete",
})


WORKSPACE_SHAPES = frozenset({
    "simple", "rename_copy", "malformed", "unsupported_status", "unavailable",
})
WORKSPACE_STATUS_CLASSES = frozenset({
    "absent", "unchanged", "modified", "type_changed", "added", "deleted", "unmerged", "unknown",
})
WORKSPACE_OTHER_CLASSES = frozenset({"absent", "present", "unknown"})
WORKSPACE_STATUS_BYTES = {
    32: "unchanged", 77: "modified", 84: "type_changed",
    65: "added", 68: "deleted", 85: "unmerged",
}


def classify_workspace_status(status):
    # Observational only. Never decode, normalize, serialize or retain paths.
    # The caller already read at most 16 KiB; preserve that diagnostic bound.
    def unknown(shape):
        return (shape, "unknown", "unknown", "unknown", "unknown", "unknown")

    if type(status) is not bytes or len(status) > 16 * 1024:
        return unknown("unavailable")
    if not status:
        return ("simple", "absent", "absent", "absent", "absent", "absent")
    if not status.endswith(b"\0"):
        return unknown("malformed")
    records = status[:-1].split(b"\0")
    known = {IOS_LOCK.encode(): None, IOS_DEBUG.encode(): None}
    seen = set()
    other = "absent"
    for index, record in enumerate(records):
        if len(record) < 4 or record[2:3] != b" ":
            return unknown("malformed")
        columns, name = record[:2], record[3:]
        if any(value not in WORKSPACE_STATUS_BYTES and value not in (82, 67) for value in columns):
            return unknown("unsupported_status")
        if columns == b"  ":
            return unknown("unsupported_status")
        if b"R" in columns or b"C" in columns:
            # Rename/copy has a second NUL-delimited name. Do not mistake it
            # for another status entry or infer any path-specific conclusion.
            return unknown("rename_copy" if index + 1 < len(records) and records[index + 1]
                           else "malformed")
        if name in seen:
            return unknown("malformed")
        seen.add(name)
        if name in known:
            known[name] = tuple(WORKSPACE_STATUS_BYTES[value] for value in columns)
        else:
            other = "present"
    lock = known[IOS_LOCK.encode()] or ("absent", "absent")
    debug = known[IOS_DEBUG.encode()] or ("absent", "absent")
    return ("simple", *lock, *debug, other)


def write_capture_phase(line):
    # _emit contains descriptor, encoding and write failures. Bypass buffering
    # so failed diagnostics cannot be retried by interpreter shutdown flushing.
    os.write(sys.stderr.fileno(), line.encode("ascii"))


class CapturePhaseDiagnostics:
    """Fixed, best-effort observations; never evidence or acceptance authority."""

    def __init__(self, write):
        self._write = write
        self._phase = "arguments"
        self._attempts = 0
        self._failed = False
        self._workspace_attempted = False
        self._writing = False

    def _emit(self, prefix, phase):
        # Count failed writes too; callbacks cannot select phases or spend budget.
        self._attempts += 1
        self._writing = True
        try:
            self._write(prefix + phase + "\n")
        except Exception:
            pass
        finally:
            self._writing = False

    def phase(self, phase):
        if self._writing or type(phase) is not str or phase not in CAPTURE_PHASES or self._failed:
            return
        self._phase = phase
        # Reserve one attempt for the terminal failure phase, even at the cap.
        if self._attempts < CAPTURE_PHASE_LIMIT - 1:
            self._emit("package_capture_phase=", phase)

    def workspace_rejection(self, status, job_matches):
        if (self._writing or type(job_matches) is not bool or self._failed or self._workspace_attempted
                or self._attempts >= CAPTURE_PHASE_LIMIT - 1):
            return
        # Set before classification/write, including a reentrant or failed writer.
        self._workspace_attempted = True
        values = classify_workspace_status(status)
        if (type(values) is not tuple or len(values) != 6
                or any(type(value) is not str for value in values)
                or values[0] not in WORKSPACE_SHAPES
                or any(value not in WORKSPACE_STATUS_CLASSES for value in values[1:5])
                or values[5] not in WORKSPACE_OTHER_CLASSES):
            return
        summary = ("job:%s;shape:%s;lock_index:%s;lock_worktree:%s;"
                   "debug_index:%s;debug_worktree:%s;other:%s") % (
                       "match" if job_matches else "mismatch", *values)
        # This observation shares the phase budget but never selects a phase.
        self._emit("package_capture_workspace=", summary)

    def failure(self):
        if self._writing or self._failed:
            return
        self._failed = True
        self._emit("package_capture_failure_phase=", self._phase)


def diagnostic_phase(diagnostics, phase):
    try:
        if diagnostics is not None:
            diagnostics.phase(phase)
    except Exception:
        pass


def diagnostic_workspace_rejection(diagnostics, status, job_matches):
    try:
        if diagnostics is not None:
            diagnostics.workspace_rejection(status, job_matches)
    except Exception:
        pass


def diagnostic_failure(diagnostics):
    try:
        if diagnostics is not None:
            diagnostics.failure()
    except Exception:
        pass

# Invoke the existing exported pure function, not its path-sensitive CLI main.
# Node's built-in data-module import consumes the exact committed bytes supplied
# on stdin. No repository module path is reopened and no custom loader is used.
PROJECTION_BRIDGE = """import { readFileSync } from 'node:fs';
if (process.argv.length !== 1) throw new Error('unexpected verifier arguments');
const input = JSON.parse(readFileSync(0, 'utf8'));
const verifier = await import('data:text/javascript;base64,' + input.verifier);
verifier.verifyIosTestPodfileLock(
  Buffer.from(input.production, 'base64').toString('utf8'),
  Buffer.from(input.projected, 'base64').toString('utf8'));
"""


def require(value):
    if not value:
        raise ValueError("capture boundary rejected")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def identity(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def projection_identity(s):
    # Internal drift evidence only; never serialized into public provenance.
    return (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def open_owned(root, relative, limit, *, identity_sink=None):
    require(identity_sink is None or type(identity_sink) is list)
    observed_identity = identity if identity_sink is None else projection_identity
    require(root.is_absolute() and root.resolve() == root)
    require(root.lstat().st_uid == os.getuid() and stat.S_ISDIR(root.lstat().st_mode))
    parts = Path(relative).parts
    require(parts and not Path(relative).is_absolute() and all(x not in (".", "..") for x in parts))
    p = root
    for part in parts[:-1]:
        p = p / part
        s = p.lstat()
        require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid())
    p = root / relative
    before = p.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
            and before.st_nlink == 1 and 0 < before.st_size <= limit)
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        require(observed_identity(os.fstat(fd)) == observed_identity(before))
        digest = hashlib.sha256()
        content = bytearray() if limit <= MAX_PLIST else None
        total = 0
        while chunk := os.read(fd, min(1024 * 1024, limit + 1 - total)):
            total += len(chunk)
            require(total <= limit)
            digest.update(chunk)
            if content is not None:
                content.extend(chunk)
        require(total == before.st_size and observed_identity(os.fstat(fd)) == observed_identity(before)
                and observed_identity(p.lstat()) == observed_identity(before))
        if identity_sink is not None:
            identity_sink.append(observed_identity(before))
        return {"bytes": total, "sha256": digest.hexdigest()}, bytes(content) if content is not None else None
    finally:
        os.close(fd)


def source_fingerprint(listing):
    require(isinstance(listing, bytes) and 0 < len(listing) <= 32 * 1024 * 1024
            and listing.endswith(b"\0"))
    digest = hashlib.sha256()
    excluded = 0
    seen = set()
    for record in listing[:-1].split(b"\0"):
        fields = record.split(b"\t", 1)
        require(len(fields) == 2 and re.fullmatch(rb"(?:100644|100755|120000) blob [0-9a-f]{40}", fields[0]))
        name = fields[1]
        require(name and name not in seen)
        seen.add(name)
        if name == INVENTORY.encode():
            excluded += 1
        else:
            digest.update(record + b"\0")
    require(excluded == 1 and len(seen) > 1)
    return digest.hexdigest()


def validate_context(context, platform):
    require(type(context) is dict)
    combined = context.get("workspaceState") == IOS_COMBINED_STATE
    require(set(context) == (CONTEXT_KEYS | {"workspaceDebugSha256"} if combined else CONTEXT_KEYS))
    require(platform in ("android", "ios"))
    for key in ("sourceSha", "sourceTree", "workflowSha"):
        require(type(context[key]) is str and re.fullmatch(r"[0-9a-f]{40}", context[key]))
    for key in ("sourceTreeFingerprint", "catalogSha256"):
        require(type(context[key]) is str and re.fullmatch(r"[0-9a-f]{64}", context[key]))
    require(type(context["workflowRef"]) is str and re.fullmatch(
        re.escape(REPOSITORY + "/" + WORKFLOW + "@") +
        r"(?:refs/heads/[A-Za-z0-9_./-]{1,160}|refs/pull/[1-9][0-9]{0,9}/merge)", context["workflowRef"]))
    require(type(context["runId"]) is str and re.fullmatch(r"[1-9][0-9]{0,19}", context["runId"]))
    require(type(context["runAttempt"]) is str and re.fullmatch(r"[1-9][0-9]{0,2}", context["runAttempt"]))
    require(context["job"] == platform + "-native-acceptance")
    if context["workspaceState"] == "clean":
        require(context["workspaceLockSha256"] is None)
    else:
        require(platform == "ios"
                and context["workspaceState"] in ("verified_ios_test_lock_projection", IOS_COMBINED_STATE)
                and type(context["workspaceLockSha256"]) is str
                and re.fullmatch(r"[0-9a-f]{64}", context["workspaceLockSha256"]))
        if combined:
            require(type(context["workspaceDebugSha256"]) is str
                    and context["workspaceDebugSha256"] == IOS_DEBUG_PROJECTED_SHA256)


def read_git(repo, args, limit, popen=subprocess.Popen):
    # Bound buffered memory; drain excess until normal child exit. No timeout,
    # signal, early pipe close or fallback termination is introduced.
    child = popen(["/usr/bin/git", "--no-optional-locks", "-C", str(repo), *args],
                  stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    data = bytearray()
    oversized = False
    try:
        while chunk := child.stdout.read(64 * 1024):
            remaining = max(0, limit - len(data))
            data.extend(chunk[:remaining])
            oversized = oversized or len(chunk) > remaining
    finally:
        code = child.wait()
    require(code == 0 and not oversized)
    return bytes(data)


def verify_lock_projection(expected_verifier, production, projected, diagnostics):
    # Existing export uses pure string projection. Its CLI main deliberately is
    # not entered: import.meta.url would otherwise resolve a repository path.
    payload = json.dumps({key: base64.b64encode(value).decode("ascii")
                          for key, value in {"verifier": expected_verifier,
                                             "production": production,
                                             "projected": projected}.items()}).encode("ascii")
    require(len(payload) <= 6 * MAX_PLIST)
    node = shutil.which("node", path=os.environ.get("PATH", os.defpath))
    require(node is not None and Path(node).is_absolute())
    diagnostic_phase(diagnostics, "workspace_projection_verify")
    verified = subprocess.run([node, "--input-type=module", "--eval", PROJECTION_BRIDGE],
                              input=payload, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              env={"PATH": os.environ.get("PATH", os.defpath), "LANG": "C", "LC_ALL": "C"},
                              check=False)
    require(verified.returncode == 0)


def check_combined_workspace(source_sha, git):
    require(git("rev-parse", "HEAD").decode("ascii").strip() == source_sha)
    require(git("status", "--porcelain", "-z", "--untracked-files=no") == IOS_COMBINED_STATUS)


def combined_projection_snapshot(repo, source_sha, git):
    # Bounded drift evidence, not a filesystem snapshot or package attestation.
    # Untracked build outputs retain the existing status handling.
    check_combined_workspace(source_sha, git)
    baselines = {}
    for path in (IOS_DEBUG, IOS_LOCK, IOS_LOCK_VERIFIER):
        raw = git("show", source_sha + ":" + path)
        require(type(raw) is bytes and 0 < len(raw) <= MAX_PLIST)
        baselines[path] = raw
    require(baselines[IOS_DEBUG] == IOS_DEBUG_SOURCE
            and sha(baselines[IOS_DEBUG]) == IOS_DEBUG_SOURCE_SHA256)
    # Bind modes and index identities to the actual immutable baseline bytes,
    # not merely to a plausible-looking ls-tree record.
    blobs = {path: hashlib.sha1(b"blob " + str(len(baselines[path])).encode("ascii")
                               + b"\0" + baselines[path]).hexdigest()
             for path in (IOS_DEBUG, IOS_LOCK)}
    source_entries = b"".join(
        b"100644 blob " + blobs[path].encode("ascii") + b"\t" + path.encode("ascii") + b"\0"
        for path in (IOS_DEBUG, IOS_LOCK))
    index_entries = b"".join(
        b"100644 " + blobs[path].encode("ascii") + b" 0\t" + path.encode("ascii") + b"\0"
        for path in (IOS_DEBUG, IOS_LOCK))
    require(git("ls-tree", "-z", source_sha, "--", IOS_DEBUG, IOS_LOCK) == source_entries)
    require(git("ls-files", "--stage", "-z", "--", IOS_DEBUG, IOS_LOCK) == index_entries)
    _, verifier = open_owned(repo, IOS_LOCK_VERIFIER, MAX_PLIST)
    require(verifier == baselines[IOS_LOCK_VERIFIER])
    files = {}
    for path in (IOS_DEBUG, IOS_LOCK):
        identities = []
        observation, raw = open_owned(repo, path, MAX_PLIST, identity_sink=identities)
        require(len(identities) == 1)
        file_identity = identities[0]
        require(stat.S_ISREG(file_identity[2]) and not file_identity[2] & 0o111)
        files[path] = (observation, raw, file_identity)
    debug_observation, debug, _ = files[IOS_DEBUG]
    require(debug == IOS_DEBUG_PREFIX + baselines[IOS_DEBUG]
            and debug_observation["sha256"] == IOS_DEBUG_PROJECTED_SHA256)
    check_combined_workspace(source_sha, git)
    # Identities and captured source bytes remain private throughout the caller.
    return {"baselines": baselines, "sourceEntries": source_entries,
            "indexEntries": index_entries, "files": files}


def workspace_observation(repo, source_sha, env, git, diagnostics=None):
    diagnostic_phase(diagnostics, "workspace_status")
    status = git("status", "--porcelain", "-z", "--untracked-files=no")
    if status == b"":
        diagnostic_phase(diagnostics, "workspace_clean")
        return {"workspaceState": "clean", "workspaceLockSha256": None}, None
    job_matches = env.get("GITHUB_JOB") == "ios-native-acceptance"
    combined = (job_matches and status == IOS_COMBINED_STATUS)
    # Admit only the existing lock projection or the exact source-bound pair.
    # Never restore a dirty path or exempt arbitrary CocoaPods changes.
    allowed = (env.get("GITHUB_JOB") == "ios-native-acceptance"
               and status == b" M " + IOS_LOCK.encode() + b"\0")
    diagnostic_phase(diagnostics, "workspace_lock_projection" if allowed or combined
                     else "workspace_rejected_other_state")
    if not (allowed or combined):
        diagnostic_workspace_rejection(diagnostics, status, job_matches)
    require(allowed or combined)
    if combined:
        before = combined_projection_snapshot(repo, source_sha, git)
        verify_lock_projection(before["baselines"][IOS_LOCK_VERIFIER],
                               before["baselines"][IOS_LOCK], before["files"][IOS_LOCK][1], diagnostics)
        diagnostic_phase(diagnostics, "workspace_projection_recheck")
        after = combined_projection_snapshot(repo, source_sha, git)
        require(before == after)
        return {"workspaceState": IOS_COMBINED_STATE,
                "workspaceLockSha256": before["files"][IOS_LOCK][0]["sha256"],
                "workspaceDebugSha256": before["files"][IOS_DEBUG][0]["sha256"]}, before
    production = git("show", source_sha + ":" + IOS_LOCK)
    require(type(production) is bytes and 0 < len(production) <= MAX_PLIST)
    expected_verifier = git("show", source_sha + ":" + IOS_LOCK_VERIFIER)
    _, verifier = open_owned(repo, IOS_LOCK_VERIFIER, MAX_PLIST)
    require(verifier == expected_verifier)
    before, projected = open_owned(repo, IOS_LOCK, MAX_PLIST)
    verify_lock_projection(expected_verifier, production, projected, diagnostics)
    diagnostic_phase(diagnostics, "workspace_projection_recheck")
    after, _ = open_owned(repo, IOS_LOCK, MAX_PLIST)
    require(before == after)
    return {"workspaceState": "verified_ios_test_lock_projection",
            "workspaceLockSha256": before["sha256"]}, None


def workspace_context(repo, source_sha, env, git, diagnostics=None):
    # Preserve the public dictionary return; filesystem identities stay private.
    context, _ = workspace_observation(repo, source_sha, env, git, diagnostics)
    return context


def collect_context(repo, source_sha, env, git=None, diagnostics=None):
    diagnostic_phase(diagnostics, "hosted_environment")
    require(env.get("GITHUB_ACTIONS") == "true" and env.get("CI") == "true"
            and env.get("SETTLEORA_PACKAGE_FAILURE_CAPTURE") == "hosted_v1"
            and env.get("GITHUB_REPOSITORY") == REPOSITORY)
    diagnostic_phase(diagnostics, "repository_identity")
    require(repo.is_absolute() and repo.resolve() == repo)
    if git is None:
        def git(*args):
            limit = MAX_PLIST if args[0] == "show" else (32 * 1024 * 1024 if args[0] == "ls-tree" else 16 * 1024)
            return read_git(repo, args, limit)
    diagnostic_phase(diagnostics, "source_head")
    require(re.fullmatch(r"[0-9a-f]{40}", source_sha or ""))
    require(git("rev-parse", "HEAD").decode("ascii").strip() == source_sha)
    workspace, workspace_proof = workspace_observation(repo, source_sha, env, git, diagnostics=diagnostics)
    # Bind the catalog to the named immutable Git object, not a mutable path.
    diagnostic_phase(diagnostics, "catalog")
    catalog = git("show", source_sha + ":apps/mobile/assets/receipt_ocr_models/catalog.json")
    require(isinstance(catalog, bytes) and 0 < len(catalog) <= MAX_PLIST)
    diagnostic_phase(diagnostics, "source_tree")
    source_tree = git("rev-parse", source_sha + "^{tree}").decode("ascii").strip()
    diagnostic_phase(diagnostics, "source_fingerprint")
    fingerprint = source_fingerprint(git("ls-tree", "-r", "-z", "--full-tree", source_sha))
    context = {"sourceSha": source_sha,
               "sourceTree": source_tree,
               "sourceTreeFingerprint": fingerprint,
               "catalogSha256": sha(catalog),
               "workflowSha": env.get("CAPTURE_WORKFLOW_SHA"),
               "workflowRef": env.get("CAPTURE_WORKFLOW_REF"),
               "runId": env.get("GITHUB_RUN_ID"), "runAttempt": env.get("GITHUB_RUN_ATTEMPT"),
               "job": env.get("GITHUB_JOB")}
    context.update(workspace)
    # Drift detection only: no atomic source-to-package snapshot/attestation claim.
    diagnostic_phase(diagnostics, "source_recheck")
    require(git("rev-parse", "HEAD").decode("ascii").strip() == source_sha)
    diagnostic_phase(diagnostics, "workspace_recheck")
    rechecked, rechecked_proof = workspace_observation(repo, source_sha, env, git, diagnostics=diagnostics)
    require(rechecked == workspace and rechecked_proof == workspace_proof)
    if workspace_proof is not None:
        # The last check still detects drift only; it does not establish atomicity.
        check_combined_workspace(source_sha, git)
    return context


def public_plist(data):
    """Exact encodings only: no ignored comments, padding, objects or trailing bytes."""
    value = plistlib.loads(data)
    require(type(value) is dict)
    required = {"CFBundleIdentifier", "CFBundleName", "CFBundlePackageType"}
    require(required <= set(value) and len(value) <= 24)
    exact = {"CFBundleIdentifier": "org.cocoapods.image-picker-ios-privacy",
             "CFBundleName": "image_picker_ios_privacy", "CFBundlePackageType": "BNDL",
             "CFBundleInfoDictionaryVersion": "6.0", "CFBundleDevelopmentRegion": "en",
             "CFBundleSignature": "????", "DTCompiler": "com.apple.compilers.llvm.clang.1_0",
             "DTPlatformName": "iphoneos", "DTXcode": "1640"}
    versions = {"CFBundleShortVersionString", "CFBundleVersion", "MinimumOSVersion", "DTPlatformVersion"}
    builds = {"BuildMachineOSBuild", "DTPlatformBuild", "DTSDKBuild", "DTXcodeBuild"}
    for key, item in value.items():
        if key in exact:
            require(type(item) is str and item == exact[key])
        elif key in versions:
            require(type(item) is str and re.fullmatch(r"[0-9]{1,3}(?:\.[0-9]{1,3}){0,2}", item))
        elif key in builds:
            require(type(item) is str and re.fullmatch(r"[0-9]{2}[A-Z][0-9]{1,4}[a-z]?", item))
        elif key == "DTSDKName":
            require(type(item) is str and re.fullmatch(r"iphoneos[0-9]{1,2}\.[0-9]{1,2}", item))
        elif key == "CFBundleSupportedPlatforms":
            require(item == ["iPhoneOS"])
        elif key == "UIDeviceFamily":
            require(type(item) is list and item in ([1], [2], [1, 2]) and all(type(x) is int for x in item))
        elif key == "LSRequiresIPhoneOS":
            require(item is True)
        else:
            raise ValueError("unclassified bundle metadata")
    require(any(data == plistlib.dumps(value, fmt=fmt, sort_keys=ordered)
                for fmt in (plistlib.FMT_XML, plistlib.FMT_BINARY) for ordered in (False, True)))
    return True


def atomic_output(root, name, data, limit):
    require(0 < len(data) <= limit and root.resolve() == root and root.lstat().st_uid == os.getuid())
    final = root / name
    partial = root / (name + ".partial")
    # Keep the written descriptor open through linking, then verify the final
    # selector names that inode and its complete bytes before the step returns.
    # This detects concurrent handoff changes, not malicious later same-user edits.
    with partial.open("x+b") as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
        written = os.fstat(output.fileno())
        source = partial.lstat()
        require((source.st_dev, source.st_ino) == (written.st_dev, written.st_ino))
        try:
            os.link(partial, final, follow_symlinks=False)
            selected = final.lstat()
            require(stat.S_ISREG(selected.st_mode) and
                    (selected.st_dev, selected.st_ino) == (written.st_dev, written.st_ino))
            output.seek(0)
            require(output.read(limit + 1) == data and selected.st_size == len(data))
            selected_after = final.lstat()
            require(identity(selected_after) == identity(selected))
        except Exception:
            # Preserve all paths on a failed handoff: a replacement may belong
            # to another writer. No ready output is emitted, so upload excludes it.
            raise
    # Preserve the excluded partial too; never unlink a potentially replaced path.


def capture(platform, root, context, diagnostics=None):
    diagnostic_phase(diagnostics, "context_contract")
    validate_context(context, platform)
    diagnostic_phase(diagnostics, "output_root_contract")
    require(root.is_absolute() and root.resolve() == root and stat.S_ISDIR(root.lstat().st_mode)
            and root.lstat().st_uid == os.getuid())
    version = 2 if context["workspaceState"] == IOS_COMBINED_STATE else 1
    evidence = {"schemaVersion": version, "kind": "package_failure_observation", "platform": platform,
                "accepted": False, "bindingKind": "hosted_workflow_observation_not_attestation",
                "repository": REPOSITORY, "context": context, "status": "unavailable"}
    payload = None
    try:
        diagnostic_phase(diagnostics, "candidate_file")
        relative = ("settleora-verified-production.apk" if platform == "android" else
                    "ios-candidate-package/apps/mobile/build/ios/iphoneos/Runner.app/" + PRIVACY_PATH)
        observation, raw = open_owned(root, relative, MAX_APK if platform == "android" else MAX_PLIST)
        evidence["file"] = observation
        if platform == "android":
            evidence.update(status="observed", contentRetained=False,
                            verification="not_granted_by_capture")
        else:
            try:
                diagnostic_phase(diagnostics, "plist_classification")
                public_plist(raw)
                evidence.update(status="observed", contentRetained=True, path=PRIVACY_PATH,
                                classification="canonical_allowlisted_public_bundle_metadata")
                payload = raw
            except Exception:
                evidence.update(reason="unclassified_or_noncanonical_plist", contentRetained=False)
    except Exception:
        evidence.update(reason="missing_unsafe_or_changed_file", contentRetained=False)
    diagnostic_phase(diagnostics, "evidence_encoding")
    encoded = (json.dumps(evidence, separators=(",", ":")) + "\n").encode()
    require(len(encoded) <= MAX_JSON)
    if platform == "android":
        diagnostic_phase(diagnostics, "output_publication")
        atomic_output(root, "android-package-failure-capture.json", encoded, MAX_JSON)
    else:
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("provenance.json", encoded)
            if payload is not None:
                archive.writestr("Info.plist", payload)
        diagnostic_phase(diagnostics, "output_publication")
        atomic_output(root, "ios-package-failure-evidence.zip", stream.getvalue(), MAX_ZIP)
    diagnostic_phase(diagnostics, "output_published")
    return evidence


def append_ready(root, output_path):
    # Existing GitHub step-output channel, never an acceptance/authentication flag.
    parent = root / "_runner_file_commands"
    require(parent.resolve() == parent and stat.S_ISDIR(parent.lstat().st_mode)
            and parent.lstat().st_uid == os.getuid())
    require(output_path.parent == parent and re.fullmatch(
        r"set_output_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", output_path.name))
    before = output_path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
            and before.st_nlink == 1 and 0 <= before.st_size <= 1024 * 1024)
    fd = os.open(output_path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino))
        line = b"\npackage_failure_capture_ready=true\n"
        require(os.write(fd, line) == len(line))
        os.fsync(fd)
    finally:
        os.close(fd)


def capture_and_mark(platform, root, context, mark_ready, diagnostics=None):
    result = capture(platform, root, context, diagnostics=diagnostics)
    diagnostic_phase(diagnostics, "ready_marker")
    mark_ready()  # Only after the complete selected bytes were verified.
    diagnostic_phase(diagnostics, "ready_marker_appended")
    return result


def main(diagnostics=None):
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--platform", choices=("android", "ios"), required=True)
        parser.add_argument("--source-sha", required=True)
        parser.add_argument("--repo-root", required=True, type=Path)
        args = parser.parse_args()
        # Preserve Android and argparse-error output. No new CLI switch or
        # environment authority is introduced by these iOS observations.
        if diagnostics is None and args.platform == "ios":
            diagnostics = CapturePhaseDiagnostics(write_capture_phase)
        diagnostic_phase(diagnostics, "arguments")
        context = collect_context(args.repo_root, args.source_sha, os.environ, diagnostics=diagnostics)
        diagnostic_phase(diagnostics, "output_root_selector")
        root = Path(os.environ.get("RUNNER_TEMP", "/nonexistent"))
        require(str(root) in ("/home/runner/work/_temp", "/Users/runner/work/_temp"))
        output_path = Path(os.environ.get("GITHUB_OUTPUT", "/nonexistent"))
        capture_and_mark(args.platform, root, context, lambda: append_ready(root, output_path),
                         diagnostics=diagnostics)
        diagnostic_phase(diagnostics, "complete")
    except Exception:
        diagnostic_failure(diagnostics)
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Neither raw input nor exception strings may enter retained logs.
        sys.stderr.write("bounded_package_failure_capture_unavailable\n")
        sys.exit(1)
