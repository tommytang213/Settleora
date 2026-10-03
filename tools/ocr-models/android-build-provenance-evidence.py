#!/usr/bin/env python3
"""Record bounded toolchain identity for a failed Android package check."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path


MAX_COMMAND_OUTPUT = 16 * 1024
MAX_EVIDENCE_BYTES = 4096
MAX_VERSION_LENGTH = 64
VERSION = re.compile(r"[0-9]+(?:\.[0-9]+){2,3}(?:\+[0-9]+)?\Z")
REVISION = re.compile(r"[0-9a-f]{40}\Z")
NDK_VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")
JAVA_RUNTIME_BUILD = re.compile(r"([0-9]+(?:\.[0-9]+){2,3}\+[0-9]+)(?:-LTS)?\Z")


def _command(tool):
    # Only these fixed commands are needed; toolchain paths are measured by
    # the workflow and passed as version strings after its bounded checks.
    commands = {
        "flutter": ("flutter", "--version", "--machine"),
        "java": ("java", "-XshowSettings:properties", "-version"),
    }
    try:
        result = subprocess.run(commands[tool], capture_output=True,
                                timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if (result.returncode != 0 or len(result.stdout) + len(result.stderr) >
            MAX_COMMAND_OUTPUT):
        return None
    return (result.stdout + result.stderr).decode("utf-8", errors="replace")


def _version(value, pattern=VERSION):
    return (value if isinstance(value, str) and
            len(value) <= MAX_VERSION_LENGTH and pattern.fullmatch(value) else None)


def _flutter():
    output = _command("flutter")
    try:
        value = json.loads(output) if output else {}
    except json.JSONDecodeError:
        value = {}
    if not isinstance(value, dict):
        value = {}
    return {
        "frameworkVersion": _version(value.get("frameworkVersion")),
        "frameworkRevision": _version(value.get("frameworkRevision"), REVISION),
        "engineRevision": _version(value.get("engineRevision"), REVISION),
        "dartSdkVersion": _version(value.get("dartSdkVersion")),
    }


def _java():
    output = _command("java") or ""
    version = re.search(r"^\s*java\.version\s*=\s*(\S+)\s*$", output, re.MULTILINE)
    runtime = re.search(r"^\s*java\.runtime\.version\s*=\s*(\S+)\s*$", output,
                        re.MULTILINE)
    vendor = re.search(r"^\s*java\.vendor\s*=\s*(.*?)\s*$", output, re.MULTILINE)
    parsed_version = _version(version.group(1)) if version else None
    runtime_value = runtime.group(1) if runtime else None
    runtime_build = (JAVA_RUNTIME_BUILD.fullmatch(runtime_value)
                     if runtime_value and len(runtime_value) <= MAX_VERSION_LENGTH else None)
    if runtime_build and (not parsed_version or
                          not runtime_build.group(1).startswith(parsed_version + "+")):
        runtime_build = None
    return {
        "version": parsed_version,
        "runtimeBuild": runtime_build.group(1) if runtime_build else None,
        "vendor": "temurin" if vendor and vendor.group(1) in
        {"Eclipse Adoptium", "Eclipse Temurin"} else "other" if vendor else None,
    }


def _ndk(selected_value, installed_value, linker_value):
    selected = _version(selected_value, NDK_VERSION)
    installed_version = _version(installed_value, NDK_VERSION)
    linker_version = _version(linker_value, NDK_VERSION)
    if not selected or installed_version != selected:
        linker_version = None
    return {
        "selectedVersion": selected,
        "installedVersion": installed_version,
        "linkerVersion": linker_version,
    }


def _build_root(candidate_present):
    runner_temp = os.environ.get("RUNNER_TEMP")
    if candidate_present != "true" or not runner_temp or not Path(runner_temp).is_absolute():
        return None
    # This fixed role matches candidate_dir in mobile-ocr-native-acceptance.yml.
    root = Path(os.path.normpath(os.path.join(runner_temp, "android-candidate-package")))
    encoded = os.fsencode(root)
    if len(encoded) > 1024:
        return None
    return {
        "role": "android_candidate_package",
        "byteLength": len(encoded),
        "sha256": hashlib.sha256(encoded).hexdigest(),
    }


def build_evidence(source_sha, ndk_selected, ndk_installed, linker_version,
                   candidate_present):
    if not REVISION.fullmatch(source_sha):
        raise ValueError("Invalid source identity")
    flutter = _flutter()
    java = _java()
    ndk = _ndk(ndk_selected, ndk_installed, linker_version)
    build_root = _build_root(candidate_present)
    gradle_value = os.environ.get("ORG_GRADLE_PROJECT_settleoraReleaseEvidence")
    gradle_property = True if gradle_value == "true" else False if gradle_value == "false" else None
    complete = (build_root is not None and gradle_property is not None and
                all(value is not None for value in (*flutter.values(), *java.values(), *ndk.values())))
    return {
        "schemaVersion": 1,
        "platform": "android",
        "sourceSha": source_sha,
        "collectionStatus": "complete" if complete else "partial",
        "buildRoot": build_root,
        "flutter": flutter,
        "java": java,
        "ndk": ndk,
        "gradleVerification": {"settleoraReleaseEvidence": gradle_property},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--ndk-selected", default="")
    parser.add_argument("--ndk-installed", default="")
    parser.add_argument("--linker-version", default="")
    parser.add_argument("--candidate-root-present", default="false")
    args = parser.parse_args()
    evidence = build_evidence(args.source_sha, args.ndk_selected,
                              args.ndk_installed, args.linker_version,
                              args.candidate_root_present)
    encoded = json.dumps(evidence, separators=(",", ":")) + "\n"
    if len(encoded.encode()) > MAX_EVIDENCE_BYTES:
        raise ValueError("Bounded build provenance exceeds reviewed size")
    args.out.write_text(encoded)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never emit tool output, environment values, or filesystem paths.
        print(f"Android build provenance failed: {type(error).__name__}",
              file=sys.stderr)
        sys.exit(1)
