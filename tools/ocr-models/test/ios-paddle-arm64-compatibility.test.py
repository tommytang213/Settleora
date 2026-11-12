#!/usr/bin/env python3
"""Offline synthetic tests; no SDK, service, native process, or receipt input."""
import hashlib
import ast
import importlib.util
import io
import json
import os
import re
from pathlib import Path
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.dont_write_bytecode = True
MODULE = Path(__file__).resolve().parents[1] / "ios-paddle-arm64-compatibility.py"
spec = importlib.util.spec_from_file_location("arm64_compatibility", MODULE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def thin(platform=7, cpu=0x0100000c):
    header = struct.pack("<IIIIIIII", 0xfeedfacf, cpu, 0, 1, 1, 24, 0, 0)
    return header + struct.pack("<IIIIII", 0x32, 24, platform, 0, 0, 0)


def ar(payload):
    name = b"object.o/".ljust(16)
    header = name + b"0".ljust(12) + b"0".ljust(6) + b"0".ljust(6)
    header += b"100644".ljust(8) + str(len(payload)).encode().ljust(10) + b"\x60\n"
    return b"!<arch>\n" + header + payload + (b"\n" if len(payload) % 2 else b"")


def context():
    return {"GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REPOSITORY": "tommytang213/Settleora",
            "GITHUB_JOB": "ios-paddle-arm64-compatibility", "GITHUB_RUN_ATTEMPT": "1",
            "SETTLEORA_ARM64_MODE": m.MODE, "EXPECTED_HEAD": "a" * 40,
            "GITHUB_SHA": "a" * 40, "CAPTURE_WORKFLOW_SHA": "a" * 40}


class Response(io.BytesIO):
    def __init__(self, raw, url, declared=None):
        super().__init__(raw)
        self.url = url
        self.headers = {} if declared is None else {"Content-Length": str(declared)}

    def geturl(self):
        return self.url


def transfer_worker(stage, marker, startup_delay=0):
    """Run the actual transfer helper with only its network transport synthetic."""
    return """
import importlib.util,io,json,os,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location("synthetic_transfer",sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
item=json.loads(sys.argv[2])
stage=STAGE
marker=Path(MARKER)
time.sleep(STARTUP_DELAY)
class Response(io.BytesIO):
    headers={}
    def geturl(self):return item["url"]
    def read(self,size=-1):
        if stage=="body":
            marker.write_text(str(os.getpid()))
            time.sleep(60)
        return super().read(size)
def request(*args,**kwargs):
    marker.write_text(str(os.getpid()))
    if stage=="connection":time.sleep(60)
    return Response(b"x")
m.urllib.request.urlopen=request
m._download_transfer(item,Path(sys.argv[3]))
""".replace("STAGE", repr(stage)).replace("MARKER", repr(str(marker))).replace("STARTUP_DELAY", repr(startup_delay))


class CompatibilityTests(unittest.TestCase):
    def test_absolute_download_deadline_interrupts_blocked_connection_and_body(self):
        item = {"bytes": 1, "sha256": hashlib.sha256(b"x").hexdigest(),
                "url": "https://download.onnxruntime.ai/synthetic.zip"}
        for stage in ("connection", "body"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                marker = root / "transport-pid"
                class BlockedResponse(Response):
                    def read(self, size=-1):
                        if stage == "body":
                            marker.write_text(str(os.getpid()))
                            m.time.sleep(15)
                        return super().read(size)
                def blocked_request(*args, **kwargs):
                    marker.write_text(str(os.getpid()))
                    if stage == "connection":
                        m.time.sleep(15)
                    return BlockedResponse(b"x", item["url"])
                with patch.object(m, "DOWNLOAD_WORKER", transfer_worker(stage, marker, startup_delay=1.0), create=True), \
                        patch.object(m.urllib.request, "urlopen", side_effect=blocked_request):
                    started = m.time.monotonic()
                    with self.assertRaises((ValueError, subprocess.TimeoutExpired)):
                        m.download(item, root / "source.zip", deadline=m.time.time() + 5)
                    elapsed = m.time.monotonic() - started
                self.assertLess(elapsed, 8, "blocked transport exceeded the absolute work deadline")
                pid = int(marker.read_text())
                self.assertNotEqual(pid, os.getpid())
                with self.assertRaises(ProcessLookupError):
                    os.kill(pid, 0)

    def test_bounded_worker_preserves_verified_download_and_makes_one_request(self):
        item = {"bytes": 1, "sha256": hashlib.sha256(b"x").hexdigest(),
                "url": "https://download.onnxruntime.ai/synthetic.zip"}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / "transport-pid"
            target = root / "source.zip"
            with patch.object(m, "DOWNLOAD_WORKER", transfer_worker("success", marker, startup_delay=1.0)):
                m.download(item, target, deadline=m.time.time() + 5)
            self.assertEqual(target.read_bytes(), b"x")
            self.assertEqual(target.stat().st_mode & 0o777, 0o400)
            pid = int(marker.read_text())
            self.assertNotEqual(pid, os.getpid())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_blocked_download_returns_control_to_main_final_failure_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            head = "a" * 40
            clock = root / "ios-paddle-arm64-job-start.json"
            clock.write_text(json.dumps({"head": head, "startedAt": int(m.time.time())}))
            clock.chmod(0o600)
            marker = root / "transport-pid"
            output = io.StringIO()
            manifest = json.loads(MODULE.with_name("ios-paddle-arm64-dependencies.json").read_bytes())
            flutter = dict(manifest["flutter"], dartSdkVersion="3.12.2")
            def execute(argv, cwd, build_root, deadline, label):
                if label == "toolchain":
                    (build_root / (label + ".log")).write_text("Xcode 16.4\nBuild version 16F6\n")
                return {"seconds": 0, "logSha256": "0" * 64, "exitCode": 0}
            def query(argv, **options):
                self.assertGreater(options["timeout"], 0)
                if argv == ["pod", "--version"]:
                    return "1.17.0"
                self.assertEqual(argv, ["flutter", "--version", "--machine"])
                return json.dumps(flutter)
            with patch.dict(os.environ, {"RUNNER_TEMP": str(root)}, clear=True), \
                    patch.object(m, "validate_context", return_value=head), \
                    patch.object(m.sys, "platform", "darwin"), \
                    patch.object(m, "MAX_WORK_SECONDS", 10), \
                    patch.object(m, "verify_source", return_value={}), \
                    patch.object(m, "git", return_value=b"b" * 40), \
                    patch.object(m, "execute", side_effect=execute), \
                    patch.object(m.subprocess, "check_output", side_effect=query), \
                    patch.object(m.sys, "stdout", output), \
                    patch.object(m, "DOWNLOAD_WORKER", transfer_worker("body", marker, startup_delay=1.0)), \
                    patch.object(m, "extract_archive") as extract:
                with self.assertRaises(subprocess.TimeoutExpired):
                    m.main()
                extract.assert_not_called()
            lines = output.getvalue().splitlines()
            self.assertEqual(len(lines), 1)
            self.assertTrue(lines[0].startswith("SETTLEORA_ARM64_COMPATIBILITY="))
            report = json.loads(lines[0].split("=", 1)[1])
            self.assertFalse(report["complete"])
            self.assertEqual(report["sourceHead"], head)
            self.assertEqual([report[name] for name in
                              ["providerCalls", "appLaunches", "simulatorBoots"]], [0, 0, 0])
            pid = int(marker.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_git_output_has_a_separate_finite_timeout(self):
        with patch.object(m.subprocess, "check_output", return_value=b"synthetic") as process:
            self.assertEqual(m.git(Path("/SYNTHETIC_UNUSED"), "rev-parse", "HEAD"), b"synthetic")
        timeout = process.call_args.kwargs.get("timeout")
        self.assertIsNotNone(timeout)
        self.assertGreater(timeout, 0)
        self.assertLessEqual(timeout, 30)

    def test_query_timeout_keeps_the_final_failure_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            head = "a" * 40
            clock = root / "ios-paddle-arm64-job-start.json"
            clock.write_text(json.dumps({"head": head, "startedAt": int(m.time.time())}))
            clock.chmod(0o600)
            output = io.StringIO()
            def execute(argv, cwd, build_root, deadline, label):
                self.assertEqual(argv, ["xcodebuild", "-version"])
                (build_root / (label + ".log")).write_text("Xcode 16.4\nBuild version 16F6\n")
                return {"seconds": 0, "logSha256": "0" * 64, "exitCode": 0}
            def timeout_query(argv, **options):
                self.assertEqual(argv, ["pod", "--version"])
                self.assertIsNotNone(options.get("timeout"))
                self.assertGreater(options["timeout"], 0)
                self.assertLessEqual(options["timeout"], m.MAX_WORK_SECONDS)
                raise subprocess.TimeoutExpired(argv, options["timeout"])
            with patch.dict(os.environ, {"RUNNER_TEMP": str(root)}, clear=True), \
                    patch.object(m, "validate_context", return_value=head), \
                    patch.object(m.sys, "platform", "darwin"), \
                    patch.object(m, "verify_source", return_value={}), \
                    patch.object(m, "git", return_value=b"b" * 40), \
                    patch.object(m, "execute", side_effect=execute), \
                    patch.object(m.subprocess, "check_output", side_effect=timeout_query), \
                    patch.object(m.sys, "stdout", output), \
                    patch.object(m, "download") as download:
                with self.assertRaises(subprocess.TimeoutExpired):
                    m.main()
                download.assert_not_called()
            lines = output.getvalue().splitlines()
            self.assertEqual(len(lines), 1)
            self.assertTrue(lines[0].startswith("SETTLEORA_ARM64_COMPATIBILITY="))
            report = json.loads(lines[0].split("=", 1)[1])
            self.assertFalse(report["complete"])
            self.assertEqual(report["sourceHead"], head)
            self.assertEqual([report[name] for name in ["providerCalls", "appLaunches", "simulatorBoots"]], [0, 0, 0])

    def test_remaining_work_time_is_recomputed_and_expiration_prevents_git_launch(self):
        with patch.object(m.time, "time", side_effect=[100, 104, 109, 110]):
            self.assertEqual([m.remaining_seconds(110) for _ in range(3)], [10, 6, 1])
            with self.assertRaises(ValueError):
                m.remaining_seconds(110)
        with patch.object(m.time, "time", return_value=110), \
                patch.object(m.subprocess, "check_output") as process:
            with self.assertRaises(ValueError):
                m.git(Path("/SYNTHETIC_UNUSED"), "rev-parse", "HEAD", deadline=110)
            process.assert_not_called()

    def test_every_direct_output_query_has_an_explicit_timeout(self):
        source = ast.parse(MODULE.read_text())
        calls = [node for node in ast.walk(source) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Attribute) and node.func.attr == "check_output"
                 and isinstance(node.func.value, ast.Name) and node.func.value.id == "subprocess"]
        self.assertTrue(calls)
        for call in calls:
            with self.subTest(line=call.lineno):
                self.assertIn("timeout", [option.arg for option in call.keywords])

    def test_context_binds_one_explicit_attempt_to_source_and_workflow(self):
        self.assertEqual(m.validate_context(context()), "a" * 40)
        for key, value in [("GITHUB_EVENT_NAME", "pull_request"),
                           ("GITHUB_JOB", "ios-ridge-phase-diagnostic"),
                           ("GITHUB_RUN_ATTEMPT", "2"), ("GITHUB_REPOSITORY", "other/repo"),
                           ("CAPTURE_WORKFLOW_SHA", "b" * 40), ("GITHUB_SHA", "b" * 40),
                           ("SETTLEORA_ARM64_MODE", "full101"), ("EXPECTED_HEAD", "")]:
            env = context()
            env[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.validate_context(env)

    def test_platform_check_accepts_real_arm64_simulator_load_command_shape(self):
        self.assertEqual(m.macho_platforms(thin()), [7])
        self.assertEqual(m.macho_platforms(ar(thin())), [7])

    def test_platform_check_rejects_arm64_device_even_when_cpu_matches(self):
        for raw in (thin(platform=2), ar(thin(platform=2)), thin(cpu=0x01000007)):
            with self.assertRaises(ValueError):
                m.macho_platforms(raw)

    def test_fat_slice_selection_checks_platform_after_selecting_arm64(self):
        raw = thin()
        fat = struct.pack(">II", 0xcafebabe, 1) + struct.pack(">IIIII", 0x0100000c, 0, 28, len(raw), 0)
        self.assertEqual(m.macho_platforms(fat + raw), [7])
        with self.assertRaises(ValueError):
            m.macho_platforms(fat + thin(platform=2))

    def test_malformed_binary_bounds_and_unknown_ar_members_fail_closed(self):
        for raw in (b"", thin()[:-1], ar(b"unrecognized object"), b"!<arch>\ninvalid"):
            with self.assertRaises((ValueError, struct.error)):
                m.macho_platforms(raw)


    def test_negative_ar_member_size_rejects_without_looping(self):
        header = (b"__.SYMDEF".ljust(16) + b"0".ljust(12) + b"0".ljust(6)
                  + b"0".ljust(6) + b"100644".ljust(8) + b"-60".ljust(10) + b"\x60\n")
        self.assertEqual(len(header), 60)
        program = """
import importlib.util,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location("bounded_ar_parser",sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
try:
 m.macho_platforms(sys.stdin.buffer.read())
except ValueError:
 sys.exit(0)
sys.exit(1)
"""
        result = subprocess.run([sys.executable, "-I", "-B", "-c", program, str(MODULE)],
                                input=b"!<arch>\n" + header, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=2,
                                env={"PATH": os.environ["PATH"]})
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_archive_rejects_traversal_links_and_duplicate_names_before_writes(self):
        cases = [
            [("../escape", 1, "file", "")],
            [("/absolute", 1, "file", "")],
            [("a", 1, "symlink", "../escape")],
            [("a", 1, "symlink", "/absolute")],
            [("a", 1, "unsupported", "")],
            [("a", 1, "file", ""), ("a", 1, "file", "")],
            [("a", 1, "symlink", "b"), ("a/child", 1, "file", "")],
            [("huge", m.MAX_EXTRACTED + 1, "file", "")],
        ]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                m.archive_plan(entries)

    def test_tar_traversal_does_not_create_destination_or_external_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "malformed.tar.gz"
            with tarfile.open(source, "w:gz") as archive:
                entry = tarfile.TarInfo("../outside")
                entry.size = 1
                archive.addfile(entry, io.BytesIO(b"x"))
            with self.assertRaises(ValueError):
                m.extract_archive(source, root / "destination")
            self.assertFalse((root / "destination").exists())
            self.assertFalse((root / "outside").exists())

    def test_zip_extraction_preserves_safe_framework_alias_without_following_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "framework.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("Framework/Versions/A/binary", b"synthetic")
                link = zipfile.ZipInfo("Framework/Versions/Current")
                link.create_system = 3
                link.external_attr = 0o120777 << 16
                archive.writestr(link, b"A")
            m.extract_archive(source, root / "out")
            alias = root / "out/Framework/Versions/Current"
            self.assertTrue(alias.is_symlink())
            self.assertEqual((alias / "binary").read_bytes(), b"synthetic")

    def test_download_checks_exact_pinned_bytes_and_hash_without_retry(self):
        raw, url = b"synthetic archive", "https://download.onnxruntime.ai/synthetic.zip"
        item = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "url": url}
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "source.zip"
            with patch.object(m.urllib.request, "urlopen", return_value=Response(raw, url)) as request:
                m._download_transfer(item, target)
            self.assertEqual(request.call_count, 1)
            self.assertEqual(target.read_bytes(), raw)
            self.assertEqual(target.stat().st_mode & 0o777, 0o400)

    def test_declared_oversize_and_redirect_reject_before_creating_destination(self):
        raw, url = b"x", "https://download.onnxruntime.ai/synthetic.zip"
        item = {"bytes": 1, "sha256": hashlib.sha256(raw).hexdigest(), "url": url}
        for response in [Response(raw, url, 2), Response(raw, "https://other.example/archive")]:
            with tempfile.TemporaryDirectory() as temporary:
                target = Path(temporary) / "source.zip"
                with patch.object(m.urllib.request, "urlopen", return_value=response):
                    with self.assertRaises(ValueError):
                        m._download_transfer(item, target)
                self.assertFalse(target.exists())

    def test_download_mismatch_never_becomes_verified_source(self):
        raw, url = b"x", "https://download.onnxruntime.ai/synthetic.zip"
        item = {"bytes": 1, "sha256": "0" * 64, "url": url}
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(m.urllib.request, "urlopen", return_value=Response(raw, url)):
                with self.assertRaises(ValueError):
                    m._download_transfer(item, Path(temporary) / "source.zip")

    def test_expired_download_deadline_makes_no_request(self):
        with patch.object(m.urllib.request, "urlopen") as request:
            with self.assertRaises(ValueError):
                m.download({"bytes": 1, "sha256": "a" * 64,
                            "url": "https://download.onnxruntime.ai/synthetic.zip"},
                           Path("/SYNTHETIC_NO_WRITE"), deadline=1)
            request.assert_not_called()

    def test_source_identity_ignores_inherited_repository_overrides_and_rejects_dirty_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary).resolve()
            env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
            def git(*args):
                return subprocess.check_output(
                    ["git", "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid",
                     "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
                     "-C", str(repo), *args], env=env, stderr=subprocess.DEVNULL)
            git("init", "-q")
            (repo / "source.swift").write_bytes(b"synthetic source")
            git("add", "source.swift")
            git("commit", "-qm", "synthetic")
            head = git("rev-parse", "HEAD").decode().strip()
            overrides = MODULE.with_name("git-repository-overrides.txt").read_text("ascii").splitlines()
            inherited = {name: "/SYNTHETIC_UNRELATED_REPOSITORY_STATE" for name in overrides}
            inherited["GIT_NO_REPLACE_OBJECTS"] = "0"
            with patch.dict(os.environ, inherited):
                self.assertEqual(m.verify_source(repo, head),
                                 {"source.swift": hashlib.sha256(b"synthetic source").hexdigest()})
                (repo / "source.swift").write_bytes(b"changed")
                with self.assertRaises(ValueError):
                    m.verify_source(repo, head)


    def test_tracked_symlink_identity_is_supported_without_accepting_type_or_external_substitution(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            repo = base / "source"
            repo.mkdir()
            env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
            def git(*args):
                return subprocess.check_output(
                    ["git", "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid",
                     "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
                     "-C", str(repo), *args], env=env, stderr=subprocess.DEVNULL)
            git("init", "-q")
            (repo / "source.swift").write_bytes(b"owned immutable source")
            link = repo / "linked.swift"
            link.symlink_to("source.swift")
            git("add", "--all"); git("commit", "-qm", "tracked source and symlink")
            head = git("rev-parse", "HEAD").decode().strip()
            expected = m.verify_source(repo, head)
            self.assertEqual(expected["linked.swift"], hashlib.sha256(b"source.swift").hexdigest())
            git("update-index", "--assume-unchanged", "linked.swift")
            link.unlink()
            link.write_bytes(b"source.swift")
            self.assertEqual(git("status", "--porcelain"), b"")
            with self.assertRaises(ValueError):
                m.verify_source(repo, head)
            link.unlink(); link.symlink_to("source.swift")
            git("update-index", "--no-assume-unchanged", "linked.swift")
            external = base / "external.swift"
            external.write_bytes(b"mutable outside source")
            link.unlink(); link.symlink_to("../external.swift")
            git("add", "linked.swift"); git("commit", "-qm", "external link is unsupported")
            head = git("rev-parse", "HEAD").decode().strip()
            with self.assertRaises(ValueError):
                m.verify_source(repo, head)

    def test_unapproved_cli_never_uses_sdk_or_leaks_context(self):
        result = subprocess.run([sys.executable, "-I", "-B", str(MODULE)],
                                env={"PATH": os.environ["PATH"], "EXPECTED_HEAD": "SYNTHETIC_PRIVATE"},
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        self.assertEqual(result.returncode, 98)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(result.stderr, b"paddle_arm64_compatibility_failed\n")

    def test_source_manifest_keeps_exact_existing_ort_and_yams(self):
        manifest = json.loads(MODULE.with_name("ios-paddle-arm64-dependencies.json").read_bytes())
        self.assertEqual(manifest["archives"]["ort-c"]["version"], "1.24.3")
        self.assertEqual(manifest["archives"]["ort-objc"]["version"], "1.24.3")
        self.assertEqual(manifest["archives"]["yams"]["version"], "5.0.6")
        self.assertLessEqual(sum(x["bytes"] for x in manifest["archives"].values()), 160 * 1024 * 1024)
        self.assertEqual(set(manifest["podspecs"]), {"onnxruntime-c", "onnxruntime-objc"})

    def test_app_and_test_bundle_disable_debug_dylib_so_symbol_scan_covers_real_code(self):
        common = m.RUBY_PROJECT.split('[app, tests].each do |target|', 1)[1].split(
            "app.frameworks_build_phase", 1)[0]
        self.assertIn("config.build_settings['ENABLE_DEBUG_DYLIB'] = 'NO'", common)

    def test_compile_mode_excludes_both_legacy_native_acceptance_jobs(self):
        workflow = (MODULE.parents[2] / ".github/workflows/mobile-ocr-native-acceptance.yml").read_text()
        expected = ("if: ${{ github.event_name == 'pull_request' || "
                    "(github.event_name == 'workflow_dispatch' && inputs.mode == 'full101') }}")
        jobs = re.split(r"(?m)^  ([A-Za-z_][A-Za-z0-9_-]*):[ \t]*$", workflow.split("\njobs:\n", 1)[1])
        self.assertEqual(set(jobs[1::2]), {
            'android-native-acceptance', 'ios-native-acceptance', 'ios-paddle-arm64-compatibility'})
        by_name = dict(zip(jobs[1::2], jobs[2::2]))
        for name in ('android-native-acceptance', 'ios-native-acceptance'):
            self.assertIn(expected, by_name[name])
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.mode == 'paddle_arm64_compile_v1'",
                      by_name['ios-paddle-arm64-compatibility'])

    def test_compile_checkout_does_not_retain_credentials(self):
        workflow = (MODULE.parents[2] / ".github/workflows/mobile-ocr-native-acceptance.yml").read_text()
        for name in ["Checkout the exact compatibility candidate"]:
            with self.subTest(name=name):
                marker = "      - name: " + name + "\n"
                self.assertEqual(workflow.count(marker), 1)
                checkout = workflow.split(marker, 1)[1].split("\n      - name:", 1)[0]
                self.assertIn("uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10", checkout)
                self.assertIn("          persist-credentials: false\n", checkout)
                self.assertIn("          fetch-depth: 0\n", checkout)

    def test_workflow_is_explicit_one_attempt_compile_only_without_paid_storage(self):
        workflow = (MODULE.parents[2] / ".github/workflows/mobile-ocr-native-acceptance.yml").read_text()
        tail = workflow.split("\n  ios-paddle-arm64-compatibility:\n", 1)[1]
        job = re.split(r"(?m)^  [A-Za-z_][A-Za-z0-9_-]*:[ \t]*(?:#[^\n]*)?$",
                       tail, maxsplit=1)[0]
        # A following job must neither satisfy nor invalidate this job's checks.
        extended = tail.rstrip("\n") + "\n  later_job:\n    run: simctl full101 actions/upload-artifact\n"
        self.assertEqual(re.split(r"(?m)^  [A-Za-z_][A-Za-z0-9_-]*:[ \t]*(?:#[^\n]*)?$",
                                  extended, maxsplit=1)[0].rstrip(), job.rstrip())
        self.assertIn("inputs.mode == 'paddle_arm64_compile_v1'", job)
        self.assertIn("runs-on: macos-15", job)
        self.assertIn("timeout-minutes: 35", job)
        self.assertIn("GITHUB_RUN_ATTEMPT']=='1'", job)
        self.assertIn("cache: false", job)
        self.assertNotIn("uses: actions/upload-artifact", job)
        self.assertNotIn("simctl", job)
        self.assertNotIn("full101", job)


if __name__ == "__main__":
    unittest.main()
