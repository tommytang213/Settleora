"""Pure mocked phase contracts; no Git, Node, shell, native or provider runs.

Import the package helper's definitions only. All operational boundaries are
guarded before each case, and successful operations are in-memory fakes. Shell
and process-wrapper wiring is inspected as text, never imported or executed.
"""
import ast
from contextlib import ExitStack
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile


ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "tools/ocr-models/package-failure-capture.py"
PRIVATE = "PRIVATE_OCR_secret@example.invalid_/private/receipt_4111111111111111"
# Independent admitted fixture bytes: do not use new production symbols as the
# red witness. The current helper rejects this otherwise supported workspace.
DEBUG_PATH = "apps/mobile/ios/Flutter/Debug.xcconfig"
DEBUG_SOURCE = b'#include "Generated.xcconfig"\n'
DEBUG_PROJECTED = (b'#include? "Pods/Target Support Files/Pods-Runner/Pods-Runner.debug.xcconfig"\n'
                   + DEBUG_SOURCE)
DEBUG_SOURCE_SHA256 = "a82d7765b37116ee4821d2cd1d65942febf8032353757ffb0826eabde785b4a6"
DEBUG_PROJECTED_SHA256 = "690b8a8b1ae15ddd29b241429963e971bbc6720ab22f154cf8cf6b085b6d4925"
COMBINED_STATE = "verified_ios_test_lock_and_debug_projection"
LEGACY_CONTEXT_KEYS = {"sourceSha", "sourceTree", "sourceTreeFingerprint", "catalogSha256",
                       "workflowSha", "workflowRef", "runId", "runAttempt", "job",
                       "workspaceState", "workspaceLockSha256"}
spec = importlib.util.spec_from_file_location("package_failure_phase_contract", HELPER)
module = importlib.util.module_from_spec(spec)
# read_git has a default Popen argument. Bind it to a guard at definition time
# as well as guarding subprocess APIs during every test below.
with patch.object(subprocess, "Popen", side_effect=AssertionError("unexpected child process")), \
        patch.object(subprocess, "run", side_effect=AssertionError("unexpected child process")):
    spec.loader.exec_module(module)


