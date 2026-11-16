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
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from urllib.parse import unquote, urljoin, urlparse
from xml.etree import ElementTree
from xml.parsers.expat import ExpatError

ROOT_NAME = "ios-paddle-full101-arm64-v1"
REFERENCE_SHA256 = "e9d53614fdfa07d60ac8c9b017cdd71a821918172a8955f086fb2912f8013636"
PRODUCTION_LOCK_SHA256 = "a5b6068c71fe9b0a77743d5c639b5538dd2be10db7ddd4ecd9317fee03541903"
DISABLED_IOS_PLUGINS = {"google_mlkit_commons": "0.11.1", "google_mlkit_text_recognition": "0.15.1"}
ARCH_CONFIG = b"\n// Test-only full101 ARM64 selection.\nARCHS = arm64\nONLY_ACTIVE_ARCH = YES\nEXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64\n"
DEBUG_BASE_HASHES = {"a82d7765b37116ee4821d2cd1d65942febf8032353757ffb0826eabde785b4a6", "690b8a8b1ae15ddd29b241429963e971bbc6720ab22f154cf8cf6b085b6d4925"}
LOCAL_PODS = {"OpenCV", "onnxruntime-c", "onnxruntime-objc", "Yams"}
MAX_SECONDS = 30 * 60
PODS_GATE_TARGET = "Verify Settleora OCR Pod Inputs"
PODS_GATE_SCRIPT = (
    'exec /usr/bin/env python3 -I -B "$GITHUB_WORKSPACE/tools/ocr-models/prepare-ios-arm64-acceptance.py"'
    ' verify-build-pods'
)
RUNNER_BUNDLE_ID = "com.tommytang213.settleora"
RUNNER_APP = Path("apps/mobile/build/ios/iphonesimulator/Runner.app")
OCR_TEST = Path("integration_test/receipt_ocr_real_provider_test.dart")
MODEL_ASSET_DIRECTORY = Path("assets/receipt_ocr_models")
RUNNER_INPUT_SETTINGS = (
    "SWIFT_OBJC_BRIDGING_HEADER", "GCC_PREFIX_HEADER", "MODULEMAP_FILE",
    "EXCLUDED_SOURCE_FILE_NAMES", "INCLUDED_SOURCE_FILE_NAMES",
    "PRODUCT_NAME", "FULL_PRODUCT_NAME", "EXECUTABLE_NAME", "PRODUCT_BUNDLE_IDENTIFIER",
    "INFOPLIST_FILE", "GENERATE_INFOPLIST_FILE",
    "FLUTTER_APPLICATION_PATH", "FLUTTER_ROOT",
)


def require(value):
    if not value:
        raise ValueError("ios_arm64_acceptance_setup_rejected")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def sha_file(path, expected_size):
    digest = hashlib.sha256()
    remaining = expected_size
    with path.open("rb") as stream:
        while remaining:
            chunk = stream.read(min(remaining, 1024 * 1024))
            require(chunk)
            digest.update(chunk)
            remaining -= len(chunk)
        require(not stream.read(1))
    return digest.hexdigest()


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
            digest = sha_file(path, size)
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


def generated_registrant_hashes(mobile):
    runner = mobile / "ios/Runner"
    implementation = (runner / "GeneratedPluginRegistrant.m").read_bytes()
    require(not re.search(rb"GoogleMlKit|google_mlkit", implementation)
            and b"IntegrationTestPlugin" in implementation and b"FLTImagePickerPlugin" in implementation)
    return {
        "headerSha256": sha((runner / "GeneratedPluginRegistrant.h").read_bytes()),
        "implementationSha256": sha(implementation),
    }


