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
import stat
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
    # Synthetic public resource-bundle metadata, including CocoaPods 1.17.0's
    # exact empty principal-class placeholder; not the withheld release plist.
    return {"CFBundleIdentifier": "org.cocoapods.image-picker-ios-privacy",
            "CFBundleName": "image_picker_ios_privacy", "CFBundlePackageType": "BNDL",
            "CFBundleInfoDictionaryVersion": "6.0", "DTXcode": "1640",
            "DTSDKName": "iphoneos18.5", "CFBundleSupportedPlatforms": ["iPhoneOS"],
            "NSPrincipalClass": ""}


def wider_binary_offsets(raw):
    # A complete valid binary plist with a different offset-table width.
    # This synthetic vector is not the unavailable hosted release plist.
    trailer = raw[-32:]
    width = trailer[6]
    count = int.from_bytes(trailer[8:16], "big")
    start = int.from_bytes(trailer[24:32], "big")
    assert width in (1, 2, 4)
    offsets = [int.from_bytes(raw[start + i * width:start + (i + 1) * width], "big")
               for i in range(count)]
    return (raw[:start] + b"".join(x.to_bytes(width * 2, "big") for x in offsets)
            + trailer[:6] + bytes([width * 2, trailer[7]]) + trailer[8:])


def unreachable_binary_string(raw, text):
    # Valid but ignored object-table content must not be exported.
    trailer = raw[-32:]
    old_width, refs = trailer[6:8]
    count = int.from_bytes(trailer[8:16], "big")
    start = int.from_bytes(trailer[24:32], "big")
    assert count + 1 < 1 << (8 * refs)
    extra = plistlib.dumps(text, fmt=plistlib.FMT_BINARY)
    extra_start = int.from_bytes(extra[-8:], "big")
    object_bytes = extra[8:extra_start]
    offsets = [int.from_bytes(raw[start + i * old_width:start + (i + 1) * old_width], "big")
               for i in range(count)] + [start]
    new_start = start + len(object_bytes)
    width = next(n for n in (1, 2, 4, 8) if new_start < 1 << (8 * n))
    return (raw[:start] + object_bytes + b"".join(x.to_bytes(width, "big") for x in offsets)
            + trailer[:6] + bytes([width, refs]) + (count + 1).to_bytes(8, "big")
            + trailer[16:24] + new_start.to_bytes(8, "big"))


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

    def assert_cocoapods_empty_principal_class_retained(self, fmt):
        values = public_values()
        self.assertEqual(values["NSPrincipalClass"], "")
        raw = plistlib.dumps(values, fmt=fmt)
        result, metadata, payload, names = self.ios(raw)
        self.assertEqual(names, ["provenance.json", "Info.plist"])
        self.assertEqual(payload, raw)
        self.assertEqual(metadata["file"], {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
        self.assertEqual(metadata["classification"], "canonical_allowlisted_public_bundle_metadata")
        self.assertTrue(result["contentRetained"])
        self.assertFalse(metadata["accepted"])

    def test_cocoapods_principal_class_empty_xml_retains_original_bytes(self):
        self.assert_cocoapods_empty_principal_class_retained(plistlib.FMT_XML)

    def test_cocoapods_principal_class_empty_binary_retains_original_bytes(self):
        self.assert_cocoapods_empty_principal_class_retained(plistlib.FMT_BINARY)

    def test_cocoapods_principal_class_rejects_nonempty_or_nonstrings(self):
        invalid = ["NSApplication", "UIApplication", " ", PRIVATE.decode(), False, 0, 1.25, [], {}]
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module, "_apple_plist", side_effect=AssertionError("unexpected encoder")) as encoder:
            for index, value in enumerate(invalid):
                with self.subTest(index=index, value_type=type(value).__name__):
                    values = public_values(); values["NSPrincipalClass"] = value
                    with self.assertRaises(module.PlistClassificationFailure) as failure:
                        module.public_plist(plistlib.dumps(values, fmt=plistlib.FMT_BINARY))
                    self.assertEqual(failure.exception.reason, "unclassified_metadata")
            encoder.assert_not_called()
        values = public_values(); values["NSPrincipalClass"] = PRIVATE.decode()
        _, metadata, payload, names = self.ios(plistlib.dumps(values, fmt=plistlib.FMT_BINARY))
        self.assertEqual(names, ["provenance.json"])
        self.assertIsNone(payload)
        self.assertEqual(metadata["classificationFailure"], "unclassified_metadata")
        self.assertNotIn(PRIVATE, (self.root / "ios-package-failure-evidence.zip").read_bytes())

    def test_exact_native_serialization_receives_public_values_and_retains_original_bytes(self):
        values = public_values()
        raw = wider_binary_offsets(plistlib.dumps(values, fmt=plistlib.FMT_BINARY))
        self.assertEqual(plistlib.loads(raw), values)
        self.assertFalse(any(raw == plistlib.dumps(values, fmt=fmt, sort_keys=ordered)
                             for fmt in (plistlib.FMT_XML, plistlib.FMT_BINARY)
                             for ordered in (False, True)))
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module, "_apple_plist", return_value=raw) as encoder:
            result, metadata, payload, _ = self.ios(raw)
        encoder.assert_called_once_with(values, plistlib.FMT_BINARY, False)
        self.assertEqual(payload, raw)
        self.assertTrue(metadata["contentRetained"])
        self.assertFalse(result["accepted"])

    def test_ignored_binary_private_object_is_not_exported_by_native_fallback(self):
        values = public_values()
        raw = unreachable_binary_string(plistlib.dumps(values, fmt=plistlib.FMT_BINARY),
                                        PRIVATE.decode())
        self.assertEqual(plistlib.loads(raw), values)
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module, "_apple_plist",
                             side_effect=lambda value, fmt, ordered: plistlib.dumps(
                                 value, fmt=fmt, sort_keys=ordered)) as encoder:
            _, metadata, payload, _ = self.ios(raw)
        self.assertEqual(encoder.call_count, 4)
        self.assertIsNone(payload)
        self.assertEqual(metadata["classificationFailure"], "noncanonical_encoding")
        self.assertNotIn(PRIVATE, (self.root / "ios-package-failure-evidence.zip").read_bytes())

    def test_unknown_metadata_never_reaches_native_encoder(self):
        values = public_values()
        values["CFBundleName"] = PRIVATE.decode()
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module, "_apple_plist", side_effect=AssertionError("unexpected encoder")) as encoder:
            _, metadata, payload, _ = self.ios(plistlib.dumps(values, fmt=plistlib.FMT_BINARY))
        encoder.assert_not_called()
        self.assertIsNone(payload)
        self.assertEqual(metadata["classificationFailure"], "unclassified_metadata")
        self.assertNotIn(PRIVATE, (self.root / "ios-package-failure-evidence.zip").read_bytes())

    def test_native_encoder_failure_is_fixed_hash_only_metadata(self):
        raw = wider_binary_offsets(plistlib.dumps(public_values(), fmt=plistlib.FMT_BINARY))
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module, "_apple_plist", side_effect=OSError(PRIVATE.decode())):
            _, metadata, payload, _ = self.ios(raw)
        self.assertIsNone(payload)
        self.assertEqual(metadata["classificationFailure"], "native_encoder_unavailable")
        self.assertNotIn(PRIVATE, (self.root / "ios-package-failure-evidence.zip").read_bytes())

    def test_native_encoder_uses_trusted_tool_clean_input_and_private_bounded_output(self):
        trusted = os.stat("/usr/bin/true")
        encoded = plistlib.dumps(public_values(), fmt=plistlib.FMT_BINARY)
        calls = []
        waited = []
        def launch(argv, **kwargs):
            calls.append((argv, kwargs))
            self.assertEqual(stat.S_IMODE(os.fstat(kwargs["stdout"].fileno()).st_mode), 0o600)
            class Child:
                def communicate(child, input):
                    self.assertEqual(plistlib.loads(input), public_values())
                    self.assertNotIn(PRIVATE, input)
                    kwargs["stdout"].write(encoded)
                    kwargs["stdout"].flush()
                def wait(child):
                    waited.append(True)
                    return 0
            return Child()
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module.os, "lstat", return_value=trusted), \
                patch.object(module.subprocess, "Popen", side_effect=launch):
            self.assertEqual(module._apple_plist(public_values(), plistlib.FMT_BINARY, False), encoded)
        self.assertEqual(waited, [True])
        argv, options = calls[0]
        self.assertEqual(argv, ["/usr/bin/plutil", "-convert", "binary1", "-o", "-", "-"])
        self.assertEqual(options["env"], {"PATH": os.defpath, "LANG": "C", "LC_ALL": "C"})
        self.assertEqual(options["stdin"], subprocess.PIPE)
        self.assertEqual(options["stderr"], subprocess.DEVNULL)
        self.assertTrue(options["stdout"].closed)
        self.assertNotIn("shell", options)
        self.assertNotIn("timeout", options)

    def test_native_encoder_rejects_unsafe_tool_platform_and_oversized_output(self):
        trusted = os.stat("/usr/bin/true")
        waited = []
        def launch(argv, **kwargs):
            class Child:
                def communicate(child, input):
                    kwargs["stdout"].write(b"x" * (module.MAX_PLIST + 1))
                    kwargs["stdout"].flush()
                def wait(child):
                    waited.append(True)
                    return 0
            return Child()
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module.os, "lstat", return_value=trusted), \
                patch.object(module.subprocess, "Popen", side_effect=launch):
            with self.assertRaises(ValueError):
                module._apple_plist(public_values(), plistlib.FMT_BINARY, False)
        self.assertEqual(waited, [True])
        unsafe = list(trusted)
        unsafe[0] |= 0o022
        with patch.object(module.sys, "platform", "darwin"), \
                patch.object(module.os, "lstat", return_value=os.stat_result(unsafe)), \
                patch.object(module.subprocess, "Popen", side_effect=AssertionError("unexpected child")) as encoder:
            with self.assertRaises(ValueError):
                module._apple_plist(public_values(), plistlib.FMT_BINARY, False)
        encoder.assert_not_called()
        with patch.object(module.sys, "platform", "linux"), \
                patch.object(module.subprocess, "Popen", side_effect=AssertionError("unexpected child")) as encoder:
            with self.assertRaises(ValueError):
                module._apple_plist(public_values(), plistlib.FMT_BINARY, False)
        encoder.assert_not_called()

    @unittest.skipUnless(sys.platform == "darwin", "requires the real Apple system plist encoder")
    def test_real_apple_encoder_round_trip_preserves_only_complete_public_bytes(self):
        values = public_values()
        for fmt, name in ((plistlib.FMT_XML, "xml1"), (plistlib.FMT_BINARY, "binary1")):
            with self.subTest(format=name):
                raw = subprocess.check_output(
                    ["/usr/bin/plutil", "-convert", name, "-o", "-", "-"],
                    input=plistlib.dumps(values, fmt=plistlib.FMT_XML),
                    stderr=subprocess.DEVNULL,
                    env={"PATH": os.defpath, "LANG": "C", "LC_ALL": "C"})
                self.assertEqual(plistlib.loads(raw), values)
                self.assertTrue(module.public_plist(raw))
                with self.assertRaises(ValueError):
                    module.public_plist(raw + PRIVATE)
                if fmt == plistlib.FMT_BINARY:
                    hidden = unreachable_binary_string(raw, PRIVATE.decode())
                    self.assertEqual(plistlib.loads(hidden), values)
                    with self.assertRaises(ValueError):
                        module.public_plist(hidden)

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

    def test_git_reader_uses_requested_source_and_preserves_configuration(self):
        # Real repositories with different HEADs/catalogs expose redirection,
        # rather than accepting a mocked source identity.
        env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
        def git(repo, *args):
            return subprocess.check_output(
                ["/usr/bin/git", "-C", str(repo), *args], env=env, stderr=subprocess.DEVNULL)
        source, external = self.root / "source", self.root / "external"
        heads = []
        for repo, content in ((source, b"requested catalog"), (external, b"foreign catalog")):
            repo.mkdir()
            git(repo, "init", "--quiet")
            (repo / "catalog.json").write_bytes(content)
            git(repo, "add", ".")
            git(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                "commit", "--quiet", "--no-gpg-sign", "-m", content.decode())
            heads.append(git(repo, "rev-parse", "HEAD").strip())
        self.assertNotEqual(*heads)
        snapshot = lambda: {str(p.relative_to(external)): p.read_bytes()
                            for p in external.rglob("*") if p.is_file()}
        before = snapshot()
        overrides = dict(GIT_DIR=str(external / ".git"), GIT_WORK_TREE=str(external),
                         GIT_COMMON_DIR=str(external / ".git"),
                         GIT_INDEX_FILE=str(external / ".git/index"),
                         GIT_OBJECT_DIRECTORY=str(external / ".git/objects"),
                         GIT_ALTERNATE_OBJECT_DIRECTORIES=str(external / ".git/objects"),
                         GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="settleora.fixtureConfig",
                         GIT_CONFIG_VALUE_0="preserved", GIT_ASKPASS="preserved-askpass",
                         GIT_NO_REPLACE_OBJECTS="1")
        children = []
        def launch(*args, **kwargs):
            child_env = kwargs.get("env", os.environ)
            self.assertEqual(child_env["GIT_ASKPASS"], "preserved-askpass")
            self.assertEqual(child_env["GIT_NO_REPLACE_OBJECTS"], "1")
            child = subprocess.Popen(*args, **kwargs)
            children.append(child)
            return child
        try:
            with patch.dict(os.environ, overrides):
                inherited = dict(os.environ)
                self.assertEqual(module.read_git(source, ["rev-parse", "HEAD"], 1024, launch).strip(),
                                 heads[0])
                self.assertEqual(module.read_git(source, ["show", "HEAD:catalog.json"], 1024, launch),
                                 b"requested catalog")
                self.assertEqual(module.read_git(source, ["config", "--get", "settleora.fixtureConfig"],
                                                 1024, launch), b"preserved\n")
                self.assertEqual(dict(os.environ), inherited)
        finally:
            for child in children:
                self.assertIsNotNone(child.poll())
                child.stdout.close()  # Only after the real reader drained/waited.
            self.assertEqual(snapshot(), before)

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


