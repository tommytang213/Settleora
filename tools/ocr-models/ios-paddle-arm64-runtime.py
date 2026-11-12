#!/usr/bin/env python3
"""Proposed one-app/two-call real native ARM64 Ridge measurement, never a 101 run."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import zipfile

MODE = "arm64_ridge_runtime_v1"
PROVEN_NATIVE_HEAD = "c39ee87cd42d7eadde7d40555183068012ea4984"
BUNDLE_ID = "com.settleora.compatibility.PaddleCompatibility"
DEVICE_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5"
IMAGE_SHA = "261b6f1831617873bad6da93cefe54c050e70d10ec283dfdc6af9286602e10ec"

def require(value):
    if not value: raise ValueError("arm64_runtime_rejected")

def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value

def context(env):
    require(env.get("GITHUB_ACTIONS") == "true" and
            env.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and
            env.get("GITHUB_REPOSITORY") == "tommytang213/Settleora" and
            env.get("GITHUB_JOB") == "ios-paddle-arm64-runtime" and
            env.get("GITHUB_RUN_ATTEMPT") == "1" and
            env.get("SETTLEORA_ARM64_MODE") == MODE)
    head = env.get("EXPECTED_HEAD", "")
    require(re.fullmatch("[0-9a-f]{40}", head) and
            head == env.get("GITHUB_SHA") == env.get("CAPTURE_WORKFLOW_SHA") ==
            env.get("DIAGNOSTIC_SOURCE_HEAD") == env.get("DIAGNOSTIC_WORKFLOW_SHA"))
    tree, fingerprint = env.get("DIAGNOSTIC_SOURCE_TREE", ""), env.get("DIAGNOSTIC_SOURCE_FINGERPRINT", "")
    require(re.fullmatch("[0-9a-f]{40}", tree) and re.fullmatch("[0-9a-f]{64}", fingerprint))
    run_id = env.get("GITHUB_RUN_ID", "")
    require(re.fullmatch("[1-9][0-9]{0,23}", run_id))
    return dict(sourceHead=head, sourceTree=tree, sourceFingerprint=fingerprint,
                runId=run_id, runAttempt="1")

def read_owned(path, maximum, modes=(0o600, 0o400)):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and
                before.st_nlink == 1 and stat.S_IMODE(before.st_mode) in modes and
                0 < before.st_size <= maximum)
        with os.fdopen(fd, "rb", closefd=False) as source: data = source.read(maximum + 1)
        after = os.fstat(fd)
        require(len(data) == before.st_size and
                (before.st_ino, before.st_dev, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_ino, after.st_dev, after.st_size, after.st_mtime_ns, after.st_ctime_ns))
        return data
    finally: os.close(fd)

def exclusive(path, data, maximum):
    require(type(data) is bytes and 0 < len(data) <= maximum)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as output:
            output.write(data); output.flush(); os.fsync(fd)
    finally: os.close(fd)

def json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            require(key not in value); value[key] = item
        return value
    def bad_constant(_): raise ValueError("arm64_runtime_rejected")
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=bad_constant)

def ready(documents, phase, deadline, pid):
    name = "first-ready.json" if phase == "first" else "warm-ready.json"
    while time.time() < deadline:
        failed = documents / "failure.json"
        if failed.exists() and stat.S_IMODE(failed.lstat().st_mode) == 0o400:
            value = strict_json(read_owned(failed, 4096, (0o400,)))
            require(set(value) == {"schemaVersion", "purpose", "stage", "providerCalls", "failureCode", "failureStage"} and
                    type(value["schemaVersion"]) is int and value["schemaVersion"] == 1 and
                    value["purpose"] == MODE and value["stage"] == "failed" and
                    type(value["providerCalls"]) is int and value["providerCalls"] in (0, 1, 2) and
                    value["failureCode"] == "native_runtime_failed" and value["failureStage"] in
                    ("preparation", "engine_initialization", "first_recognition", "first_capture",
                     "warm_admission", "warm_recognition", "warm_capture"))
            return None, value
        path = documents / name
        if path.exists() and stat.S_IMODE(path.lstat().st_mode) == 0o400:
            value = strict_json(read_owned(path, 4096, (0o400,)))
            require(set(value) == {"schemaVersion", "purpose", "stage", "providerCalls",
                    "bytes", "sha256", "wallTimeMs", "blockCount"} and
                    type(value["schemaVersion"]) is int and value["schemaVersion"] == 1 and
                    value["purpose"] == MODE and value["stage"] == phase + "_ready" and
                    type(value["providerCalls"]) is int and value["providerCalls"] == (1 if phase == "first" else 2) and
                    type(value["wallTimeMs"]) is int and 0 <= value["wallTimeMs"] <=
                    (10 if phase == "first" else 5) * 60 * 1000 + 2000 and
                    type(value["blockCount"]) is int and 0 <= value["blockCount"] <= 256 and
                    type(value["bytes"]) is int and 0 < value["bytes"] <=
                    (128 * 1024 if phase == "first" else 64 * 1024) and
                    re.fullmatch("[0-9a-f]{64}", value["sha256"]))
            return value, None
        try: os.kill(pid, 0)
        except ProcessLookupError: return None, {"failureCode": "owned_app_exited"}
        time.sleep(.2)
    return None, {"failureCode": "native_call_deadline"}

def model_rows(repo, tracked):
    prefix = "apps/mobile/assets/receipt_ocr_models/"
    rows = []
    for relative in sorted(tracked):
        if relative.startswith(prefix):
            file = repo / relative
            data = file.read_bytes()
            require(hashlib.sha256(data).hexdigest() == tracked[relative])
            rows.append({"path": "receipt_ocr_models/" + relative[len(prefix):],
                         "bytes": len(data), "sha256": tracked[relative]})
    require(0 < len(rows) <= 128)
    return rows

def retain_capture(documents, private, phase, receipt, identity, model_ids, verifier):
    maximum = 128 * 1024 if phase == "first" else 64 * 1024
    raw = read_owned(documents / (phase + ".json"), maximum, (0o400,))
    require(len(raw) == receipt["bytes"] and hashlib.sha256(raw).hexdigest() == receipt["sha256"])
    value = verifier.validate_capture(raw, identity, phase, model_ids)
    exclusive(private / (phase + ".json"), raw, maximum)
    return value

def build_private_bundle(private, identity, captures, calls_admitted, warm_status,
                         model_ids, model_hash, capture_start, verifier):
    receipts = {phase: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                for phase, data in captures.items()}
    manifest = dict(schemaVersion=1, purpose=MODE, **identity,
        fixtureId="existing_13_ridge_restaurant_en_US", inputSha256=IMAGE_SHA, inputBytes=263039,
        sourceImageSha256=verifier.SOURCE_SHA, modelManifestSha256=model_hash, modelPackIds=model_ids,
        providerCalls=calls_admitted, completedCalls=len(captures), warmStatus=warm_status,
        captureWindowStartedAtMs=capture_start["startedAt"],
        requestedExpiresAtMs=capture_start["expiresAt"], captures=receipts)
    members = {"manifest.json": json_bytes(manifest), **{phase + ".json": data for phase, data in captures.items()}}
    import io
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, data in members.items():
            info = zipfile.ZipInfo(name); info.compress_type = zipfile.ZIP_STORED
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            archive.writestr(info, data)
    raw = output.getvalue()
    verifier.validate_zip(raw, identity)
    exclusive(private / "bundle.zip", raw, 256 * 1024)
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

def input_project(repo, root, tracked):
    project = root / "input-project"; project.mkdir(mode=0o700)
    # A fresh private copy avoids plugin/localization generation in the frozen checkout.
    for relative in tracked:
        prefix = "apps/mobile/"
        if relative in (prefix + "pubspec.yaml", prefix + "pubspec.lock", prefix + "l10n.yaml") or relative.startswith(prefix + "lib/"):
            target = project / relative[len(prefix):]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((repo / relative).read_bytes())
    return project


def bootstrap():
    env = os.environ
    require(env.get("GITHUB_ACTIONS") == "true" and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and
            env.get("GITHUB_REPOSITORY") == "tommytang213/Settleora" and
            env.get("GITHUB_JOB") == "ios-paddle-arm64-runtime" and env.get("GITHUB_RUN_ATTEMPT") == "1" and
            env.get("SETTLEORA_ARM64_MODE") == MODE)
    head = env.get("EXPECTED_HEAD", "")
    require(re.fullmatch("[0-9a-f]{40}", head) and head == env.get("GITHUB_SHA") == env.get("CAPTURE_WORKFLOW_SHA"))
    repo = Path(__file__).resolve().parents[2]
    base = load_module(repo / "tools/ocr-models/ios-paddle-arm64-compatibility.py", "arm_build_bootstrap")
    end = time.time() + 60
    require(Path(base.git(repo, "rev-parse", "--show-toplevel", deadline=end).decode().strip()).resolve() == repo)
    base.verify_source(repo, head, deadline=end)
    tree = base.git(repo, "rev-parse", "HEAD^{tree}", deadline=end).decode().strip()
    fingerprint = subprocess.check_output(["node", "--input-type=module", "-e",
        "import { reviewedSourceTreeFingerprint } from './tools/ocr-models/verify-mobile-package.mjs'; process.stdout.write(reviewedSourceTreeFingerprint(process.cwd(),process.argv[1]));",
        head], cwd=repo, env=base.git_environment(), timeout=base.remaining_seconds(end)).decode()
    require(re.fullmatch("[0-9a-f]{40}", tree) and re.fullmatch("[0-9a-f]{64}", fingerprint))
    subprocess.check_output(["node", "--input-type=module", "-e",
        "import { recipientPublicKey } from './tools/ocr-models/ios-paddle-arm64-runtime-seal.mjs'; recipientPublicKey(process.env.ARM64_RUNTIME_RECIPIENT_KEY);"],
        cwd=repo, env=base.git_environment(), timeout=base.remaining_seconds(end))
    with open(env["GITHUB_ENV"], "a") as output:
        output.write("DIAGNOSTIC_SOURCE_HEAD=" + head + "\nDIAGNOSTIC_SOURCE_TREE=" + tree +
                     "\nDIAGNOSTIC_SOURCE_FINGERPRINT=" + fingerprint +
                     "\nDIAGNOSTIC_WORKFLOW_SHA=" + head + "\n")
    print("arm64_runtime_source_bound", flush=True)

def main():
    env = os.environ
    identity = context(env)
    require(sys.platform == "darwin" and os.uname().machine == "arm64")
    repo = Path(__file__).resolve().parents[2]
    base = load_module(repo / "tools/ocr-models/ios-paddle-arm64-compatibility.py", "arm_build")
    verifier = load_module(repo / "tools/ocr-models/ios-paddle-arm64-runtime-bundle.py", "arm_capture")
    clock_path = Path(env["RUNNER_TEMP"]) / "ios-paddle-arm64-job-start.json"
    clock = strict_json(read_owned(clock_path, 4096, (0o600,)))
    require(set(clock) == {"head", "startedAt"} and clock["head"] == identity["sourceHead"] and
            type(clock["startedAt"]) is int and 0 <= time.time() - clock["startedAt"] < 30 * 60)
    deadline = clock["startedAt"] + 30 * 60
    root = Path(env["RUNNER_TEMP"]) / "ios-paddle-arm64-runtime-v1"
    require(not root.exists() and not root.is_symlink())
    root.mkdir(mode=0o700)
    private = Path(env["RUNNER_TEMP"]) / ("settleora-arm64-ridge-private-" + identity["runId"] + "-1")
    require(private.resolve() == private and private.is_dir() and
            private.stat().st_uid == os.getuid() and stat.S_IMODE(private.stat().st_mode) == 0o700)
    slot = strict_json(read_owned(private / "slot.json", 16 * 1024, (0o600,)))
    for local, remote in [("sourceHead", "head"), ("sourceTree", "tree"), ("sourceFingerprint", "fingerprint"),
                          ("runId", "runId"), ("runAttempt", "runAttempt")]:
        require(slot["identity"][remote] == identity[local])
    require(slot["purpose"] == MODE and slot["expiresAt"] == slot["preparedAt"] + 24 * 60 * 60 * 1000)
    # Upload credentials remain in the Node action's private descriptor, never a report.
    slot.pop("uploadUrl", None)
    recipient = strict_json(read_owned(private / "recipient.json", 4096, (0o600,)))
    import base64
    key_bytes = base64.b64decode(env.get("ARM64_RUNTIME_RECIPIENT_KEY", ""), validate=True)
    require(len(key_bytes) == 44 and recipient["fingerprint"] == hashlib.sha256(key_bytes).hexdigest())
    require(recipient["context"] == dict(head=identity["sourceHead"], tree=identity["sourceTree"],
        fingerprint=identity["sourceFingerprint"], runId=identity["runId"], runAttempt="1", name=slot["name"]))
    files = base.verify_source(repo, identity["sourceHead"], deadline=deadline)
    require(base.git(repo, "rev-parse", "HEAD^{tree}", deadline=deadline).decode().strip() == identity["sourceTree"])
    unchanged = ["apps/mobile/ios/Runner/PaddleOCR", "apps/mobile/ios/Runner/SettleoraReceiptOcrPlugin.swift",
                 "apps/mobile/assets/receipt_ocr_models", "apps/mobile/lib/receipt_ocr_capture",
                 "apps/mobile/pubspec.yaml", "apps/mobile/pubspec.lock",
                 "apps/mobile/test/fixtures/receipt_ocr"]
    require(base.git(repo, "diff", "--exit-code", PROVEN_NATIVE_HEAD, identity["sourceHead"],
                     "--", *unchanged, deadline=deadline) == b"")
    manifest = json.loads((repo / "tools/ocr-models/ios-paddle-arm64-dependencies.json").read_bytes())
    report = dict(schemaVersion=1, purpose=MODE, **identity, complete=False, compileComplete=False,
        targetArchitecture="arm64", targetPlatform="iosSimulator", hostArchitecture="arm64",
        providerCallsAdmitted=0, completedCalls=0, appLaunches=0, simulatorBoots=0,
        shippingAcceptance=False, nativeEngineOnly=True, stages={},
        cacheState="uncontrolled; required integrity reads precede first engine initialization",
        memoryMetric="Darwin process-lifetime peak RSS in bytes, not per-call peak",
        originalX86Allowance="unchanged/unspent")
    owned_device = None
    captures = {}; warm_status = "not_admitted"
    def execute(argv, label):
        report["stages"][label] = base.execute(argv, root, root, deadline, label)
    def query(argv, maximum=20):
        return subprocess.check_output(argv, env=base.git_environment(), text=True,
                                       timeout=min(maximum, base.remaining_seconds(deadline)))
    try:
        target = base.build_target(repo, identity["sourceHead"], root, manifest, files, report, deadline,
            main_source=repo / "tools/ocr-models/ios-paddle-arm64-runtime-main.swift")
        report["compileComplete"] = True
        app = target / "DerivedData/Build/Products/Debug-iphonesimulator/PaddleCompatibility.app"
        require(app.is_dir())
        project = input_project(repo, root, files)
        original_lock = (project / "pubspec.lock").read_bytes()
        report["stages"]["input-pub"] = base.execute(["flutter", "pub", "get", "--enforce-lockfile"],
                                                     project, root, deadline, "input-pub")
        require((project / "pubspec.lock").read_bytes() == original_lock)
        normalized = root / "ridge-input.jpeg"
        execute(["dart", "--packages=" + str(project / ".dart_tool/package_config.json"),
                 str(repo / "tools/ocr-models/ios-paddle-arm64-runtime-input.dart"),
                 str(repo), str(normalized)], "input-normalization")
        image = read_owned(normalized, 263039, (0o600, 0o644))
        require(len(image) == 263039 and hashlib.sha256(image).hexdigest() == IMAGE_SHA)
        rows = model_rows(repo, files)
        model_data = json_bytes(rows); model_hash = hashlib.sha256(model_data).hexdigest()
        catalog = json.loads((repo / "apps/mobile/assets/receipt_ocr_models/catalog.json").read_bytes())
        model_ids = [row["modelPackId"] for row in catalog["packs"]]
        require(len(set(model_ids)) == len(model_ids) == 8)
        for row in rows:
            relative = row["path"]
            destination = app / relative; destination.parent.mkdir(parents=True, exist_ok=True)
            source = repo / "apps/mobile/assets" / relative
            data = source.read_bytes()
            require(len(data) == row["bytes"] and hashlib.sha256(data).hexdigest() == row["sha256"])
            exclusive(destination, data, 128 * 1024 * 1024)
        exclusive(app / "arm64-ridge-input.jpeg", image, 263039)
        exclusive(app / "arm64-model-binding.json", model_data, 32768)
        binding = dict(purpose=MODE, **identity, fixtureId="existing_13_ridge_restaurant_en_US",
            sourceImageSha256=verifier.SOURCE_SHA, inputSha256=IMAGE_SHA, inputBytes=263039,
            width=1086, height=1448, maximumCalls=2, modelManifestSha256=model_hash, modelPackIds=model_ids)
        exclusive(app / "arm64-runtime-binding.json", json_bytes(binding), 32768)
        sdk = Path(query(["which", "flutter"]).strip()).resolve().parents[1]
        flutter = base.simulator_framework(sdk / "bin/cache/artifacts/engine/ios/Flutter.xcframework")
        base.macho_platforms((flutter / "Flutter").read_bytes())
        require(app.resolve().is_relative_to(root.resolve()) and not app.is_symlink())
        frameworks = app / "Frameworks"
        if frameworks.exists(): require(frameworks.is_dir() and not frameworks.is_symlink())
        else: frameworks.mkdir()
        embedded = frameworks / "Flutter.framework"
        if embedded.exists():
            require(embedded.is_dir() and not embedded.is_symlink() and embedded.resolve().is_relative_to(app.resolve()))
            shutil.rmtree(embedded)  # Only this newly built owned product; replace with exact verified SDK input.
        shutil.copytree(flutter, embedded, symlinks=True)
        execute(["codesign", "--force", "--sign", "-", "--timestamp=none",
                 str(frameworks / "Flutter.framework")], "adhoc-flutter")
        execute(["codesign", "--force", "--sign", "-", "--timestamp=none", str(app)], "adhoc-app")
        base.macho_platforms((app / "PaddleCompatibility").read_bytes())
        report["runtimeSignedBinarySha256"] = hashlib.sha256((app / "PaddleCompatibility").read_bytes()).hexdigest()
        runtimes = json.loads(query(["xcrun", "simctl", "list", "runtimes", "--json"]))
        require(any(row["identifier"] == RUNTIME and row.get("isAvailable") is True for row in runtimes["runtimes"]))
        device_name = "Settleora-ARM64-Ridge-" + identity["runId"] + "-1"
        owned_device = query(["xcrun", "simctl", "create", device_name, DEVICE_TYPE, RUNTIME]).strip()
        require(re.fullmatch(r"[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}", owned_device))
        execute(["xcrun", "simctl", "boot", owned_device], "owned-boot")
        report["simulatorBoots"] = 1
        execute(["xcrun", "simctl", "bootstatus", owned_device, "-b"], "owned-boot-ready")
        execute(["xcrun", "simctl", "install", owned_device, str(app)], "owned-install")
        container = Path(query(["xcrun", "simctl", "get_app_container", owned_device, BUNDLE_ID, "data"]).strip())
        require(container.is_absolute() and len(container.parts) >= 7 and
                container.parts[-7:-1] == ("Devices", owned_device, "data", "Containers", "Data", "Application") and
                re.fullmatch(r"[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}", container.name) and
                container.resolve() == container and container.is_dir())
        documents = container / "Documents"
        documents.mkdir(exist_ok=True)
        start = dict(schemaVersion=1, purpose=MODE, name=slot["name"],
                     startedAt=int(time.time() * 1000), preparedAt=slot["preparedAt"], expiresAt=slot["expiresAt"])
        require(start["preparedAt"] <= start["startedAt"] < start["preparedAt"] + 35 * 60 * 1000)
        exclusive(private / "capture-start.json", json_bytes(start), 4096)
        output = query(["xcrun", "simctl", "launch", owned_device, BUNDLE_ID])
        match = re.fullmatch(re.escape(BUNDLE_ID) + r": ([1-9][0-9]*)\s*", output)
        require(match)
        pid = int(match[1]); report["appLaunches"] = 1; report["providerCallsAdmitted"] = 1
        receipt, failure = ready(documents, "first", min(deadline, time.time() + 10 * 60), pid)
        if failure is not None: report["nativeFailure"] = failure
        require(receipt is not None)
        first = retain_capture(documents, private, "first", receipt, identity, model_ids, verifier)
        captures["first"] = read_owned(private / "first.json", 128 * 1024, (0o600,))
        report["completedCalls"] = 1
        report["first"] = {key: first[key] for key in ("wallTimeMs", "processLifetimePeakRssBytes", "capturedAtMs")}
        report["first"]["blockCount"] = len(first["channel"]["blocks"])
        if base.remaining_seconds(deadline) > 5 * 60 + 60:
            exclusive(documents / "allow-warm", b"1", 1)
            report["providerCallsAdmitted"] = 2
            receipt, failure = ready(documents, "warm", min(deadline, time.time() + 5 * 60), pid)
            warm_status = "failed"
            if failure is not None: report["nativeFailure"] = failure
            if receipt is not None:
                warm = retain_capture(documents, private, "warm", receipt, identity, model_ids, verifier)
                captures["warm"] = read_owned(private / "warm.json", 64 * 1024, (0o600,))
                report["completedCalls"] = 2; warm_status = "completed"
                report["warm"] = {key: warm[key] for key in ("wallTimeMs", "processLifetimePeakRssBytes", "capturedAtMs")}
                report["warm"]["blockCount"] = len(warm["channel"]["blocks"])
        else:
            exclusive(documents / "stop-after-first", b"1", 1)
        report["privateBundle"] = build_private_bundle(private, identity, captures,
            report["providerCallsAdmitted"], warm_status, model_ids, model_hash, start, verifier)
        output_file = env.get("GITHUB_OUTPUT")
        if output_file:
            with open(output_file, "a") as output: output.write("bundle_ready=true\n")
        require(base.verify_source(repo, identity["sourceHead"], deadline=deadline) == files)
        report["warmStatus"] = warm_status
        report["complete"] = warm_status in ("completed", "not_admitted")
    finally:
        # Only this fresh owned simulator/app. No global shutdown/delete and no retry.
        cleanup_deadline = min(time.time() + 120, clock["startedAt"] + 35 * 60 - 5)
        if owned_device and re.fullmatch(r"[A-Fa-f0-9-]{36}", owned_device):
            for label, argv in [("owned-terminate", ["xcrun", "simctl", "terminate", owned_device, BUNDLE_ID]),
                                ("owned-shutdown", ["xcrun", "simctl", "shutdown", owned_device]),
                                ("owned-delete", ["xcrun", "simctl", "delete", owned_device])]:
                try: report["stages"][label] = base.execute(argv, root, root, cleanup_deadline, label)
                except Exception: report.setdefault("cleanupUnconfirmed", []).append(label)
        report["finishedAt"] = int(time.time())
        raw = json_bytes(report)
        require(len(raw) <= 64 * 1024)
        print("SETTLEORA_ARM64_RUNTIME=" + raw.decode(), flush=True)
    require(report["complete"])

if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["bootstrap"]: bootstrap()
        else:
            require(not sys.argv[1:])
            main()
    except Exception:
        print("arm64_runtime_failed", file=sys.stderr)
        sys.exit(98)
