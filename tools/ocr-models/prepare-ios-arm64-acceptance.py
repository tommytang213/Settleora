#!/usr/bin/env python3
"""ARM64 dependencies for the real Flutter full101 lane, in its detached test tree.

This never replaces Runner/Flutter with the diagnostic application. It changes
only native plugin selection in derived package metadata; every Dart file,
fixture, model and production dependency contract stays intact. Running this
setup does not grant another native execution allowance.
"""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from urllib.parse import unquote, urljoin, urlparse

ROOT_NAME = "ios-paddle-full101-arm64-v1"
REFERENCE_SHA256 = "e9d53614fdfa07d60ac8c9b017cdd71a821918172a8955f086fb2912f8013636"
PRODUCTION_LOCK_SHA256 = "a5b6068c71fe9b0a77743d5c639b5538dd2be10db7ddd4ecd9317fee03541903"
DISABLED_IOS_PLUGINS = {"google_mlkit_commons": "0.11.1", "google_mlkit_text_recognition": "0.15.1"}
ARCH_CONFIG = b"\n// Test-only full101 ARM64 selection.\nARCHS = arm64\nONLY_ACTIVE_ARCH = YES\nEXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64\n"
DEBUG_BASE_HASHES = {"a82d7765b37116ee4821d2cd1d65942febf8032353757ffb0826eabde785b4a6", "690b8a8b1ae15ddd29b241429963e971bbc6720ab22f154cf8cf6b085b6d4925"}
LOCAL_PODS = {"OpenCV", "onnxruntime-c", "onnxruntime-objc", "Yams"}
MAX_SECONDS = 30 * 60


def require(value):
    if not value:
        raise ValueError("ios_arm64_acceptance_setup_rejected")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def ruby_json(program, *args, data=None):
    result = subprocess.run(["ruby", "-rjson", "-ryaml", "-e", program, *map(str, args)],
                            input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=60, check=True)
    return result.stdout


def read_yaml(path):
    require(path.stat().st_size <= 256 * 1024)
    if path.read_bytes().lstrip().startswith(b"{"):
        return json.loads(path.read_bytes())
    program = """def normalize(value)
 case value
 when Hash then value.to_h {|key,item| [key.to_s.delete_prefix(':'), normalize(item)]}
 when Array then value.map {|item| normalize(item)}
 else value
 end
end
print JSON.generate(normalize(YAML.safe_load(File.read(ARGV[0]), permitted_classes: [Symbol], aliases: false)))"""
    return json.loads(ruby_json(program, path))


def project_plugin_spec(document, name):
    require(name in DISABLED_IOS_PLUGINS and document.get("name") == name
            and str(document.get("version")) == DISABLED_IOS_PLUGINS[name])
    projected = copy.deepcopy(document)
    platforms = projected["flutter"]["plugin"]["platforms"]
    require(isinstance(platforms.get("ios"), dict) and "android" in platforms)
    del platforms["ios"]
    return projected


def bounded_tree_files(root, max_bytes=64 * 1024 * 1024):
    require(root.is_dir() and not root.is_symlink() and root.resolve() == root)
    result, total = {}, 0
    for path in sorted(root.rglob("*")):
        if path.is_dir() and not path.is_symlink():
            continue
        rel = path.relative_to(root).as_posix()
        require(".git" not in Path(rel).parts)
        metadata = path.lstat()
        mode = metadata.st_mode
        require(stat.S_ISREG(mode) or stat.S_ISLNK(mode))
        if stat.S_ISLNK(mode):
            require(path.resolve().is_relative_to(root))
            raw = os.readlink(path).encode()
            size, digest = len(raw), sha(raw)
        else:
            size = metadata.st_size
            require(0 <= size <= max_bytes - total)
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
        total += size
        require(len(result) < 10000 and total <= max_bytes)
        result[rel] = {"sha256": digest, "symlink": stat.S_ISLNK(mode),
                       "executable": bool(mode & 0o111)}
    return result


def package_files(root):
    result = bounded_tree_files(root)
    require("pubspec.yaml" in result and any(name.startswith("lib/") for name in result))
    return result


def ios_plugin_inputs(mobile, installed=False):
    data = json.loads((mobile / ".flutter-plugins-dependencies").read_bytes())
    require(data["swift_package_manager_enabled"]["ios"] is False)
    plugins = data["plugins"]["ios"]
    require(isinstance(plugins, list) and 0 < len(plugins) <= 128)
    records = {}
    sources = {}
    for plugin in plugins:
        name = plugin["name"]
        require(re.fullmatch(r"[a-z][a-z0-9_]*", name) and name not in records and name not in DISABLED_IOS_PLUGINS)
        native = plugin.get("native_build", True)
        shared = plugin.get("shared_darwin_source", False)
        require(type(native) is bool and type(shared) is bool)
        path = Path(plugin["path"])
        require(path.is_absolute())
        resolved = path.resolve(strict=True)
        require(resolved.is_dir())
        records[name] = plugin
        if native:
            directory = "darwin" if shared else "ios"
            source = resolved / directory
            require((source / (name + ".podspec")).is_file())
            files = bounded_tree_files(source)
            sources[name] = {"root": str(resolved), "sourceDir": directory,
                             "inputSha256": sha(json.dumps(files, sort_keys=True).encode())}
    if installed:
        links = mobile / "ios/.symlinks/plugins"
        require(links.is_dir() and not links.is_symlink())
        require({path.name for path in links.iterdir()} == set(sources))
        for name, source in sources.items():
            link = links / name
            require(link.is_symlink() and link.resolve(strict=True) == Path(source["root"]))
    return {"inventory": records, "nativeSources": sources}