class WorkspaceStatusDiagnosticTest(unittest.TestCase):
    def test_fixed_path_columns_and_opaque_other_names(self):
        lock, debug = module.IOS_LOCK.encode(), module.IOS_DEBUG.encode()
        self.assertEqual(module.classify_workspace_status(b""),
                         ("simple", "absent", "absent", "absent", "absent", "absent"))
        cases = [
            (b" M " + lock + b"\0", ("simple", "unchanged", "modified", "absent", "absent", "absent")),
            (b"MM " + lock + b"\0T  " + debug + b"\0",
             ("simple", "modified", "modified", "type_changed", "unchanged", "absent")),
            (b"A  " + lock + b"\0 D " + debug + b"\0",
             ("simple", "added", "unchanged", "unchanged", "deleted", "absent")),
            (b"UU " + lock + b"\0", ("simple", "unmerged", "unmerged", "absent", "absent", "absent")),
            (b" M " + PRIVATE + b"\xff\n" + lock + b"\0",
             ("simple", "absent", "absent", "absent", "absent", "present")),
        ]
        for raw, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(module.classify_workspace_status(raw), expected)
                lines = []
                module.CapturePhaseDiagnostics(lines.append).workspace_rejection(raw, True)
                self.assertEqual(len(lines), 2)
                self.assertTrue(all(len(line.encode("ascii")) <= 256 for line in lines))
                for private in (PRIVATE.decode(), module.IOS_LOCK, module.IOS_DEBUG):
                    self.assertNotIn(private, lines[0])

    def test_malformed_nul_rename_and_unknown_status_discard_partial_conclusions(self):
        lock = module.IOS_LOCK.encode()
        prefix = b" M " + lock + b"\0"
        cases = [
            (None, "unavailable"), (bytearray(prefix), "unavailable"),
            (b"x" * (16 * 1024 + 1), "unavailable"),
            (b"\0", "malformed"), (prefix[:-1], "malformed"),
            (prefix + b"\0", "malformed"), (prefix + b" M \0", "malformed"),
            (prefix + b"M x\0", "malformed"), (prefix + prefix, "malformed"),
            (prefix + b"R  private\0", "malformed"),
            (prefix + b"R  private\0\0", "malformed"),
            (prefix + b"R  private\0old\0", "rename_copy"),
            (prefix + b" C private\0old\0", "rename_copy"),
            (prefix + b"?? private\0", "unsupported_status"),
            (prefix + b"!! private\0", "unsupported_status"),
            (prefix + b"\xffM private\0", "unsupported_status"),
            (prefix + b"   private\0", "unsupported_status"),
        ]
        for raw, shape in cases:
            with self.subTest(shape=shape, raw_type=type(raw).__name__):
                self.assertEqual(module.classify_workspace_status(raw),
                                 (shape, "unknown", "unknown", "unknown", "unknown", "unknown"))


