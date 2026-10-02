#!/usr/bin/env python3
"""Record bounded toolchain identity for a failed Android package check."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


MAX_COMMAND_OUTPUT = 16 * 1024
MAX_EVIDENCE_BYTES = 4096
VERSION = re.compile(r"[0-9]+(?:\.[0-9]+){2,3}(?:\+[0-9]+)?\Z")
REVISION = re.compile(r"[0-9a-f]{40}\Z")
NDK_VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")


def _command(*args):
    try:
        result = subprocess.run(args, capture_output=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if (result.returncode != 0 or len(result.stdout) + len(result.stderr) >
            MAX_COMMAND_OUTPUT):
        return None
    return (result.stdout + result.stderr).decode("utf-8", errors="replace")


def _small_text(path):
    try:
        if not path.is_file() or path.stat().st_size > 1024 * 1024:
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None


def _version(value, pattern=VERSION):
    return value if isinstance(value, str) and pattern.fullmatch(value) else None


def _flutter():
    output = _command("flutter", "--version", "--machine")
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
    output = _command("java", "-XshowSettings:properties", "-version") or ""
    version = re.search(r"^\s*java\.version\s*=\s*(\S+)\s*$", output, re.MULTILINE)
    vendor = re.search(r"^\s*java\.vendor\s*=\s*(.*?)\s*$", output, re.MULTILINE)
    return {
        "version": _version(version.group(1)) if version else None,
        "vendor": "temurin" if vendor and vendor.group(1) in
        {"Eclipse Adoptium", "Eclipse Temurin"} else "other" if vendor else None,
    }


def _flutter_root():
    supplied = os.environ.get("FLUTTER_ROOT")
    if supplied:
        return Path(supplied)
    executable = shutil.which("flutter")
    return Path(executable).resolve().parent.parent if executable else None


def _ndk():
    flutter_root = _flutter_root()
    android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    source = (_small_text(flutter_root / "packages/flutter_tools/gradle/src/main/kotlin/FlutterExtension.kt")
              if flutter_root else None)
    match = re.search(r'\bval ndkVersion: String = "([0-9]+\.[0-9]+\.[0-9]+)"', source or "")
    selected = _version(match.group(1), NDK_VERSION) if match else None
    if not selected or not android_home:
        return {"selectedVersion": selected, "installedVersion": None,
                "linkerVersion": None}
    ndk_root = Path(android_home) / "ndk" / selected
    properties = _small_text(ndk_root / "source.properties") or ""
    installed = re.search(r"^Pkg\.Revision\s*=\s*(\S+)\s*$", properties,
                          re.MULTILINE)
    installed_version = _version(installed.group(1), NDK_VERSION) if installed else None
    linker = ndk_root / "toolchains/llvm/prebuilt/linux-x86_64/bin/ld.lld"
    linker_output = _command(str(linker), "--version") if installed_version == selected else None
    linker_match = re.search(r"\bLLD\s+([0-9]+\.[0-9]+\.[0-9]+)\b", linker_output or "")
    return {
        "selectedVersion": selected,
        "installedVersion": installed_version,
        "linkerVersion": _version(linker_match.group(1)) if linker_match else None,
    }


def _build_root():
    runner_temp = os.environ.get("RUNNER_TEMP")
    if not runner_temp or not Path(runner_temp).is_absolute():
        return None
    # This fixed role matches candidate_dir in mobile-ocr-native-acceptance.yml.
    root = Path(os.path.normpath(os.path.join(runner_temp, "android-candidate-package")))
    encoded = os.fsencode(root)
    if not root.is_dir() or len(encoded) > 1024:
        return None
    return {
        "role": "android_candidate_package",
        "byteLength": len(encoded),
        "sha256": hashlib.sha256(encoded).hexdigest(),
    }


def build_evidence(source_sha):
    if not REVISION.fullmatch(source_sha):
        raise ValueError("Invalid source identity")
    flutter = _flutter()
    java = _java()
    ndk = _ndk()
    build_root = _build_root()
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
    args = parser.parse_args()
    evidence = build_evidence(args.source_sha)
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
