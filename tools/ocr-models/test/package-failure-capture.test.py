"""Synthetic package-capture contracts: no SDK, build, device or signaling.

Imports the helper directly from source; no project aggregator/provider import.
Explicit shell-function tests spawn /bin/bash with inert python3/hash functions.
The stderr regression spawns finite isolated Python children using only the
source observer and fixed output; no timeout/kill/cleanup wrapper is used.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import importlib.util
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "tools/ocr-models/package-failure-capture.py"
spec = importlib.util.spec_from_file_location("package_failure_capture_under_test", HELPER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PRIVATE = b"PRIVATE_OCR_secret@example.invalid_4111111111111111"


def context(platform="ios"):
    return {"sourceSha": "a" * 40, "sourceTree": "b" * 40,
            "sourceTreeFingerprint": "c" * 64, "catalogSha256": "d" * 64,
            "workflowSha": "e" * 40,
            "workflowRef": module.REPOSITORY + "/" + module.WORKFLOW + "@refs/heads/fixture",
            "runId": "123", "runAttempt": "1", "job": platform + "-native-acceptance",
            "workspaceState": "clean", "workspaceLockSha256": None}


def public_values():
    return {"CFBundleIdentifier": "org.cocoapods.image-picker-ios-privacy",
            "CFBundleName": "image_picker_ios_privacy", "CFBundlePackageType": "BNDL",
            "CFBundleInfoDictionaryVersion": "6.0", "DTXcode": "1640",
            "DTSDKName": "iphoneos18.5", "CFBundleSupportedPlatforms": ["iPhoneOS"]}


class CaptureContractTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.relative = "ios-candidate-package/apps/mobile/build/ios/iphoneos/Runner.app/" + module.PRIVACY_PATH
        self.plist = self.root / self.relative
        self.plist.parent.mkdir(parents=True)

    def ios(self, data):
        self.plist.write_bytes(data)
        result = module.capture("ios", self.root, context())
        with zipfile.ZipFile(self.root / "ios-package-failure-evidence.zip") as archive:
            names = archive.namelist()
            metadata = json.loads(archive.read("provenance.json"))
            payload = archive.read("Info.plist") if "Info.plist" in names else None
        return result, metadata, payload, names

    def test_exact_xml_bytes_and_source_context_retained_without_acceptance(self):
        raw = plistlib.dumps(public_values())
        result, metadata, payload, names = self.ios(raw)
        self.assertEqual(names, ["provenance.json", "Info.plist"])
        self.assertEqual(payload, raw)
        self.assertEqual(metadata["file"], {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
        self.assertEqual(metadata["context"], context())
        self.assertFalse(metadata["accepted"])
        self.assertEqual(metadata["bindingKind"], "hosted_workflow_observation_not_attestation")
        self.assertNotIn(str(self.root), json.dumps(metadata))
        self.assertEqual(result["status"], "observed")
        self.assertEqual((self.root / "ios-package-failure-evidence.zip").stat().st_mode & 0o777, 0o600)
        self.assertTrue((self.root / "ios-package-failure-evidence.zip.partial").exists())

    def test_exact_binary_bytes_retained(self):
        raw = plistlib.dumps(public_values(), fmt=plistlib.FMT_BINARY)
        self.assertEqual(self.ios(raw)[2], raw)

    def test_unknown_value_keeps_only_hash_and_fixed_reason(self):
        values = public_values(); values["CFBundleName"] = PRIVATE.decode()
        raw = plistlib.dumps(values)
        _, metadata, payload, names = self.ios(raw)
        self.assertIsNone(payload)
        self.assertEqual(names, ["provenance.json"])
        self.assertEqual(metadata["status"], "unavailable")
        self.assertEqual(metadata["reason"], "unclassified_or_noncanonical_plist")
        self.assertEqual(metadata["file"]["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertNotIn(PRIVATE, (self.root / "ios-package-failure-evidence.zip").read_bytes())

    def test_unknown_key_is_not_exported(self):
        values = public_values(); values["private"] = PRIVATE.decode()
        self.assertIsNone(self.ios(plistlib.dumps(values))[2])

    def test_comments_cannot_hide_private_bytes(self):
        raw = plistlib.dumps(public_values()).replace(b"<dict>", b"<!--" + PRIVATE + b"--><dict>")
        self.assertIsNone(self.ios(raw)[2])
        self.assertNotIn(PRIVATE, (self.root / "ios-package-failure-evidence.zip").read_bytes())

    def test_trailing_bytes_are_not_retained(self):
        self.assertIsNone(self.ios(plistlib.dumps(public_values(), fmt=plistlib.FMT_BINARY) + PRIVATE)[2])

    def test_malformed_bytes_are_not_retained(self):
        result, _, payload, _ = self.ios(PRIVATE)
        self.assertIsNone(payload); self.assertEqual(result["status"], "unavailable")

    def test_oversize_plist_yields_no_content(self):
        result, _, payload, _ = self.ios(b"x" * (module.MAX_PLIST + 1))
        self.assertIsNone(payload); self.assertNotIn("file", result)

    def test_symlink_file_is_not_read(self):
        other = self.root / "other"; other.write_bytes(PRIVATE); self.plist.symlink_to(other)
        result = module.capture("ios", self.root, context())
        self.assertNotIn("file", result)

    def test_symlink_parent_is_not_read(self):
        parent = self.plist.parent; parent.rmdir(); other = self.root / "other"; other.mkdir()
        (other / "Info.plist").write_bytes(PRIVATE); parent.symlink_to(other, target_is_directory=True)
        self.assertNotIn("file", module.capture("ios", self.root, context()))

    def test_hardlinked_file_is_not_read(self):
        self.plist.write_bytes(PRIVATE); os.link(self.plist, self.root / "alias")
        self.assertNotIn("file", module.capture("ios", self.root, context()))

    def test_android_hashes_but_never_exports_apk_payload(self):
        raw = b"synthetic APK not executable " + PRIVATE
        (self.root / "settleora-verified-production.apk").write_bytes(raw)
        result = module.capture("android", self.root, context("android"))
        evidence = (self.root / "android-package-failure-capture.json").read_bytes()
        self.assertEqual(result["file"], {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
        self.assertFalse(result["contentRetained"]); self.assertFalse(result["accepted"])
        self.assertEqual(result["verification"], "not_granted_by_capture")
        self.assertNotIn(PRIVATE, evidence)
        self.assertLess(len(evidence), module.MAX_JSON)
        self.assertEqual(result["context"]["sourceTreeFingerprint"], "c" * 64)

    def test_missing_android_file_yields_fixed_unavailable(self):
        result = module.capture("android", self.root, context("android"))
        self.assertEqual(result["reason"], "missing_unsafe_or_changed_file")
        self.assertFalse(result["accepted"])

    def test_android_oversize_sparse_file_is_not_read(self):
        with (self.root / "settleora-verified-production.apk").open("wb") as output:
            output.truncate(module.MAX_APK + 1)
        self.assertNotIn("file", module.capture("android", self.root, context("android")))

    def test_existing_complete_evidence_is_never_overwritten(self):
        self.plist.write_bytes(plistlib.dumps(public_values()))
        module.capture("ios", self.root, context()); original = (self.root / "ios-package-failure-evidence.zip").read_bytes()
        with self.assertRaises(FileExistsError):module.capture("ios", self.root, context())
        self.assertEqual((self.root / "ios-package-failure-evidence.zip").read_bytes(), original)

    def test_replaced_partial_cannot_become_complete_evidence(self):
        original_link = os.link
        def replace_then_link(source, destination, **kwargs):
            Path(source).unlink()
            Path(source).write_bytes(PRIVATE)
            return original_link(source, destination, **kwargs)
        ready = []
        with patch.object(module.os, "link", side_effect=replace_then_link):
            with self.assertRaises(ValueError):module.capture_and_mark("ios", self.root, context(), lambda: ready.append(True))
        self.assertTrue((self.root / "ios-package-failure-evidence.zip").exists())
        self.assertEqual(ready, [])

    def test_changed_written_bytes_cannot_become_complete_evidence(self):
        original_link = os.link
        def change_then_link(source, destination, **kwargs):
            Path(source).write_bytes(PRIVATE)
            return original_link(source, destination, **kwargs)
        ready = []
        with patch.object(module.os, "link", side_effect=change_then_link):
            with self.assertRaises(ValueError):module.capture_and_mark("ios", self.root, context(), lambda: ready.append(True))
        self.assertTrue((self.root / "ios-package-failure-evidence.zip").exists())
        self.assertEqual(ready, [])

    def test_replacement_final_evidence_is_preserved_on_failed_handoff(self):
        original_link = os.link
        def replace_final(source, destination, **kwargs):
            result = original_link(source, destination, **kwargs)
            Path(destination).unlink()
            Path(destination).write_bytes(PRIVATE)
            return result
        with patch.object(module.os, "link", side_effect=replace_final):
            with self.assertRaises(ValueError):module.capture("ios", self.root, context())
        self.assertEqual((self.root / "ios-package-failure-evidence.zip").read_bytes(), PRIVATE)

    def test_replacement_partial_is_preserved_after_verified_handoff(self):
        original_link = os.link
        def replace_partial_after_link(source, destination, **kwargs):
            result = original_link(source, destination, **kwargs)
            Path(source).unlink()
            Path(source).write_bytes(PRIVATE)
            return result
        with patch.object(module.os, "link", side_effect=replace_partial_after_link):
            module.capture("ios", self.root, context())
        self.assertEqual((self.root / "ios-package-failure-evidence.zip.partial").read_bytes(), PRIVATE)
        with zipfile.ZipFile(self.root / "ios-package-failure-evidence.zip") as archive:
            self.assertEqual(archive.namelist(), ["provenance.json"])

    def test_incomplete_output_is_not_selected_as_complete(self):
        with patch.object(module.os, "link", side_effect=OSError("synthetic failure")):
            with self.assertRaises(OSError):module.capture("ios", self.root, context())
        self.assertFalse((self.root / "ios-package-failure-evidence.zip").exists())
        self.assertTrue((self.root / "ios-package-failure-evidence.zip.partial").exists())

    def test_only_complete_capture_marks_upload_ready(self):
        ready = []
        module.capture_and_mark("ios", self.root, context(), lambda: ready.append(True))
        self.assertEqual(ready, [True])  # Safe unavailable metadata is complete evidence too.

    def test_existing_evidence_never_marks_a_new_upload_ready(self):
        module.capture("ios", self.root, context())
        ready = []
        with self.assertRaises(FileExistsError):
            module.capture_and_mark("ios", self.root, context(), lambda: ready.append(True))
        self.assertEqual(ready, [])

    def test_step_output_marker_is_fixed_and_appended(self):
        parent = self.root / "_runner_file_commands"; parent.mkdir()
        output = parent / "set_output_00000000-0000-0000-0000-000000000000"
        output.write_text("existing=true\n")
        module.append_ready(self.root, output)
        self.assertEqual(output.read_text(), "existing=true\n\npackage_failure_capture_ready=true\n")

    def test_step_output_rejects_aliases_and_other_paths(self):
        parent = self.root / "_runner_file_commands"; parent.mkdir()
        output = parent / "set_output_00000000-0000-0000-0000-000000000000"
        other = self.root / "other"; other.write_bytes(PRIVATE); output.symlink_to(other)
        with self.assertRaises(ValueError):module.append_ready(self.root, output)
        self.assertEqual(other.read_bytes(), PRIVATE)
        with self.assertRaises(ValueError):module.append_ready(self.root, other)

    def test_cross_platform_context_cannot_write(self):
        with self.assertRaises(ValueError):module.capture("ios", self.root, context("android"))
        self.assertFalse((self.root / "ios-package-failure-evidence.zip").exists())

    def test_arbitrary_context_string_cannot_leak(self):
        c = context(); c["runId"] = PRIVATE.decode()
        with self.assertRaises(ValueError):module.capture("ios", self.root, c)
        self.assertFalse((self.root / "ios-package-failure-evidence.zip").exists())

    def test_extra_context_fields_are_rejected(self):
        c = context(); c["raw"] = PRIVATE.decode()
        with self.assertRaises(ValueError):module.capture("ios", self.root, c)

    def test_pull_request_merge_workflow_ref_is_accepted_for_both_platforms(self):
        for platform in ("android", "ios"):
            with self.subTest(platform=platform):
                c = context(platform)
                c["workflowRef"] = module.REPOSITORY + "/" + module.WORKFLOW + "@refs/pull/123/merge"
                self.assertIsNone(module.validate_context(c, platform))

    def test_canonical_counter_metadata_has_tight_limits(self):
        for key, value in [("runId", "1" * 21), ("runAttempt", "1000"), ("sourceSha", "A" * 40),
                           ("workflowRef", "private://" + PRIVATE.decode())]:
            with self.subTest(key=key):
                c = context(); c[key] = value
                with self.assertRaises(ValueError):module.validate_context(c, "ios")

    def test_all_public_metadata_classes_are_bounded(self):
        values = public_values(); values.update({"CFBundleVersion": "1", "MinimumOSVersion": "15.0",
            "DTPlatformBuild": "22F76", "DTSDKBuild": "22F76", "DTXcodeBuild": "16F6",
            "BuildMachineOSBuild": "24F74", "UIDeviceFamily": [1, 2], "LSRequiresIPhoneOS": True})
        self.assertTrue(module.public_plist(plistlib.dumps(values)))
        values["UIDeviceFamily"] = [True]
        with self.assertRaises(ValueError):module.public_plist(plistlib.dumps(values))

    def test_source_fingerprint_excludes_only_the_inventory_record(self):
        a = b"100644 blob " + b"a" * 40 + b"\tREADME.md\0"
        b = b"100644 blob " + b"b" * 40 + b"\t" + module.INVENTORY.encode() + b"\0"
        self.assertEqual(module.source_fingerprint(a + b), hashlib.sha256(a).hexdigest())
        for malformed in (a, a + b + a, a + b[:-1], a + b.replace(b"100644", b"160000")):
            with self.subTest(malformed=malformed):
                with self.assertRaises(ValueError):module.source_fingerprint(malformed)

    def test_git_output_bound_drains_without_signals_or_early_close(self):
        stream = io.BytesIO(PRIVATE * 10000)
        class Child:
            stdout = stream
            waited = False
            def wait(self):self.waited = True; return 0
        child = Child(); observed = []
        def launch(argv, **kwargs):observed.append((argv, kwargs)); return child
        with self.assertRaises(ValueError):module.read_git(self.root, ["show", "a" * 40], 8, launch)
        self.assertEqual(stream.tell(), len(PRIVATE) * 10000)
        self.assertFalse(stream.closed)
        self.assertTrue(child.waited)
        self.assertEqual(observed[0][0][:4], ["/usr/bin/git", "--no-optional-locks", "-C", str(self.root)])
        self.assertNotIn("timeout", observed[0][1])
        self.assertNotIn("shell", observed[0][1])

    def test_git_exact_bound_succeeds_and_failed_child_is_rejected(self):
        class Child:
            def __init__(self, data, code):self.stdout = io.BytesIO(data); self.code = code
            def wait(self):return self.code
        self.assertEqual(module.read_git(self.root, ["fixture"], 8, lambda *a, **k: Child(b"12345678", 0)), b"12345678")
        with self.assertRaises(ValueError):module.read_git(self.root, ["fixture"], 8, lambda *a, **k: Child(b"123", 1))

    def test_context_reads_exact_git_head_and_rejects_mutable_source(self):
        repo = self.root / "repo"; (repo / "apps/mobile/assets/receipt_ocr_models").mkdir(parents=True)
        (repo / "apps/mobile/assets/receipt_ocr_models/catalog.json").write_bytes(PRIVATE)
        listing = b"100644 blob " + b"a" * 40 + b"\tREADME.md\0" + b"100644 blob " + b"b" * 40 + b"\t" + module.INVENTORY.encode() + b"\0"
        env = {"GITHUB_ACTIONS": "true", "CI": "true", "SETTLEORA_PACKAGE_FAILURE_CAPTURE": "hosted_v1",
               "GITHUB_REPOSITORY": module.REPOSITORY, "CAPTURE_WORKFLOW_SHA": "e" * 40,
               "CAPTURE_WORKFLOW_REF": context()["workflowRef"], "GITHUB_RUN_ID": "123",
               "GITHUB_RUN_ATTEMPT": "1", "GITHUB_JOB": "ios-native-acceptance"}
        def git(*args):
            if args == ("rev-parse", "HEAD"):return b"a" * 40 + b"\n"
            if args[0] == "status":return b""
            if args[0] == "show":return b"{}"  # Exact Git object, distinct from disk bytes.
            if args[0] == "rev-parse":return b"b" * 40 + b"\n"
            return listing
        c = module.collect_context(repo, "a" * 40, env, git); module.validate_context(c, "ios")
        self.assertEqual(c["catalogSha256"], hashlib.sha256(b"{}").hexdigest())
        with self.assertRaises(ValueError):module.collect_context(repo, "f" * 40, env, git)
        with self.assertRaises(ValueError):module.collect_context(repo, "a" * 40, {}, git)
        with self.assertRaises(ValueError):module.collect_context(repo, "a" * 40, env, lambda *a: b" M private" if a[0] == "status" else git(*a))

    def projection_fixture(self):
        repo = self.root / "projection"
        lock = repo / module.IOS_LOCK
        lock.parent.mkdir(parents=True)
        verifier = repo / module.IOS_LOCK_VERIFIER
        verifier.parent.mkdir(parents=True)
        verifier.write_bytes((ROOT / module.IOS_LOCK_VERIFIER).read_bytes())
        production = b"PODS:\n  - Flutter (1.0.0)\nDEPENDENCIES:\nEXTERNAL SOURCES:\nSPEC CHECKSUMS:\n"
        projected = production.replace(b"DEPENDENCIES:", b"  - integration_test (0.0.1):\n    - Flutter\nDEPENDENCIES:")
        projected = projected.replace(b"EXTERNAL SOURCES:", b"  - integration_test (from `.symlinks/plugins/integration_test/ios`)\nEXTERNAL SOURCES:")
        projected = projected.replace(b"SPEC CHECKSUMS:", b'  integration_test:\n    :path: ".symlinks/plugins/integration_test/ios"\nSPEC CHECKSUMS:')
        projected += b"  integration_test: " + b"a" * 40 + b"\n"
        lock.write_bytes(projected)
        def git(*args):
            if args[0] == "status":return b" M " + module.IOS_LOCK.encode() + b"\0"
            return production if args[1].endswith(":" + module.IOS_LOCK) else (ROOT / module.IOS_LOCK_VERIFIER).read_bytes()
        return repo, lock, projected, git

    def test_existing_exact_ios_projection_is_bound_without_mutation(self):
        repo, lock, projected, git = self.projection_fixture()
        result = module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "ios-native-acceptance"}, git)
        self.assertEqual(result, {"workspaceState": "verified_ios_test_lock_projection", "workspaceLockSha256": module.sha(projected)})
        self.assertEqual(lock.read_bytes(), projected)
        c = context(); c.update(result); module.validate_context(c, "ios")
        with self.assertRaises(ValueError):module.validate_context(c, "android")

    def test_projection_rejects_extra_version_or_checksum_changes(self):
        repo, lock, projected, git = self.projection_fixture()
        for changed in (projected + b"PRIVATE FIELD\n", projected.replace(b"Flutter (1.0.0)", b"Flutter (2.0.0)"), projected.replace(b"a" * 40, b"bad")):
            lock.write_bytes(changed)
            with self.assertRaises(ValueError):module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "ios-native-acceptance"}, git)

    def test_projection_rejects_android_staged_other_and_modified_verifier(self):
        repo, lock, projected, git = self.projection_fixture()
        with self.assertRaises(ValueError):module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "android-native-acceptance"}, git)
        for status in (b"M  " + module.IOS_LOCK.encode() + b"\0", b" M other\0", b" M " + module.IOS_LOCK.encode() + b"\0 M other\0"):
            with self.assertRaises(ValueError):module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "ios-native-acceptance"}, lambda *a: status if a[0] == "status" else git(*a))
        (repo / module.IOS_LOCK_VERIFIER).write_bytes(b"untrusted")
        with self.assertRaises(ValueError):module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "ios-native-acceptance"}, git)

    def test_projection_executes_captured_git_bytes_not_reopened_verifier_path(self):
        repo, lock, projected, git = self.projection_fixture()
        real_run = subprocess.run
        commands = []
        def replace_path(*args, **kwargs):
            (repo / module.IOS_LOCK_VERIFIER).write_text("throw new Error('untrusted replacement');")
            commands.append((args, kwargs))
            return real_run(*args, **kwargs)
        with patch.object(module.subprocess, "run", side_effect=replace_path):
            result = module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "ios-native-acceptance"}, git)
        self.assertEqual(result["workspaceLockSha256"], module.sha(projected))
        argv = commands[0][0][0]
        self.assertTrue(Path(argv[0]).is_absolute())
        self.assertEqual(argv[1:], ["--input-type=module", "--eval", module.PROJECTION_BRIDGE])
        self.assertNotIn(str(repo), " ".join(argv))
        self.assertEqual(set(commands[0][1]["env"]), {"PATH", "LANG", "LC_ALL"})
        self.assertFalse(commands[0][1]["check"])
        self.assertNotIn("timeout", commands[0][1])

    def test_projection_fails_closed_without_existing_node(self):
        repo, lock, projected, git = self.projection_fixture()
        with patch.object(module.shutil, "which", return_value=None):
            with self.assertRaises(ValueError):module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "ios-native-acceptance"}, git)

    def test_projection_rejects_lock_drift_during_verification(self):
        repo, lock, projected, git = self.projection_fixture()
        def mutate(*args, **kwargs):
            lock.write_bytes(projected + b"changed")
            return subprocess.CompletedProcess(args[0], 0)
        with patch.object(module.subprocess, "run", side_effect=mutate):
            with self.assertRaises(ValueError):module.workspace_context(repo, "a" * 40, {"GITHUB_JOB": "ios-native-acceptance"}, git)

    def test_both_native_jobs_run_source_isolated_capture_contracts(self):
        workflow = (ROOT / ".github/workflows/mobile-ocr-native-acceptance.yml").read_text()
        command = "run: python3 -I -S -B -X pycache_prefix=/dev/null tools/ocr-models/test/package-failure-capture.test.py -v"
        self.assertEqual(workflow.count(command), 2)
        for job in ("android-native-acceptance:", "ios-native-acceptance:"):
            section = workflow.split(job, 1)[1]
            self.assertLess(section.index("Verify exact candidate"), section.index(command))
            self.assertLess(section.index("Setup Node"), section.index(command))

    def test_workflow_capture_selectors_are_exact_and_acceptance_stays_required(self):
        workflow = (ROOT / ".github/workflows/mobile-ocr-native-acceptance.yml").read_text()
        self.assertEqual(workflow.count("--require-complete=true"), 2)
        self.assertEqual(workflow.count("timeout-minutes: 180"), 2)
        self.assertEqual(workflow.count("timeout-minutes: 360"), 2)
        self.assertIn("${{ runner.temp }}/android-package-failure-capture.json", workflow)
        self.assertIn("${{ runner.temp }}/ios-package-failure-evidence.zip", workflow)
        self.assertNotIn("${{ runner.temp }}/**", workflow)
        self.assertIn("steps.package_comparison.outputs.package_failure_capture_ready == 'true'", workflow)
        self.assertIn("steps.package.outputs.package_failure_capture_ready == 'true'", workflow)
        self.assertEqual(workflow.count("path: ${{ runner.temp }}/ios-package-failure-evidence.zip"), 1)
        self.assertEqual(workflow.count("path: ${{ runner.temp }}/android-package-failure-capture.json"), 1)
        self.assertIn("if: ${{ !cancelled() && steps.package.outcome == 'failure' }}", workflow)
        self.assertLess(workflow.index("python3 tools/ocr-models/package-failure-capture.py"),
                        workflow.index("python3 tools/ocr-models/android-build-provenance-evidence.py"))
        self.assertEqual(workflow.count('run: test "${{ steps.acceptance.outputs.status }}" = "0"'), 2)

    def test_wrapper_capture_never_turns_rejection_into_success(self):
        script = (ROOT / "apps/mobile/tool/build-production-ios.sh").read_text()
        body = script.split("fail_unreviewed_resource_path() {", 1)[1].split("\nis_reviewed_pre_native_baseline_resource()", 1)[0]
        function = "fail_unreviewed_resource_path() {" + body
        for enabled, mode, artifact_class, capture_status, called in [
                ("hosted_v1", "unsigned", "release-candidate", 0, True),
                ("hosted_v1", "unsigned", "release-candidate", 1, True),
                ("", "unsigned", "release-candidate", 0, False),
                ("hosted_v1", "signed", "release-candidate", 0, False),
                ("hosted_v1", "unsigned", "size-measurement", 0, False)]:
            with self.subTest(enabled=enabled, mode=mode, capture_status=capture_status):
                setup = "set -eu\nsha256_file(){ printf '%064d' 0; }\nshasum(){ printf '%064d -\\n' 0; }\nfail(){ printf 'ORIGINAL_REJECT\\n'; exit 1; }\n"
                setup += f"python3(){{ printf 'CAPTURE_CALLED\\n'; return {capture_status}; }}\n"
                setup += function + "\nrelative_resource='" + module.PRIVACY_PATH + "'\ncandidate=fixture\n"
                setup += f"mode={mode}\nartifact_class={artifact_class}\ntool_root=fixture\nsource_git_root=fixture\nrepo_root=fixture\nsource_sha=fixture\nfail_unreviewed_resource_path\n"
                env = {"PATH": "/usr/bin:/bin", "HOME": str(self.root), "TMPDIR": str(self.root),
                       "SETTLEORA_PACKAGE_FAILURE_CAPTURE": enabled}
                result = subprocess.run(["/bin/bash", "-c", setup], env=env, cwd=self.root,
                                        capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn("ORIGINAL_REJECT", result.stdout)
                self.assertEqual("CAPTURE_CALLED" in result.stdout, called)
                if capture_status == 1 and called:self.assertIn("bounded_package_failure_capture_unavailable", result.stderr)


class CapturePhaseStderrProcessTest(unittest.TestCase):
    def test_real_stderr_failure_preserves_exit_status_and_fixed_output(self):
        if not Path("/dev/full").is_char_device():
            self.skipTest("requires the /dev/full failing stderr device")
        child_source = r"""
