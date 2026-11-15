import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "prepare-ios-arm64-acceptance.py"
spec = importlib.util.spec_from_file_location("arm64_full101", MODULE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Arm64FlutterAcceptance(unittest.TestCase):
    def plugin(self, name):
        return {"name": name, "version": m.DISABLED_IOS_PLUGINS[name],
                "dependencies": {"flutter": {"sdk": "flutter"}},
                "flutter": {"plugin": {"platforms": {
                    "android": {"package": "real.android", "pluginClass": "ActualPlugin"},
                    "ios": {"pluginClass": "ActualPlugin"}}}}}

    def write_projected_plugins(self, mobile):
        links = mobile / "ios/.symlinks/plugins"
        links.mkdir(parents=True)
        records = []
        for name in ("integration_test", "image_picker_ios", "file_picker",
                     "flutter_secure_storage_darwin", "path_provider_foundation"):
            package = mobile.parent / "pub-cache" / name
            package.mkdir(parents=True)
            native = name != "path_provider_foundation"
            shared = name == "flutter_secure_storage_darwin"
            records.append(dict(name=name, path=str(package), native_build=native, shared_darwin_source=shared))
            if native:
                source = package / ("darwin" if shared else "ios")
                source.mkdir()
                (source / (name + ".podspec")).write_text("fixture podspec\n")
                (source / "Plugin.swift").write_text("fixture Swift\n")
                (links / name).symlink_to(package)
        (mobile / ".flutter-plugins-dependencies").write_text(json.dumps({
            "swift_package_manager_enabled": {"ios": False}, "plugins": {"ios": records},
        }))

    def test_native_selection_changes_only_ios_registration(self):
        for name in m.DISABLED_IOS_PLUGINS:
            original = self.plugin(name)
            expected = copy.deepcopy(original)
            del expected["flutter"]["plugin"]["platforms"]["ios"]
            self.assertEqual(m.project_plugin_spec(original, name), expected)
            self.assertIn("ios", original["flutter"]["plugin"]["platforms"])
            for field, value in [("version", "999.0.0"), ("name", "unrelated")]:
                wrong = copy.deepcopy(original); wrong[field] = value
                with self.assertRaises(ValueError): m.project_plugin_spec(wrong, name)

    def test_real_dart_files_and_other_package_config_entries_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); roots = {}; entries = []
            for name in m.DISABLED_IOS_PLUGINS:
                source = root / name; source.mkdir(); (source / "lib").mkdir()
                (source / "lib/actual.dart").write_text("class RealProvider {}\n")
                (source / "pubspec.yaml").write_text(json.dumps(self.plugin(name)))
                (source / "pubspec.yaml").chmod(0o444)
                roots[name] = source
                entries.append({"name": name, "rootUri": source.as_uri() + "/", "packageUri": "lib/", "languageVersion": "3.0"})
            entries.append({"name": "integration_test", "rootUri": "file:///real/flutter/integration_test/", "packageUri": "lib/"})
            config = root / "package_config.json"; original = {"configVersion": 2, "packages": entries}
            config.write_text(json.dumps(original))
            proof = m.project_packages(config, root / "clones", roots)
            for name, source in roots.items():
                clone = Path(proof["packages"][name]["clone"])
                self.assertEqual((clone / "lib/actual.dart").read_bytes(), (source / "lib/actual.dart").read_bytes())
                self.assertNotIn("ios", json.loads((clone / "pubspec.yaml").read_bytes())["flutter"]["plugin"]["platforms"])
                self.assertIn("ios", json.loads((source / "pubspec.yaml").read_bytes())["flutter"]["plugin"]["platforms"])
            self.assertEqual(proof["projectedConfig"]["packages"][-1], original["packages"][-1])
            # A mismatched source URI cannot make preparation walk arbitrary home data.
            with self.assertRaises(ValueError): m.project_packages(config, root / "wrong", roots)

    def graph(self):
        paths = {name: "/owned/" + name for name in m.LOCAL_PODS}
        paths["integration_test"] = ".symlinks/plugins/integration_test/ios"
        checks = {name: "b" * 40 for name in paths}
        production = {
            "PODS": ["Flutter (1.0.0)", {"image_picker_ios (0.0.1)": ["Flutter", "SharedUtility"]},
                     "SharedUtility (1.0.0)", {"google_mlkit_commons (0.11.1)": ["Flutter", "MLKitVision"]},
                     {"google_mlkit_text_recognition (0.15.1)": ["google_mlkit_commons", "MLKitVision"]},
                     {"MLKitVision (10.0.0)": ["SharedUtility"]}, "onnxruntime-c (1.24.3)",
                     {"onnxruntime-objc (1.24.3)": ["onnxruntime-objc/Core (= 1.24.3)"]},
                     {"onnxruntime-objc/Core (1.24.3)": ["onnxruntime-c (= 1.24.3)"]}, "OpenCV (4.3.0)", "Yams (5.0.6)"],
            "DEPENDENCIES": ["Flutter (from `Flutter`)", "image_picker_ios (from `.symlinks/plugins/image_picker_ios/ios`)",
                             "google_mlkit_commons (from `.symlinks/plugins/google_mlkit_commons/ios`)",
                             "google_mlkit_text_recognition (from `.symlinks/plugins/google_mlkit_text_recognition/ios`)",
                             "onnxruntime-objc (= 1.24.3)", "OpenCV (= 4.3.0)", "Yams (= 5.0.6)"],
            "SPEC REPOS": {"trunk": ["MLKitVision", "SharedUtility", "onnxruntime-c", "onnxruntime-objc", "OpenCV", "Yams"]},
            "EXTERNAL SOURCES": {name: {"path": path} for name, path in {
                "Flutter": "Flutter", "image_picker_ios": ".symlinks/plugins/image_picker_ios/ios",
                "google_mlkit_commons": ".symlinks/plugins/google_mlkit_commons/ios",
                "google_mlkit_text_recognition": ".symlinks/plugins/google_mlkit_text_recognition/ios"}.items()},
            "SPEC CHECKSUMS": {name: "a" * 40 for name in ["Flutter", "image_picker_ios", "SharedUtility", "google_mlkit_commons", "google_mlkit_text_recognition", "MLKitVision", "onnxruntime-c", "onnxruntime-objc", "OpenCV", "Yams"]},
            "PODFILE CHECKSUM": "c" * 40, "COCOAPODS": "1.17.0"}
        actual = {
            "PODS": ["Flutter (1.0.0)", {"image_picker_ios (0.0.1)": ["Flutter", "SharedUtility"]},
                     "SharedUtility (1.0.0)", "onnxruntime-c (1.24.3)",
                     {"onnxruntime-objc (1.24.3)": ["onnxruntime-objc/Core (= 1.24.3)"]},
                     {"onnxruntime-objc/Core (1.24.3)": ["onnxruntime-c (= 1.24.3)"]},
                     "OpenCV (4.12.0)", "Yams (5.0.6)", {"integration_test (0.0.1)": ["Flutter"]}],
            "DEPENDENCIES": ["Flutter (from `Flutter`)", "image_picker_ios (from `.symlinks/plugins/image_picker_ios/ios`)"] + [name + " (from `" + value + "`)" for name, value in paths.items()],
            "SPEC REPOS": {"trunk": ["SharedUtility"]},
            "EXTERNAL SOURCES": {"Flutter": {"path": "Flutter"}, "image_picker_ios": {"path": ".symlinks/plugins/image_picker_ios/ios"}, **{name: {"path": value} for name, value in paths.items()}},
            "SPEC CHECKSUMS": {"Flutter": "a" * 40, "image_picker_ios": "a" * 40, "SharedUtility": "a" * 40, **checks},
            "PODFILE CHECKSUM": "d" * 40, "COCOAPODS": "1.17.0"}
        return production, actual, paths, checks

    def test_graph_preserves_shared_and_every_unrelated_native_dependency(self):
        source, actual, paths, checks = self.graph()
        result = m.verify_pod_projection(source, actual, paths, checks, "d" * 40)
        self.assertTrue(result["allOtherPodsVersionsChecksumsAndSourcesExact"])
        for change in [lambda x: x["PODS"].append("Unexpected (1.0.0)"),
                       lambda x: x["PODS"].remove("SharedUtility (1.0.0)"),
                       lambda x: x["SPEC CHECKSUMS"].update(image_picker_ios="e" * 40),
                       lambda x: x["EXTERNAL SOURCES"].update(Flutter={"path": "/wrong"}),
                       lambda x: x.update(COCOAPODS="9.0"),
                       lambda x: x.update(**{"PODFILE CHECKSUM": "e" * 40}),
                       lambda x: x["PODS"].append("MLKitVision (10.0.0)")]:
            modified = copy.deepcopy(actual); change(modified)
            with self.assertRaises(ValueError): m.verify_pod_projection(source, modified, paths, checks, "d" * 40)

    def test_installed_pod_manifest_matches_the_verified_graph_across_builds(self):
        with tempfile.TemporaryDirectory() as directory:
            ios = Path(directory)
            lock = ios / "Podfile.lock"
            manifest = ios / "Pods/Manifest.lock"
            manifest.parent.mkdir()
            lock.write_bytes(b"original graph")
            with self.assertRaises(FileNotFoundError):
                m.verified_installed_pod_lock(ios)
            manifest.write_bytes(b"original graph")
            digest = m.verified_installed_pod_lock(ios)
            self.assertEqual(digest, m.sha(b"original graph"))
            self.assertEqual(m.verified_installed_pod_lock(ios, digest), digest)
            manifest.write_bytes(b"changed installed graph")
            with self.assertRaises(ValueError):
                m.verified_installed_pod_lock(ios, digest)
            lock.write_bytes(manifest.read_bytes())
            with self.assertRaises(ValueError):
                m.verified_installed_pod_lock(ios, digest)

    def test_podfile_projection_is_test_only_and_rejects_unexpected_input(self):
        source = MODULE.parents[2] / "apps/mobile/ios/Podfile"
        original = source.read_text(); paths = {name: "/owned/" + name for name in m.LOCAL_PODS}
        result = m.derive_podfile(original, paths)
        self.assertIn("ARCHS", result); self.assertIn("'arm64'", result)
        self.assertIn("flutter_install_all_ios_pods", result)
        self.assertIn("target 'RunnerTests'", result)
        self.assertIn("use_frameworks!", result)
        self.assertEqual(source.read_text(), original)
        with self.assertRaises(ValueError): m.derive_podfile(original.replace("'4.3.0'", "'unknown'"), paths)
        wrong = dict(paths, OpenCV="/tmp/#{not_code}")
        with self.assertRaises(ValueError): m.derive_podfile(original, wrong)

    def prepare_with_newer_retained_pod_available(self, subspec=False, require_refresh=False):
        # Exercise the real prepare orchestration. Downloads/tool execution and
        # CocoaPods transport are synthetic; this is not macOS qualification.
        production, _, _, _ = self.graph()
        if subspec:
            production["PODS"].append({"SharedUtility/Core (1.0.0)": ["SharedUtility (= 1.0.0)"]})
            production["PODS"][1] = {"image_picker_ios (0.0.1)": ["Flutter", "SharedUtility/Core"]}
        original = copy.deepcopy(production)
        with tempfile.TemporaryDirectory() as directory:
            top = Path(directory).resolve(); repo = top / "repo"; target = top / "target"
            mobile = target / "apps/mobile"; ios = mobile / "ios"; ios.mkdir(parents=True)
            (repo / "apps/mobile/ios").mkdir(parents=True)
            podfile = (MODULE.parents[2] / "apps/mobile/ios/Podfile").read_bytes()
            (repo / "apps/mobile/ios/Podfile").write_bytes(podfile); (ios / "Podfile").write_bytes(podfile)
            lock = ios / "Podfile.lock"; lock.write_text(json.dumps(production)); original_lock = lock.read_bytes()
            (ios / "Flutter").mkdir(); debug = ios / "Flutter/Debug.xcconfig"; debug.write_bytes(b"owned debug base\n")
            (mobile / "pubspec.lock").write_bytes(b"unchanged Dart lock\n")
            (mobile / ".dart_tool").mkdir(); (mobile / ".dart_tool/package_config.json").write_text("{}")
            (ios / "Runner").mkdir(); (ios / "Runner/GeneratedPluginRegistrant.m").write_text("GoogleMlKitCommonsPlugin")
            self.write_projected_plugins(mobile)
            sdk = top / "sdk"; (sdk / "bin").mkdir(parents=True); (sdk / "bin/flutter").write_bytes(b"test tool marker")
            (sdk / "packages/flutter_tools/.dart_tool").mkdir(parents=True)
            (sdk / "packages/flutter_tools/.dart_tool/package_config.json").write_text("{}")
            framework = sdk / "bin/cache/artifacts/engine/ios/Flutter.xcframework/simulator"
            framework.mkdir(parents=True); (framework / "Flutter").write_bytes(b"fixture framework")
            cache = top / "pub-cache"; cache.mkdir(); root = top / "setup"
            manifest = json.loads((MODULE.parent / "ios-paddle-arm64-dependencies.json").read_bytes())
            selected, commands = [], []

            def extract(_archive, destination):
                destination.mkdir()
                if destination.name == "opencv":
                    (destination / "modules/core").mkdir(parents=True)
                    (destination / "modules/imgproc").mkdir(); (destination / "LICENSE").write_bytes(b"fixture license")
                if destination.name == "ort-c":
                    folder = destination / "onnxruntime.xcframework/simulator"; folder.mkdir(parents=True)
                    (folder / "onnxruntime").write_bytes(b"fixture framework")
                return 1

            def execute(argv, *_args):
                commands.append(argv)
                if argv[0].endswith("/bin/dart"):
                    (ios / "Runner/GeneratedPluginRegistrant.m").write_text("IntegrationTestPlugin FLTImagePickerPlugin")
                if "--out" in argv:
                    output = Path(argv[argv.index("--out") + 1]); output.mkdir()
                    folder = output / "opencv2.xcframework/simulator"; folder.mkdir(parents=True)
                    (folder / "opencv2").write_bytes(b"fixture framework")
                if argv[:3] == ["flutter", "build", "ios"] or argv[:2] == ["pod", "install"]:
                    # An unlocked resolver is offered a newer compatible pod.
                    # A present lock keeps its retained direct/transitive pins.
                    nodes = m.pod_nodes(m.read_yaml(lock)) if lock.exists() else {}
                    selected.append(nodes.get("SharedUtility/Core" if subspec else "SharedUtility",
                                              ("SharedUtility (2.0.0)", []))[0])

            def output(argv, **_kwargs):
                if argv[0] == "xcodebuild": return "Xcode 16.4\nBuild version 16F6\n"
                if argv[0] == "pod": return "1.17.0\n"
                if argv[0] == "which": return str(sdk / "bin/flutter") + "\n"
                return json.dumps({**manifest["flutter"], "dartSdkVersion": "3.12.2"})

            base = SimpleNamespace(verify_source=lambda *_: {"owned.dart": "fixed"}, execute=execute,
                                   simulator_framework=lambda path: path / "simulator", macho_platforms=lambda _: [7],
                                   download=lambda *_: None, extract_archive=extract, single_directory=lambda path: path,
                                   MAX_EXTRACTED=768 * 1024 * 1024)
            projection = {"originalConfig": {}, "projectedConfig": {}, "packages": {}}
            with patch.object(m, "module", return_value=base), patch.object(m.subprocess, "check_output", side_effect=output), \
                 patch.object(m, "PRODUCTION_LOCK_SHA256", m.sha(original_lock)), \
                 patch.object(m, "DEBUG_BASE_HASHES", {m.sha(debug.read_bytes())}), \
                 patch.object(m, "project_packages", return_value=projection), \
                 patch.object(m, "verify_protected_source", return_value={"owned.dart": "fixed"}), \
                 patch.object(m, "verify") as verify, \
                 patch.object(m, "ruby_json", side_effect=lambda _program, *args, data=None: json.dumps({name: "b" * 40 for name in json.loads(data)}).encode()), \
                 patch.object(m, "write_pod_lock", create=True, side_effect=lambda path, document: path.write_text(json.dumps(document))), \
                 patch.dict(os.environ, EXPECTED_HEAD="fixture-head", PUB_CACHE=str(cache)):
                m.prepare(repo, root, target, manifest)
                verify.assert_called_once_with(repo, root, target, pods=True)
            expected = "SharedUtility/Core (1.0.0)" if subspec else "SharedUtility (1.0.0)"
            self.assertEqual(selected, [expected, expected])
            if require_refresh:
                refresh = [i for i, argv in enumerate(commands) if argv[0].endswith('/bin/dart')]
                self.assertEqual(len(refresh), 1, 'explicit pinned-SDK native registrant refresh is required without pub get')
                build = next(i for i, argv in enumerate(commands) if argv[:3] == ['flutter', 'build', 'ios'])
                self.assertLess(refresh[0], build)

            self.assertEqual(commands[-1], ["pod", "install", "--deployment", "--no-repo-update"])
            self.assertEqual(m.read_yaml(root / "production-Podfile.lock"), original)
            self.assertEqual(production, original)

    def test_prepare_locks_retained_versions_before_flutter_can_install_pods(self):
        self.prepare_with_newer_retained_pod_available()

    def test_prepare_locks_retained_shared_subspec_before_both_installs(self):
        self.prepare_with_newer_retained_pod_available(subspec=True)

    def test_prepare_explicitly_regenerates_native_registrant_before_no_pub_build(self):
        self.prepare_with_newer_retained_pod_available(require_refresh=True)

    def test_native_plugin_refresh_bootstraps_only_the_missing_sdk_config(self):
        for cached in (False, True):
            with self.subTest(cached=cached), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                mobile, sdk = root / "mobile", root / "sdk"
                config = mobile / ".dart_tool/package_config.json"
                config.parent.mkdir(parents=True)
                config.write_bytes(b"projected config")
                app_lock = mobile / "pubspec.lock"
                app_lock.write_bytes(b"app dependency lock")
                tools = sdk / "packages/flutter_tools"
                tools.mkdir(parents=True)
                sdk_lock = tools / "pubspec.lock"
                sdk_lock.write_bytes(b"SDK dependency lock")
                packages = tools / ".dart_tool/package_config.json"
                if cached:
                    packages.parent.mkdir()
                    packages.write_bytes(b"cached SDK config")
                registrant = mobile / "ios/Runner/GeneratedPluginRegistrant.m"
                registrant.parent.mkdir(parents=True)
                commands = []

                def execute(argv, cwd, _root, _deadline, label):
                    commands.append((argv, cwd, label))
                    if label == "flutter-tool-packages":
                        packages.parent.mkdir()
                        packages.write_bytes(b"generated SDK config")
                    else:
                        self.assertTrue(packages.is_file())
                        registrant.write_text("IntegrationTestPlugin FLTImagePickerPlugin")

                m.regenerate_native_plugins(SimpleNamespace(execute=execute), sdk, mobile, root, 1234)
                expected = [] if cached else [
                    ([str(sdk / "bin/dart"), "--suppress-analytics", "pub", "get", "--enforce-lockfile"],
                     tools, "flutter-tool-packages"),
                ]
                self.assertEqual(commands[:-1], expected)
                self.assertEqual(commands[-1][1:], (mobile, "flutter-native-plugin-refresh"))
                self.assertEqual(commands[-1][0][1], "--packages=" + str(packages))
                self.assertEqual(sdk_lock.read_bytes(), b"SDK dependency lock")
                self.assertEqual(app_lock.read_bytes(), b"app dependency lock")
                self.assertEqual(config.read_bytes(), b"projected config")

    def test_native_plugin_refresh_detects_projected_package_config_rewrites(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); mobile = root / "mobile"; sdk = root / "sdk"
            (mobile / ".dart_tool").mkdir(parents=True)
            config = mobile / ".dart_tool/package_config.json"; config.write_text("projected config")
            (mobile / "pubspec.lock").write_text("unchanged dependency lock")
            (sdk / "packages/flutter_tools/.dart_tool").mkdir(parents=True)
            (sdk / "packages/flutter_tools/.dart_tool/package_config.json").write_text("{}")
            base = SimpleNamespace(execute=lambda *_: config.write_text("pub get erased projection"))
            with self.assertRaises(ValueError):
                m.regenerate_native_plugins(base, sdk, mobile, root, 1234)

    def test_local_pod_checksums_match_cocoapods_sandbox_specifications(self):
        try:
            probe = subprocess.run(["ruby", "-e", "require 'cocoapods'; print Pod::VERSION"],
                                   capture_output=True, text=True, timeout=30)
        except FileNotFoundError:
            self.skipTest("Ruby and CocoaPods 1.17.0 are needed for the serialization check")
        if probe.returncode or probe.stdout != "1.17.0":
            self.skipTest("CocoaPods 1.17.0 is needed for the serialization check")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = {}
            for name, suffix in [("RubyLocal", ".podspec"), ("JsonLocal", ".podspec.json")]:
                path = root / (name + suffix)
                if suffix == ".podspec":
                    path.write_text("Pod::Spec.new { |s| s.name = 'RubyLocal'; "
                                    "s.version = '1.0.0'; s.ios.deployment_target = '15.5' }")
                else:
                    path.write_text('{"name":"JsonLocal","version":"1.0.0","platforms":{"ios":"15.5"}}')
                sources[name] = str(path)
            program = """
require 'cocoapods'
paths = JSON.parse(STDIN.read)
sandbox = Pod::Sandbox.new(ARGV.fetch(0))
FileUtils.mkdir_p(sandbox.specifications_root)
checksums = paths.to_h do |name, path|
  spec = Pod::Specification.from_file(path)
  sandbox.store_podspec(name, spec, true, true)
  [name, sandbox.specification(name).checksum]
end
print JSON.generate(checksums)
"""
            expected = json.loads(m.ruby_json(program, root / "sandbox", data=json.dumps(sources).encode()))
            checksums = m.local_podspec_checksums(sources)
            self.assertEqual(checksums, expected)
            for name, path in sources.items():
                self.assertNotEqual(checksums[name], hashlib.sha1(Path(path).read_bytes()).hexdigest())

    def test_derived_lock_matches_reviewed_local_substitutions_without_mutating_production(self):
        source, expected, paths, checks = self.graph(); original = copy.deepcopy(source)
        result = m.derive_test_pod_lock(source, paths, checks, "d" * 40)
        self.assertEqual(m.pod_nodes(result), m.pod_nodes(expected))
        for field in ["EXTERNAL SOURCES", "SPEC CHECKSUMS", "SPEC REPOS", "PODFILE CHECKSUM", "COCOAPODS"]:
            self.assertEqual(result[field], expected[field])
        self.assertEqual(sorted(result["DEPENDENCIES"]), sorted(expected["DEPENDENCIES"]))
        self.assertEqual(source, original)

    def test_derived_lock_keeps_retained_transitive_versions_and_rejects_later_drift(self):
        source, _, paths, checks = self.graph()
        result = m.derive_test_pod_lock(source, paths, checks, "d" * 40)
        for name in ["Flutter", "image_picker_ios", "SharedUtility", "onnxruntime-objc/Core"]:
            self.assertEqual(m.pod_nodes(result)[name], m.pod_nodes(source)[name])
        for field in ["PODS", "SPEC CHECKSUMS", "EXTERNAL SOURCES"]:
            wrong = copy.deepcopy(result)
            if field == "PODS":
                wrong[field].remove("SharedUtility (1.0.0)"); wrong[field].append("SharedUtility (2.0.0)")
            elif field == "SPEC CHECKSUMS":
                wrong[field]["SharedUtility"] = "e" * 40
            else:
                wrong[field]["image_picker_ios"]["path"] = "/unreviewed/plugin"
            with self.assertRaises(ValueError): m.verify_pod_projection(source, wrong, paths, checks, "d" * 40)

    def test_derived_lock_cannot_discard_shared_closure_or_add_unreviewed_local_pods(self):
        source, _, paths, checks = self.graph()
        result = m.derive_test_pod_lock(source, paths, checks, "d" * 40)
        self.assertIn("SharedUtility", m.pod_nodes(result))
        self.assertNotIn("MLKitVision", m.pod_nodes(result))
        self.assertFalse(set(m.DISABLED_IOS_PLUGINS) & set(m.pod_nodes(result)))
        with self.assertRaises(ValueError):
            m.derive_test_pod_lock(source, dict(paths, Unexpected="/unreviewed"), dict(checks, Unexpected="f" * 40), "d" * 40)

    def test_protected_source_catches_dart_fixture_model_and_native_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); files = {}
            for rel in [
                "apps/mobile/lib/provider.dart",
                "fixtures/manifest.json",
                "apps/mobile/assets/receipt_ocr_models/model.onnx",
                "apps/mobile/ios/Runner/PaddleOCR/Engine.swift",
                "apps/mobile/ios/Runner/PaddleOCR/ThirdParty/Clipper1/clipper.hpp",
            ]:
                path = root / rel; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b"actual bytes")
                files[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(m.verify_protected_source(root, files), files)
            for rel in files:
                path = root / rel; path.write_bytes(b"changed")
                with self.assertRaises(ValueError): m.verify_protected_source(root, files)
                path.write_bytes(b"actual bytes")

    def test_cli_cannot_start_a_native_setup_outside_owned_normal_lane(self):
        result = subprocess.run([sys.executable, "-I", "-B", str(MODULE), "prepare"],
                                env={"PATH": os.environ["PATH"]}, capture_output=True)
        self.assertEqual(result.returncode, 98)
        self.assertEqual(result.stderr, b"ios_arm64_acceptance_setup_rejected\n")


    def test_verify_rejects_changed_retained_registrations(self):
        # Real verification, synthetic transport/files: no native execution.
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); target = root / "target"; mobile = target / "apps/mobile"
            (mobile / "ios/Runner").mkdir(parents=True)
            (mobile / "ios/Flutter").mkdir(); (mobile / ".dart_tool").mkdir()
            (mobile / "pubspec.lock").write_bytes(b"locked dependencies")
            (mobile / "ios/Podfile").write_bytes(b"reviewed pod selection")
            (mobile / "ios/Flutter/Debug.xcconfig").write_bytes(b"arm64 configuration")
            (mobile / ".dart_tool/package_config.json").write_text("{}")
            self.write_projected_plugins(mobile)
            registrations = ["IntegrationTestPlugin", "FLTImagePickerPlugin", "FilePickerPlugin", "FlutterSecureStoragePlugin", "PathProviderPlugin"]
            raw = ("\n".join(registrations) + "\n").encode()
            registrant = mobile / "ios/Runner/GeneratedPluginRegistrant.m"; registrant.write_bytes(raw)
            cv = root / "opencv-build/opencv2.xcframework/simulator/opencv2"
            ort = root / "ort-c/onnxruntime.xcframework/simulator/onnxruntime"
            for path in [cv, ort]: path.parent.mkdir(parents=True); path.write_bytes(b"verified framework")
            proof = {"sourceHead": "fixture-head", "target": str(target), "architecture": "arm64",
                     "referenceManifestSha256": m.REFERENCE_SHA256,
                     "opencvBinarySha256": m.sha(cv.read_bytes()), "ortBinarySha256": m.sha(ort.read_bytes()),
                     "protectedSource": {"owned.dart": "fixed"},
                     "pubspecLockSha256": m.sha((mobile / "pubspec.lock").read_bytes()),
                     "derivedPodfileSha256": m.sha((mobile / "ios/Podfile").read_bytes()),
                     "debugDerivedSha256": m.sha((mobile / "ios/Flutter/Debug.xcconfig").read_bytes()),
                     "packageProjection": {"projectedConfig": {}, "packages": {}},
                     "iosPluginInputs": m.ios_plugin_inputs(mobile),
                     "nativePluginRefresh": {"nativeRegistrantSha256": m.sha(raw)}}
            (root / "setup.json").write_text(json.dumps(proof))
            base = SimpleNamespace(simulator_framework=lambda path: path / "simulator")
            with patch.object(m, "module", return_value=base), \
                 patch.object(m, "verify_protected_source", return_value={"owned.dart": "fixed"}), \
                 patch.dict(os.environ, EXPECTED_HEAD="fixture-head"), contextlib.redirect_stdout(io.StringIO()):
                m.verify(target, root, target)
                for name in registrations:
                    with self.subTest(removed=name):
                        registrant.write_bytes(raw.replace((name + "\n").encode(), b""))
                        with self.assertRaises(ValueError): m.verify(target, root, target)
                registrant.write_bytes(raw)
                m.verify(target, root, target)

                production, projected, paths, checksums = self.graph()
                ios = mobile / "ios"
                lock = ios / "Podfile.lock"
                manifest = ios / "Pods/Manifest.lock"
                manifest.parent.mkdir()
                production_file = root / "production-Podfile.lock"
                production_file.write_text(json.dumps(production))
                projected["PODFILE CHECKSUM"] = hashlib.sha1((ios / "Podfile").read_bytes()).hexdigest()
                lock.write_text(json.dumps(projected))
                manifest.write_bytes(lock.read_bytes())
                proof.update(localPodPaths={name: paths[name] for name in m.LOCAL_PODS},
                             opencvObjectCount=1, opencvPlatformIds=[7],
                             ortSimulatorImageCount=1, ortPlatformIds=[7])
                (root / "setup.json").write_text(json.dumps(proof))
                debug = ios / "Flutter/Debug.xcconfig"
                original = debug.read_bytes()
                with patch.object(m, "PRODUCTION_LOCK_SHA256", m.sha(production_file.read_bytes())), \
                     patch.object(m, "local_podspec_checksums", return_value=checksums):
                    m.verify(target, root, target, pods=True)
                    verification = root / "verification.json"
                    prepared = json.loads(verification.read_bytes())
                    self.assertEqual(prepared["graphVerifiedAt"], "prepared")
                    m.verify_build_pods(root, target)
                    link_tail = (
                        "\nENABLE_DEBUG_DYLIB = NO\n"
                        f"OTHER_LDFLAGS = $(inherited) {root.parent}/settleora-network-interposer-anchor.o "
                        f"-Wl,-u,_settleora_require_network_interposer -L{root.parent} "
                        f"{root.parent}/libSettleoraOcrNetworkDeny.dylib -Wl,-needed-lSettleoraOcrNetworkDeny\n"
                        f"LIBRARY_SEARCH_PATHS = $(inherited) {root.parent}\n"
                    ).encode()
                    debug.write_bytes(original + link_tail)
                    m.verify(target, root, target, pods=True, stage="after_simulator_build")
                    built = json.loads(verification.read_bytes())
                    self.assertEqual(built["graphVerifiedAt"], "after_simulator_build")
                    self.assertEqual(built["podfileLockSha256"], prepared["podfileLockSha256"])
                    m.verify_build_pods(root, target)
                    link = ios / ".symlinks/plugins/image_picker_ios"
                    plugin = link.resolve()
                    swift = plugin / "ios/Plugin.swift"
                    source = swift.read_bytes()
                    swift.write_bytes(b"same Pod constraints, different native input")
                    with self.assertRaises(ValueError):
                        m.verify_build_pods(root, target)
                    swift.write_bytes(source)
                    moved = plugin.with_name("also_image_picker")
                    shutil.copytree(plugin, moved)
                    link.unlink()
                    link.symlink_to(moved)
                    with self.assertRaises(ValueError):
                        m.verify_build_pods(root, target)
                    link.unlink()
                    link.symlink_to(plugin)
                    m.verify_build_pods(root, target)
                    manifest.write_bytes(b"changed")
                    with self.assertRaises(ValueError):
                        m.verify_build_pods(root, target)
                    with patch.object(m, "context", return_value=(target, root, target, None)), \
                         patch.object(sys, "argv", [str(MODULE), "verify-after-test"]):
                        with self.assertRaises(ValueError):
                            m.main()
                        self.assertEqual(json.loads(verification.read_bytes()), built)
                        manifest.write_bytes(lock.read_bytes())
                        m.main()
                    tested = json.loads(verification.read_bytes())
                    self.assertEqual(tested["graphVerifiedAt"], "after_test_command")
                    self.assertFalse(tested["nativeAcceptancePassed"])
                    self.assertEqual(tested["podsManifestLockSha256"], built["podfileLockSha256"])
                    with self.assertRaises(ValueError):
                        m.verify_build_pods(root, target)

    def test_actual_integration_bundle_requires_arm64_simulator_and_interposer_bytes(self):
        def binary(cpu=0x0100000c, platform=7):
            header = struct.pack("<IIIIIIII", 0xfeedfacf, cpu, 0, 2, 1, 24, 0, 0)
            build_version = struct.pack("<IIIIII", 0x32, 24, platform, 0, 0, 0)
            return header + build_version

        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory).resolve()
            bundle = target / "apps/mobile/build/ios/iphonesimulator/Runner.app"
            embedded = bundle / "Frameworks/libSettleoraOcrNetworkDeny.dylib"
            embedded.parent.mkdir(parents=True)
            original = target / embedded.name
            runner = bundle / "Runner"
            original.write_bytes(binary() + b"x")
            embedded.write_bytes(binary() + b"x")
            runner.write_bytes(binary())
            repo = MODULE.parents[2]
            m.verify_test_bundle(repo, target, target)
            for name, path, raw in (
                ("x86", runner, binary(cpu=0x01000007)),
                ("device", runner, binary(platform=2)),
                ("changed interposer", embedded, binary() + b"y"),
            ):
                with self.subTest(name=name):
                    path.write_bytes(raw)
                    with self.assertRaises(ValueError):
                        m.verify_test_bundle(repo, target, target)
                    path.write_bytes(binary() if path == runner else binary() + b"x")


if __name__ == "__main__": unittest.main()