def local_pod_inputs(root, paths):
    require(set(paths) == LOCAL_PODS)
    digests = {}
    for name, directory in paths.items():
        source = Path(directory)
        require(source.is_relative_to(root) and source.resolve(strict=True) == source)
        # OpenCV's work directory also contains compiler scratch. CocoaPods uses
        # only the podspec, license and exported framework (including headers).
        if name == "OpenCV":
            framework = bounded_tree_files(source / "opencv2.xcframework", max_bytes=512 * 1024 * 1024)
            require(framework)
            metadata = {}
            for relative in ("LICENSE", "OpenCV.podspec.json"):
                file = source / relative
                require(file.is_file() and not file.is_symlink() and file.stat().st_size <= 1024 * 1024)
                metadata[relative] = sha(file.read_bytes())
            inputs = {"framework": framework, "metadata": metadata}
        else:
            inputs = bounded_tree_files(source, max_bytes=512 * 1024 * 1024)
        require(inputs)
        digests[name] = sha(json.dumps(inputs, sort_keys=True).encode())
    return digests


def project_packages(config_path, destination, approved_roots):
    """Keep real Dart libraries; suppress only two incompatible iOS registrations.

    Explicit SDK plugin generation consumes these cloned pubspecs before the
    no-pub build. No generated registrant is patched or replaced with a stub.
    """
    original = json.loads(config_path.read_bytes())
    projected = copy.deepcopy(original)
    rows = {row["name"]: row for row in projected["packages"]}
    require(len(rows) == len(projected["packages"]))
    proofs = {}
    for name in sorted(DISABLED_IOS_PLUGINS):
        row = rows[name]
        source_url = urlparse(urljoin(config_path.as_uri(), row["rootUri"]))
        require(source_url.scheme == "file" and not source_url.netloc)
        source = Path(unquote(source_url.path)).resolve(strict=True)
        require(source == approved_roots[name].resolve(strict=True))
        before = package_files(source)
        require(not before["pubspec.yaml"]["symlink"])
        target = destination / name
        require(not target.exists())
        shutil.copytree(source, target, symlinks=True)
        spec = project_plugin_spec(read_yaml(source / "pubspec.yaml"), name)
        # JSON is a YAML mapping too; Flutter reads the same pubspec fields.
        encoded = (json.dumps(spec, indent=2) + "\n").encode()
        spec_file = target / "pubspec.yaml"
        spec_file.chmod(stat.S_IMODE(spec_file.lstat().st_mode) | stat.S_IWUSR)
        spec_file.write_bytes(encoded)
        after = package_files(target)
        require(set(before) == set(after))
        require(all(before[key] == after[key] for key in before if key != "pubspec.yaml"))
        require(package_files(source) == before)
        row["rootUri"] = target.as_uri() + "/"
        proofs[name] = {"original": str(source), "clone": str(target), "files": after,
                        "originalFiles": before, "allDartAndNativeSourceBytesUnchanged": True,
                        "onlyIosRegistrationMetadataRemoved": True}
    require(len(projected["packages"]) == len(original["packages"]))
    for old, new in zip(original["packages"], projected["packages"]):
        expected = dict(old)
        if old["name"] in DISABLED_IOS_PLUGINS:
            expected["rootUri"] = rows[old["name"]]["rootUri"]
        require(expected == new)
    config_path.write_text(json.dumps(projected, indent=2) + "\n")
    return {"originalConfig": original, "projectedConfig": projected, "packages": proofs}


def pod_name(text):
    require(isinstance(text, str))
    match = re.fullmatch(r"([A-Za-z0-9_+./-]+)(?: \(.+\))?", text)
    require(match is not None)
    return match[1]