import importlib.util
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("package_capture_stderr_child", sys.argv[1])
module = importlib.util.module_from_spec(spec)
with patch.object(subprocess, "Popen", side_effect=AssertionError("unexpected child process")), \
        patch.object(subprocess, "run", side_effect=AssertionError("unexpected child process")):
    spec.loader.exec_module(module)
observer_class = module.CapturePhaseDiagnostics
writers = []
class WriterSelected(Exception):
    pass
def select_writer(write):
    writers.append(write)
    raise WriterSelected()
parser = SimpleNamespace(add_argument=lambda *args, **kwargs: None,
                         parse_args=lambda: SimpleNamespace(platform="ios"))
# Capture the actual production writer before argument parsing, context reads
# or filesystem operations. Only this private sentinel is caught.
with patch.object(module.argparse, "ArgumentParser", return_value=parser), \
        patch.object(module, "CapturePhaseDiagnostics", side_effect=select_writer):
    try:
        module.main()
    except WriterSelected:
        pass
assert len(writers) == 1
status = int(sys.argv[3])
if sys.argv[2] == "1":
    observer = observer_class(writers[0])
    observer.phase("arguments")
    if status:
        observer.failure()
    else:
        observer.phase("complete")
sys.stdout.write('{"result":"preserved"}\n')
raise SystemExit(status)
"""
        command = [sys.executable, "-I", "-S", "-B", "-X", "pycache_prefix=/dev/null",
                   "-c", child_source, str(HELPER)]
        for status in (0, 7):
            for failing_stderr, enabled in ((False, True), (True, False), (True, True)):
                failing = open("/dev/full", "wb", buffering=0)
                child = None
                try:
                    child = subprocess.Popen(
                        [*command, "1" if enabled else "0", str(status)],
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                        stderr=failing if failing_stderr else subprocess.PIPE,
                        env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
                        cwd=ROOT)
                    try:
                        stdout, stderr = child.communicate()
                    except BaseException:
                        # Retain ownership and expose the PID before waiting.
                        # No termination, retry launch or early cleanup follows.
                        self.pending_stderr_child = (child.pid, child, failing)
                        try:
                            os.write(2, (
                                "package_capture_stderr_child_pending_pid="
                                + str(child.pid) + "\n").encode("ascii"))
                        except Exception:
                            pass
                        child.wait()
                        raise
                finally:
                    # Close descriptors only after known ordinary termination,
                    # or when process construction returned no child handle.
                    if child is None or child.returncode is not None:
                        if child is not None:
                            child.stdout.close()
                            if child.stderr is not None:
                                child.stderr.close()
                        failing.close()
                with self.subTest(status=status, failing_stderr=failing_stderr, enabled=enabled):
                    self.assertEqual(stdout, b'{"result":"preserved"}\n')
                    self.assertEqual(child.returncode, status)
                    if not failing_stderr:
                        terminal = (b"package_capture_failure_phase=arguments\n" if status else
                                    b"package_capture_phase=complete\n")
                        self.assertEqual(stderr, b"package_capture_phase=arguments\n" + terminal)


if __name__ == "__main__":unittest.main()