class PhaseContractTest(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.popen = self.stack.enter_context(patch.object(
            module.subprocess, "Popen", side_effect=AssertionError("unexpected child process")))
        self.run = self.stack.enter_context(patch.object(
            module.subprocess, "run", side_effect=AssertionError("unexpected child process")))
        self.which = self.stack.enter_context(patch.object(
            module.shutil, "which", side_effect=AssertionError("unexpected executable lookup")))
        self.read_git = self.stack.enter_context(patch.object(
            module, "read_git", side_effect=self.fake_read_git))
        self.real_open_owned = module.open_owned
        self.open_owned = self.stack.enter_context(patch.object(
            module, "open_owned", side_effect=self.fake_open_owned))
        self.publish = self.stack.enter_context(patch.object(
            module, "atomic_output", side_effect=self.fake_publish))
        self.ready = self.stack.enter_context(patch.object(
            module, "append_ready", side_effect=lambda *args: self.ready_calls.append(args)))
        self.real_phase_writer = module.write_capture_phase
        self.phase_writer = self.stack.enter_context(patch.object(
            module, "write_capture_phase", side_effect=lambda line: self.log.write(line)))
        self.stack.enter_context(patch.object(Path, "resolve", lambda path: path))
        self.stack.enter_context(patch.object(Path, "lstat", return_value=SimpleNamespace(
            st_mode=stat.S_IFDIR | 0o700, st_uid=os.getuid())))
        self.reset_observations()

    def reset_observations(self):
        self.log = io.StringIO()
        self.outputs = []
        self.ready_calls = []
        self.git_calls = []
        self.status = b""
        self.head = b"a" * 40 + b"\n"
        self.catalog = b"{}"
        self.raw = plistlib.dumps({
            "CFBundleIdentifier": "org.cocoapods.image-picker-ios-privacy",
            "CFBundleName": "image_picker_ios_privacy", "CFBundlePackageType": "BNDL",
        })
        self.git_failure = None
        self.environment = {
            "GITHUB_ACTIONS": "true", "CI": "true",
            "SETTLEORA_PACKAGE_FAILURE_CAPTURE": "hosted_v1",
            "GITHUB_REPOSITORY": module.REPOSITORY,
            "CAPTURE_WORKFLOW_SHA": "e" * 40,
            "CAPTURE_WORKFLOW_REF": module.REPOSITORY + "/" + module.WORKFLOW + "@refs/heads/fixture",
            "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_JOB": "ios-native-acceptance",
            "RUNNER_TEMP": "/Users/runner/work/_temp",
            "GITHUB_OUTPUT": "/Users/runner/work/_temp/_runner_file_commands/set_output_00000000-0000-0000-0000-000000000000",
        }

    def fake_read_git(self, repo, args, limit):
        args = tuple(args)
        self.git_calls.append(args)
        if args == self.git_failure:
            raise RuntimeError(PRIVATE)
        if args == ("rev-parse", "HEAD"):
            return self.head
        if args[0] == "status":
            return self.status
        if args == ("show", "a" * 40 + ":" + module.IOS_LOCK):
            return b"production lock"
        if args == ("show", "a" * 40 + ":" + module.IOS_LOCK_VERIFIER):
            return b"verifier source"
        if args[0] == "show":
            return self.catalog
        if args[0] == "rev-parse":
            return b"b" * 40 + b"\n"
        if args[0] == "ls-tree":
            return (b"100644 blob " + b"a" * 40 + b"\tREADME.md\0"
                    + b"100644 blob " + b"b" * 40 + b"\t" + module.INVENTORY.encode() + b"\0")
        raise AssertionError("unexpected fake Git operation")

    def fake_open_owned(self, root, relative, limit):
        raw = (b"verifier source" if relative == module.IOS_LOCK_VERIFIER else
               b"projected lock" if relative == module.IOS_LOCK else self.raw)
        return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}, raw

    def fake_publish(self, root, name, data, limit):
        self.outputs.append((name, data, limit))

    def combined_fixture(self):
        """All Git, owned-file, Node and publication operations remain fakes."""
        self.reset_observations()
        self.source_bytes = {DEBUG_PATH: DEBUG_SOURCE, module.IOS_LOCK: b"production lock",
                             module.IOS_LOCK_VERIFIER: b"verifier source"}
        self.projected_bytes = {DEBUG_PATH: DEBUG_PROJECTED, module.IOS_LOCK: b"projected lock"}
        self.file_identities = {
            path: (11, 100 + index, stat.S_IFREG | 0o644, os.getuid(), os.getgid(),
                   1, len(raw), 123456789, 987654321)
            for index, (path, raw) in enumerate(self.projected_bytes.items())
        }
        self.owned_errors = {}
        self.owned_calls = []
        self.status = b" M " + DEBUG_PATH.encode() + b"\0 M " + module.IOS_LOCK.encode() + b"\0"
        blobs = {path: hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
                 for path, raw in self.source_bytes.items() if path in self.projected_bytes}
        self.source_records = b"".join(
            b"100644 blob " + blobs[path].encode() + b"\t" + path.encode() + b"\0"
            for path in (DEBUG_PATH, module.IOS_LOCK))
        self.index_records = b"".join(
            b"100644 " + blobs[path].encode() + b" 0\t" + path.encode() + b"\0"
            for path in (DEBUG_PATH, module.IOS_LOCK))
        self.node_hook = None
        self.between_observations_hook = None
        self.node_payloads = []

        def git(repo, args, limit):
            args = tuple(args)
            self.git_calls.append(args)
            if args == ("rev-parse", "HEAD"):
                return self.head
            if args == ("status", "--porcelain", "-z", "--untracked-files=no"):
                return self.status
            if args == ("ls-tree", "-z", "a" * 40, "--", DEBUG_PATH, module.IOS_LOCK):
                return self.source_records
            if args == ("ls-files", "--stage", "-z", "--", DEBUG_PATH, module.IOS_LOCK):
                return self.index_records
            if args == ("rev-parse", "a" * 40 + "^{tree}"):
                return b"b" * 40 + b"\n"
            if args == ("ls-tree", "-r", "-z", "--full-tree", "a" * 40):
                return (self.source_records + b"100644 blob " + b"b" * 40 + b"\t"
                        + module.INVENTORY.encode() + b"\0")
            if args[0] == "show" and args[1].startswith("a" * 40 + ":"):
                path = args[1].split(":", 1)[1]
                if path == "apps/mobile/assets/receipt_ocr_models/catalog.json":
                    if self.between_observations_hook is not None:
                        hook, self.between_observations_hook = self.between_observations_hook, None
                        hook()
                    return self.catalog
                if path in self.source_bytes:
                    return self.source_bytes[path]
            raise AssertionError("unexpected combined-fixture Git operation")

        def owned(root, relative, limit, *, identity_sink=None):
            self.owned_calls.append(relative)
            if relative in self.owned_errors:
                raise self.owned_errors[relative]
            if relative in self.projected_bytes:
                raw = self.projected_bytes[relative]
                if identity_sink is not None:
                    identity_sink.append(self.file_identities[relative])
            elif relative == module.IOS_LOCK_VERIFIER:
                raw = b"verifier source"
            else:
                return self.fake_open_owned(root, relative, limit)
            return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}, raw

        def node(*args, **kwargs):
            self.assertEqual(args[0][0], "/fixture-node")
            self.assertNotIn("timeout", kwargs)
            self.assertFalse(kwargs["check"])
            payload = {key: module.base64.b64decode(value)
                       for key, value in json.loads(kwargs["input"]).items()}
            self.node_payloads.append(payload)
            valid = payload == {"verifier": b"verifier source", "production": b"production lock",
                                "projected": b"projected lock"}
            if self.node_hook is not None:
                hook, self.node_hook = self.node_hook, None
                hook()
            return SimpleNamespace(returncode=0 if valid else 1)

        self.read_git.reset_mock()
        self.read_git.side_effect = git
        self.open_owned.reset_mock()
        self.open_owned.side_effect = owned
        self.which.side_effect = None
        self.which.return_value = "/fixture-node"
        self.run.reset_mock()
        self.run.side_effect = node
        self.publish.reset_mock()
        self.ready.reset_mock()

    def assert_combined_success(self):
        self.assertIsNone(self.main())
        metadata = self.metadata()
        context = metadata["context"]
        self.assertEqual(metadata["schemaVersion"], 2)
        self.assertEqual(set(context), LEGACY_CONTEXT_KEYS | {"workspaceDebugSha256"})
        self.assertEqual(context["workspaceState"], COMBINED_STATE)
        self.assertEqual(context["workspaceDebugSha256"], DEBUG_PROJECTED_SHA256)
        self.assertEqual(context["workspaceLockSha256"], hashlib.sha256(b"projected lock").hexdigest())
        self.assertEqual(context["sourceSha"], "a" * 40)
        self.assertEqual(context["sourceTree"], "b" * 40)
        self.assertEqual(len(self.outputs), 1)
        self.assertEqual(len(self.ready_calls), 1)
        self.assertEqual(self.run.call_count, 2)
        for path in (DEBUG_PATH, module.IOS_LOCK):
            self.assertGreaterEqual(self.git_calls.count(("show", "a" * 40 + ":" + path)), 4)
            self.assertGreaterEqual(self.owned_calls.count(path), 4)
        for command in (("rev-parse", "HEAD"),
                        ("status", "--porcelain", "-z", "--untracked-files=no"),
                        ("ls-tree", "-z", "a" * 40, "--", DEBUG_PATH, module.IOS_LOCK),
                        ("ls-files", "--stage", "-z", "--", DEBUG_PATH, module.IOS_LOCK)):
            self.assertGreaterEqual(self.git_calls.count(command), 4)
        serialized = json.dumps(metadata)
        for private_value in (PRIVATE, DEBUG_SOURCE.decode(), DEBUG_PROJECTED.decode(),
                              "file_identities", "identity_sink", "st_ino", "st_dev"):
            self.assertNotIn(json.dumps(private_value)[1:-1], serialized)
        self.assertLessEqual(len(self.log.getvalue().splitlines()), module.CAPTURE_PHASE_LIMIT)
        self.popen.assert_not_called()
        return context

    def assert_combined_rejected(self, *, after_node):
        with self.assertRaises((ValueError, OSError)):
            self.main()
        self.assertEqual(bool(self.node_payloads), after_node)
        self.assertEqual(self.outputs, [])
        self.assertEqual(self.ready_calls, [])
        self.assertNotIn(PRIVATE, self.log.getvalue())
        self.assertLessEqual(len(self.log.getvalue().splitlines()), module.CAPTURE_PHASE_LIMIT)
        self.popen.assert_not_called()

    def main(self, platform="ios", diagnostics=None):
        argv = [str(HELPER), "--platform=" + platform,
                "--source-sha=" + "a" * 40, "--repo-root=/fixture-repo"]
        with patch.object(sys, "argv", argv), patch.dict(os.environ, self.environment, clear=True), \
                patch.object(sys, "stderr", self.log):
            return module.main(diagnostics=diagnostics)

    def metadata(self):
        name, data, _ = self.outputs[-1]
        if name.endswith(".json"):
            return json.loads(data)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            return json.loads(archive.read("provenance.json"))

    def assert_failure_phase(self, phase):
        lines = self.log.getvalue().splitlines()
        self.assertEqual(lines[-1], "package_capture_failure_phase=" + phase)
        self.assertEqual(sum(line.startswith("package_capture_failure_phase=") for line in lines), 1)
        self.assertLessEqual(len(lines), module.CAPTURE_PHASE_LIMIT)
        self.assertNotIn(PRIVATE, self.log.getvalue())

    def test_main_success_keeps_evidence_and_ready_handoff_unchanged(self):
        self.assertIsNone(self.main())
        self.phase_writer.assert_called()
        self.assertEqual(len(self.outputs), 1)
        self.assertEqual(len(self.ready_calls), 1)
        metadata = self.metadata()
        self.assertFalse(metadata["accepted"])
        self.assertEqual(metadata["status"], "observed")
        self.assertEqual(metadata["context"]["workspaceState"], "clean")
        self.assertNotIn("diagnostics", metadata)
        self.assertNotIn("phase", metadata)
        lines = self.log.getvalue().splitlines()
        self.assertEqual(lines[-3:], ["package_capture_phase=ready_marker",
                                    "package_capture_phase=ready_marker_appended", "package_capture_phase=complete"])
        self.assertLess(lines.index("package_capture_phase=output_published"),
                        lines.index("package_capture_phase=ready_marker"))
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_rejected_workspace_reports_fixed_status_without_changing_admission(self):
        cases = [
            ("ios-native-acceptance", b" M " + module.IOS_LOCK.encode() + b"\0 M " + PRIVATE.encode() + b"\0",
             "job:match;shape:simple;lock_index:unchanged;lock_worktree:modified;debug_index:absent;debug_worktree:absent;other:present"),
            ("private-job", b" M " + module.IOS_LOCK.encode() + b"\0",
             "job:mismatch;shape:simple;lock_index:unchanged;lock_worktree:modified;debug_index:absent;debug_worktree:absent;other:absent"),
            ("ios-native-acceptance", b"M  " + DEBUG_PATH.encode() + b"\0",
             "job:match;shape:simple;lock_index:absent;lock_worktree:absent;debug_index:modified;debug_worktree:unchanged;other:absent"),
            ("ios-native-acceptance", b" M " + module.IOS_LOCK.encode(),
             "job:match;shape:malformed;lock_index:unknown;lock_worktree:unknown;debug_index:unknown;debug_worktree:unknown;other:unknown"),
            ("ios-native-acceptance", b"R  " + DEBUG_PATH.encode() + b"\0" + PRIVATE.encode() + b"\0",
             "job:match;shape:rename_copy;lock_index:unknown;lock_worktree:unknown;debug_index:unknown;debug_worktree:unknown;other:unknown"),
        ]
        for job, status, summary in cases:
            with self.subTest(summary=summary):
                self.reset_observations()
                self.status = status
                self.environment["GITHUB_JOB"] = job
                with self.assertRaisesRegex(ValueError, "^capture boundary rejected$"):
                    self.main()
                self.assert_failure_phase("workspace_rejected_other_state")
                self.assertEqual(self.git_calls, [
                    ("rev-parse", "HEAD"),
                    ("status", "--porcelain", "-z", "--untracked-files=no"),
                ])
                self.assertEqual(self.outputs, [])
                self.assertEqual(self.ready_calls, [])
                summaries = [line for line in self.log.getvalue().splitlines()
                             if line.startswith("package_capture_workspace=")]
                self.assertEqual(summaries, ["package_capture_workspace=" + summary])
                self.assertNotIn("private-job", self.log.getvalue())

    def test_workspace_unmerged_pairs_classify_both_known_files_as_conflicts(self):
        for columns in (b"DD", b"AU", b"UD", b"UA", b"DU", b"AA", b"UU"):
            for name, offset in ((module.IOS_LOCK, 1), (DEBUG_PATH, 3)):
                with self.subTest(columns=columns, name=name):
                    expected = ["simple", "absent", "absent", "absent", "absent", "absent"]
                    expected[offset:offset + 2] = ["unmerged", "unmerged"]
                    self.assertEqual(module.classify_workspace_status(
                        columns + b" " + name.encode() + b"\0"), tuple(expected))

    def test_workspace_conflict_classification_keeps_negative_and_private_inputs_bounded(self):
        unknown = ("unknown",) * 5
        for columns in (b"DD", b"AU", b"UD", b"UA", b"DU", b"AA", b"UU"):
            with self.subTest(columns=columns):
                status = columns + b" " + PRIVATE.encode() + b"\0"
                self.assertEqual(module.classify_workspace_status(status),
                                 ("simple", "absent", "absent", "absent", "absent", "present"))
                lines = []
                module.CapturePhaseDiagnostics(lines.append).workspace_rejection(status, True)
                self.assertEqual(lines, [
                    "package_capture_workspace=job:match;shape:simple;lock_index:absent;"
                    "lock_worktree:absent;debug_index:absent;debug_worktree:absent;other:present\n",
                    'package_capture_workspace_membership=v1;c01:absent;c02:absent;c03:absent;c04:absent;c05:absent;c06:absent;c07:absent;c08:absent;c09:absent;c10:absent;c11:absent;other:present\n'])
                self.assertNotIn(PRIVATE, "".join(lines))
        for name in (module.IOS_LOCK, DEBUG_PATH):
            path = name.encode()
            cases = [
                (b"AA " + path, "malformed"),
                (b"AA\t" + path + b"\0", "malformed"),
                (b"AA " + path + b"\0AA " + path + b"\0", "malformed"),
                (b"AX " + path + b"\0", "unsupported_status"),
                (b"?? " + path + b"\0", "unsupported_status"),
                (b"   " + path + b"\0", "unsupported_status"),
                (b"R  " + path + b"\0" + PRIVATE.encode() + b"\0", "rename_copy"),
                (b"AA " + path + b"\0" + b"x" * (16 * 1024), "unavailable"),
            ]
            for status, shape in cases:
                with self.subTest(name=name, shape=shape, status=status[:3]):
                    self.assertEqual(module.classify_workspace_status(status), (shape, *unknown))
            for columns, classes in ((b"A ", ("added", "unchanged")),
                                     (b" D", ("unchanged", "deleted")),
                                     (b"MM", ("modified", "modified"))):
                with self.subTest(name=name, columns=columns):
                    expected = ["simple", "absent", "absent", "absent", "absent", "absent"]
                    offset = 1 if name == module.IOS_LOCK else 3
                    expected[offset:offset + 2] = classes
                    self.assertEqual(module.classify_workspace_status(
                        columns + b" " + path + b"\0"), tuple(expected))

    def test_workspace_conflicts_keep_rejection_identity_operations_and_outputs_invariant(self):
        original = ValueError("original conflict rejection")
        real_require = module.require
        def require(value):
            if not value:
                raise original
            return real_require(value)
        def broken_write(line):
            raise OSError(PRIVATE)
        for columns in (b"DD", b"AU", b"UD", b"UA", b"DU", b"AA", b"UU"):
            for name in (module.IOS_LOCK, DEBUG_PATH):
                for mode in ("disabled", "enabled", "broken"):
                    with self.subTest(columns=columns, name=name, mode=mode):
                        self.reset_observations()
                        self.status = columns + b" " + name.encode() + b"\0"
                        observer = (object() if mode == "disabled" else
                                    module.CapturePhaseDiagnostics(
                                        self.log.write if mode == "enabled" else broken_write))
                        with patch.object(module, "require", side_effect=require):
                            with self.assertRaises(ValueError) as raised:
                                self.main(diagnostics=observer)
                        self.assertIs(raised.exception, original)
                        self.assertEqual(self.git_calls, [
                            ("rev-parse", "HEAD"),
                            ("status", "--porcelain", "-z", "--untracked-files=no"),
                        ])
                        self.assertEqual(self.outputs, [])
                        self.assertEqual(self.ready_calls, [])
                        self.assertNotIn(PRIVATE, self.log.getvalue())
                        if mode == "enabled":
                            self.assert_failure_phase("workspace_rejected_other_state")
                        else:
                            self.assertEqual(self.log.getvalue(), "")
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_main_context_failure_is_original_exception_and_has_exact_phase(self):
        error = RuntimeError(PRIVATE)
        self.read_git.side_effect = error
        with self.assertRaises(RuntimeError) as raised:
            self.main()
        self.assertIs(raised.exception, error)
        self.assert_failure_phase("source_head")
        self.publish.assert_not_called()
        self.ready.assert_not_called()

    def test_main_source_context_boundaries_do_not_export_input_or_exception_values(self):
        cases = [
            ("hosted_environment", lambda: self.environment.update(CI="false")),
            ("source_head", lambda: setattr(self, "head", b"f" * 40)),
            ("workspace_rejected_other_state", lambda: setattr(self, "status", (" M " + PRIVATE + "\0").encode())),
            ("catalog", lambda: setattr(self, "catalog", b"x" * (module.MAX_PLIST + 1))),
            ("source_tree", lambda: setattr(self, "git_failure", ("rev-parse", "a" * 40 + "^{tree}"))),
            ("source_fingerprint", lambda: setattr(self, "git_failure", ("ls-tree", "-r", "-z", "--full-tree", "a" * 40))),
            ("output_root_selector", lambda: self.environment.update(RUNNER_TEMP="/" + PRIVATE)),
            ("context_contract", lambda: self.environment.update(GITHUB_JOB="android-native-acceptance")),
        ]
        for phase, change in cases:
            with self.subTest(phase=phase):
                self.reset_observations()
                change()
                with self.assertRaises((ValueError, RuntimeError)):
                    self.main()
                self.assert_failure_phase(phase)
                self.assertEqual(self.outputs, [])
                self.assertEqual(self.ready_calls, [])

    def test_main_repository_and_output_root_rejections_keep_existing_contract(self):
        with patch.object(Path, "is_absolute", return_value=False):
            with self.assertRaises(ValueError):
                self.main()
        self.assert_failure_phase("repository_identity")
        self.reset_observations()
        with patch.object(Path, "lstat", return_value=SimpleNamespace(st_mode=stat.S_IFREG, st_uid=os.getuid())):
            with self.assertRaises(ValueError):
                self.main()
        self.assert_failure_phase("output_root_contract")
        self.assertEqual(self.ready_calls, [])

    def test_main_rechecks_head_and_workspace_without_relaxing_tolerances(self):
        original = self.fake_read_git
        def changed_head(repo, args, limit):
            if tuple(args) == ("rev-parse", "HEAD") and tuple(args) in self.git_calls:
                raise RuntimeError(PRIVATE)
            return original(repo, args, limit)
        self.read_git.side_effect = changed_head
        with self.assertRaises(RuntimeError):
            self.main()
        self.assert_failure_phase("source_recheck")
        self.reset_observations()
        def changed_workspace(repo, args, limit):
            if args[0] == "status" and any(call[0] == "status" for call in self.git_calls):
                self.status = b" M apps/mobile/ios/Flutter/Debug.xcconfig\0"
            return original(repo, args, limit)
        self.read_git.side_effect = changed_workspace
        with self.assertRaises(ValueError):
            self.main()
        self.assertIn("package_capture_phase=workspace_recheck\n", self.log.getvalue())
        self.assert_failure_phase("workspace_rejected_other_state")
        self.assertEqual(self.outputs, [])

    def test_exact_lock_projection_keeps_verification_and_recheck_with_fake_node_only(self):
        self.status = b" M " + module.IOS_LOCK.encode() + b"\0"
        self.which.side_effect = None
        self.which.return_value = "/fixture-node"
        self.run.side_effect = None
        self.run.return_value = SimpleNamespace(returncode=0)
        self.main()
        self.assertEqual(self.run.call_count, 2)
        self.assertEqual(self.metadata()["context"]["workspaceState"], "verified_ios_test_lock_projection")
        for call in self.run.call_args_list:
            self.assertNotIn("timeout", call.kwargs)
            self.assertFalse(call.kwargs["check"])
        self.popen.assert_not_called()
        self.reset_observations()
        self.status = b" M " + module.IOS_LOCK.encode() + b"\0"
        self.run.return_value = SimpleNamespace(returncode=1)
        with self.assertRaises(ValueError):
            self.main()
        self.assert_failure_phase("workspace_projection_verify")
        self.assertEqual(self.ready_calls, [])

    def test_combined_projection_has_exact_independent_fixture_and_bound_provenance(self):
        self.assertEqual(len(DEBUG_SOURCE), 30)
        self.assertEqual(len(DEBUG_PROJECTED), 107)
        self.assertEqual(hashlib.sha256(DEBUG_SOURCE).hexdigest(), DEBUG_SOURCE_SHA256)
        self.assertEqual(hashlib.sha256(DEBUG_PROJECTED).hexdigest(), DEBUG_PROJECTED_SHA256)
        self.combined_fixture()
        self.assert_combined_success()

    def test_combined_workspace_public_api_contains_no_private_proof(self):
        self.combined_fixture()
        workspace = module.workspace_context(
            Path("/fixture-repo"), "a" * 40, self.environment,
            lambda *args: self.read_git(Path("/fixture-repo"), args, module.MAX_PLIST))
        self.assertEqual(workspace, {
            "workspaceState": COMBINED_STATE,
            "workspaceLockSha256": hashlib.sha256(b"projected lock").hexdigest(),
            "workspaceDebugSha256": DEBUG_PROJECTED_SHA256,
        })
        self.assertEqual(self.run.call_count, 1)
        self.assertEqual(self.outputs, [])
        self.assertEqual(self.ready_calls, [])

    def test_legacy_context_shapes_and_schema_versions_remain_exact(self):
        self.main()
        clean = self.metadata()
        self.assertEqual(clean["schemaVersion"], 1)
        self.assertEqual(set(clean["context"]), LEGACY_CONTEXT_KEYS)
        self.assertEqual(clean["context"]["workspaceState"], "clean")
        self.assertIsNone(clean["context"]["workspaceLockSha256"])
        self.reset_observations()
        self.status = b" M " + module.IOS_LOCK.encode() + b"\0"
        self.which.side_effect = None
        self.which.return_value = "/fixture-node"
        self.run.side_effect = None
        self.run.return_value = SimpleNamespace(returncode=0)
        self.main()
        projected = self.metadata()
        self.assertEqual(projected["schemaVersion"], 1)
        self.assertEqual(set(projected["context"]), LEGACY_CONTEXT_KEYS)
        self.assertEqual(projected["context"]["workspaceState"], "verified_ios_test_lock_projection")
        self.assertEqual(projected["context"]["workspaceLockSha256"],
                         hashlib.sha256(b"projected lock").hexdigest())

    def test_combined_and_legacy_context_keysets_are_discriminated_and_strict(self):
        context = {
            "sourceSha": "a" * 40, "sourceTree": "b" * 40,
            "sourceTreeFingerprint": "c" * 64, "catalogSha256": "d" * 64,
            "workflowSha": "e" * 40,
            "workflowRef": module.REPOSITORY + "/" + module.WORKFLOW + "@refs/heads/fixture",
            "runId": "123", "runAttempt": "1", "job": "ios-native-acceptance",
            "workspaceState": COMBINED_STATE, "workspaceLockSha256": "f" * 64,
            "workspaceDebugSha256": DEBUG_PROJECTED_SHA256,
        }
        self.assertIsNone(module.validate_context(context, "ios"))
        variants = []
        missing = dict(context)
        del missing["workspaceDebugSha256"]
        variants.append(("missing Debug digest", missing, "ios"))
        for key, value in (("workspaceDebugSha256", "0" * 64),
                           ("workspaceDebugSha256", DEBUG_PROJECTED_SHA256.upper()),
                           ("workspaceDebugSha256", None),
                           ("workspaceLockSha256", "0" * 63),
                           ("workspaceLockSha256", 7),
                           ("workspaceState", "verified_ios_test_lock_projection"),
                           ("workspaceState", "clean"),
                           ("workspaceState", PRIVATE),
                           ("job", "android-native-acceptance"),
                           ("privateProof", PRIVATE)):
            variants.append((key + ":" + repr(value), {**context, key: value}, "ios"))
        variants.append(("Android combined state",
                         {**context, "job": "android-native-acceptance"}, "android"))
        for name, invalid, platform in variants:
            with self.subTest(case=name):
                with self.assertRaises(ValueError):
                    module.validate_context(invalid, platform)
        for state, lock in (("clean", None), ("verified_ios_test_lock_projection", "f" * 64)):
            legacy = {key: value for key, value in context.items() if key != "workspaceDebugSha256"}
            legacy.update(workspaceState=state, workspaceLockSha256=lock)
            self.assertIsNone(module.validate_context(legacy, "ios"))
            with self.assertRaises(ValueError):
                module.validate_context({**legacy, "workspaceDebugSha256": DEBUG_PROJECTED_SHA256}, "ios")

    def test_combined_projection_rejects_staged_extra_duplicate_and_debug_only_status(self):
        self.combined_fixture()
        self.assert_combined_success()
        combined = b" M " + DEBUG_PATH.encode() + b"\0 M " + module.IOS_LOCK.encode() + b"\0"
        variants = [
            b" M " + DEBUG_PATH.encode() + b"\0",
            combined.replace(b" M ", b"M  ", 1),
            combined.replace(b" M ", b"MM ", 1),
            combined.replace(b" M " + module.IOS_LOCK.encode(), b"M  " + module.IOS_LOCK.encode()),
            combined + b" M apps/mobile/ios/Runner.xcodeproj/project.pbxproj\0",
            combined + b" M " + DEBUG_PATH.encode() + b"\0",
            b" M " + module.IOS_LOCK.encode() + b"\0 M " + DEBUG_PATH.encode() + b"\0",
            combined[:-1],
        ]
        for status in variants:
            with self.subTest(status=status):
                self.combined_fixture()
                self.status = status
                self.assert_combined_rejected(after_node=False)
        self.combined_fixture()
        self.environment["GITHUB_JOB"] = "android-native-acceptance"
        self.assert_combined_rejected(after_node=False)

    def test_combined_projection_requires_regular_source_and_matching_unstaged_index(self):
        self.combined_fixture()
        self.assert_combined_success()
        variants = [
            ("source executable", lambda: setattr(self, "source_records", self.source_records.replace(b"100644", b"100755", 1))),
            ("source symlink", lambda: setattr(self, "source_records", self.source_records.replace(b"100644", b"120000", 1))),
            ("missing source", lambda: setattr(self, "source_records", self.source_records.split(b"\0", 1)[0] + b"\0")),
            ("index executable", lambda: setattr(self, "index_records", self.index_records.replace(b"100644", b"100755", 1))),
            ("index symlink", lambda: setattr(self, "index_records", self.index_records.replace(b"100644", b"120000", 1))),
            ("index conflict", lambda: setattr(self, "index_records", self.index_records.replace(b" 0\t", b" 1\t", 1))),
            ("index blob mismatch", lambda: setattr(self, "index_records", self.index_records[:7] + b"f" * 40 + self.index_records[47:])),
            ("duplicate index", lambda: setattr(self, "index_records", self.index_records + self.index_records)),
        ]
        for name, change in variants:
            with self.subTest(case=name):
                self.combined_fixture()
                change()
                self.assert_combined_rejected(after_node=False)

    def test_combined_projection_rejects_altered_debug_bytes_and_owned_read_failures(self):
        self.combined_fixture()
        self.assert_combined_success()
        for source in (b"", DEBUG_SOURCE + b"\n", DEBUG_PROJECTED):
            with self.subTest(source=source):
                self.combined_fixture()
                self.source_bytes[DEBUG_PATH] = source
                self.assert_combined_rejected(after_node=False)
        for projected in (DEBUG_SOURCE, DEBUG_PROJECTED + b"\n",
                          DEBUG_PROJECTED.replace(b"#include?", b"#include"),
                          DEBUG_PROJECTED.replace(b"\n", b"\r\n")):
            with self.subTest(projected=projected):
                self.combined_fixture()
                self.projected_bytes[DEBUG_PATH] = projected
                self.assert_combined_rejected(after_node=False)
        for path in (DEBUG_PATH, module.IOS_LOCK):
            with self.subTest(owned_path=path):
                self.combined_fixture()
                self.owned_errors[path] = ValueError(PRIVATE)
                self.assert_combined_rejected(after_node=False)
                self.assertIn(path, self.owned_calls)

    def test_combined_projection_detects_source_status_and_file_drift_during_node(self):
        self.combined_fixture()
        self.assert_combined_success()
        variants = [
            ("HEAD", lambda: setattr(self, "head", b"f" * 40 + b"\n")),
            ("status", lambda: setattr(self, "status", b" M " + DEBUG_PATH.encode() + b"\0")),
            ("source tree entries", lambda: setattr(self, "source_records", self.source_records.replace(b"100644", b"100755", 1))),
            ("index entries", lambda: setattr(self, "index_records", self.index_records.replace(b" 0\t", b" 1\t", 1))),
            ("Debug baseline", lambda: self.source_bytes.update({DEBUG_PATH: DEBUG_SOURCE + b"\n"})),
            ("lock baseline", lambda: self.source_bytes.update({module.IOS_LOCK: b"different production lock"})),
            ("verifier baseline", lambda: self.source_bytes.update({module.IOS_LOCK_VERIFIER: b"different verifier"})),
            ("Debug bytes", lambda: self.projected_bytes.update({DEBUG_PATH: DEBUG_PROJECTED + b"\n"})),
            ("lock bytes", lambda: self.projected_bytes.update({module.IOS_LOCK: b"different projected lock"})),
        ]
        for name, change in variants:
            with self.subTest(case=name):
                self.combined_fixture()
                self.node_hook = change
                self.assert_combined_rejected(after_node=True)
                self.assertEqual(self.run.call_count, 1)

    def test_combined_projection_rechecks_every_private_identity_field(self):
        self.combined_fixture()
        self.assert_combined_success()
        fields = ("device", "inode", "mode", "uid", "gid", "links", "size", "mtime", "ctime")
        for path in (DEBUG_PATH, module.IOS_LOCK):
            for index, field in enumerate(fields):
                with self.subTest(path=path, field=field):
                    self.combined_fixture()
                    def change(path=path, index=index):
                        values = list(self.file_identities[path])
                        values[index] = stat.S_IFREG | 0o640 if index == 2 else values[index] + 1
                        self.file_identities[path] = tuple(values)
                    self.node_hook = change
                    self.assert_combined_rejected(after_node=True)
                    self.assertEqual(self.run.call_count, 1)

    def test_combined_projection_keeps_private_proof_between_context_observations(self):
        self.combined_fixture()
        self.assert_combined_success()
        fields = ("device", "inode", "mode", "uid", "gid", "links", "size", "mtime", "ctime")
        for path in (DEBUG_PATH, module.IOS_LOCK):
            for index, field in enumerate(fields):
                with self.subTest(path=path, field=field):
                    self.combined_fixture()
                    def change_private_identity(path=path, index=index):
                        values = list(self.file_identities[path])
                        # A non-executable permission change isolates continuity
                        # from the separate initial executable-mode rejection.
                        values[index] = stat.S_IFREG | 0o640 if index == 2 else values[index] + 1
                        self.file_identities[path] = tuple(values)
                    self.between_observations_hook = change_private_identity
                    self.assert_combined_rejected(after_node=True)
                    self.assertEqual(self.run.call_count, 2)

    def test_combined_projection_checks_drift_through_the_final_context_observation(self):
        self.combined_fixture()
        self.assert_combined_success()
        variants = [
            ("final HEAD", lambda: setattr(self, "head", b"f" * 40 + b"\n")),
            ("final status", lambda: setattr(self, "status", b" M " + DEBUG_PATH.encode() + b"\0")),
            ("final lock baseline", lambda: self.source_bytes.update({module.IOS_LOCK: b"changed lock baseline"})),
        ]
        for name, change in variants:
            with self.subTest(case=name):
                self.combined_fixture()
                def after_first_node(change=change):
                    self.node_hook = change
                self.node_hook = after_first_node
                self.assert_combined_rejected(after_node=True)
                self.assertEqual(self.run.call_count, 2)

    def exercise_real_owned_reader(self, *, sink=None, with_sink=False, before_changes=None,
                                   fd_before_changes=None, fd_after_changes=None,
                                   path_after_changes=None, directory_changes=None):
        # Invoke the actual reader with every filesystem syscall replaced.
        raw = b"owned fixture"
        root = Path("/fixture-repo")
        path = root / "nested/fixture.bin"
        fields = {"st_dev": 11, "st_ino": 100, "st_mode": stat.S_IFREG | 0o640,
                  "st_uid": os.getuid(), "st_gid": os.getgid(), "st_nlink": 1,
                  "st_size": len(raw), "st_mtime_ns": 123456789, "st_ctime_ns": 987654321}
        before = SimpleNamespace(**{**fields, **(before_changes or {})})
        fd_before = SimpleNamespace(**{**vars(before), **(fd_before_changes or {})})
        fd_after = SimpleNamespace(**{**vars(before), **(fd_after_changes or {})})
        path_after = SimpleNamespace(**{**vars(before), **(path_after_changes or {})})
        directory = SimpleNamespace(**{
            "st_mode": stat.S_IFDIR | 0o700, "st_uid": os.getuid(), **(directory_changes or {})})
        path_reads = 0
        def lstat(selected):
            nonlocal path_reads
            if selected == path:
                path_reads += 1
                return before if path_reads == 1 else path_after
            return directory
        with ExitStack() as io_stack:
            io_stack.enter_context(patch.object(Path, "lstat", lstat))
            opened = io_stack.enter_context(patch.object(module.os, "open", return_value=83))
            read = io_stack.enter_context(patch.object(module.os, "read", side_effect=[raw, b""]))
            closed = io_stack.enter_context(patch.object(module.os, "close"))
            fstat = io_stack.enter_context(patch.object(module.os, "fstat", side_effect=[fd_before, fd_after]))
            self.reader_io = {"open": opened, "read": read, "close": closed, "fstat": fstat}
            kwargs = {"identity_sink": sink} if with_sink else {}
            return self.real_open_owned(root, "nested/fixture.bin", module.MAX_PLIST, **kwargs)

    def test_real_owned_reader_preserves_legacy_return_and_keeps_snapshot_private(self):
        expected = ({"bytes": 13, "sha256": hashlib.sha256(b"owned fixture").hexdigest()},
                    b"owned fixture")
        self.assertEqual(self.exercise_real_owned_reader(), expected)
        self.reader_io["close"].assert_called_once_with(83)
        # Preserve the legacy five-field identity policy when no sink is requested.
        self.assertEqual(self.exercise_real_owned_reader(
            fd_before_changes={"st_gid": os.getgid() + 1}), expected)
        sink = []
        self.assertEqual(self.exercise_real_owned_reader(sink=sink, with_sink=True), expected)
        self.assertEqual(sink, [(11, 100, stat.S_IFREG | 0o640, os.getuid(), os.getgid(),
                                 1, 13, 123456789, 987654321)])
        self.reader_io["open"].assert_called_once_with(
            Path("/fixture-repo/nested/fixture.bin"), os.O_RDONLY | os.O_NOFOLLOW)
        self.reader_io["close"].assert_called_once_with(83)
        self.assertEqual(self.reader_io["fstat"].call_count, 2)
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_real_owned_reader_checks_every_full_identity_field_at_each_read_boundary(self):
        fields = {"st_dev": 12, "st_ino": 101, "st_mode": stat.S_IFREG | 0o600,
                  "st_uid": os.getuid() + 1, "st_gid": os.getgid() + 1, "st_nlink": 2,
                  "st_size": 14, "st_mtime_ns": 123456790, "st_ctime_ns": 987654322}
        for boundary in ("fd_before_changes", "fd_after_changes", "path_after_changes"):
            for field, value in fields.items():
                with self.subTest(boundary=boundary, field=field):
                    sink = []
                    with self.assertRaises(ValueError):
                        self.exercise_real_owned_reader(sink=sink, with_sink=True,
                                                        **{boundary: {field: value}})
                    self.assertEqual(sink, [])
                    self.reader_io["close"].assert_called_once_with(83)
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_real_owned_reader_rejects_unsafe_initial_files_and_directories_without_opening(self):
        for changes in ({"st_uid": os.getuid() + 1}, {"st_nlink": 2},
                        {"st_mode": stat.S_IFLNK | 0o640}, {"st_mode": stat.S_IFDIR | 0o700},
                        {"st_size": 0}, {"st_size": module.MAX_PLIST + 1}):
            with self.subTest(before=changes):
                sink = []
                with self.assertRaises(ValueError):
                    self.exercise_real_owned_reader(sink=sink, with_sink=True, before_changes=changes)
                self.assertEqual(sink, [])
                self.reader_io["open"].assert_not_called()
                self.reader_io["close"].assert_not_called()
        for changes in ({"st_uid": os.getuid() + 1}, {"st_mode": stat.S_IFLNK | 0o700}):
            with self.subTest(directory=changes):
                with self.assertRaises(ValueError):
                    self.exercise_real_owned_reader(sink=[], with_sink=True, directory_changes=changes)
                self.reader_io["open"].assert_not_called()
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_combined_projection_rejects_initial_execute_bits_without_fixing_rw_permissions(self):
        for path in (DEBUG_PATH, module.IOS_LOCK):
            for permissions in (0o600, 0o640, 0o644):
                with self.subTest(path=path, allowed_permissions=permissions):
                    self.combined_fixture()
                    values = list(self.file_identities[path])
                    values[2] = stat.S_IFREG | permissions
                    self.file_identities[path] = tuple(values)
                    self.assert_combined_success()
            for permissions in (0o744, 0o654, 0o645):
                with self.subTest(path=path, rejected_permissions=permissions):
                    self.combined_fixture()
                    values = list(self.file_identities[path])
                    values[2] = stat.S_IFREG | permissions
                    self.file_identities[path] = tuple(values)
                    self.assert_combined_rejected(after_node=False)

    def test_main_safe_unavailable_plist_and_missing_file_still_publish_and_mark(self):
        self.raw = PRIVATE.encode()
        self.main()
        self.assertEqual(self.metadata()["reason"], "unclassified_or_noncanonical_plist")
        self.assertFalse(self.metadata()["contentRetained"])
        self.assertEqual(len(self.ready_calls), 1)
        self.assertNotIn("package_capture_failure_phase=", self.log.getvalue())
        self.assertNotIn(PRIVATE.encode(), self.outputs[-1][1])
        self.reset_observations()
        self.open_owned.side_effect = FileNotFoundError(PRIVATE)
        self.main()
        self.assertEqual(self.metadata()["reason"], "missing_unsafe_or_changed_file")
        self.assertEqual(len(self.ready_calls), 1)
        self.assertNotIn("package_capture_failure_phase=", self.log.getvalue())

    def test_main_publication_and_ready_failures_are_distinct_and_preserve_exception_identity(self):
        error = RuntimeError(PRIVATE)
        self.publish.side_effect = error
        with self.assertRaises(RuntimeError) as raised:
            self.main()
        self.assertIs(raised.exception, error)
        self.assert_failure_phase("output_publication")
        self.ready.assert_not_called()
        self.reset_observations()
        self.publish.side_effect = self.fake_publish
        self.ready.side_effect = error
        with self.assertRaises(RuntimeError) as raised:
            self.main()
        self.assertIs(raised.exception, error)
        self.assert_failure_phase("ready_marker")
        self.assertEqual(len(self.outputs), 1)
        self.assertIn("package_capture_phase=output_published\n", self.log.getvalue())
        self.assertNotIn("package_capture_phase=ready_marker_appended", self.log.getvalue())

    def test_android_default_remains_silent_on_success_and_failure(self):
        self.environment.update(GITHUB_JOB="android-native-acceptance", RUNNER_TEMP="/home/runner/work/_temp")
        self.main(platform="android")
        self.assertEqual(self.log.getvalue(), "")
        self.assertEqual(self.outputs[-1][0], "android-package-failure-capture.json")
        self.assertFalse(self.metadata()["accepted"])
        self.environment["CI"] = "false"
        with self.assertRaises(ValueError):
            self.main(platform="android")
        self.assertEqual(self.log.getvalue(), "")

    def test_argparse_exit_and_existing_cli_failure_status_are_preserved(self):
        with patch.object(sys, "argv", [str(HELPER)]), patch.object(sys, "stderr", self.log):
            with self.assertRaises(SystemExit) as raised:
                module.main()
        self.assertEqual(raised.exception.code, 2)
        self.assertNotIn("package_capture_", self.log.getvalue())
        # Inspect the existing terminal boundary; never execute __main__.
        source = HELPER.read_text()
        terminal = source.split('if __name__ == "__main__":', 1)[1]
        self.assertIn('sys.stderr.write("bounded_package_failure_capture_unavailable\\n")', terminal)
        self.assertIn("sys.exit(1)", terminal)

    def test_raw_phase_writer_uses_one_unbuffered_write_without_retry(self):
        line = "package_capture_phase=catalog\n"
        stream = SimpleNamespace(fileno=lambda: 23)
        for written in (0, 1, len(line)):
            with self.subTest(written=written):
                with patch.object(sys, "stderr", stream), \
                        patch.object(module.os, "write", return_value=written) as write:
                    self.assertIsNone(self.real_phase_writer(line))
                write.assert_called_once_with(23, line.encode("ascii"))
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_raw_phase_writer_io_errors_are_contained_by_observer(self):
        error = OSError(PRIVATE)
        stream = SimpleNamespace(fileno=lambda: 23)
        with patch.object(sys, "stderr", stream), \
                patch.object(module.os, "write", side_effect=error) as write:
            with self.assertRaises(OSError) as raised:
                self.real_phase_writer("package_capture_phase=arguments\n")
            self.assertIs(raised.exception, error)
            diagnostics = module.CapturePhaseDiagnostics(self.real_phase_writer)
            diagnostics.phase("catalog")
            diagnostics.failure()
        self.assertEqual(write.call_count, 3)
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_raw_phase_writer_missing_descriptors_have_no_fallback(self):
        for stream in (None, object(), io.StringIO()):
            with self.subTest(stream_type=type(stream).__name__):
                with patch.object(sys, "stderr", stream), \
                        patch.object(module.os, "write") as write:
                    diagnostics = module.CapturePhaseDiagnostics(self.real_phase_writer)
                    diagnostics.phase("catalog")
                    diagnostics.failure()
                    write.assert_not_called()
        self.popen.assert_not_called()
        self.run.assert_not_called()

    def test_broken_diagnostic_writers_do_not_change_success_or_original_failure(self):
        def broken_write(line):
            raise RuntimeError(PRIVATE)
        for writer in (None, 7, broken_write):
            with self.subTest(writer_type=type(writer).__name__):
                self.reset_observations()
                diagnostics = module.CapturePhaseDiagnostics(writer)
                self.assertIsNone(self.main(diagnostics=diagnostics))
                self.assertEqual(len(self.ready_calls), 1)
                self.assertEqual(self.log.getvalue(), "")
                error = RuntimeError(PRIVATE)
                self.publish.side_effect = error
                with self.assertRaises(RuntimeError) as raised:
                    self.main(diagnostics=module.CapturePhaseDiagnostics(writer))
                self.assertIs(raised.exception, error)
                self.publish.side_effect = self.fake_publish

    def test_malformed_observers_cannot_change_helper_control_flow(self):
        class BrokenObserver:
            @property
            def phase(self):
                raise RuntimeError(PRIVATE)
            @property
            def failure(self):
                raise RuntimeError(PRIVATE)
        self.main(diagnostics=BrokenObserver())
        self.assertEqual(len(self.ready_calls), 1)
        error = RuntimeError(PRIVATE)
        self.publish.side_effect = error
        with self.assertRaises(RuntimeError) as raised:
            self.main(diagnostics=BrokenObserver())
        self.assertIs(raised.exception, error)

    def test_phase_tokens_never_coerce_or_retain_arbitrary_values(self):
        class Hostile:
            def __str__(self):
                raise AssertionError("unexpected coercion")
            def __hash__(self):
                raise AssertionError("unexpected hashing")
        class TextSubclass(str):
            pass
        lines = []
        diagnostics = module.CapturePhaseDiagnostics(lines.append)
        for value in (None, True, 1, [], {}, Hostile(), TextSubclass("catalog"), PRIVATE, "catalog\n" + PRIVATE):
            diagnostics.phase(value)
        self.assertEqual(lines, [])
        diagnostics.phase("catalog")
        diagnostics.failure()
        self.assertEqual(lines, ["package_capture_phase=catalog\n", "package_capture_failure_phase=catalog\n"])
        self.assertNotIn(PRIVATE, "".join(lines))

    def test_strict_cap_reserves_terminal_failure_and_counts_failed_or_reentrant_writes(self):
        for throws in (False, True):
            with self.subTest(throws=throws):
                lines = []
                def write(line):
                    lines.append(line)
                    if throws:
                        raise RuntimeError(PRIVATE)
                diagnostics = module.CapturePhaseDiagnostics(write)
                for _ in range(1000):
                    diagnostics.phase("catalog")
                diagnostics.phase("ready_marker")
                diagnostics.failure()
                diagnostics.failure()
                diagnostics.phase("complete")
                self.assertEqual(len(lines), 32)
                self.assertEqual(lines[-1], "package_capture_failure_phase=ready_marker\n")
        lines = []
        def reenter(line):
            lines.append(line)
            diagnostics.phase("catalog")
        diagnostics = module.CapturePhaseDiagnostics(reenter)
        diagnostics.phase("arguments")
        diagnostics.failure()
        self.assertEqual(lines, ["package_capture_phase=arguments\n",
                                 "package_capture_failure_phase=arguments\n"])

    def test_reentrant_workspace_writer_cannot_replace_original_failure_phase(self):
        original = ValueError("original rejection sentinel")
        real_require = module.require
        def require(value):
            if not value:
                raise original
            return real_require(value)
        for throws in (False, True):
            with self.subTest(throws=throws):
                self.reset_observations()
                self.status = b" M " + PRIVATE.encode() + b"\0"
                def write(line):
                    self.log.write(line)
                    if line.startswith("package_capture_workspace="):
                        observer.phase("catalog")
                        if throws:
                            raise OSError(PRIVATE)
                observer = module.CapturePhaseDiagnostics(write)
                with patch.object(module, "require", side_effect=require):
                    with self.assertRaises(ValueError) as raised:
                        self.main(diagnostics=observer)
                self.assertIs(raised.exception, original)
                self.assertEqual(self.git_calls, [("rev-parse", "HEAD"),
                                                 ("status", "--porcelain", "-z", "--untracked-files=no")])
                self.assertEqual(self.outputs, [])
                self.assertEqual(self.ready_calls, [])
                self.assert_failure_phase("workspace_rejected_other_state")

    def test_workspace_observation_preserves_both_environment_reads_and_predicates(self):
        class Environment:
            def __init__(self, values):
                self.values = iter(values)
                self.calls = []
            def get(self, name):
                self.calls.append(name)
                return next(self.values)
        match, mismatch = "ios-native-acceptance", PRIVATE
        cases = [
            (b"", (), "clean"),
            (b" M " + module.IOS_LOCK.encode() + b"\0", (mismatch, match), "admitted"),
            (module.IOS_COMBINED_STATUS, (match, mismatch), "admitted"),
            (module.IOS_COMBINED_STATUS, (mismatch, match), "rejected"),
            (b" M " + module.IOS_LOCK.encode() + b"\0", (match, mismatch), "rejected"),
        ]
        for status, values, outcome in cases:
            for enabled in (False, True):
                with self.subTest(outcome=outcome, enabled=enabled, values=values):
                    environment = Environment(values)
                    commands, lines = [], []
                    admitted = RuntimeError("admitted operation sentinel")
                    def git(*args):
                        commands.append(args)
                        if args[0] == "status":
                            return status
                        raise admitted
                    observer = module.CapturePhaseDiagnostics(lines.append) if enabled else None
                    with patch.object(module, "combined_projection_snapshot", side_effect=admitted):
                        if outcome == "clean":
                            result = module.workspace_observation(
                                Path("/fixture-repo"), "a" * 40, environment, git, observer)
                            self.assertEqual(result, ({"workspaceState": "clean", "workspaceLockSha256": None}, None))
                        elif outcome == "admitted":
                            with self.assertRaises(RuntimeError) as raised:
                                module.workspace_observation(Path("/fixture-repo"), "a" * 40, environment, git, observer)
                            self.assertIs(raised.exception, admitted)
                        else:
                            with self.assertRaisesRegex(ValueError, "^capture boundary rejected$"):
                                module.workspace_observation(Path("/fixture-repo"), "a" * 40, environment, git, observer)
                    self.assertEqual(environment.calls, ["GITHUB_JOB"] * len(values))
                    self.assertEqual(commands[0], ("status", "--porcelain", "-z", "--untracked-files=no"))
                    self.assertEqual(sum(line.startswith("package_capture_workspace=") for line in lines),
                                     int(enabled and outcome == "rejected"))
                    self.assertEqual(sum(line.startswith("package_capture_workspace_membership=") for line in lines),
                                     int(enabled and outcome == "rejected"))
                    self.assertNotIn(PRIVATE, "".join(lines))

    def test_workspace_observer_failures_preserve_original_rejection_and_operation_trace(self):
        self.status = b" M " + PRIVATE.encode() + b"\0"
        original = ValueError("original boundary sentinel")
        real_require = module.require
        def require(value):
            if not value:
                raise original
            return real_require(value)
        class BrokenObserver:
            def phase(self, phase):
                pass
            def failure(self):
                pass
            @property
            def workspace_rejection(self):
                raise RuntimeError(PRIVATE)
        def broken_writer(line):
            raise OSError(PRIVATE)
        for observer in (BrokenObserver(), module.CapturePhaseDiagnostics(broken_writer)):
            with self.subTest(observer=type(observer).__name__), patch.object(module, "require", side_effect=require):
                self.git_calls = []
                with self.assertRaises(ValueError) as raised:
                    self.main(diagnostics=observer)
                self.assertIs(raised.exception, original)
                self.assertEqual(self.git_calls, [("rev-parse", "HEAD"),
                                                 ("status", "--porcelain", "-z", "--untracked-files=no")])
                self.assertEqual(self.outputs, [])
                self.assertEqual(self.ready_calls, [])
        with patch.object(module, "require", side_effect=require), \
                patch.object(module, "classify_workspace_status", side_effect=RuntimeError(PRIVATE)):
            with self.assertRaises(ValueError) as raised:
                self.main()
            self.assertIs(raised.exception, original)
        self.assert_failure_phase("workspace_rejected_other_state")

    def test_workspace_observation_rejects_non_enum_results_without_coercion(self):
        class Hostile:
            def __str__(self):
                raise AssertionError("unexpected coercion")
            def __hash__(self):
                raise AssertionError("unexpected hashing")
        class TextSubclass(str):
            pass
        valid = ("simple", "absent", "absent", "absent", "absent", "absent")
        malformed = (None, [], Hostile(), valid[:-1], (*valid[:-1], PRIVATE),
                     (PRIVATE, *valid[1:]), ("simple", Hostile(), *valid[2:]),
                     (TextSubclass("simple"), *valid[1:]))
        for result in malformed:
            lines = []
            observer = module.CapturePhaseDiagnostics(lines.append)
            with patch.object(module, "classify_workspace_status", return_value=result):
                observer.workspace_rejection(b"", True)
            self.assertEqual(lines, [])
            observer.failure()
            self.assertEqual(lines, ["package_capture_failure_phase=arguments\n"])
        for job_matches in (None, 1, PRIVATE, Hostile()):
            observer = module.CapturePhaseDiagnostics(self.log.write)
            with patch.object(module, "classify_workspace_status") as classify:
                observer.workspace_rejection(b"", job_matches)
                classify.assert_not_called()
        self.assertEqual(self.log.getvalue(), "")

    def test_workspace_observation_shares_budget_reserves_failure_and_is_reentrant_safe(self):
        for count in (0, 30, 31, 1000):
            for throws in (False, True):
                with self.subTest(count=count, throws=throws):
                    lines = []
                    def write(line):
                        lines.append(line)
                        if throws:
                            raise OSError(PRIVATE)
                    observer = module.CapturePhaseDiagnostics(write)
                    for _ in range(count):
                        observer.phase("workspace_rejected_other_state")
                    observer.workspace_rejection(b" M " + PRIVATE.encode() + b"\0", True)
                    observer.workspace_rejection(b"", False)
                    observer.failure()
                    observer.workspace_rejection(b"", False)
                    observer.failure()
                    self.assertLessEqual(len(lines), 32)
                    self.assertEqual(sum(line.startswith("package_capture_workspace=") for line in lines),
                                     int(count < 31))
                    phase = "workspace_rejected_other_state" if count else "arguments"
                    self.assertEqual(lines[-1], "package_capture_failure_phase=" + phase + "\n")
                    self.assertNotIn(PRIVATE, "".join(lines))
        lines = []
        def reenter(line):
            lines.append(line)
            observer.workspace_rejection(b"", False)
            if line.startswith("package_capture_workspace="):
                for _ in range(1000):
                    observer.phase("catalog")
        observer = module.CapturePhaseDiagnostics(reenter)
        observer.phase("workspace_rejected_other_state")
        observer.workspace_rejection(b"", True)
        observer.failure()
        self.assertEqual(len(lines), 4)
        self.assertEqual(sum(line.startswith("package_capture_workspace=") for line in lines), 1)
        self.assertEqual(lines[-1], "package_capture_failure_phase=workspace_rejected_other_state\n")

    def test_reentrant_callbacks_cannot_consume_terminal_state_or_block_sequential_phases(self):
        for throws in (False, True):
            with self.subTest(throws=throws):
                lines = []
                def write(line):
                    lines.append(line)
                    observer.phase("catalog")
                    observer.workspace_rejection(b" M " + PRIVATE.encode() + b"\0", False)
                    observer.failure()
                    if throws:
                        raise OSError(PRIVATE)
                observer = module.CapturePhaseDiagnostics(write)
                observer.phase("workspace_rejected_other_state")
                self.assertEqual(lines, ["package_capture_phase=workspace_rejected_other_state\n"])
                # A nested callback must not consume the workspace one-shot.
                observer.workspace_rejection(b"", True)
                self.assertEqual(len(lines), 2 if throws else 3)
                self.assertTrue(lines[1].startswith("package_capture_workspace=job:match;"))
                # The guard resets after successful and failed writes alike.
                observer.phase("output_published")
                self.assertEqual(lines[-1], "package_capture_phase=output_published\n")
                for _ in range(1000):
                    observer.phase("ready_marker")
                self.assertEqual(len(lines), 31)
                self.assertFalse(any(line.startswith("package_capture_failure_phase=") for line in lines))
                observer.failure()
                observer.failure()
                observer.phase("complete")
                self.assertEqual(len(lines), 32)
                self.assertEqual(lines[-1], "package_capture_failure_phase=ready_marker\n")
                self.assertEqual(sum(line.startswith("package_capture_workspace=") for line in lines), 1)
                self.assertNotIn("package_capture_phase=catalog\n", lines)
                self.assertNotIn(PRIVATE, "".join(lines))


    def test_membership_is_additive_after_original_rejected_workspace_summary(self):
        self.status = (b" M apps/mobile/ios/Runner.xcodeproj/project.pbxproj\0 M "
                       + PRIVATE.encode() + b"\0")
        with self.assertRaisesRegex(ValueError, "^capture boundary rejected$"):
            self.main()
        lines = self.log.getvalue().splitlines()
        original = ("package_capture_workspace=job:match;shape:simple;lock_index:absent;"
                    "lock_worktree:absent;debug_index:absent;debug_worktree:absent;other:present")
        membership = ("package_capture_workspace_membership=v1;c01:absent;c02:absent;"
                      "c03:absent;c04:present;c05:absent;c06:absent;c07:absent;c08:absent;"
                      "c09:absent;c10:absent;c11:absent;other:present")
        self.assertIn(original, lines)
        self.assertIn(membership, lines)
        self.assertLess(lines.index(original), lines.index(membership))
        self.assertEqual(self.git_calls, [("rev-parse", "HEAD"),
                                         ("status", "--porcelain", "-z", "--untracked-files=no")])
        self.assertEqual(self.outputs, [])
        self.assertEqual(self.ready_calls, [])
        self.assert_failure_phase("workspace_rejected_other_state")


    def test_membership_classifier_failures_preserve_original_rejection_and_trace(self):
        class Hostile:
            def __str__(self):
                raise AssertionError("unexpected coercion")
            def __hash__(self):
                raise AssertionError("unexpected hashing")
        class TextSubclass(str):
            pass
        valid = ("absent",) * 12
        malformed = (None, [], Hostile(), valid[:-1], (*valid[:-1], PRIVATE),
                     (Hostile(), *valid[1:]), (TextSubclass("absent"), *valid[1:]))
        for result in malformed:
            with self.subTest(result_type=type(result).__name__):
                self.reset_observations()
                self.status = b" M " + PRIVATE.encode() + b"\0"
                with patch.object(module, "classify_workspace_membership", return_value=result):
                    with self.assertRaisesRegex(ValueError, "^capture boundary rejected$"):
                        self.main()
                lines = self.log.getvalue().splitlines()
                self.assertEqual(sum(line.startswith("package_capture_workspace=") for line in lines), 1)
                self.assertFalse(any(line.startswith("package_capture_workspace_membership=") for line in lines))
                self.assertEqual(self.git_calls, [("rev-parse", "HEAD"),
                                                 ("status", "--porcelain", "-z", "--untracked-files=no")])
                self.assertEqual(self.outputs, [])
                self.assertEqual(self.ready_calls, [])
                self.assert_failure_phase("workspace_rejected_other_state")
        self.reset_observations()
        self.status = b" M " + PRIVATE.encode() + b"\0"
        with patch.object(module, "classify_workspace_membership", side_effect=RuntimeError(PRIVATE)):
            with self.assertRaisesRegex(ValueError, "^capture boundary rejected$"):
                self.main()
        self.assertIn("package_capture_workspace=", self.log.getvalue())
        self.assertNotIn("package_capture_workspace_membership=", self.log.getvalue())
        self.assert_failure_phase("workspace_rejected_other_state")

    def test_membership_cap_reentry_and_write_failures_keep_original_and_terminal_priority(self):
        for count in (0, 29, 30, 31, 1000):
            for failed_prefix in (None, "package_capture_workspace=", "package_capture_workspace_membership="):
                with self.subTest(count=count, failed_prefix=failed_prefix):
                    lines = []
                    def write(line):
                        lines.append(line)
                        observer.phase("catalog")
                        observer.workspace_rejection(b"", False)
                        observer.failure()
                        if failed_prefix and line.startswith(failed_prefix):
                            raise OSError(PRIVATE)
                    observer = module.CapturePhaseDiagnostics(write)
                    for _ in range(count):
                        observer.phase("workspace_rejected_other_state")
                    observer.workspace_rejection(b" M " + PRIVATE.encode() + b"\0", True)
                    observer.workspace_rejection(b"", False)
                    observer.failure()
                    observer.workspace_rejection(b"", False)
                    observer.failure()
                    self.assertLessEqual(len(lines), 32)
                    self.assertEqual(observer._attempts, len(lines))
                    self.assertEqual(sum(line.startswith("package_capture_workspace=") for line in lines),
                                     int(count < 31))
                    self.assertEqual(sum(line.startswith("package_capture_workspace_membership=") for line in lines),
                                     int(count < 30 and failed_prefix != "package_capture_workspace="))
                    phase = "workspace_rejected_other_state" if count else "arguments"
                    self.assertEqual(lines[-1], "package_capture_failure_phase=" + phase + "\n")
                    self.assertNotIn("package_capture_phase=catalog\n", lines)
                    self.assertNotIn(PRIVATE, "".join(lines))

    def test_membership_work_follows_successful_legacy_write_and_available_budget(self):
        for count, fails in ((0, False), (0, True), (30, False), (31, False)):
            with self.subTest(count=count, fails=fails):
                lines = []
                with patch.object(module, "classify_workspace_membership",
                                  return_value=("absent",) * 12) as classify:
                    def write(line):
                        if line.startswith("package_capture_workspace="):
                            classify.assert_not_called()
                            if fails:
                                raise OSError(PRIVATE)
                        lines.append(line)
                    observer = module.CapturePhaseDiagnostics(write)
                    for _ in range(count):
                        observer.phase("workspace_rejected_other_state")
                    observer.workspace_rejection(b"", True)
                    self.assertEqual(classify.call_count, int(count < 30 and not fails))
                    observer.failure()
                    self.assertLessEqual(observer._attempts, 32)

    def test_shell_wiring_is_literal_capped_and_samples_exit_status_before_observation(self):
        source = (ROOT / "tools/ocr-models/run-ios-native-acceptance.sh").read_text()
        body = source.split("observe_ios_phase() {", 1)[1].split("\nread_simulator_environment()", 1)[0]
        self.assertIn('if test "$ios_phase_observations" -ge 32; then return 0; fi', body)
        self.assertIn("*) return 0 ;;", body)
        self.assertIn("( printf 'ios_capture_phase=%s\\n' \"$observed_phase\" >&2 ) || :", body)
        self.assertRegex(source, r"report_failure_phase\(\) \{\n  status=\$\?\n  observe_ios_phase cleanup_enter")
        calls = re.findall(r"\bobserve_ios_phase ([^;\n]+)", source)
        self.assertTrue(calls)
        for token in calls:
            self.assertRegex(token.strip(), r"^[a-z_]+$")
            self.assertIn(token.strip(), body)
        for operation in ("debug_restore", "project_restore", "simulator_unset_isolation",
                          "simulator_unset_constructor", "simulator_read_isolation", "simulator_read_constructor"):
            self.assertLess(source.index("observe_ios_phase " + operation + "_enter"),
                            source.index("observe_ios_phase " + operation + "_return"))
        self.assertIn('--device="$device" || status=$?\nobserve_ios_phase flutter_capture_return', source)
        self.assertIn('echo "failure_phase=" >> "$GITHUB_OUTPUT"\nobserve_ios_phase acceptance_outputs_written', source)

    def test_process_wrapper_wiring_is_ios_only_without_importing_or_executing_it(self):
        source = (ROOT / "tools/ocr-models/bounded-process-capture.mjs").read_text()
        self.assertIn("runBoundedProcess(options, diagnosticWriter)", source)
        self.assertIn("createCapturePhaseDiagnostics(diagnosticWriter)", source)
        self.assertIn('platform === "ios" ? (line) => { writeSync(2, line); } : undefined', source)
        self.assertIn('const allowedOptions = new Set(["stdout", "stderr", "max-bytes", "platform", "device"]);', source)
        self.assertIn('"--timeout",\n      "6h",', source)
        self.assertIn('child.once("close", (code, signal) => resolve({ code, signal, wrapperError: false }));', source)
        self.assertIn("await Promise.all([stdoutDone, stderrDone]);", source)
        self.assertIn("if (overflow) return 97;", source)
        self.assertIn("if (interrupted) return 98;", source)
        self.assertIn("return outcome.code;", source)
        observer = (ROOT / "tools/ocr-models/capture-phase-diagnostics.mjs").read_text()
        self.assertNotRegex(observer, r"(?m)^\s*import\b")

    def test_helper_operational_entry_point_remains_definition_only_on_import(self):
        tree = ast.parse(HELPER.read_text())
        # No top-level main() call outside the existing __main__ guard.
        for statement in tree.body:
            if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
                self.assertNotEqual(getattr(statement.value.func, "id", None), "main")
        self.popen.assert_not_called()
        self.run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