def regenerate_native_plugins(base, sdk, mobile, root, deadline):
    """Run the pinned Flutter generator without resolving app dependencies."""
    config = mobile / ".dart_tool/package_config.json"
    dart_lock = mobile / "pubspec.lock"
    before_config, before_lock = sha(config.read_bytes()), sha(dart_lock.read_bytes())
    tools = sdk / "packages/flutter_tools"
    packages = tools / ".dart_tool/package_config.json"
    if not packages.is_file():
        # Flutter release archives can ship a ready tool snapshot while
        # omitting the tool's package config needed to import its source.
        lock = tools / "pubspec.lock"
        lock_bytes = lock.read_bytes()
        base.execute([str(sdk / "bin/dart"), "--suppress-analytics", "pub", "get", "--enforce-lockfile"],
                     tools, root, deadline, "flutter-tool-packages")
        require(lock.read_bytes() == lock_bytes)
    require(packages.is_file())
    program = """import 'dart:convert';
import 'package:flutter_tools/src/cache.dart';
import 'package:flutter_tools/src/base/template.dart';
import 'package:flutter_tools/src/isolated/mustache_template.dart';
import 'package:flutter_tools/src/context_runner.dart';
import 'package:flutter_tools/src/flutter_plugins.dart';
import 'package:flutter_tools/src/project.dart';
import 'package:flutter_tools/src/globals.dart' as globals;

Future<void> main(List<String> args) async {
  if (args.length != 2) throw ArgumentError('SDK and project paths required');
  Cache.flutterRoot = args[0];
  await runInContext(() async {
    final project = FlutterProject.fromDirectory(globals.fs.directory(args[1]));
    await refreshPluginsList(project, iosPlatform: true, macOSPlatform: false);
    await injectPlugins(project, iosPlatform: true, releaseMode: false);
    final plugins = await findPlugins(project);
    final names = plugins.where((p) => p.platforms.containsKey('ios')).map((p) => p.name).toList()..sort();
    print('ARM64_FLUTTER_IOS_PLUGINS=' + jsonEncode(names));
  }, overrides: {TemplateRenderer: () => const MustacheTemplateRenderer()});
}
"""
    driver = root / "refresh-ios-plugins.dart"
    with driver.open("x") as file:
        file.write(program)
    driver.chmod(0o400)
    base.execute([str(sdk / "bin/dart"), "--packages=" + str(packages), str(driver), str(sdk), str(mobile)],
                 mobile, root, deadline, "flutter-native-plugin-refresh")
    require(sha(config.read_bytes()) == before_config and sha(dart_lock.read_bytes()) == before_lock)
    registrant = (mobile / "ios/Runner/GeneratedPluginRegistrant.m").read_text()
    require(not re.search(r"GoogleMlKit|google_mlkit", registrant)
            and "IntegrationTestPlugin" in registrant and "FLTImagePickerPlugin" in registrant)
    return {"scriptSha256": sha(driver.read_bytes()), "projectedPackageConfigSha256": before_config,
            "pubspecLockSha256": before_lock, "nativeRegistrantSha256": sha(registrant.encode()),
            "regeneratedByPinnedFlutterWithoutPubGet": True, "nativeCalls": 0}


def local_podspec_checksums(spec_paths):
    # CocoaPods stores path-source specs as sandbox JSON before resolving them.
    # Its lockfile hashes those serialized bytes, including the trailing newline.
    program = """
require 'cocoapods'
require 'digest'
paths = JSON.parse(STDIN.read)
checksums = paths.to_h do |name, path|
  spec = Pod::Specification.from_file(path)
  raise ArgumentError unless spec.name == name
  [name, Digest::SHA1.hexdigest(spec.to_pretty_json)]
end
print JSON.generate(checksums)
"""
    return json.loads(ruby_json(program, data=json.dumps(spec_paths).encode()))


def pod_nodes(document):
    nodes = {}
    for item in document["PODS"]:
        require(isinstance(item, (str, dict)))
        signature, dependencies = (item, []) if isinstance(item, str) else next(iter(item.items()))
        require(isinstance(item, str) or len(item) == 1)
        name = pod_name(signature)
        require(name not in nodes and isinstance(dependencies, list))
        nodes[name] = (signature, dependencies)
    return nodes


def verify_pod_projection(production, actual, paths, checksums, podfile_checksum):
    """Exact retained graph, with only reviewed local runtime pods and integration_test."""
    require(set(paths) == LOCAL_PODS | {"integration_test"} and set(checksums) == set(paths))
    require(all(re.fullmatch(r"[0-9a-f]{40}", value) for value in checksums.values()))
    require(production["COCOAPODS"] == actual["COCOAPODS"] == "1.17.0")
    source = pod_nodes(production)
    roots = {pod_name(name) for name in production["DEPENDENCIES"]}
    require(set(DISABLED_IOS_PLUGINS) <= roots)
    retained, pending = set(), list(roots - set(DISABLED_IOS_PLUGINS))
    while pending:
        name = pending.pop()
        if name in retained:
            continue
        retained.add(name)
        if name in source:
            pending.extend(pod_name(value) for value in source[name][1])
    expected_nodes = {name: row for name, row in source.items() if name in retained}
    require(expected_nodes.get("OpenCV") == ("OpenCV (4.3.0)", []))
    expected_nodes["OpenCV"] = ("OpenCV (4.12.0)", [])
    expected_nodes["integration_test"] = ("integration_test (0.0.1)", ["Flutter"])
    require(pod_nodes(actual) == expected_nodes)
    require(not any(re.search(r"mlkit|^Google|^GTM|^nanopb|^PromisesObjC", name, re.I)
                    for name in expected_nodes))
    root_names = {name.split("/")[0] for name in expected_nodes}
    dependencies = [name for name in production["DEPENDENCIES"]
                    if pod_name(name) not in set(DISABLED_IOS_PLUGINS) | LOCAL_PODS]
    dependencies += [name + " (from `" + paths[name] + "`)" for name in sorted(paths)]
    require(sorted(actual["DEPENDENCIES"]) == sorted(dependencies))
    external = {name: value for name, value in production["EXTERNAL SOURCES"].items()
                if name in root_names and name not in LOCAL_PODS}
    external.update({name: {"path": value} for name, value in paths.items()})
    require(actual["EXTERNAL SOURCES"] == external)
    sums = {name: value for name, value in production["SPEC CHECKSUMS"].items()
            if name in root_names and name not in LOCAL_PODS}
    sums.update(checksums)
    require(actual["SPEC CHECKSUMS"] == sums)
    repos = {repo: [name for name in names if name in root_names and name not in LOCAL_PODS]
             for repo, names in production.get("SPEC REPOS", {}).items()}
    repos = {repo: names for repo, names in repos.items() if names}
    require(actual.get("SPEC REPOS", {}) == repos)
    require(actual["PODFILE CHECKSUM"] == podfile_checksum)
    require(set(actual) - {"SPEC REPOS"} == set(production) - {"SPEC REPOS"})
    return {"retainedPodNodes": len(expected_nodes), "removedMlkitOnlyNodes": len(source) - len(expected_nodes) + 1,
            "allOtherPodsVersionsChecksumsAndSourcesExact": True}


