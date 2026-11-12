#!/usr/bin/env python3
"""Compile/link-only ARM64 iOS-simulator probe. Never launches an app or OCR."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import signal
import stat
import struct
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile

MODE = "paddle_arm64_compile_v1"
ROOT_NAME = "ios-paddle-arm64-compatibility-v1"
MAX_ARCHIVE = 128 * 1024 * 1024
MAX_EXTRACTED = 768 * 1024 * 1024
MAX_FILES = 20000
MAX_LOG = 32 * 1024 * 1024
MAX_WORK_SECONDS = 30 * 60


def require(value):
    if not value:
        raise ValueError("paddle_arm64_compatibility_rejected")


def safe_path(name):
    path = PurePosixPath(name)
    require(name and not path.is_absolute() and ".." not in path.parts
            and "\\" not in name and "\0" not in name)
    return path


def archive_plan(entries):
    """Validate the whole namespace before creating any extracted file."""
    seen, total = set(), 0
    symlinks = {entry[0].rstrip("/") for entry in entries if entry[2] == "symlink"}
    for name, size, kind, link in entries:
        path = safe_path(name)
        key = str(path).rstrip("/")
        require(key not in seen and kind in ("file", "directory", "symlink"))
        seen.add(key)
        require(type(size) is int and size >= 0)
        total += size
        require(len(seen) <= MAX_FILES and total <= MAX_EXTRACTED)
        if kind == "symlink":
            # Official ORT macOS framework aliases are relative, without '..'.
            safe_path(link)
        require(not any(str(parent) in symlinks
                        for parent in path.parents if str(parent) != "."))
    return total


def extract_archive(archive, destination):
    require(not destination.exists())
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as source:
            entries = []
            for info in source.infolist():
                kind = ("directory" if info.is_dir() else
                        "symlink" if stat.S_ISLNK(info.external_attr >> 16) else "file")
                link = source.read(info).decode("utf-8") if kind == "symlink" else ""
                entries.append((info.filename, info.file_size, kind, link))
            total = archive_plan(entries)
            destination.mkdir(mode=0o700)
            for info, (name, _, kind, _) in zip(source.infolist(), entries):
                target = destination.joinpath(*safe_path(name).parts)
                if kind == "directory":
                    target.mkdir(parents=True, exist_ok=True)
                elif kind == "file":
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open("xb") as output, source.open(info) as raw:
                        while chunk := raw.read(1024 * 1024):
                            output.write(chunk)
            for name, _, kind, link in entries:
                if kind == "symlink":
                    target = destination.joinpath(*safe_path(name).parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.symlink_to(link)
            return total
    with tarfile.open(archive, "r:gz") as source:
        members = source.getmembers()
        entries = [(m.name, m.size, "directory" if m.isdir() else
                    "file" if m.isfile() else "unsupported", "") for m in members]
        total = archive_plan(entries)
        destination.mkdir(mode=0o700)
        for member in members:
            target = destination.joinpath(*safe_path(member.name).parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as output, source.extractfile(member) as raw:
                    while chunk := raw.read(1024 * 1024):
                        output.write(chunk)
        return total


def macho_platforms(raw):
    """Read actual ARM64 Mach-O load commands, including fat static archives."""
    if raw.startswith(b"\xca\xfe\xba\xbe"):
        require(len(raw) >= 8)
        count = struct.unpack_from(">I", raw, 4)[0]
        require(0 < count <= 8 and len(raw) >= 8 + count * 20)
        selected = []
        for index in range(count):
            cpu, _, offset, size, _ = struct.unpack_from(">IIIII", raw, 8 + 20 * index)
            require(offset + size <= len(raw))
            if cpu == 0x0100000c:
                selected.extend(macho_platforms(raw[offset:offset + size]))
        require(selected)
        return selected
    if raw.startswith(b"!<arch>\n"):
        offset, platforms = 8, []
        while offset < len(raw):
            require(offset + 60 <= len(raw) and raw[offset + 58:offset + 60] == b"\x60\n")
            name = raw[offset:offset + 16].decode("ascii").strip()
            size = int(raw[offset + 48:offset + 58].decode("ascii").strip())
            start, end = offset + 60, offset + 60 + size
            require(size >= 0 and end <= len(raw))
            payload = raw[start:end]
            if name.startswith("#1/"):
                name_size = int(name[3:])
                require(name_size <= len(payload))
                name = payload[:name_size].rstrip(b"\0").decode("utf-8")
                payload = payload[name_size:]
            if payload.startswith(b"\xcf\xfa\xed\xfe"):
                platforms.extend(macho_platforms(payload))
            else:
                require(name.startswith("__.SYMDEF") or name in ("/", "//"))
            offset = end + size % 2
        require(offset == len(raw) and platforms)
        return platforms
    require(raw.startswith(b"\xcf\xfa\xed\xfe") and len(raw) >= 32)
    _, cpu, _, _, count, command_bytes, _, _ = struct.unpack_from("<IIIIIIII", raw)
    require(cpu == 0x0100000c and 0 < count <= 4096 and 32 + command_bytes <= len(raw))
    offset, platforms = 32, []
    for _ in range(count):
        require(offset + 8 <= 32 + command_bytes)
        command, size = struct.unpack_from("<II", raw, offset)
        require(size >= 8 and offset + size <= 32 + command_bytes)
        if command == 0x32:
            require(size >= 24)
            platforms.append(struct.unpack_from("<I", raw, offset + 8)[0])
        require(command not in (0x24, 0x25, 0x2f, 0x30))  # require explicit platform
        offset += size
    require(offset == 32 + command_bytes and platforms == [7])
    return platforms


def validate_context(env):
    require(env.get("GITHUB_ACTIONS") == "true"
            and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
            and env.get("GITHUB_REPOSITORY") == "tommytang213/Settleora"
            and env.get("GITHUB_JOB") == "ios-paddle-arm64-compatibility"
            and env.get("GITHUB_RUN_ATTEMPT") == "1"
            and env.get("SETTLEORA_ARM64_MODE") == MODE)
    head = env.get("EXPECTED_HEAD", "")
    require(re.fullmatch("[0-9a-f]{40}", head)
            and head == env.get("GITHUB_SHA") == env.get("CAPTURE_WORKFLOW_SHA"))
    return head


def git_environment():
    overrides = Path(__file__).with_name("git-repository-overrides.txt").read_text("ascii").splitlines()
    require(5 <= len(overrides) <= 32 and len(set(overrides)) == len(overrides)
            and {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
                 "GIT_OBJECT_DIRECTORY"} <= set(overrides)
            and all(re.fullmatch(r"GIT_[A-Z_]+", name) and not name.startswith((
                "GIT_CONFIG", "GIT_SSH", "GIT_ASKPASS", "GIT_PROXY_COMMAND",
                "GIT_NO_REPLACE_OBJECTS")) for name in overrides))
    env = {key: value for key, value in os.environ.items()
           if key not in overrides and key not in
           ("GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS")}
    env["GIT_NO_REPLACE_OBJECTS"] = "1"
    return env


def remaining_seconds(deadline):
    remaining = deadline - time.time()
    require(remaining > 0)
    return remaining


def git(repo, *args, deadline=None):
    return subprocess.check_output(["git", "--no-replace-objects", "-C", str(repo), *args],
                                   env=git_environment(),
                                   timeout=30 if deadline is None else min(30, remaining_seconds(deadline)))


def verify_source(repo, head, deadline=None):
    require(git(repo, "rev-parse", "HEAD", deadline=deadline).decode().strip() == head)
    require(not git(repo, "status", "--porcelain=v1", "--untracked-files=no", deadline=deadline))
    files, links, regular = {}, [], set()
    for entry in git(repo, "ls-tree", "-rz", head, deadline=deadline).split(b"\0"):
        if not entry:
            continue
        if deadline is not None:
            remaining_seconds(deadline)
        metadata, name = entry.split(b"\t", 1)
        mode, kind, identity = metadata.decode().split()
        # Gitlinks/submodules are outside this isolated blob-only probe.
        require(kind == "blob" and mode in ("100644", "100755", "120000"))
        path = repo.joinpath(*safe_path(name.decode()).parts)
        info = path.lstat()
        if mode == "120000":
            require(stat.S_ISLNK(info.st_mode))
            target = os.readlink(path)
            require(not Path(target).is_absolute())
            raw = target.encode()
            links.append(path)
        else:
            require(stat.S_ISREG(info.st_mode) and
                    bool(info.st_mode & 0o111) == (mode == "100755"))
            raw = path.read_bytes()
            regular.add(name.decode())
        require(hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == identity)
        files[name.decode()] = hashlib.sha256(raw).hexdigest()
    # Supported symlinks must resolve to another verified regular Git blob,
    # never a mutable external source or an untracked directory.
    for path in links:
        resolved = path.resolve(strict=True)
        require(resolved.is_relative_to(repo.resolve()) and
                str(resolved.relative_to(repo.resolve())) in regular)
    return files


DOWNLOAD_WORKER = r"""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("paddle_archive_transfer",sys.argv[1])
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module._download_transfer(json.loads(sys.argv[2]),Path(sys.argv[3]),deadline=float(sys.argv[4]))
"""


def download(item, destination, deadline=None):
    # A socket inactivity timeout cannot bound DNS, connection or trickling reads.
    # Own the whole transfer in a fresh group so the controller keeps its deadline.
    deadline = time.time() + 60 if deadline is None else deadline
    remaining_seconds(deadline)
    process = subprocess.Popen(
        [sys.executable, "-I", "-B", "-c", DOWNLOAD_WORKER,
         str(Path(__file__).resolve()), json.dumps(item), str(destination), str(deadline)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env=git_environment(), start_new_session=True)
    try:
        require(process.wait(timeout=remaining_seconds(deadline)) == 0)
        remaining_seconds(deadline)
    except BaseException:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=1)
        raise


def _download_transfer(item, destination, deadline=None):
    require(type(item["bytes"]) is int and 0 < item["bytes"] <= MAX_ARCHIVE)
    require(re.fullmatch("[0-9a-f]{64}", item["sha256"]))
    require(item["url"].startswith(("https://codeload.github.com/", "https://download.onnxruntime.ai/")))
    digest, count = hashlib.sha256(), 0
    require(deadline is None or time.time() < deadline)
    with urllib.request.urlopen(item["url"], timeout=60) as response:
        require(response.geturl() == item["url"])
        declared = response.headers.get("Content-Length")
        require(declared is None or int(declared) <= item["bytes"])
        with destination.open("xb") as output:
            while chunk := response.read(1024 * 1024):
                require(deadline is None or time.time() < deadline)
                count += len(chunk)
                require(count <= item["bytes"])
                output.write(chunk)
                digest.update(chunk)
    require(count == item["bytes"] and digest.hexdigest() == item["sha256"])
    destination.chmod(0o400)


def execute(argv, cwd, root, deadline, label):
    require(re.fullmatch("[a-z0-9-]+", label))
    log = root / (label + ".log")
    started = time.monotonic()
    with log.open("xb") as output:
        process = subprocess.Popen(argv, cwd=cwd, stdout=output, stderr=subprocess.STDOUT,
                                   env=git_environment(), start_new_session=True)
        try:
            while process.poll() is None:
                require(time.time() < deadline and log.stat().st_size <= MAX_LOG)
                time.sleep(0.2)
            require(process.returncode == 0 and log.stat().st_size <= MAX_LOG)
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    # Only this newly created compiler group on the fresh runner.
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=10)
            sys.stderr.write(log.read_bytes()[-16384:].decode("utf-8", errors="replace"))
            raise
    return {"seconds": round(time.monotonic() - started, 3),
            "logSha256": hashlib.sha256(log.read_bytes()).hexdigest(), "exitCode": 0}


def single_directory(root):
    entries = list(root.iterdir())
    require(len(entries) == 1 and entries[0].is_dir() and not entries[0].is_symlink())
    return entries[0]


def simulator_framework(xcframework):
    info = plistlib.loads((xcframework / "Info.plist").read_bytes())
    selected = [item for item in info["AvailableLibraries"]
                if item["SupportedPlatform"] == "ios"
                and item.get("SupportedPlatformVariant") == "simulator"
                and "arm64" in item["SupportedArchitectures"]]
    require(len(selected) == 1)
    item = selected[0]
    return xcframework / item["LibraryIdentifier"] / item["LibraryPath"]


def main():
    env = os.environ
    head = validate_context(env)
    repo = Path(__file__).resolve().parents[2]
    require(sys.platform == "darwin")
    start_path = Path(env["RUNNER_TEMP"]) / "ios-paddle-arm64-job-start.json"
    info = start_path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= 4096)
    clock = json.loads(start_path.read_bytes())
    require(set(clock) == {"head", "startedAt"} and clock["head"] == head
            and type(clock["startedAt"]) is int
            and 0 <= time.time() - clock["startedAt"] < MAX_WORK_SECONDS)
    deadline = clock["startedAt"] + MAX_WORK_SECONDS
    root = Path(env["RUNNER_TEMP"]) / ROOT_NAME
    require(not root.exists() and not root.is_symlink())
    root.mkdir(mode=0o700)
    manifest = json.loads((Path(__file__).parent / "ios-paddle-arm64-dependencies.json").read_bytes())
    files = verify_source(repo, head, deadline=deadline)
    report = {"schemaVersion": 1, "purpose": MODE, "sourceHead": head,
              "sourceTree": git(repo, "rev-parse", "HEAD^{tree}", deadline=deadline).decode().strip(),
              "providerCalls": 0, "appLaunches": 0, "simulatorBoots": 0,
              "targetArchitecture": "arm64", "targetPlatform": "iosSimulator",
              "hostArchitecture": os.uname().machine, "shippingAcceptance": False,
              "stages": {}, "complete": False}
    try:
        report["stages"]["toolchain"] = execute(
            ["xcodebuild", "-version"], repo, root, deadline, "toolchain")
        require((root / "toolchain.log").read_text().strip() == "Xcode 16.4\nBuild version 16F6")
        require(subprocess.check_output(["pod", "--version"], text=True,
                                        timeout=remaining_seconds(deadline)).strip() == "1.17.0")
        flutter = json.loads(subprocess.check_output(["flutter", "--version", "--machine"], text=True,
                                                     timeout=remaining_seconds(deadline)))
        require(flutter["frameworkRevision"] == manifest["flutter"]["frameworkRevision"]
                and flutter["engineRevision"] == manifest["flutter"]["engineRevision"]
                and flutter["dartSdkVersion"] == "3.12.2")
        (root / "project-generator.rb").write_text(RUBY_PROJECT)
        report["stages"]["ruby-syntax"] = execute(
            ["ruby", "-c", str(root / "project-generator.rb")], repo, root, deadline, "ruby-syntax")
        report["stages"]["flutter-precache"] = execute(
            ["flutter", "precache", "--ios"], repo, root, deadline, "flutter-precache")
        sources = {}
        require(sum(item["bytes"] for item in manifest["archives"].values()) <= 160 * 1024 * 1024)
        extracted = 0
        for name, item in manifest["archives"].items():
            archive = root / (name + (".zip" if item["url"].endswith(".zip") else ".tar.gz"))
            download(item, archive, deadline)
            destination = root / name
            extracted += extract_archive(archive, destination)
            require(extracted <= MAX_EXTRACTED)
            sources[name] = destination
        opencv = single_directory(sources["opencv"])
        yams = single_directory(sources["yams"])
        output = root / "opencv-build"
        excluded = sorted(p.name for p in (opencv / "modules").iterdir()
                          if p.is_dir() and p.name not in ("core", "imgproc"))
        argv = [sys.executable, str(opencv / "platforms/apple/build_xcframework.py"),
                "--out", str(output), "--iphonesimulator_archs", "arm64",
                "--build_only_specified_archs", "--iphoneos_deployment_target", "15.5",
                "--disable-bitcode", "--disable-swift", "--without", "objc"]
        for name in excluded:
            if name != "objc":
                argv.extend(["--without", name])
        for feature in ("IPP", "ITT", "OPENCL", "TBB", "OPENMP", "EIGEN", "LAPACK", "PROTOBUF", "ADE"):
            argv.extend(["--disable", feature])
        report["stages"]["opencv-build"] = execute(argv, root, root, deadline, "opencv-build")
        cv = simulator_framework(output / "opencv2.xcframework")
        cv_platforms = macho_platforms((cv / "opencv2").read_bytes())
        report["opencvObjectCount"] = len(cv_platforms)
        report["opencvPlatformIds"] = sorted(set(cv_platforms))
        report["opencvBinarySha256"] = hashlib.sha256((cv / "opencv2").read_bytes()).hexdigest()
        c_root, objc_root = sources["ort-c"], sources["ort-objc"]
        ort = simulator_framework(c_root / "onnxruntime.xcframework")
        report["ortSimulatorMachOImageCount"] = len(macho_platforms((ort / "onnxruntime").read_bytes()))
        for name, directory in (("onnxruntime-c", c_root), ("onnxruntime-objc", objc_root)):
            (directory / (name + ".podspec.json")).write_text(json.dumps(manifest["podspecs"][name]))
        sdk_root = Path(subprocess.check_output(["which", "flutter"], text=True,
                                                timeout=remaining_seconds(deadline)).strip()).resolve().parents[1]
        flutter_xc = sdk_root / "bin/cache/artifacts/engine/ios/Flutter.xcframework"
        flutter_framework = simulator_framework(flutter_xc)
        macho_platforms((flutter_framework / "Flutter").read_bytes())
        target = root / "paddle-only"
        target.mkdir(mode=0o700)
        runner = repo / "apps/mobile/ios/Runner"
        compiled = sorted(list((runner / "PaddleOCR").rglob("*.swift"))
                          + list((runner / "PaddleOCR").rglob("*.mm"))
                          + list((runner / "PaddleOCR").rglob("*.cpp"))
                          + [runner / "SettleoraReceiptOcrPlugin.swift"])
        report["compiledSources"] = {str(path.relative_to(repo)): files[str(path.relative_to(repo))]
                                     for path in compiled}
        original_bridge = (runner / "Runner-Bridging-Header.h").read_text()
        require(original_bridge.count('#import "GeneratedPluginRegistrant.h"\n') == 1)
        (target / "Bridge.h").write_text(original_bridge.replace('#import "GeneratedPluginRegistrant.h"\n', ""))
        (target / "main.swift").write_text("import Foundation\nlet _ = SettleoraReceiptOcrPlugin.self\n")
        project = {"sources": [str(path) for path in compiled],
                   "runnerTests": str(repo / "apps/mobile/ios/RunnerTests/RunnerTests.swift"),
                   "flutter": str(flutter_xc), "opencv": str(output / "opencv2.xcframework"),
                   "runnerHeaders": str(runner), "target": str(target)}
        (target / "project.json").write_text(json.dumps(project))
        (target / "create.rb").write_text(RUBY_PROJECT)
        report["stages"]["project"] = execute(["ruby", "create.rb"], target, root, deadline, "project")
        (target / "Podfile").write_text(
            "ENV['COCOAPODS_DISABLE_STATS']='true'\nplatform :ios, '15.5'\n"
            "project 'PaddleCompatibility'\nuse_frameworks! :linkage => :static\n"
            "target 'PaddleCompatibility' do\n"
            + "".join("  pod " + repr(name) + ", :path => " + repr(str(path)) + "\n"
                      for name, path in [("onnxruntime-c", c_root), ("onnxruntime-objc", objc_root), ("Yams", yams)])
            + "  target 'PaddleCompatibilityTests' do\n    inherit! :search_paths\n  end\nend\n")
        report["stages"]["pods"] = execute(
            ["pod", "install", "--no-repo-update"], target, root, deadline, "pods")
        lock = (target / "Podfile.lock").read_text()
        require(all(value in lock for value in ["onnxruntime-c (1.24.3)", "onnxruntime-objc (1.24.3)",
                                                "Yams (5.0.6)"]) and "MLKit" not in lock and "Google" not in lock)
        report["stages"]["paddle-build"] = execute(
            ["xcodebuild", "-workspace", "PaddleCompatibility.xcworkspace",
             "-scheme", "PaddleCompatibility", "-configuration", "Debug",
             "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator",
             "-derivedDataPath", str(target / "DerivedData"), "ARCHS=arm64", "ONLY_ACTIVE_ARCH=YES",
             "CODE_SIGNING_ALLOWED=NO", "build-for-testing"], target, root, deadline, "paddle-build")
        binary = target / "DerivedData/Build/Products/Debug-iphonesimulator/PaddleCompatibility.app/PaddleCompatibility"
        macho_platforms(binary.read_bytes())
        linked = subprocess.check_output(["xcrun", "otool", "-L", str(binary)], text=True,
                                          timeout=remaining_seconds(deadline))
        symbols = subprocess.check_output(["xcrun", "nm", "-u", str(binary)], text=True,
                                           timeout=remaining_seconds(deadline))
        require(not re.search("mlkit|googleml|gmlkit", linked + symbols + lock, re.IGNORECASE))
        report["paddleBinarySha256"] = hashlib.sha256(binary.read_bytes()).hexdigest()
        catalog = json.loads((repo / "apps/mobile/assets/receipt_ocr_models/catalog.json").read_bytes())
        report["modelPackIds"] = [pack["modelPackId"] for pack in catalog["packs"]]
        require(len(report["modelPackIds"]) == 8)
        require(verify_source(repo, head, deadline=deadline) == files)
        report["complete"] = True
    finally:
        report["finishedAt"] = int(time.time())
        report["opencvSource"] = manifest["archives"]["opencv"]
        report["onnxruntimeVersion"] = "1.24.3"
        report["yamsVersion"] = "5.0.6"
        raw = json.dumps(report, sort_keys=True, separators=(",", ":"))
        require(len(raw.encode()) <= 64 * 1024)
        print("SETTLEORA_ARM64_COMPATIBILITY=" + raw, flush=True)
        summary = env.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a") as output:
                output.write("\nPaddle ARM64 simulator compile/link: " +
                             ("PASS" if report["complete"] else "FAIL") +
                             "\n\nSource: " + head + "\n\nProvider calls: 0. App launches: 0. "
                             "Simulator boots: 0. Shipping acceptance: pending.\n")


RUBY_PROJECT = r"""
require 'json'
require 'xcodeproj'
p = JSON.parse(File.read('project.json'))
project = Xcodeproj::Project.new('PaddleCompatibility.xcodeproj')
app = project.new_target(:application, 'PaddleCompatibility', :ios, '15.5')
tests = project.new_target(:unit_test_bundle, 'PaddleCompatibilityTests', :ios, '15.5')
tests.add_dependency(app)
p['sources'].each { |source| app.source_build_phase.add_file_reference(project.main_group.new_file(source)) }
app.source_build_phase.add_file_reference(project.main_group.new_file('main.swift'))
tests.source_build_phase.add_file_reference(project.main_group.new_file(p['runnerTests']))
[app, tests].each do |target|
  target.frameworks_build_phase.add_file_reference(project.main_group.new_file(p['flutter']))
  target.build_configurations.each do |config|
    config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.settleora.compatibility.' + target.name
    config.build_settings['SWIFT_VERSION'] = '5.0'
    config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
    config.build_settings['ENABLE_DEBUG_DYLIB'] = 'NO'
    config.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) DEBUG'
    config.build_settings['ARCHS'] = 'arm64'
    config.build_settings['SUPPORTED_PLATFORMS'] = 'iphonesimulator'
    config.build_settings['HEADER_SEARCH_PATHS'] = ['$(inherited)', p['runnerHeaders']]
    config.build_settings['FRAMEWORK_SEARCH_PATHS'] = ['$(inherited)', File.dirname(p['flutter'])]
    config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  end
end
app.frameworks_build_phase.add_file_reference(project.main_group.new_file(p['opencv']))
app.build_configurations.each do |config|
  config.build_settings['PRODUCT_MODULE_NAME'] = 'Runner'
  config.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] = '$(SRCROOT)/Bridge.h'
  config.build_settings['ENABLE_TESTABILITY'] = 'YES'
  config.build_settings['OTHER_LDFLAGS'] = ['$(inherited)', '-lc++', '-framework', 'Accelerate', '-framework', 'UIKit', '-framework', 'CoreGraphics', '-framework', 'ImageIO']
  config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
end
tests.build_configurations.each do |config|
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/PaddleCompatibility.app/PaddleCompatibility'
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.set_launch_target(app)
scheme.add_test_target(tests)
scheme.save_as('PaddleCompatibility.xcodeproj', 'PaddleCompatibility', true)
"""

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("paddle_arm64_compatibility_failed", file=sys.stderr)
        sys.exit(98)
