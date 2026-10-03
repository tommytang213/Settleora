"""Bounded, privacy-safe Android package build provenance tests."""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "android-build-provenance-evidence.py"
WORKFLOW = Path(__file__).resolve().parents[3] / ".github/workflows/mobile-ocr-native-acceptance.yml"
SOURCE_SHA = "a" * 40
PRIVATE = "private-receipt-sentinel"


class AndroidBuildProvenanceEvidenceTest(unittest.TestCase):
    def test_workflow_collects_provenance_before_apk_comparison(self):
        workflow = WORKFLOW.read_text()
        step = workflow.split("- name: Record bounded Android package comparison after failed measurement", 1)[1]
        step = step.split("- name: Upload bounded Android package comparison", 1)[0]
        self.assertLess(step.index("android-build-provenance-evidence.py"),
                        step.index("android-package-comparison-evidence.py"))
        self.assertIn("android-build-provenance.json", workflow)
        self.assertIn('--ndk-selected="$ndk_selected"', step)
        self.assertIn('--ndk-installed="$ndk_installed"', step)
        self.assertIn('--linker-version="$linker_version"', step)
        self.assertIn('--candidate-root-present="$candidate_present"', step)
        self.assertIn('if linker_output=$(timeout 30s "$linker" --version 2>/dev/null); then', step)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=f"{PRIVATE}-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.runner_temp = self.root / "runner-temp"
        (self.runner_temp / "android-candidate-package").mkdir(parents=True)
        self.flutter_root = self.root / "flutter"
        extension = (self.flutter_root /
                     "packages/flutter_tools/gradle/src/main/kotlin/FlutterExtension.kt")
        extension.parent.mkdir(parents=True)
        extension.write_text('val ndkVersion: String = "28.2.13676358"\n')
        self.android_home = self.root / "android-sdk"
        ndk_root = self.android_home / "ndk/28.2.13676358"
        ndk_root.mkdir(parents=True)
        (ndk_root / "source.properties").write_text("Pkg.Revision = 28.2.13676358\n")
        linker = ndk_root / "toolchains/llvm/prebuilt/linux-x86_64/bin/ld.lld"
        linker.parent.mkdir(parents=True)
        self.script(linker, "printf 'LLD 19.0.1 (compatible with GNU linkers)\\n'")
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.script(self.bin / "flutter", "printf '%s\\n' '{\"frameworkVersion\":\"3.44.8\",\"frameworkRevision\":\"" +
                    "1" * 40 + "\",\"engineRevision\":\"" + "2" * 40 +
                    "\",\"dartSdkVersion\":\"3.12.2\",\"flutterRoot\":\"" +
                    PRIVATE + "\"}'")
        self.script(self.bin / "java", "printf '    java.version = 17.0.17\\n    java.runtime.version = 17.0.17+10-LTS\\n    java.vendor = Eclipse Adoptium\\n' >&2")
        self.output = self.root / "evidence.json"

    def script(self, path, command):
        path.write_text("#!/bin/sh\n" + command + "\n")
        path.chmod(0o700)

    def run_tool(self, *, source_sha=SOURCE_SHA, overrides=None,
                 ndk_versions=("28.2.13676358", "28.2.13676358", "19.0.1"),
                 candidate_present="true"):
        env = {**os.environ,
               "PATH": f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}",
               "RUNNER_TEMP": str(self.runner_temp),
               "FLUTTER_ROOT": str(self.flutter_root),
               "ANDROID_HOME": str(self.android_home),
               "ORG_GRADLE_PROJECT_settleoraReleaseEvidence": "true"}
        if overrides:
            env.update(overrides)
        return subprocess.run(
            [sys.executable, str(SCRIPT), f"--source-sha={source_sha}",
             f"--ndk-selected={ndk_versions[0]}",
             f"--ndk-installed={ndk_versions[1]}",
             f"--linker-version={ndk_versions[2]}",
             f"--candidate-root-present={candidate_present}",
             f"--out={self.output}"], capture_output=True, text=True, env=env)

    def test_missing_candidate_directory_stays_partial(self):
        result = self.run_tool(candidate_present="false")
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(self.output.read_text())
        self.assertIsNone(value["buildRoot"])
        self.assertEqual(value["collectionStatus"], "partial")

    def test_failed_linker_probe_does_not_abort_diagnostics(self):
        linker = (self.android_home / "ndk/28.2.13676358" /
                  "toolchains/llvm/prebuilt/linux-x86_64/bin/ld.lld")
        self.script(linker, "printf 'LLD 19.0.1\\n'\nexit 42")
        workflow = WORKFLOW.read_text()
        step = workflow.split("- name: Record bounded Android package comparison after failed measurement", 1)[1]
        probe = step.split("python3 tools/ocr-models/android-build-provenance-evidence.py", 1)[0]
        probe = probe.split("run: |", 1)[1]
        env = {**os.environ, "FLUTTER_ROOT": str(self.flutter_root),
               "ANDROID_HOME": str(self.android_home),
               "RUNNER_TEMP": str(self.runner_temp)}
        result = subprocess.run(["bash", "-e", "-o", "pipefail", "-c",
                                 probe + '\nprintf "%s" "$linker_version"\n'],
                                capture_output=True, text=True, env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_rejects_unbounded_or_inconsistent_ndk_versions(self):
        result = self.run_tool(ndk_versions=("28.2.13676358", PRIVATE,
                                             "19.0.1"))
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(self.output.read_text())
        self.assertEqual(value["ndk"], {"selectedVersion": "28.2.13676358",
                                        "installedVersion": None,
                                        "linkerVersion": None})
        self.assertEqual(value["collectionStatus"], "partial")
        self.assertNotIn(PRIVATE, self.output.read_text())

    def test_records_only_allowlisted_complete_provenance(self):
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        raw = self.output.read_bytes()
        self.assertLess(len(raw), 4096)
        self.assertNotIn(PRIVATE.encode(), raw)
        self.assertNotIn(str(self.root).encode(), raw)
        value = json.loads(raw)
        self.assertEqual(set(value), {"schemaVersion", "platform", "sourceSha",
                                      "collectionStatus", "buildRoot", "flutter",
                                      "java", "ndk", "gradleVerification"})
        self.assertEqual(value["collectionStatus"], "complete")
        self.assertEqual(value["flutter"], {
            "frameworkVersion": "3.44.8", "frameworkRevision": "1" * 40,
            "engineRevision": "2" * 40, "dartSdkVersion": "3.12.2"})
        self.assertEqual(value["java"], {"version": "17.0.17",
                                         "runtimeBuild": "17.0.17+10",
                                         "vendor": "temurin"})
        self.assertEqual(value["ndk"], {
            "selectedVersion": "28.2.13676358",
            "installedVersion": "28.2.13676358", "linkerVersion": "19.0.1"})
        self.assertEqual(value["gradleVerification"], {"settleoraReleaseEvidence": True})
        identity = str(self.runner_temp / "android-candidate-package").encode()
        self.assertEqual(value["buildRoot"], {
            "role": "android_candidate_package", "byteLength": len(identity),
            "sha256": hashlib.sha256(identity).hexdigest()})

    def test_discards_untrusted_version_text_and_private_paths(self):
        self.script(self.bin / "flutter", "printf '%s\\n' '{\"frameworkVersion\":\"" +
                    PRIVATE + "\",\"frameworkRevision\":\"" + "1" * 40 +
                    "\",\"engineRevision\":\"" + "2" * 40 +
                    "\",\"dartSdkVersion\":\"3.12.2\",\"path\":\"" +
                    PRIVATE + "\"}'")
        self.script(self.bin / "java", "printf '    java.version = " + PRIVATE +
                    "\\n    java.runtime.version = " + PRIVATE +
                    "\\n    java.vendor = " + PRIVATE + "\\n' >&2")
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        raw = self.output.read_bytes()
        self.assertNotIn(PRIVATE.encode(), raw)
        value = json.loads(raw)
        self.assertEqual(value["collectionStatus"], "partial")
        self.assertIsNone(value["flutter"]["frameworkVersion"])
        self.assertIsNone(value["java"]["version"])
        self.assertIsNone(value["java"]["runtimeBuild"])
        self.assertEqual(value["java"]["vendor"], "other")

    def test_missing_or_relative_runner_root_stays_bounded(self):
        result = self.run_tool(overrides={"RUNNER_TEMP": PRIVATE})
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(self.output.read_text())
        self.assertEqual(value["collectionStatus"], "partial")
        self.assertIsNone(value["buildRoot"])
        self.assertNotIn(PRIVATE, self.output.read_text())

    def test_records_four_component_java_patch_without_vendor_text(self):
        self.script(self.bin / "java", "printf '    java.version = 17.0.20.1\\n    java.runtime.version = 17.0.20.1+1\\n    java.vendor = Ubuntu\\n' >&2")
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(self.output.read_text())
        self.assertEqual(value["java"], {"version": "17.0.20.1",
                                         "runtimeBuild": "17.0.20.1+1",
                                         "vendor": "other"})
        self.assertEqual(value["collectionStatus"], "complete")

    def test_rejects_runtime_build_for_a_different_java_patch(self):
        self.script(self.bin / "java", "printf '    java.version = 17.0.20\\n    java.runtime.version = 17.0.21+1\\n    java.vendor = Eclipse Adoptium\\n' >&2")
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(self.output.read_text())
        self.assertEqual(value["java"]["version"], "17.0.20")
        self.assertIsNone(value["java"]["runtimeBuild"])
        self.assertEqual(value["collectionStatus"], "partial")

    def test_rejects_long_version_fields_before_regex_matching(self):
        repeated = "0" * 5000
        self.script(self.bin / "flutter", "printf '%s\\n' '{\"frameworkVersion\":\"" +
                    repeated + "\",\"frameworkRevision\":\"" + "1" * 40 +
                    "\",\"engineRevision\":\"" + "2" * 40 +
                    "\",\"dartSdkVersion\":\"3.12.2\"}'")
        self.script(self.bin / "java", "printf '    java.version = " + repeated +
                    "\\n    java.runtime.version = " + repeated +
                    "\\n    java.vendor = Eclipse Adoptium\\n' >&2")
        result = self.run_tool(ndk_versions=(repeated, repeated, repeated))
        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(self.output.read_text())
        self.assertEqual(evidence["collectionStatus"], "partial")
        self.assertIsNone(evidence["flutter"]["frameworkVersion"])
        self.assertIsNone(evidence["java"]["version"])
        self.assertIsNone(evidence["java"]["runtimeBuild"])
        self.assertEqual(evidence["ndk"], {"selectedVersion": None,
                                           "installedVersion": None,
                                           "linkerVersion": None})
        self.assertNotIn(repeated, self.output.read_text())

    def test_invalid_source_identity_fails_without_path_or_payload(self):
        result = self.run_tool(source_sha=PRIVATE)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertNotIn(PRIVATE, result.stderr + result.stdout)
        self.assertNotIn(str(self.root), result.stderr + result.stdout)

    def test_oversized_tool_output_is_not_retained(self):
        self.script(self.bin / "flutter", "printf '" + PRIVATE * 2000 + "'")
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(self.output.read_text())["collectionStatus"], "partial")
        self.assertNotIn(PRIVATE, self.output.read_text())


if __name__ == "__main__":
    unittest.main()