def derive_test_pod_lock(production, paths, checksums, podfile_checksum):
    """Seed the reviewed test graph without unlocking any retained dependency."""
    source = pod_nodes(production)
    roots = {pod_name(value) for value in production["DEPENDENCIES"]}
    retained, pending = set(), list(roots - set(DISABLED_IOS_PLUGINS))
    while pending:
        name = pending.pop()
        if name in retained:
            continue
        retained.add(name)
        if name in source:
            pending.extend(pod_name(value) for value in source[name][1])
    result = copy.deepcopy(production)
    nodes = {name: row for name, row in source.items() if name in retained}
    nodes["OpenCV"] = ("OpenCV (4.12.0)", [])
    nodes["integration_test"] = ("integration_test (0.0.1)", ["Flutter"])
    result["PODS"] = [({signature: list(dependencies)} if dependencies else signature)
                      for signature, dependencies in nodes.values()]
    root_names = {name.split("/")[0] for name in nodes}
    result["DEPENDENCIES"] = [value for value in production["DEPENDENCIES"]
                              if pod_name(value) not in set(DISABLED_IOS_PLUGINS) | LOCAL_PODS]
    result["DEPENDENCIES"] += [name + " (from `" + paths[name] + "`)" for name in sorted(paths)]
    result["EXTERNAL SOURCES"] = {name: value for name, value in result["EXTERNAL SOURCES"].items()
                                  if name in root_names and name not in LOCAL_PODS}
    result["EXTERNAL SOURCES"].update({name: {"path": value} for name, value in paths.items()})
    result["SPEC CHECKSUMS"] = {name: value for name, value in result["SPEC CHECKSUMS"].items()
                                if name in root_names and name not in LOCAL_PODS}
    result["SPEC CHECKSUMS"].update(checksums)
    repos = {repo: [name for name in names if name in root_names and name not in LOCAL_PODS]
             for repo, names in production.get("SPEC REPOS", {}).items()}
    repos = {repo: names for repo, names in repos.items() if names}
    if repos:
        result["SPEC REPOS"] = repos
    else:
        result.pop("SPEC REPOS", None)
    result["PODFILE CHECKSUM"] = podfile_checksum
    verify_pod_projection(production, result, paths, checksums, podfile_checksum)
    return result


def write_pod_lock(path, document):
    """Use CocoaPods' own serializer, including symbol-valued external options."""
    metadata = path.lstat()
    require(stat.S_ISREG(metadata.st_mode) and not path.is_symlink()
            and metadata.st_nlink == 1 and metadata.st_uid == os.getuid())
    program = """require 'cocoapods'
raise 'unexpected CocoaPods' unless Pod::VERSION == '1.17.0'
document = JSON.parse(STDIN.read)
document.fetch('EXTERNAL SOURCES').each_value {|value| value.transform_keys!(&:to_sym)}
print Pod::Lockfile.new(document).to_yaml"""
    encoded = ruby_json(program, data=json.dumps(document).encode())
    require(0 < len(encoded) <= 256 * 1024)
    path.write_bytes(encoded)


def derive_podfile(original, paths):
    require(set(paths) == LOCAL_PODS and all(re.fullmatch(r"/[A-Za-z0-9_./-]+", value) for value in paths.values()))
    value = original
    for name, version in [("onnxruntime-objc", "1.24.3"), ("Yams", "5.0.6"), ("OpenCV", "4.3.0")]:
        needle = "  pod '" + name + "', '" + version + "'"
        require(value.count(needle) == 1)
        value = value.replace(needle, "  pod '" + name + "', :path => " + json.dumps(paths[name]), 1)
    needle = "  pod 'onnxruntime-objc', :path => "
    position = value.index(needle)
    value = value[:position] + "  pod 'onnxruntime-c', :path => " + json.dumps(paths["onnxruntime-c"]) + "\n" + value[position:]
    needle = "    flutter_additional_ios_build_settings(target)"
    require(value.count(needle) == 1)
    value = value.replace(needle, needle + "\n    target.build_configurations.each do |config|\n"
                          "      config.build_settings['ARCHS'] = 'arm64'\n"
                          "      config.build_settings['ONLY_ACTIVE_ARCH'] = 'YES'\n"
                          "      config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'\n    end", 1)
    return value