class WorkspaceMembershipDiagnosticTest(unittest.TestCase):
    # Independent fixtures define the published opaque-key mapping.
    PATHS = (
        b"apps/mobile/.metadata",
        b"apps/mobile/ios/Flutter/AppFrameworkInfo.plist",
        b"apps/mobile/ios/Flutter/Release.xcconfig",
        b"apps/mobile/ios/Runner.xcodeproj/project.pbxproj",
        b"apps/mobile/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata",
        b"apps/mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist",
        b"apps/mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings",
        b"apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme",
        b"apps/mobile/ios/Runner.xcworkspace/contents.xcworkspacedata",
        b"apps/mobile/ios/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist",
        b"apps/mobile/ios/Runner.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings",
    )

    @staticmethod
    def expected(present=(), other="absent", unavailable=False):
        return (("unavailable",) * 12 if unavailable else
                tuple("present" if index in present else "absent" for index in range(11)) + (other,))

    @staticmethod
    def line(values):
        keys = ("c01", "c02", "c03", "c04", "c05", "c06",
                "c07", "c08", "c09", "c10", "c11", "other")
        return "package_capture_workspace_membership=v1;" + ";".join(
            key + ":" + value for key, value in zip(keys, values)) + "\n"

    def test_each_fixed_candidate_has_its_own_key_and_never_exports_path(self):
        for index, path in enumerate(self.PATHS):
            with self.subTest(key=index + 1):
                raw = b" M " + path + b"\0"
                expected = self.expected((index,))
                self.assertEqual(module.classify_workspace_membership(raw), expected)
                self.assertEqual(module.classify_workspace_status(raw),
                                 ("simple", "absent", "absent", "absent", "absent", "present"))
                lines = []
                module.CapturePhaseDiagnostics(lines.append).workspace_rejection(raw, True)
                self.assertEqual(lines[1], self.line(expected))
                for known in self.PATHS:
                    self.assertNotIn(known.decode("ascii"), "".join(lines))

    def test_all_candidates_and_unknown_remainder_are_order_independent(self):
        records = [b" M " + path for path in self.PATHS]
        records += [b" M " + module.IOS_LOCK.encode(), b" M " + module.IOS_DEBUG.encode(),
                    b" M " + PRIVATE + b"\xff\n\t"]
        expected = self.expected(range(11), "present")
        for ordered in (records, list(reversed(records))):
            raw = b"\0".join(ordered) + b"\0"
            self.assertEqual(module.classify_workspace_membership(raw), expected)
        for raw in (b"", b" M " + module.IOS_LOCK.encode() + b"\0", module.IOS_COMBINED_STATUS):
            self.assertEqual(module.classify_workspace_membership(raw), self.expected())

    def test_unknown_aliases_and_private_bytes_never_match_or_escape(self):
        path = self.PATHS[3]
        aliases = (b"./" + path, path + b"/", b"prefix/" + path, path + b"\n" + PRIVATE,
                   path.replace(b"/", b"//", 1), path.upper(), PRIVATE + b"\xff\r\n\t")
        for name in aliases:
            with self.subTest(length=len(name)):
                raw = b" M " + name + b"\0"
                self.assertEqual(module.classify_workspace_membership(raw), self.expected(other="present"))
                lines = []
                module.CapturePhaseDiagnostics(lines.append).workspace_rejection(raw, True)
                self.assertEqual(lines[1], self.line(self.expected(other="present")))
                self.assertNotIn(PRIVATE.decode(), "".join(lines))
                self.assertTrue(all(line.isascii() for line in lines))

    def test_invalid_snapshots_discard_partial_membership(self):
        prefix = b" M " + self.PATHS[3] + b"\0"
        invalid = (None, bytearray(prefix), b"x" * (16 * 1024 + 1), prefix[:-1],
                   prefix + prefix, prefix + b"\0", prefix + b" M \0",
                   prefix + b"R  private\0old\0", prefix + b" C private\0old\0",
                   prefix + b"R  private\0", prefix + b"?? private\0",
                   prefix + b"!! private\0", prefix + b"\xffM private\0",
                   prefix + b"   private\0")
        for raw in invalid:
            with self.subTest(type=type(raw).__name__):
                self.assertEqual(module.classify_workspace_membership(raw), self.expected(unavailable=True))

    def test_supported_index_worktree_and_unmerged_columns_keep_membership(self):
        for columns in (b" M", b"M ", b"MM", b"T ", b" D", b"A ", b"DD",
                        b"AU", b"UD", b"UA", b"DU", b"AA", b"UU"):
            with self.subTest(columns=columns):
                raw = columns + b" " + self.PATHS[3] + b"\0"
                self.assertEqual(module.classify_workspace_membership(raw), self.expected((3,)))

    def test_worst_case_line_is_exactly_234_ascii_bytes_including_newline(self):
        expected = self.line(self.expected(unavailable=True))
        lines = []
        module.CapturePhaseDiagnostics(lines.append).workspace_rejection(b"x" * (16 * 1024 + 1), True)
        self.assertEqual(lines[1], expected)
        self.assertEqual(len(lines[1].encode("ascii")), 234)
        self.assertTrue(all(len(line.encode("ascii")) <= 256 for line in lines))

    def test_original_other_presence_equals_candidate_or_unknown_membership(self):
        cases = (b"", module.IOS_COMBINED_STATUS,
                 b" M " + self.PATHS[0] + b"\0",
                 b" M " + PRIVATE + b"\0",
                 b" M " + self.PATHS[-1] + b"\0 M " + PRIVATE + b"\0")
        for raw in cases:
            with self.subTest(length=len(raw)):
                membership = module.classify_workspace_membership(raw)
                self.assertEqual(module.classify_workspace_status(raw)[-1] == "present",
                                 "present" in membership)