def regenerate_native_plugins(base, sdk, mobile, root, deadline):
    """Run the pinned Flutter generator without resolving app dependencies."""
    config = mobile / ".dart_tool/package_config.json"
    dart_lock = mobile / "pubspec.lock"
    before_config, before_lock = sha(config.read_bytes()), sha(dart_lock.read_bytes())
    tools = sdk / "packages/flutter_tools"
    packages = tools / ".dart_tool/package_config.json"
    if not packages.is_file():
        observe_preparation_phase("bootstrap_projected_flutter_tools")
        # Flutter release archives can ship a ready tool snapshot while
        # omitting the tool's package config needed to import its source.
        lock = tools / "pubspec.lock"
        lock_bytes = lock.read_bytes()
        base.execute([str(sdk / "bin/dart"), "--suppress-analytics", "pub", "get", "--enforce-lockfile"],
                     tools, root, deadline, "flutter-tool-packages")
        require(lock.read_bytes() == lock_bytes)
    require(packages.is_file())
    observe_preparation_phase("regenerate_projected_plugin_registrants")
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
    observe_preparation_phase("verify_projected_plugin_registrants")
    require(sha(config.read_bytes()) == before_config and sha(dart_lock.read_bytes()) == before_lock)
    return {"scriptSha256": sha(driver.read_bytes()), "projectedPackageConfigSha256": before_config,
            "pubspecLockSha256": before_lock, "nativeRegistrant": generated_registrant_hashes(mobile),
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
        require(isinstance(item, str) or isinstance(item, dict) and len(item) == 1)
        signature, dependencies = (item, []) if isinstance(item, str) else next(iter(item.items()))
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
    require(value.endswith("  end\nend\n"))
    return value[:-len("end\n")] + f"""
  pod_project = installer.pods_project
  verifier = pod_project.targets.find {{ |target| target.name == {json.dumps(PODS_GATE_TARGET)} }}
  unless verifier
    verifier = pod_project.new_aggregate_target({json.dumps(PODS_GATE_TARGET)}, [], :ios, $iOSVersion)
    verifier.build_configurations.each do |config|
      config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
    end
    phase = verifier.new_shell_script_build_phase({json.dumps(PODS_GATE_TARGET)})
    phase.shell_script = {json.dumps(PODS_GATE_SCRIPT)}
    phase.always_out_of_date = '1'
  end
  pod_project.targets.reject {{ |target| target == verifier }}.each {{ |consumer| consumer.add_dependency(verifier) }}
end
"""


def pods_project_selection(project):
    program = """
require 'xcodeproj'
require 'digest'
project = Xcodeproj::Project.open(ARGV[0])
gate = project.targets.select { |target| target.name == ARGV[1] }
raise ArgumentError unless gate.length == 1
gate = gate.first
raise ArgumentError unless gate.isa == 'PBXAggregateTarget' && gate.dependencies.empty?
phases = gate.shell_script_build_phases
raise ArgumentError unless phases.length == 1 && phases.first.shell_script == ARGV[2] &&
  phases.first.always_out_of_date == '1'
consumers = project.targets - [gate]
raise ArgumentError if consumers.empty? || consumers.any? { |target| !target.dependency_for_target(gate) }
raise ArgumentError unless consumers.map(&:name).uniq.length == consumers.length
# CocoaPods assigns stable IDs before post_install. Normalize only IDs that the
# verification hook creates later, while keeping every reference and setting.
ids = {
  gate.uuid => 'settleora-gate-target',
  gate.build_configuration_list.uuid => 'settleora-gate-configurations',
  phases.first.uuid => 'settleora-gate-phase',
}
gate.build_configurations.each do |config|
  ids[config.uuid] = "settleora-gate-config-#{config.name}"
end
consumers.each do |target|
  dependency = target.dependency_for_target(gate)
  ids[dependency.uuid] = "settleora-gate-dependency-#{target.name}"
  ids[dependency.target_proxy.uuid] = "settleora-gate-proxy-#{target.name}"
end
raise ArgumentError unless ids.values.uniq.length == ids.length
def stable(value, ids)
  case value
  when Hash then value.to_h { |key, item| [ids.fetch(key, key), stable(item, ids)] }.sort.to_h
  when Array then value.map { |item| stable(item, ids) }
  when String then ids.fetch(value, value)
  else value
  end
end
print JSON.generate({'targetCount' => consumers.length,
                     'sha256' => Digest::SHA256.hexdigest(JSON.generate(stable(project.to_hash, ids)))})
"""
    selected = json.loads(ruby_json(program, project, PODS_GATE_TARGET, PODS_GATE_SCRIPT))
    require(type(selected["targetCount"]) is int and selected["targetCount"] > 0
            and re.fullmatch(r"[0-9a-f]{64}", selected["sha256"]))
    return selected


def verified_xcode_workspace(ios):
    # Pinned Flutter selects the first visible project and workspace in ios/.
    for suffix, name in ((".xcodeproj", "Runner.xcodeproj"), (".xcworkspace", "Runner.xcworkspace")):
        require({item.name for item in ios.iterdir() if item.suffix == suffix and not item.name.startswith(".")}
                == {name})
    workspace = ios / "Runner.xcworkspace"
    require(workspace.is_dir() and workspace.resolve(strict=True) == workspace)
    contents = workspace / "contents.xcworkspacedata"
    require(contents.is_file() and not contents.is_symlink() and 0 < contents.stat().st_size <= 16 * 1024)
    raw = contents.read_bytes()
    require(b"<!DOCTYPE" not in raw)
    root = ElementTree.fromstring(raw)
    require(root.tag == "Workspace" and root.attrib == {"version": "1.0"})
    expected = ["Runner.xcodeproj", "Pods/Pods.xcodeproj"]
    locations = []
    for reference in root:
        require(reference.tag == "FileRef" and len(reference) == 0 and set(reference.attrib) == {"location"})
        locations.append(reference.attrib["location"])
    require(sorted(locations) == sorted("group:" + name for name in expected))
    for name in expected:
        project = ios / name
        require(project.is_dir() and project.resolve(strict=True) == project)
        file = project / "project.pbxproj"
        require(file.is_file() and not file.is_symlink())
    return sorted(locations)


def runner_verifier_script(repo):
    return f'/usr/bin/env python3 -I -B "{repo}/tools/ocr-models/prepare-ios-arm64-acceptance.py" verify-runner-build'


def runner_build_selection(project, verifier_script=None):
    program = """
require 'xcodeproj'
project = Xcodeproj::Project.open(ARGV[0])
raise ArgumentError unless project.targets.map(&:name).sort == ['Runner', 'RunnerTests']
keys = JSON.parse(ARGV[1])
expected_verifier = JSON.parse(ARGV[2])
runner = project.targets.find { |target| target.name == 'Runner' }
verifiers = runner.build_phases.each_index.select do |index|
  runner.build_phases[index].display_name == 'Verify OCR test Pods'
end
if expected_verifier
  raise ArgumentError unless verifiers.length == 1
  index = verifiers.first
  expected = {'isa' => 'PBXShellScriptBuildPhase', 'name' => 'Verify OCR test Pods',
              'inputPaths' => [], 'outputPaths' => [], 'files' => [], 'shellPath' => '/bin/sh',
              'shellScript' => expected_verifier, 'buildActionMask' => '2147483647',
              'runOnlyForDeploymentPostprocessing' => '0', 'alwaysOutOfDate' => '1'}
  raise ArgumentError unless runner.build_phases[index].to_hash == expected &&
    runner.build_phases[index + 1]&.display_name == 'Run Script'
else
  raise ArgumentError unless verifiers.empty?
end
tracked = ['Run Script', 'Thin Binary', 'Copy OCR acceptance fixtures', 'Embed OCR network interposer']
def configured_inputs(configurations, keys)
  configurations.sort_by(&:name).to_h do |config|
    [config.name, config.build_settings.select { |key, _value| keys.include?(key.split('[', 2).first) }]
  end
end
def file_selection(reference, base)
  selected = [reference.isa, reference.real_path.relative_path_from(base).to_s]
  if reference.respond_to?(:children)
    selected << reference.children.map { |child| file_selection(child, base) }
  end
  selected
end
seen = []
targets = project.targets.sort_by(&:name).to_h do |target|
  phases = target.build_phases.filter_map do |phase|
    case phase.isa
    when 'PBXSourcesBuildPhase', 'PBXResourcesBuildPhase'
      [phase.isa, phase.files.map { |input| [file_selection(input.file_ref, project.path.dirname), input.settings] }]
    when 'PBXShellScriptBuildPhase'
      if tracked.include?(phase.name)
        raise ArgumentError unless target.name == 'Runner' && phase.files.empty?
        seen << phase.name
        phase.to_hash
      end
    end
  end
  [target.name, {'phases' => phases, 'settings' => configured_inputs(target.build_configurations, keys)}]
end
raise ArgumentError unless seen.sort == tracked.sort
print JSON.generate({'targets' => targets, 'settings' => configured_inputs(project.build_configurations, keys)})
"""
    data = json.loads(ruby_json(program, project, json.dumps(RUNNER_INPUT_SETTINGS), json.dumps(verifier_script)))
    return sha(json.dumps(data, sort_keys=True).encode())


def runner_input_settings(settings):
    selected = {key: settings.get(key, "") for key in RUNNER_INPUT_SETTINGS}
    require(all(isinstance(value, str) and len(value) <= 16384 for value in selected.values()))
    return selected


def effective_runner_inputs(ios):
    observed = {}
    for name, extension in (("Runner", ".app"), ("RunnerTests", ".xctest")):
        raw = subprocess.check_output(
            ["xcodebuild", "-project", str(ios / "Runner.xcodeproj"), "-target", name,
             "-configuration", "Debug", "-sdk", "iphonesimulator", "-showBuildSettings", "-json"],
            cwd=ios, stderr=subprocess.PIPE, timeout=45,
        )
        rows = [row for row in json.loads(raw) if row["target"] == name]
        require(len(rows) == 1)
        selected = runner_input_settings(rows[0]["buildSettings"])
        require(selected["PRODUCT_NAME"] == selected["EXECUTABLE_NAME"] == name
                and selected["FULL_PRODUCT_NAME"] == name + extension)
        observed[name] = selected
    require(observed["Runner"]["PRODUCT_BUNDLE_IDENTIFIER"] == RUNNER_BUNDLE_ID)
    bridge = observed["Runner"]["SWIFT_OBJC_BRIDGING_HEADER"]
    require((ios / bridge).resolve(strict=True) == ios / "Runner/Runner-Bridging-Header.h")
    require(all(not selected[key].strip() for selected in observed.values()
                for key in ("EXCLUDED_SOURCE_FILE_NAMES", "INCLUDED_SOURCE_FILE_NAMES")))
    return observed


def pods_build_selection(ios, paths, plugin_inputs, verifier_script=None):
    workspace = verified_xcode_workspace(ios)
    pods = ios / "Pods"
    project = pods / "Pods.xcodeproj/project.pbxproj"
    support = pods / "Target Support Files"

    def resolve(value):
        value = value.strip().strip('"')
        prefix = "${PODS_ROOT}/"
        require(value.startswith(prefix))
        return (pods / value[len(prefix):]).resolve(strict=True)

    expected = {name: Path(value) for name, value in paths.items()}
    expected.update({name: Path(row["root"]) / row["sourceDir"] for name, row in plugin_inputs["nativeSources"].items()})
    for name, source in expected.items():
        configurations = tuple((support / name).glob("*.xcconfig"))
        require(configurations)
        for config in configurations:
            require(config.is_file() and not config.is_symlink() and config.stat().st_size <= 64 * 1024)
            roots = re.findall(r"(?m)^PODS_TARGET_SRCROOT\s*=\s*(.+)$", config.read_text())
            require(len(roots) == 1 and resolve(roots[0]) == source)
    for name, framework in (("OpenCV", "opencv2.xcframework"), ("onnxruntime-c", "onnxruntime.xcframework")):
        inputs = support / name / (name + "-xcframeworks-input-files.xcfilelist")
        require(inputs.is_file() and not inputs.is_symlink() and inputs.stat().st_size <= 64 * 1024)
        declared = {resolve(line) for line in inputs.read_text().splitlines() if line.strip()}
        require(declared == {support / name / (name + "-xcframeworks.sh"), expected[name] / framework})
    require(project.is_file() and not project.is_symlink() and 0 < project.stat().st_size <= 4 * 1024 * 1024)
    generated = bounded_tree_files(support)
    return {"workspaceProjects": workspace, "podsProject": pods_project_selection(project.parent),
            "runnerBuildSelectionSha256": runner_build_selection(ios / "Runner.xcodeproj", verifier_script),
            "targetSupportFilesSha256": sha(json.dumps(generated, sort_keys=True).encode())}


class ProtectedSourceRejection(ValueError):
    def __init__(self, reason, relative):
        super().__init__("ios_arm64_acceptance_setup_rejected")
        self.observation = f"{reason}:{sha(relative.encode())}"


def git_source_types(base, repo):
    modes = {b"100644": stat.S_IFREG, b"100755": stat.S_IFREG, b"120000": stat.S_IFLNK}
    output = base.git(repo, "ls-tree", "-rz", os.environ["EXPECTED_HEAD"])
    types = {}
    for entry in output.rstrip(b"\0").split(b"\0"):
        metadata, name = entry.split(b"\t", 1)
        mode, kind, _ = metadata.split(b" ")
        require(kind == b"blob" and mode in modes)
        types[name.decode()] = modes[mode]
    return types


def verify_protected_source(target, tracked, source_types):
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
        try:
            ancestor = target
            for part in path.parts[:-1]:
                ancestor /= part
                if not stat.S_ISDIR(ancestor.lstat().st_mode):
                    raise ProtectedSourceRejection("unexpected_type", relative)
            file_type = stat.S_IFMT(file.lstat().st_mode)
            if file_type != source_types[relative]:
                raise ProtectedSourceRejection("unexpected_type", relative)
            raw = os.readlink(file).encode() if file_type == stat.S_IFLNK else file.read_bytes()
        except FileNotFoundError:
            raise ProtectedSourceRejection("missing", relative) from None
        except OSError:
            raise ProtectedSourceRejection("read_error", relative) from None
        if sha(raw) != digest:
            raise ProtectedSourceRejection("hash_mismatch", relative)
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


def observe_preparation_phase(phase):
    print(f"ios_arm64_preparation_phase={phase}", flush=True)


def verify_projected_detached_source(target, tracked, source_types):
    observe_preparation_phase("verify_projected_detached_source")
    try:
        return verify_protected_source(target, tracked, source_types)
    except ProtectedSourceRejection as exc:
        print(f"ios_arm64_detached_source_failure={exc.observation}", flush=True)
        raise


def prepare(repo, root, target, manifest):
    observe_preparation_phase("prepare_flutter_toolchain")
    require(not root.exists() and not root.is_symlink())
    root.mkdir(mode=0o700)
    deadline = time.time() + MAX_SECONDS
    base = module(repo / "tools/ocr-models/ios-paddle-arm64-compatibility.py", "full101_dependencies")
    tracked = base.verify_source(repo, os.environ["EXPECTED_HEAD"], deadline)
    source_types = git_source_types(base, repo)
    require(subprocess.check_output(["xcodebuild", "-version"], text=True).strip() == "Xcode 16.4\nBuild version 16F6")
    require(subprocess.check_output(["pod", "--version"], text=True).strip() == "1.17.0")
    base.execute(["flutter", "precache", "--ios"], repo, root, deadline, "flutter-precache")
    flutter = json.loads(subprocess.check_output(["flutter", "--version", "--machine"], text=True))
    require(all(flutter[key] == value for key, value in manifest["flutter"].items())
            and flutter["dartSdkVersion"] == "3.12.2")
    sdk = Path(subprocess.check_output(["which", "flutter"], text=True).strip()).resolve().parents[1]
    base.macho_platforms((base.simulator_framework(sdk / "bin/cache/artifacts/engine/ios/Flutter.xcframework") / "Flutter").read_bytes())
    observe_preparation_phase("fetch_projected_native_sources")
    source = {}
    extracted_total = 0
    for name, item in manifest["archives"].items():
        archive = root / (name + (".zip" if item["url"].endswith(".zip") else ".tar.gz"))
        base.download(item, archive, deadline)
        extracted = root / name
        extracted_total += base.extract_archive(archive, extracted)
        require(extracted_total <= base.MAX_EXTRACTED)
        source[name] = extracted
    observe_preparation_phase("build_projected_opencv")
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
    observe_preparation_phase("verify_projected_native_frameworks")
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
    observe_preparation_phase("project_flutter_native_plugins")
    mobile = target / "apps/mobile"
    lock = mobile / "ios/Podfile.lock"
    require(sha(lock.read_bytes()) == PRODUCTION_LOCK_SHA256)
    production_lock = lock.read_bytes()
    (root / "production-Podfile.lock").write_bytes(production_lock)
    original_podfile = (mobile / "ios/Podfile").read_text()
    require(original_podfile.encode() == (repo / "apps/mobile/ios/Podfile").read_bytes())
    observe_preparation_phase("project_flutter_package_config")
    pub_cache = Path(os.environ.get("PUB_CACHE", str(Path.home() / ".pub-cache"))).resolve(strict=True)
    approved_roots = {"google_mlkit_commons": target / "packages/google_mlkit_commons",
                      "google_mlkit_text_recognition": pub_cache / "hosted/pub.dev/google_mlkit_text_recognition-0.15.1"}
    package_proof = project_packages(mobile / ".dart_tool/package_config.json", root / "flutter-packages", approved_roots)
    plugin_refresh = regenerate_native_plugins(base, sdk, mobile, root, deadline)
    observe_preparation_phase("verify_projected_plugin_inventory")
    plugin_inputs = ios_plugin_inputs(mobile)
    observe_preparation_phase("derive_projected_pod_sources")
    paths = {"OpenCV": str(output), "onnxruntime-c": str(source["ort-c"]),
             "onnxruntime-objc": str(source["ort-objc"]), "Yams": str(base.single_directory(source["yams"]))}
    (mobile / "ios/Podfile").write_text(derive_podfile(original_podfile, paths))
    debug = mobile / "ios/Flutter/Debug.xcconfig"
    original_debug = debug.read_bytes()
    require(sha(original_debug) in DEBUG_BASE_HASHES)
    debug.write_bytes(original_debug + ARCH_CONFIG)
    protected = verify_projected_detached_source(target, tracked, source_types)
    observe_preparation_phase("hash_projected_native_pod_inputs")
    proof = {"schemaVersion": 1, "sourceHead": os.environ["EXPECTED_HEAD"], "architecture": "arm64",
             "root": str(root), "target": str(target), "referenceManifestSha256": REFERENCE_SHA256,
             "flutterSdk": str(sdk),
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
    observe_preparation_phase("verify_projected_candidate_checkout")
    require(base.verify_source(repo, os.environ["EXPECTED_HEAD"], deadline) == tracked)
    (root / "setup.json").write_text(json.dumps(proof, indent=2) + "\n")
    observe_preparation_phase("seed_projected_pod_lock")
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
    observe_preparation_phase("configure_projected_ios_app")
    base.execute(["flutter", "build", "ios", "--config-only", "--simulator", "--debug", "--no-pub"],
                 mobile, root, deadline, "flutter-plugin-selection")
    require(sha((mobile / "pubspec.lock").read_bytes()) == proof["pubspecLockSha256"])
    verify_pod_projection(production, read_yaml(lock), test_paths, checksums, podfile_checksum)
    observe_preparation_phase("install_projected_pods")
    base.execute(["pod", "install", "--deployment", "--no-repo-update"], mobile / "ios", root, deadline, "test-pods")
    observe_preparation_phase("verify_projected_xcode_configuration")
    proof["podsBuildSelection"] = pods_build_selection(mobile / "ios", paths, plugin_inputs)
    require(proof["podsBuildSelection"]["runnerBuildSelectionSha256"]
            == runner_build_selection(repo / "apps/mobile/ios/Runner.xcodeproj"))
    proof["runnerVerifierScript"] = runner_verifier_script(repo)
    proof["runnerEffectiveInputs"] = effective_runner_inputs(mobile / "ios")
    runner_settings = proof["runnerEffectiveInputs"]["Runner"]
    require(Path(runner_settings["FLUTTER_APPLICATION_PATH"]).resolve(strict=True) == mobile
            and Path(runner_settings["FLUTTER_ROOT"]).resolve(strict=True) == sdk)
    (root / "setup.json").write_text(json.dumps(proof, indent=2) + "\n")
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
    require(verify_protected_source(target, proof["protectedSource"], git_source_types(base, repo))
            == proof["protectedSource"])
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
    require(generated_registrant_hashes(mobile) == proof["nativePluginRefresh"]["nativeRegistrant"])
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
        verifier = None if stage == "prepared" else proof["runnerVerifierScript"]
        require(pods_build_selection(ios, proof["localPodPaths"], plugin_inputs, verifier) == proof["podsBuildSelection"])
        require(effective_runner_inputs(ios) == proof["runnerEffectiveInputs"])
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
                      podsBuildSelection=proof["podsBuildSelection"],
                      runnerEffectiveInputsSha256=sha(json.dumps(proof["runnerEffectiveInputs"], sort_keys=True).encode()),
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
    require(pods_build_selection(mobile / "ios", setup["localPodPaths"], observed,
                                 setup["runnerVerifierScript"]) == proof["podsBuildSelection"])
    print("ios_full101_arm64_build_pods=verified")


def verify_runner_build(root, target):
    verify_build_pods(root, target)
    proof = json.loads((root / "setup.json").read_bytes())
    require(os.environ.get("TARGET_NAME") == "Runner" and os.environ.get("CONFIGURATION") == "Debug"
            and os.environ.get("PLATFORM_NAME") == "iphonesimulator")
    require(runner_input_settings(os.environ) == proof["runnerEffectiveInputs"]["Runner"])
    mobile = target / "apps/mobile"
    require(generated_registrant_hashes(mobile) == proof["nativePluginRefresh"]["nativeRegistrant"])
    verify_flutter_build_target(root, mobile, Path(proof["flutterSdk"]), os.environ)


def verify_flutter_build_target(root, mobile, sdk, settings):
    require(Path(settings["FLUTTER_APPLICATION_PATH"]).resolve(strict=True) == mobile)
    require(Path(settings["FLUTTER_ROOT"]).resolve(strict=True) == sdk)
    entrypoint = Path(settings.get("FLUTTER_TARGET", "lib/main.dart"))
    if not (root.parent / "first-ios-acceptance-runner.app").exists():
        require((mobile / entrypoint).resolve(strict=True) == mobile / "lib/main.dart")
        return
    listener_root = root.parent / "settleora-ocr-flutter-test"
    require(entrypoint.is_absolute() and entrypoint.name == "listener.dart"
            and entrypoint.parent.name.startswith("flutter_test_listener.")
            and entrypoint.parent.parent.resolve(strict=True) == listener_root.resolve(strict=True)
            and not entrypoint.is_symlink() and entrypoint.is_file()
            and entrypoint.resolve(strict=True).is_relative_to(listener_root.resolve(strict=True))
            and 0 < entrypoint.stat().st_size <= 16 * 1024)
    source = entrypoint.read_text()
    expected_test = (mobile / OCR_TEST).as_uri()
    imports = re.findall(r"(?m)^import '([^'\n]+)' as test;$", source)
    require(imports == [expected_test] and "IntegrationTestWidgetsFlutterBinding.ensureInitialized();" in source
            and "await Future(test.main);" in source)
    configurations = re.findall(r"(?m)^const packageConfigLocation = '([^'\n]+)';$", source)
    require(len(configurations) == 1)
    config = urlparse(configurations[0])
    require(config.scheme in ("", "file") and not (config.netloc or config.params or config.query or config.fragment))
    require((mobile / unquote(config.path)).resolve(strict=True) == mobile / ".dart_tool/package_config.json")


def retire_first_bundle(target, temporary):
    bundle = target / RUNNER_APP
    saved = temporary / "first-ios-acceptance-runner.app"
    require(bundle.is_dir() and bundle.resolve(strict=True) == bundle and not saved.exists() and not saved.is_symlink())
    bundle.rename(saved)
    require(not bundle.exists() and not bundle.is_symlink())


def read_bundled_plist(path, bundle):
    require(path.is_file() and path.stat().st_size <= 1024 * 1024
            and path.resolve(strict=True).is_relative_to(bundle))
    try:
        values = plistlib.loads(path.read_bytes())
    except (ExpatError, AttributeError, IndexError):
        # Malformed XML plist values can raise errors from parser callbacks.
        raise ValueError("Invalid bundled plist") from None
    require(isinstance(values, dict))
    return values


def verify_bundled_models(mobile, bundle):
    source_catalog = mobile / MODEL_ASSET_DIRECTORY / "catalog.json"
    original = source_catalog.read_bytes()
    catalog = json.loads(original)
    assets = {MODEL_ASSET_DIRECTORY / "catalog.json": (len(original), sha(original))}
    for pack in catalog["packs"]:
        directory = Path(pack["assetDirectory"])
        require(directory.is_relative_to(MODEL_ASSET_DIRECTORY) and ".." not in directory.parts)
        for file in pack["files"]:
            require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", file["name"]))
            asset = directory / file["name"]
            require(asset not in assets and type(file["bytes"]) is int
                    and 0 < file["bytes"] <= 128 * 1024 * 1024 and re.fullmatch(r"[0-9a-f]{64}", file["sha256"]))
            assets[asset] = (file["bytes"], file["sha256"])
    require(len(assets) == 17)

    frameworks = bundle / "Frameworks"
    framework = frameworks / "App.framework"

    # The pinned embedder selects the private framework with this identifier,
    # falls back to the main bundle, and then derives the lookup key prefix.
    infos = [read_bundled_plist(directory / "Info.plist", bundle)
             for directory in frameworks.iterdir() if not directory.name.startswith(".")
             and (directory / "Info.plist").is_file()]
    selected = [info for info in infos if info.get("CFBundleIdentifier") == "io.flutter.flutter.app"]
    require(len(selected) <= 1)
    settings = selected[0] if selected else read_bundled_plist(bundle / "Info.plist", bundle)
    prefix = Path(settings.get("FLTAssetsPath", "Frameworks/App.framework/flutter_assets"))
    require(prefix.parts and not prefix.is_absolute() and ".." not in prefix.parts)
    roots = [bundle, *sorted(bundle.glob("*.lproj"))]
    require(len(roots) <= 128)
    for asset, (size, digest) in assets.items():
        key = prefix / asset
        # Match the Swift lookup order. Verify every present copy so a localized
        # resource or a higher-precedence copy cannot shadow verified bytes.
        candidates = [*(root / key for root in roots), bundle / asset.relative_to("assets"), framework / key]
        present = [path for path in candidates if path.exists() or path.is_symlink()]
        require(present)
        for path in present:
            require(path.is_file() and not path.is_symlink() and path.resolve(strict=True).is_relative_to(bundle)
                    and path.stat().st_size == size)
            require(sha_file(path, size) == digest)


def verify_test_bundle(repo, target, temporary):
    base = module(repo / "tools/ocr-models/ios-paddle-arm64-compatibility.py", "full101_test_bundle")
    bundle = target / RUNNER_APP
    saved = temporary / "first-ios-acceptance-runner.app"
    # Flutter 3.44.8 installs the newly built simulator bundle at RUNNER_APP
    # when the verified product name is Runner. Keep its normal uninstall step.
    require(saved.is_dir() and saved.resolve(strict=True) == saved)
    require(bundle.is_dir() and bundle.resolve(strict=True) == bundle)
    require((bundle.stat().st_dev, bundle.stat().st_ino) != (saved.stat().st_dev, saved.stat().st_ino))
    info = bundle / "Info.plist"
    require(not info.is_symlink())
    values = read_bundled_plist(info, bundle)
    require(values["CFBundleIdentifier"] == RUNNER_BUNDLE_ID and values["CFBundleExecutable"] == "Runner")
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
    fixtures = repo / "apps/mobile/test/fixtures/receipt_ocr"
    expected_files = bounded_tree_files(fixtures)
    manifest = json.loads((fixtures / "manifest.json").read_bytes())
    declared = {row["file"] for row in manifest["fixtures"]}
    require(len(manifest["fixtures"]) == len(declared) == 101 and declared <= expected_files.keys())
    require(bounded_tree_files(bundle / "receipt_ocr_acceptance") == expected_files)
    verify_bundled_models(repo / "apps/mobile", bundle)
    print("ios_full101_test_bundle_arm64=verified")


def main():
    if sys.argv[1:] == ["verify-build-pods"]:
        _, root, target, _ = context()
        verify_build_pods(root, target)
        return
    if sys.argv[1:] == ["verify-runner-build"]:
        _, root, target, _ = context()
        verify_runner_build(root, target)
        return
    if sys.argv[1:] == ["retire-first-bundle"]:
        _, root, target, _ = context()
        retire_first_bundle(target, root.parent)
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
    # This CLI also runs directly in Xcode. Exceptions can contain private
    # paths or input values, so its error output is a single fixed marker.
    except Exception:
        sys.stderr.write("ios_arm64_acceptance_setup_rejected\n")
        sys.exit(98)


if __name__ == "__main__":
    run_cli()