def verify_protected_source(target, tracked):
    protected = {}
    for relative, digest in tracked.items():
        path = Path(relative)
        native_code = relative.startswith("apps/mobile/ios/") and path.suffix in (
            ".swift", ".mm", ".cpp", ".h", ".hpp", ".m"
        )
        if relative.startswith("apps/mobile/ios/") and not native_code:
            continue
        if relative == "apps/mobile/ios/Runner/GeneratedPluginRegistrant.m":
            continue
        file = target / relative
        require(file.is_file() or file.is_symlink())
        raw = os.readlink(file).encode() if file.is_symlink() else file.read_bytes()
        require(sha(raw) == digest)
        protected[relative] = digest
    require(protected)
    return protected


def context():
    env = os.environ
    require(env.get("GITHUB_ACTIONS") == "true" and env.get("GITHUB_REPOSITORY") == "tommytang213/Settleora"
            and env.get("GITHUB_JOB") == "ios-native-acceptance"
            and env.get("GITHUB_EVENT_NAME") in ("pull_request", "workflow_dispatch")
            and env.get("SETTLEORA_IOS_ACCEPTANCE_ARCH") == "arm64")
    require(platform.system() == "Darwin" and platform.machine() == "arm64")
    repo, temporary = Path(env["GITHUB_WORKSPACE"]), Path(env["RUNNER_TEMP"])
    isolation = module(repo / "tools/ocr-models/prepare-ios-acceptance-worktree.py", "full101_isolation")
    try:
        target = isolation.verify(repo, temporary, env["EXPECTED_HEAD"])
    except isolation.IsolationError:
        raise ValueError("ios_arm64_acceptance_setup_rejected") from None
    require(Path(env["SETTLEORA_IOS_ACCEPTANCE_ROOT"]) == target)
    reference = repo / "tools/ocr-models/ios-paddle-arm64-dependencies.json"
    require(sha(reference.read_bytes()) == REFERENCE_SHA256)
    return repo, temporary / ROOT_NAME, target, json.loads(reference.read_bytes())


