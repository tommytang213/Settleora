#!/usr/bin/env python3
"""Failure-only package observations. Never grants package/native acceptance.

No package payload is exported on Android. An iOS raw plist is retained only
when its entire encoding is canonical and every decoded value is classified
public bundle metadata. Unknown encodings/values yield hash-only unavailable
observations. Existing verifier failures remain authoritative.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import re
import stat
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
IOS_LOCK_VERIFIER = "tools/ocr-models/verify-ios-test-podfile-lock.mjs"
WORKFLOW = ".github/workflows/mobile-ocr-native-acceptance.yml"
REPOSITORY = "tommytang213/Settleora"
CONTEXT_KEYS = {"sourceSha", "sourceTree", "sourceTreeFingerprint", "catalogSha256",
                "workflowSha", "workflowRef", "runId", "runAttempt", "job",
                "workspaceState", "workspaceLockSha256"}


def require(value):
    if not value:
        raise ValueError("capture boundary rejected")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def identity(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def open_owned(root, relative, limit):
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
        require(identity(os.fstat(fd)) == identity(before))
        digest = hashlib.sha256()
        content = bytearray() if limit <= MAX_PLIST else None
        total = 0
        while chunk := os.read(fd, min(1024 * 1024, limit + 1 - total)):
            total += len(chunk)
            require(total <= limit)
            digest.update(chunk)
            if content is not None:
                content.extend(chunk)
        require(total == before.st_size and identity(os.fstat(fd)) == identity(before)
                and identity(p.lstat()) == identity(before))
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
    require(type(context) is dict and set(context) == CONTEXT_KEYS)
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
        require(platform == "ios" and context["workspaceState"] == "verified_ios_test_lock_projection"
                and type(context["workspaceLockSha256"]) is str
                and re.fullmatch(r"[0-9a-f]{64}", context["workspaceLockSha256"]))


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


def workspace_context(repo, source_sha, env, git):
    status = git("status", "--porcelain", "-z", "--untracked-files=no")
    if status == b"":
        return {"workspaceState": "clean", "workspaceLockSha256": None}
    # Only the existing, exact test-only projection is admissible. Never restore
    # a dirty path or exempt arbitrary CocoaPods changes from source binding.
    require(env.get("GITHUB_JOB") == "ios-native-acceptance"
            and status == b" M " + IOS_LOCK.encode() + b"\0")
    production = git("show", source_sha + ":" + IOS_LOCK)
    require(type(production) is bytes and 0 < len(production) <= MAX_PLIST)
    expected_verifier = git("show", source_sha + ":" + IOS_LOCK_VERIFIER)
    _, verifier = open_owned(repo, IOS_LOCK_VERIFIER, MAX_PLIST)
    require(verifier == expected_verifier)
    before, _ = open_owned(repo, IOS_LOCK, MAX_PLIST)
    # Existing verifier uses only Node standard-library reads, no hooks, writes,
    # network, SDK, timers or signaling. Its CLI compares stdin with this lock.
    verified = subprocess.run(["node", str(repo / IOS_LOCK_VERIFIER)], input=production,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              env={"PATH": os.environ.get("PATH", os.defpath), "LANG": "C", "LC_ALL": "C"})
    require(verified.returncode == 0)
    after, _ = open_owned(repo, IOS_LOCK, MAX_PLIST)
    require(before == after)
    return {"workspaceState": "verified_ios_test_lock_projection",
            "workspaceLockSha256": before["sha256"]}


def collect_context(repo, source_sha, env, git=None):
    require(env.get("GITHUB_ACTIONS") == "true" and env.get("CI") == "true"
            and env.get("SETTLEORA_PACKAGE_FAILURE_CAPTURE") == "hosted_v1"
            and env.get("GITHUB_REPOSITORY") == REPOSITORY)
    require(repo.is_absolute() and repo.resolve() == repo)
    if git is None:
        def git(*args):
            limit = MAX_PLIST if args[0] == "show" else (32 * 1024 * 1024 if args[0] == "ls-tree" else 16 * 1024)
            return read_git(repo, args, limit)
    require(re.fullmatch(r"[0-9a-f]{40}", source_sha or ""))
    require(git("rev-parse", "HEAD").decode("ascii").strip() == source_sha)
    workspace = workspace_context(repo, source_sha, env, git)
    # Bind the catalog to the named immutable Git object, not a mutable path.
    catalog = git("show", source_sha + ":apps/mobile/assets/receipt_ocr_models/catalog.json")
    require(isinstance(catalog, bytes) and 0 < len(catalog) <= MAX_PLIST)
    context = {"sourceSha": source_sha,
               "sourceTree": git("rev-parse", source_sha + "^{tree}").decode("ascii").strip(),
               "sourceTreeFingerprint": source_fingerprint(git("ls-tree", "-r", "-z", "--full-tree", source_sha)),
               "catalogSha256": sha(catalog),
               "workflowSha": env.get("CAPTURE_WORKFLOW_SHA"),
               "workflowRef": env.get("CAPTURE_WORKFLOW_REF"),
               "runId": env.get("GITHUB_RUN_ID"), "runAttempt": env.get("GITHUB_RUN_ATTEMPT"),
               "job": env.get("GITHUB_JOB")}
    context.update(workspace)
    # Drift detection only: no atomic source-to-package snapshot/attestation claim.
    require(git("rev-parse", "HEAD").decode("ascii").strip() == source_sha)
    require(workspace_context(repo, source_sha, env, git) == workspace)
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


def capture(platform, root, context):
    validate_context(context, platform)
    require(root.is_absolute() and root.resolve() == root and stat.S_ISDIR(root.lstat().st_mode)
            and root.lstat().st_uid == os.getuid())
    evidence = {"schemaVersion": 1, "kind": "package_failure_observation", "platform": platform,
                "accepted": False, "bindingKind": "hosted_workflow_observation_not_attestation",
                "repository": REPOSITORY, "context": context, "status": "unavailable"}
    payload = None
    try:
        relative = ("settleora-verified-production.apk" if platform == "android" else
                    "ios-candidate-package/apps/mobile/build/ios/iphoneos/Runner.app/" + PRIVACY_PATH)
        observation, raw = open_owned(root, relative, MAX_APK if platform == "android" else MAX_PLIST)
        evidence["file"] = observation
        if platform == "android":
            evidence.update(status="observed", contentRetained=False,
                            verification="not_granted_by_capture")
        else:
            try:
                public_plist(raw)
                evidence.update(status="observed", contentRetained=True, path=PRIVACY_PATH,
                                classification="canonical_allowlisted_public_bundle_metadata")
                payload = raw
            except Exception:
                evidence.update(reason="unclassified_or_noncanonical_plist", contentRetained=False)
    except Exception:
        evidence.update(reason="missing_unsafe_or_changed_file", contentRetained=False)
    encoded = (json.dumps(evidence, separators=(",", ":")) + "\n").encode()
    require(len(encoded) <= MAX_JSON)
    if platform == "android":
        atomic_output(root, "android-package-failure-capture.json", encoded, MAX_JSON)
    else:
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("provenance.json", encoded)
            if payload is not None:
                archive.writestr("Info.plist", payload)
        atomic_output(root, "ios-package-failure-evidence.zip", stream.getvalue(), MAX_ZIP)
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


def capture_and_mark(platform, root, context, mark_ready):
    result = capture(platform, root, context)
    mark_ready()  # Only after the complete selected bytes were verified.
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=("android", "ios"), required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--repo-root", required=True, type=Path)
    args = parser.parse_args()
    context = collect_context(args.repo_root, args.source_sha, os.environ)
    root = Path(os.environ.get("RUNNER_TEMP", "/nonexistent"))
    require(str(root) in ("/home/runner/work/_temp", "/Users/runner/work/_temp"))
    output_path = Path(os.environ.get("GITHUB_OUTPUT", "/nonexistent"))
    capture_and_mark(args.platform, root, context, lambda: append_ready(root, output_path))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Neither raw input nor exception strings may enter retained logs.
        sys.stderr.write("bounded_package_failure_capture_unavailable\n")
        sys.exit(1)