class CapturePhaseStderrProcessTest(unittest.TestCase):
    def test_real_stdout_and_stderr_failures_preserve_exit_status_and_fixed_output(self):
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
try:
    module.os.write(1, b'{"result":"preserved"}\n')
except OSError:
    status = 7
if sys.argv[2] == "1":
    observer = observer_class(writers[0])
    observer.phase("arguments")
    observer.workspace_rejection(b" M private-unreported-path\0", True)
    if status:
        observer.failure()
    else:
        observer.phase("complete")
raise SystemExit(status)
"""
        command = [sys.executable, "-I", "-S", "-B", "-X", "pycache_prefix=/dev/null",
                   "-c", child_source, str(HELPER)]
        for status in (0, 7):
            for failing_stdout, failing_stderr, enabled in (
                    (False, False, False), (False, False, True), (False, True, False), (False, True, True),
                    (True, False, False), (True, False, True), (True, True, False), (True, True, True)):
                failing = open("/dev/full", "wb", buffering=0)
                child = None
                try:
                    child = subprocess.Popen(
                        [*command, "1" if enabled else "0", str(status)],
                        stdin=subprocess.DEVNULL, stdout=failing if failing_stdout else subprocess.PIPE,
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
                            if child.stdout is not None:
                                child.stdout.close()
                            if child.stderr is not None:
                                child.stderr.close()
                        failing.close()
                with self.subTest(status=status, failing_stdout=failing_stdout,
                                  failing_stderr=failing_stderr, enabled=enabled):
                    expected_status = 7 if failing_stdout else status
                    self.assertEqual(stdout, None if failing_stdout else b'{"result":"preserved"}\n')
                    self.assertEqual(child.returncode, expected_status)
                    if not failing_stderr:
                        terminal = (b"package_capture_failure_phase=arguments\n" if expected_status else
                                    b"package_capture_phase=complete\n")
                        observation = (b"package_capture_workspace=job:match;shape:simple;"
                                       b"lock_index:absent;lock_worktree:absent;"
                                       b"debug_index:absent;debug_worktree:absent;other:present\n")
                        membership = b'package_capture_workspace_membership=v1;c01:absent;c02:absent;c03:absent;c04:absent;c05:absent;c06:absent;c07:absent;c08:absent;c09:absent;c10:absent;c11:absent;other:present\n'
                        self.assertEqual(stderr, b"package_capture_phase=arguments\n" + observation + membership + terminal
                                         if enabled else b"")


if __name__ == "__main__":unittest.main()