def prepare(repo, root, target, manifest):
    require(not root.exists() and not root.is_symlink())
    root.mkdir(mode=0o700)
    deadline = time.time() + MAX_SECONDS
    base = module(repo / "tools/ocr-models/ios-paddle-arm64-compatibility.py", "full101_dependencies")
    tracked = base.verify_source(repo, os.environ["EXPECTED_HEAD"], deadline)
    require(subprocess.check_output(["xcodebuild", "-version"], text=True).strip() == "Xcode 16.4\nBuild version 16F6")
    require(subprocess.check_output(["pod", "--version"], text=True).strip() == "1.17.0")
    base.execute(["flutter", "precache", "--ios"], repo, root, deadline, "flutter-precache")
    flutter = json.loads(subprocess.check_output(["flutter", "--version", "--machine"], text=True))
    require(all(flutter[key] == value for key, value in manifest["flutter"].items())
            and flutter["dartSdkVersion"] == "3.12.2")
    sdk = Path(subprocess.check_output(["which", "flutter"], text=True).strip()).resolve().parents[1]
    base.macho_platforms((base.simulator_framework(sdk / "bin/cache/artifacts/engine/ios/Flutter.xcframework") / "Flutter").read_bytes())
    source = {}
    extracted_total = 0
    for name, item in manifest["archives"].items():
        archive = root / (name + (".zip" if item["url"].endswith(".zip") else ".tar.gz"))
        base.download(item, archive, deadline)
        extracted = root / name
        extracted_total += base.extract_archive(archive, extracted)
        require(extracted_total <= base.MAX_EXTRACTED)
        source[name] = extracted
    opencv = base.single_directory(source["opencv"])
    output = root / "opencv-build"
    argv = [sys.executable, str(opencv / "platforms/apple/build_xcframework.py"), "--out", str(output),
            "--iphonesimulator_archs", "arm64", "--build_only_specified_archs",
            "--iphoneos_deployment_target", "15.5", "--disable-bitcode", "--disable-swift", "--without", "objc"]
    for directory in sorted((opencv / "modules").iterdir()):
        if directory.is_dir() and directory.name not in ("core", "imgproc", "objc"):
            argv.extend(["--without", directory.name])
    for feature in ("IPP", "ITT", "OPENCL", "TBB", "OPENMP", "EIGEN", "LAPACK", "PROTOBUF", "ADE"):
        argv.extend(["--disable", feature])
    base.execute(argv, root, root, deadline, "opencv-build")
    cv = base.simulator_framework(output / "opencv2.xcframework")
    cv_platforms = base.macho_platforms((cv / "opencv2").read_bytes())
    ort = base.simulator_framework(source["ort-c"] / "onnxruntime.xcframework")
    ort_platforms = base.macho_platforms((ort / "onnxruntime").read_bytes())
    cv_spec = {"name": "OpenCV", "version": "4.12.0", "summary": "Pinned test-only ARM64 simulator core/imgproc",
               "homepage": "https://opencv.org/", "license": {"type": "Apache-2.0", "file": str(opencv / "LICENSE")},
               "authors": "OpenCV", "source": {"http": manifest["archives"]["opencv"]["url"]},
               "platforms": {"ios": "15.5"}, "vendored_frameworks": "opencv2.xcframework", "static_framework": True}
    (output / "LICENSE").write_bytes((opencv / "LICENSE").read_bytes())
    cv_spec["license"]["file"] = "LICENSE"
    cv_spec["source"]["sha256"] = manifest["archives"]["opencv"]["sha256"]
    (output / "OpenCV.podspec.json").write_text(json.dumps(cv_spec, indent=2) + "\n")
    for name, directory in [("onnxruntime-c", source["ort-c"]), ("onnxruntime-objc", source["ort-objc"])]:
        (directory / (name + ".podspec.json")).write_text(json.dumps(manifest["podspecs"][name], indent=2) + "\n")
    mobile = target / "apps/mobile"
    lock = mobile / "ios/Podfile.lock"
    require(sha(lock.read_bytes()) == PRODUCTION_LOCK_SHA256)
    production_lock = lock.read_bytes()
    (root / "production-Podfile.lock").write_bytes(production_lock)
    original_podfile = (mobile / "ios/Podfile").read_text()
    require(original_podfile.encode() == (repo / "apps/mobile/ios/Podfile").read_bytes())
    pub_cache = Path(os.environ.get("PUB_CACHE", str(Path.home() / ".pub-cache"))).resolve(strict=True)
    approved_roots = {"google_mlkit_commons": target / "packages/google_mlkit_commons",
                      "google_mlkit_text_recognition": pub_cache / "hosted/pub.dev/google_mlkit_text_recognition-0.15.1"}
    package_proof = project_packages(mobile / ".dart_tool/package_config.json", root / "flutter-packages", approved_roots)
    plugin_refresh = regenerate_native_plugins(base, sdk, mobile, root, deadline)
    plugin_inputs = ios_plugin_inputs(mobile)
    paths = {"OpenCV": str(output), "onnxruntime-c": str(source["ort-c"]),
             "onnxruntime-objc": str(source["ort-objc"]), "Yams": str(base.single_directory(source["yams"]))}
    (mobile / "ios/Podfile").write_text(derive_podfile(original_podfile, paths))
    debug = mobile / "ios/Flutter/Debug.xcconfig"
    original_debug = debug.read_bytes()
    require(sha(original_debug) in DEBUG_BASE_HASHES)
    debug.write_bytes(original_debug + ARCH_CONFIG)
    protected = verify_protected_source(target, tracked)
    proof = {"schemaVersion": 1, "sourceHead": os.environ["EXPECTED_HEAD"], "architecture": "arm64",
             "root": str(root), "target": str(target), "referenceManifestSha256": REFERENCE_SHA256,
             "archives": manifest["archives"], "localPodPaths": paths, "protectedSource": protected, "packageProjection": package_proof,
             "localPodInputs": local_pod_inputs(root, paths),
             "nativePluginRefresh": plugin_refresh, "iosPluginInputs": plugin_inputs,
             "derivedPodfileSha256": sha((mobile / "ios/Podfile").read_bytes()),
             "debugBaseSha256": sha(original_debug), "debugDerivedSha256": sha(debug.read_bytes()),
             "pubspecLockSha256": sha((mobile / "pubspec.lock").read_bytes()),
             "opencvObjectCount": len(cv_platforms), "opencvPlatformIds": sorted(set(cv_platforms)),
             "opencvBinarySha256": sha((cv / "opencv2").read_bytes()),
             "ortBinarySha256": sha((ort / "onnxruntime").read_bytes()),
             "ortSimulatorImageCount": len(ort_platforms), "ortPlatformIds": sorted(set(ort_platforms)),
             "FlutterRunnerAndIntegrationTestPreserved": True, "fixtures": 101,
             "DartLibrariesChanged": False, "productionSourceModified": False, "nativeCallsDuringSetup": 0,
             "diagnosticAllowanceReused": False}
    require(base.verify_source(repo, os.environ["EXPECTED_HEAD"], deadline) == tracked)
    (root / "setup.json").write_text(json.dumps(proof, indent=2) + "\n")
    # The pinned SDK generator has already refreshed native registration.
    # No-pub configuration must preserve that projected registration below.
    require(lock.lstat().st_nlink == 1 and lock.lstat().st_uid == os.getuid()
            and sha(lock.read_bytes()) == PRODUCTION_LOCK_SHA256)
    # Flutter's --config-only path also runs CocoaPods. Its first invocation
    # must already see every retained version lock, not an unlocked graph.
    test_paths = dict(paths, integration_test=".symlinks/plugins/integration_test/ios")
    spec_paths = {name: str(Path(value) / (name + (".podspec" if name == "Yams" else ".podspec.json")))
                  for name, value in paths.items()}
    spec_paths["integration_test"] = str(sdk / "packages/integration_test/ios/integration_test.podspec")
    checksums = local_podspec_checksums(spec_paths)
    podfile_checksum = hashlib.sha1((mobile / "ios/Podfile").read_bytes()).hexdigest()
    production = read_yaml(root / "production-Podfile.lock")
    write_pod_lock(lock, derive_test_pod_lock(production, test_paths, checksums, podfile_checksum))
    verify_pod_projection(production, read_yaml(lock), test_paths, checksums, podfile_checksum)
    proof.update(retainedPodLocksSeededBeforeFlutter=True, derivedTestPodLockSha256=sha(lock.read_bytes()))
    (root / "setup.json").write_text(json.dumps(proof, indent=2) + "\n")
    base.execute(["flutter", "build", "ios", "--config-only", "--simulator", "--debug", "--no-pub"],
                 mobile, root, deadline, "flutter-plugin-selection")
    require(sha((mobile / "pubspec.lock").read_bytes()) == proof["pubspecLockSha256"])
    verify_pod_projection(production, read_yaml(lock), test_paths, checksums, podfile_checksum)
    base.execute(["pod", "install", "--deployment", "--no-repo-update"], mobile / "ios", root, deadline, "test-pods")
    verify(repo, root, target, pods=True)


def verified_installed_pod_lock(ios, expected_sha256=None):
    lock = (ios / "Podfile.lock").read_bytes()
    require(lock and lock == (ios / "Pods/Manifest.lock").read_bytes())
    digest = sha(lock)
    if expected_sha256 is not None:
        require(digest == expected_sha256)
    return digest


def verify(repo, root, target, pods=False, stage="prepared"):
    require(root.is_dir() and root.resolve() == root and root.stat().st_uid == os.getuid())
    proof = json.loads((root / "setup.json").read_bytes())
    require(proof["sourceHead"] == os.environ["EXPECTED_HEAD"] and proof["target"] == str(target)
            and proof["architecture"] == "arm64" and proof["referenceManifestSha256"] == REFERENCE_SHA256)
    base = module(repo / "tools/ocr-models/ios-paddle-arm64-compatibility.py", "full101_verified_frameworks")
    cv = base.simulator_framework(root / "opencv-build/opencv2.xcframework") / "opencv2"
    ort = base.simulator_framework(root / "ort-c/onnxruntime.xcframework") / "onnxruntime"
    require(sha(cv.read_bytes()) == proof["opencvBinarySha256"]
            and sha(ort.read_bytes()) == proof["ortBinarySha256"])
    require(local_pod_inputs(root, proof["localPodPaths"]) == proof["localPodInputs"])
    mobile = target / "apps/mobile"
    require(verify_protected_source(target, proof["protectedSource"]) == proof["protectedSource"])
    require(sha((mobile / "pubspec.lock").read_bytes()) == proof["pubspecLockSha256"])
    require(sha((mobile / "ios/Podfile").read_bytes()) == proof["derivedPodfileSha256"])
    debug = (mobile / "ios/Flutter/Debug.xcconfig").read_bytes()
    if stage != "prepared":
        temporary = root.parent
        anchor = temporary / "settleora-network-interposer-anchor.o"
        interposer = temporary / "libSettleoraOcrNetworkDeny.dylib"
        link_config = (
            "\nENABLE_DEBUG_DYLIB = NO\n"
            f"OTHER_LDFLAGS = $(inherited) {anchor} -Wl,-u,_settleora_require_network_interposer "
            f"-L{temporary} {interposer} -Wl,-needed-lSettleoraOcrNetworkDeny\n"
            f"LIBRARY_SEARCH_PATHS = $(inherited) {temporary}\n"
        ).encode()
        require(debug.endswith(link_config))
        debug = debug[:-len(link_config)]
    require(sha(debug) == proof["debugDerivedSha256"])
    require(json.loads((mobile / ".dart_tool/package_config.json").read_bytes()) == proof["packageProjection"]["projectedConfig"])
    for row in proof["packageProjection"]["packages"].values():
        require(package_files(Path(row["original"])) == row["originalFiles"])
        require(package_files(Path(row["clone"])) == row["files"])
    plugin_inputs = ios_plugin_inputs(mobile, installed=pods)
    require(plugin_inputs == proof["iosPluginInputs"])
    require({"integration_test", "file_picker", "image_picker_ios", "flutter_secure_storage_darwin"}
            <= plugin_inputs["nativeSources"].keys())
    registrant = (mobile / "ios/Runner/GeneratedPluginRegistrant.m").read_text()
    require(not re.search(r"GoogleMlKit|google_mlkit", registrant))
    require("IntegrationTestPlugin" in registrant and "FLTImagePickerPlugin" in registrant)
    require(sha(registrant.encode()) == proof["nativePluginRefresh"]["nativeRegistrantSha256"])
    if pods:
        verified = root / "verification.json"
        expected_lock = None
        if stage != "prepared":
            previous = json.loads(verified.read_bytes())
            require(previous["sourceHead"] == proof["sourceHead"])
            require(previous["graphVerifiedAt"] == ("prepared" if stage == "after_simulator_build" else "after_simulator_build"))
            expected_lock = previous["podfileLockSha256"]
        ios = mobile / "ios"
        lock_sha = verified_installed_pod_lock(ios, expected_lock)
        production_lock = root / "production-Podfile.lock"
        require(sha(production_lock.read_bytes()) == PRODUCTION_LOCK_SHA256)
        paths = dict(proof["localPodPaths"], integration_test=".symlinks/plugins/integration_test/ios")
        spec_paths = {name: str(Path(value) / (name + (".podspec.json" if name != "Yams" else ".podspec")))
                      for name, value in proof["localPodPaths"].items()}
        spec_paths["integration_test"] = str(mobile / "ios/.symlinks/plugins/integration_test/ios/integration_test.podspec")
        checksums = local_podspec_checksums(spec_paths)
        result = verify_pod_projection(read_yaml(production_lock),
                                       read_yaml(ios / "Podfile.lock"), paths, checksums,
                                       hashlib.sha1((mobile / "ios/Podfile").read_bytes()).hexdigest())
        verified_installed_pod_lock(ios, lock_sha)
        result.update(sourceHead=proof["sourceHead"], architecture="arm64", fullFlutterAcceptancePreserved=True,
                      fixtureCount=101, modelAndFixtureBytesUnchanged=True, nativeCallsDuringSetup=0,
                      scope="dependency_projection_integrity_only", nativeAcceptancePassed=False,
                      graphVerifiedAt=stage, podfileLockSha256=lock_sha, podsManifestLockSha256=lock_sha,
                      opencvObjectCount=proof["opencvObjectCount"], opencvPlatformIds=proof["opencvPlatformIds"],
                      ortSimulatorImageCount=proof["ortSimulatorImageCount"], ortPlatformIds=proof["ortPlatformIds"],
                      opencvBinarySha256=proof["opencvBinarySha256"], ortBinarySha256=proof["ortBinarySha256"],
                      localPodInputsSha256=proof["localPodInputs"],
                      retainedNativePluginInputs=len(plugin_inputs["nativeSources"]),
                      retainedNativePluginInputsSha256=sha(json.dumps(plugin_inputs, sort_keys=True).encode()),
                      protectedSourceFiles=len(proof["protectedSource"]),
                      protectedSourceDigest=sha(json.dumps(proof["protectedSource"],sort_keys=True).encode()))
        with tempfile.NamedTemporaryFile(mode="w", dir=root, prefix=".verification-", delete=False) as receipt:
            json.dump(result, receipt, indent=2)
            receipt.write("\n")
        os.replace(receipt.name, verified)
    print("ios_full101_arm64_setup=verified")


def verify_build_pods(root, target):
    proof = json.loads((root / "verification.json").read_bytes())
    require(proof["sourceHead"] == os.environ["EXPECTED_HEAD"])
    require(proof["graphVerifiedAt"] in ("prepared", "after_simulator_build"))
    mobile = target / "apps/mobile"
    verified_installed_pod_lock(mobile / "ios", proof["podfileLockSha256"])
    observed = ios_plugin_inputs(mobile, installed=True)
    require(sha(json.dumps(observed, sort_keys=True).encode()) == proof["retainedNativePluginInputsSha256"])
    setup = json.loads((root / "setup.json").read_bytes())
    require(setup["sourceHead"] == proof["sourceHead"])
    require(local_pod_inputs(root, setup["localPodPaths"]) == proof["localPodInputsSha256"])
    print("ios_full101_arm64_build_pods=verified")


def verify_test_bundle(repo, target, temporary):
    base = module(repo / "tools/ocr-models/ios-paddle-arm64-compatibility.py", "full101_test_bundle")
    bundle = target / "apps/mobile/build/ios/iphonesimulator/Runner.app"
    runner = bundle / "Runner"
    debug_image = bundle / "Runner.debug.dylib"
    embedded = bundle / "Frameworks/libSettleoraOcrNetworkDeny.dylib"
    original = temporary / embedded.name
    required_images = [runner, embedded]
    if debug_image.exists() or debug_image.is_symlink():
        required_images.append(debug_image)
    for path in required_images:
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(bundle))
        require(0 < path.stat().st_size <= 64 * 1024 * 1024)
        binary = path.read_bytes()
        require(binary.startswith(b"\xcf\xfa\xed\xfe") and base.macho_platforms(binary) == [7])
    require(original.is_file() and not original.is_symlink()
            and original.stat().st_size == embedded.stat().st_size and original.read_bytes() == embedded.read_bytes())
    print("ios_full101_test_bundle_arm64=verified")


def main():
    if sys.argv[1:] == ["verify-build-pods"]:
        _, root, target, _ = context()
        verify_build_pods(root, target)
        return
    if sys.argv[1:] == ["verify-test-bundle"]:
        repo, root, target, _ = context()
        verify_test_bundle(repo, target, root.parent)
        return
    stages = {
        "verify": "prepared",
        "verify-after-build": "after_simulator_build",
        "verify-after-test": "after_test_command",
    }
    require(len(sys.argv) == 2 and sys.argv[1] in ("prepare", *stages))
    repo, root, target, manifest = context()
    if sys.argv[1] == "prepare":
        prepare(repo, root, target, manifest)
    else:
        verify(repo, root, target, pods=True, stage=stages[sys.argv[1]])


def run_cli():
    try:
        main()
    except (ValueError, KeyError, OSError, TypeError, subprocess.SubprocessError):
        sys.stderr.write("ios_arm64_acceptance_setup_rejected\n")
        sys.exit(98)


if __name__ == "__main__":
    run_cli()
