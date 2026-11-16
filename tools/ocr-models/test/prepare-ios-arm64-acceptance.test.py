import copy
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
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

    def write_pod_build_inputs(self, ios, local_paths, plugins):
        pods = ios / "Pods"
        project = pods / "Pods.xcodeproj/project.pbxproj"
        project.parent.mkdir(parents=True)
        project.write_text("fixture generated project\n")
        runner = ios / "Runner.xcodeproj"
        runner.mkdir()
        (runner / "project.pbxproj").write_text("fixture Runner project\n")
        workspace = ios / "Runner.xcworkspace"
        workspace.mkdir()
        (workspace / "contents.xcworkspacedata").write_text(
            '<Workspace version="1.0"><FileRef location="group:Runner.xcodeproj"/>'
            '<FileRef location="group:Pods/Pods.xcodeproj"/></Workspace>\n'
        )
        support = pods / "Target Support Files"
        roots = {name: Path(value) for name, value in local_paths.items()}
        roots.update({name: Path(row["root"]) / row["sourceDir"] for name, row in plugins["nativeSources"].items()})
        for name, source in roots.items():
            folder = support / name
            folder.mkdir(parents=True)
            (folder / (name + ".debug.xcconfig")).write_text(
                "PODS_TARGET_SRCROOT = ${PODS_ROOT}/" + os.path.relpath(source, pods) + "\n"
                "FRAMEWORK_SEARCH_PATHS = $(inherited)\n"
            )
        for name, framework in (("OpenCV", "opencv2.xcframework"), ("onnxruntime-c", "onnxruntime.xcframework")):
            script = support / name / (name + "-xcframeworks.sh")
            script.write_text("fixture CocoaPods bridge\n")
            (support / name / (name + "-xcframeworks-input-files.xcfilelist")).write_text(
                "${PODS_ROOT}/" + os.path.relpath(script, pods) + "\n"
                "${PODS_ROOT}/" + os.path.relpath(roots[name] / framework, pods) + "\n"
            )
        return support

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

    def graph(self, local_paths=None):
        paths = dict(local_paths) if local_paths is not None else {name: "/owned/" + name for name in m.LOCAL_PODS}
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

    def test_pod_consumers_depend_on_verification_in_generated_xcode_project(self):
        try:
            version = subprocess.run(["ruby", "-rxcodeproj", "-e", "print Xcodeproj::VERSION"],
                                     capture_output=True, timeout=15)
        except FileNotFoundError:
            self.skipTest("Ruby and Xcodeproj are unavailable")
        if version.returncode:
            self.skipTest("Xcodeproj is unavailable")
        original = (MODULE.parents[2] / "apps/mobile/ios/Podfile").read_text()
        projected = m.derive_podfile(original, {name: "/owned/" + name for name in m.LOCAL_PODS})
        gate_code = projected[projected.index("  pod_project = installer.pods_project\n"):-len("end\n")]
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first/Pods.xcodeproj"
            second = Path(directory) / "second/Pods.xcodeproj"
            for project in (first, second):
                project.parent.mkdir()
            program = """require 'xcodeproj'
project = Xcodeproj::Project.new(ARGV[0])
project.new_target(:static_library, 'LocalPod', :ios, '15.5')
project.new_aggregate_target('Pods-Runner', [], :ios, '15.5')
project.predictabilize_uuids
installer = Struct.new(:pods_project).new(project)
$iOSVersion = '15.5'
""" + gate_code + gate_code + "\nproject.save"
            for project in (first, second):
                m.ruby_json(program, project)
            raw = (first / "project.pbxproj").read_bytes()
            self.assertNotEqual(raw, (second / "project.pbxproj").read_bytes())
            self.assertEqual(m.pods_project_selection(first), m.pods_project_selection(second))
            self.assertEqual(m.pods_project_selection(first)["targetCount"], 2)
            self.assertEqual((first / "project.pbxproj").read_bytes(), raw)
            m.ruby_json("""require 'xcodeproj'
project = Xcodeproj::Project.open(ARGV[0])
project.targets.find { |target| target.name == 'LocalPod' }.dependencies.clear
project.save""", first)
            with self.assertRaises(subprocess.CalledProcessError):
                m.pods_project_selection(first)

    def test_runner_sources_resources_and_fixture_copy_are_bound_to_checkout(self):
        try:
            version = subprocess.run(["ruby", "-rxcodeproj", "-e", "print Xcodeproj::VERSION"],
                                     capture_output=True, timeout=15)
        except FileNotFoundError:
            self.skipTest("Ruby and Xcodeproj are unavailable")
        if version.returncode:
            self.skipTest("Xcodeproj is unavailable")
        source = MODULE.parents[2] / "apps/mobile/ios/Runner.xcodeproj"
        expected = m.runner_build_selection(source)
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory) / "Runner.xcodeproj"
            project.mkdir()
            config = project / "project.pbxproj"
            raw = (source / config.name).read_text()
            config.write_text(raw)
            self.assertEqual(m.runner_build_selection(project), expected)
            runner = MODULE.with_name("run-ios-native-acceptance.sh").read_text()
            projection = runner.split("phase=apply_runner_project_link\n", 1)[1]
            node = projection.split("<<'NODE'\n", 1)[1].split("\nNODE\n", 1)[0]
            subprocess.run(["node", "-", config, str(project.parent / "interposer.dylib"), project.parent],
                           input=node, text=True, check=True, capture_output=True, timeout=15)
            projected = config.read_text()
            self.assertNotEqual(projected, raw)
            verifier = m.runner_verifier_script(project.parent)
            self.assertEqual(m.runner_build_selection(project, verifier), expected)
            phases = json.loads(m.ruby_json("""require 'xcodeproj'
project = Xcodeproj::Project.open(ARGV[0])
puts JSON.generate(project.targets.find { |target| target.name == 'Runner' }.build_phases.map(&:display_name))
""", project))
            self.assertLess(phases.index("Verify OCR test Pods"), phases.index("Run Script"))
            markers = {
                project.parent / relative: b"unchanged control\n"
                for relative in ("Podfile.lock", "Pods/Manifest.lock", "Runner.xcworkspace/contents.xcworkspacedata")
            }
            for path, value in markers.items():
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(value)
            changed = projected.replace("xcode_backend.sh", "replacement_backend.sh", 1)
            self.assertNotEqual(changed, projected)
            config.write_text(changed)
            self.assertNotEqual(m.runner_build_selection(project, verifier), expected)
            config.write_text(projected)
            m.ruby_json("""require 'xcodeproj'
project = Xcodeproj::Project.open(ARGV[0])
runner = project.targets.find { |target| target.name == 'Runner' }
phase = runner.shell_script_build_phases.find { |value| value.name == 'Verify OCR test Pods' }
phase.remove_from_project
project.save
""", project)
            with self.assertRaises(subprocess.CalledProcessError):
                m.runner_build_selection(project, verifier)
            self.assertEqual({path: path.read_bytes() for path in markers}, markers)
            for original, changed in (
                ("path = AppDelegate.swift;", "path = Replacement.swift;"),
                ("path = Assets.xcassets;", "path = Replacement.xcassets;"),
                ("$SRCROOT/../test/fixtures/receipt_ocr", "$SRCROOT/../test/fixtures/replacement"),
                ("Runner/Runner-Bridging-Header.h", "Runner/Replacement-Bridging-Header.h"),
                ('PRODUCT_NAME = "$(TARGET_NAME)";', "PRODUCT_NAME = Replacement;"),
            ):
                with self.subTest(changed=changed):
                    self.assertIn(original, raw)
                    config.write_text(raw.replace(original, changed))
                    self.assertNotEqual(m.runner_build_selection(project), expected)

    def test_effective_debug_inputs_reject_overrides_outside_the_project_file(self):
        with tempfile.TemporaryDirectory() as directory:
            ios = Path(directory).resolve()
            bridge = ios / "Runner/Runner-Bridging-Header.h"
            bridge.parent.mkdir()
            bridge.write_bytes(b"fixture header")
            unrelated = bridge.with_name("Replacement.h")
            unrelated.write_bytes(bridge.read_bytes())
            settings = {
                "Runner": dict(PRODUCT_NAME="Runner", EXECUTABLE_NAME="Runner", FULL_PRODUCT_NAME="Runner.app",
                               PRODUCT_BUNDLE_IDENTIFIER=m.RUNNER_BUNDLE_ID,
                               SWIFT_OBJC_BRIDGING_HEADER=str(bridge)),
                "RunnerTests": dict(PRODUCT_NAME="RunnerTests", EXECUTABLE_NAME="RunnerTests",
                                    FULL_PRODUCT_NAME="RunnerTests.xctest"),
            }

            def xcodebuild(argv, **_kwargs):
                target = argv[argv.index("-target") + 1]
                return json.dumps([dict(target=target, buildSettings=settings[target])]).encode()

            with patch.object(m.subprocess, "check_output", side_effect=xcodebuild):
                self.assertEqual(m.effective_runner_inputs(ios)["Runner"]["SWIFT_OBJC_BRIDGING_HEADER"], str(bridge))
                settings["Runner"]["SWIFT_OBJC_BRIDGING_HEADER"] = str(unrelated)
                with self.assertRaises(ValueError):
                    m.effective_runner_inputs(ios)
                settings["Runner"]["SWIFT_OBJC_BRIDGING_HEADER"] = str(bridge)
                settings["RunnerTests"]["EXCLUDED_SOURCE_FILE_NAMES"] = "RunnerTests.swift"
                with self.assertRaises(ValueError):
                    m.effective_runner_inputs(ios)

    def test_runner_build_phase_checks_actual_effective_input_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory).resolve()
            root = target / "setup"
            root.mkdir()
            mobile, sdk = target / "apps/mobile", target / "flutter"
            sdk.mkdir()
            (mobile / "lib").mkdir(parents=True)
            (mobile / "lib/main.dart").write_text("void main() {}\n")
            runner = mobile / "ios/Runner"
            runner.mkdir(parents=True)
            header = runner / "GeneratedPluginRegistrant.h"
            header.write_text("#import <Flutter/Flutter.h>\n")
            (runner / "GeneratedPluginRegistrant.m").write_text("IntegrationTestPlugin\nFLTImagePickerPlugin\n")
            phase = dict(TARGET_NAME="Runner", CONFIGURATION="Debug", PLATFORM_NAME="iphonesimulator",
                         PRODUCT_NAME="Runner", FULL_PRODUCT_NAME="Runner.app", EXECUTABLE_NAME="Runner",
                         PRODUCT_BUNDLE_IDENTIFIER=m.RUNNER_BUNDLE_ID,
                         SWIFT_OBJC_BRIDGING_HEADER="Runner/Runner-Bridging-Header.h",
                         FLUTTER_APPLICATION_PATH=str(mobile), FLUTTER_ROOT=str(sdk))
            (root / "setup.json").write_text(json.dumps({
                "runnerEffectiveInputs": {"Runner": m.runner_input_settings(phase)}, "flutterSdk": str(sdk),
                "nativePluginRefresh": {"nativeRegistrant": m.generated_registrant_hashes(mobile)},
            }))
            with patch.object(m, "verify_build_pods") as verify, patch.dict(os.environ, phase, clear=True):
                m.verify_runner_build(root, target)
                verify.assert_called_once_with(root, target)
                original_header = header.read_bytes()
                header.write_text("#import <Unreviewed/Unreviewed.h>\n")
                with self.assertRaises(ValueError):
                    m.verify_runner_build(root, target)
                header.write_bytes(original_header)
                os.environ["EXCLUDED_SOURCE_FILE_NAMES"] = "AppDelegate.swift"
                with self.assertRaises(ValueError):
                    m.verify_runner_build(root, target)

    def test_flutter_backend_uses_the_detached_root_and_generated_integration_listener(self):
        with tempfile.TemporaryDirectory() as directory:
            top = Path(directory).resolve()
            root, mobile, sdk = top / "setup", top / "mobile", top / "flutter"
            for path in (root, mobile / ".dart_tool", mobile / "integration_test", sdk):
                path.mkdir(parents=True)
            (mobile / ".dart_tool/package_config.json").write_text("{}")
            test = mobile / m.OCR_TEST
            test.write_text("void main() {}\n")
            listener = top / "settleora-ocr-flutter-test/flutter_test_listener.fixture/listener.dart"
            listener.parent.mkdir(parents=True)
            valid = (f"import '{test.as_uri()}' as test;\n"
                     "const packageConfigLocation = '.dart_tool/package_config.json';\n"
                     "IntegrationTestWidgetsFlutterBinding.ensureInitialized();\nawait Future(test.main);\n")
            listener.write_text(valid)
            (top / "first-ios-acceptance-runner.app").mkdir()
            settings = dict(FLUTTER_APPLICATION_PATH=str(mobile), FLUTTER_ROOT=str(sdk), FLUTTER_TARGET=str(listener))
            m.verify_flutter_build_target(root, mobile, sdk, settings)
            for key in ("FLUTTER_APPLICATION_PATH", "FLUTTER_ROOT"):
                with self.subTest(changed=key), self.assertRaises(ValueError):
                    m.verify_flutter_build_target(root, mobile, sdk, dict(settings, **{key: str(top)}))
            for invalid in (valid.replace(test.as_uri(), (mobile / "replacement.dart").as_uri()),
                            valid.replace(".dart_tool/package_config.json", (top / "replacement.json").as_uri())):
                listener.write_text(invalid)
                with self.assertRaises((ValueError, FileNotFoundError)):
                    m.verify_flutter_build_target(root, mobile, sdk, settings)

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
                (destination / "source-marker").write_text("extracted fixture source\n")
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
                    (ios / "Runner/GeneratedPluginRegistrant.h").write_text("#import <Flutter/Flutter.h>\n")
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
                 patch.object(m, "git_source_types", return_value={"owned.dart": stat.S_IFREG}), \
                 patch.object(m, "verify_protected_source", return_value={"owned.dart": "fixed"}), \
                 patch.object(m, "verify") as verify, \
                 patch.object(m, "pods_build_selection", return_value={"runnerBuildSelectionSha256": "b" * 64}), \
                 patch.object(m, "runner_build_selection", return_value="b" * 64), \
                 patch.object(m, "effective_runner_inputs", return_value={"Runner": {
                     "FLUTTER_APPLICATION_PATH": str(mobile), "FLUTTER_ROOT": str(sdk)}}), \
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
                        registrant.with_suffix(".h").write_text("#import <Flutter/Flutter.h>\n")
                        registrant.write_text("IntegrationTestPlugin FLTImagePickerPlugin")

                observed = io.StringIO()
                with contextlib.redirect_stdout(observed):
                    m.regenerate_native_plugins(SimpleNamespace(execute=execute), sdk, mobile, root, 1234)
                phases = [] if cached else ["bootstrap_projected_flutter_tools"]
                phases.extend(["regenerate_projected_plugin_registrants", "verify_projected_plugin_registrants"])
                self.assertEqual(observed.getvalue().splitlines(),
                                 [f"ios_arm64_preparation_phase={phase}" for phase in phases])
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
            source_types = dict.fromkeys(files, stat.S_IFREG)
            self.assertEqual(m.verify_protected_source(root, files, source_types), files)
            for rel in files:
                path = root / rel; path.write_bytes(b"changed")
                with self.assertRaises(ValueError): m.verify_protected_source(root, files, source_types)
                path.write_bytes(b"actual bytes")

    def test_preparation_reports_first_rejected_tracked_path_with_bounded_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            relative = "apps/mobile/lib/first.dart"
            path = root / relative
            path.parent.mkdir(parents=True)
            expected = m.sha(b"reviewed bytes")
            tracked = {relative: expected, "apps/mobile/lib/second.dart": expected}
            path_digest = m.sha(relative.encode())
            source_types = dict.fromkeys(tracked, stat.S_IFREG)

            def check_rejection(reason):
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout), self.assertRaisesRegex(
                        ValueError, "^ios_arm64_acceptance_setup_rejected$"):
                    m.verify_projected_detached_source(root, tracked, source_types)
                self.assertEqual(stdout.getvalue(),
                                 "ios_arm64_preparation_phase=verify_projected_detached_source\n"
                                 f"ios_arm64_detached_source_failure={reason}:{path_digest}\n")

            check_rejection("missing")
            path.mkdir()
            check_rejection("unexpected_type")
            path.rmdir()
            path.write_bytes(b"synthetic private bytes")
            check_rejection("hash_mismatch")
            with patch.object(Path, "read_bytes", side_effect=PermissionError("synthetic private error")):
                check_rejection("read_error")
            path.unlink()
            path.symlink_to("reviewed bytes")
            check_rejection("unexpected_type")
            # The corresponding Git type still permits an authentic tracked link.
            source_types[relative] = stat.S_IFLNK
            (root / "apps/mobile/lib/second.dart").write_bytes(b"reviewed bytes")
            self.assertEqual(m.verify_protected_source(root, tracked, source_types), tracked)
            with tempfile.TemporaryDirectory() as external:
                redirected = Path(external) / "lib"
                path.parent.rename(redirected)
                path.parent.symlink_to(redirected, target_is_directory=True)
                # Identical leaves and link texts cannot authenticate an aliased parent.
                check_rejection("unexpected_type")

    def test_cli_cannot_start_a_native_setup_outside_owned_normal_lane(self):
        result = subprocess.run([sys.executable, "-I", "-B", str(MODULE), "prepare"],
                                env={"PATH": os.environ["PATH"]}, capture_output=True)
        self.assertEqual(result.returncode, 98)
        self.assertEqual(result.stderr, b"ios_arm64_acceptance_setup_rejected\n")

    def test_post_build_isolation_failure_does_not_expose_paths(self):
        repo = MODULE.parents[2]
        isolation = m.module(repo / "tools/ocr-models/prepare-ios-acceptance-worktree.py", "rejected_test_isolation")
        stderr = io.StringIO()
        with patch.object(m, "module", return_value=isolation), \
             patch.object(isolation, "verify", side_effect=isolation.IsolationError("/synthetic/private/path")), \
             patch.object(m.platform, "system", return_value="Darwin"), \
             patch.object(m.platform, "machine", return_value="arm64"), \
             patch.object(sys, "argv", [str(MODULE), "verify-after-build"]), \
             patch.dict(os.environ, GITHUB_ACTIONS="true", GITHUB_REPOSITORY="tommytang213/Settleora",
                        GITHUB_JOB="ios-native-acceptance", GITHUB_EVENT_NAME="workflow_dispatch",
                        SETTLEORA_IOS_ACCEPTANCE_ARCH="arm64", GITHUB_WORKSPACE=str(repo),
                        RUNNER_TEMP="/synthetic", EXPECTED_HEAD="fixture-head"), contextlib.redirect_stderr(stderr):
            with self.assertRaises(SystemExit) as rejected:
                m.run_cli()
        self.assertEqual(rejected.exception.code, 98)
        self.assertEqual(stderr.getvalue(), "ios_arm64_acceptance_setup_rejected\n")

    def test_verify_rejects_malformed_xcframework_plist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            target = root / "target"
            (root / "setup.json").write_text(json.dumps({
                "sourceHead": "fixture-head",
                "target": str(target),
                "architecture": "arm64",
                "referenceManifestSha256": m.REFERENCE_SHA256,
            }))
            info = root / "opencv-build/opencv2.xcframework/Info.plist"
            info.parent.mkdir(parents=True)
            xml = b'<?xml version="1.0"?><plist version="1.0">'
            inputs = {
                "truncated": xml + b"<dict>",
                "invalid date": xml + b"<date>invalid</date></plist>",
                "misplaced key": xml + b"<key>x</key></plist>",
                "unknown encoding": b'<?xml version="1.0" encoding="PRIVATE_UNKNOWN_ENCODING"?>'
                                    b'<plist version="1.0"><dict/></plist>',
            }
            for name, raw in inputs.items():
                with self.subTest(metadata=name):
                    info.write_bytes(raw)
                    stdout, stderr = io.StringIO(), io.StringIO()
                    with patch.object(m, "context", return_value=(MODULE.parents[2], root, target, None)), \
                         patch.object(sys, "argv", [str(MODULE), "verify"]), \
                         patch.dict(os.environ, EXPECTED_HEAD="fixture-head"), contextlib.redirect_stdout(stdout), \
                         contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as rejection:
                        m.run_cli()
                    self.assertEqual(rejection.exception.code, 98)
                    self.assertEqual(stdout.getvalue(), "")
                    self.assertEqual(stderr.getvalue(), "ios_arm64_acceptance_setup_rejected\n")

    def test_verify_rejects_changed_retained_registrations(self):
        # Real verification, synthetic transport/files: no native execution.
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
            registrant.with_suffix(".h").write_text("#import <Flutter/Flutter.h>\n")
            cv = root / "opencv-build/opencv2.xcframework/simulator/opencv2"
            ort = root / "ort-c/onnxruntime.xcframework/simulator/onnxruntime"
            for path in [cv, ort]: path.parent.mkdir(parents=True); path.write_bytes(b"verified framework")
            cv_license = root / "opencv-build/LICENSE"
            cv_license.write_bytes(b"fixture license")
            cv_license.with_name("OpenCV.podspec.json").write_text("{}")
            header = ort.parent / "Headers/onnxruntime_c_api.h"
            header.parent.mkdir()
            header.write_bytes(b"verified native header")
            objc_source = root / "ort-objc/objectivec/ort_session.mm"
            yams_source = root / "yams/Sources/Yams/Parser.swift"
            for path in (objc_source, yams_source):
                path.parent.mkdir(parents=True)
                path.write_bytes(b"verified local source")
            local_paths = {name: str(root / directory) for name, directory in {
                "OpenCV": "opencv-build", "onnxruntime-c": "ort-c",
                "onnxruntime-objc": "ort-objc", "Yams": "yams",
            }.items()}
            proof = {"sourceHead": "fixture-head", "target": str(target), "architecture": "arm64",
                     "referenceManifestSha256": m.REFERENCE_SHA256,
                     "opencvBinarySha256": m.sha(cv.read_bytes()), "ortBinarySha256": m.sha(ort.read_bytes()),
                     "protectedSource": {"owned.dart": "fixed"},
                     "pubspecLockSha256": m.sha((mobile / "pubspec.lock").read_bytes()),
                     "derivedPodfileSha256": m.sha((mobile / "ios/Podfile").read_bytes()),
                     "debugDerivedSha256": m.sha((mobile / "ios/Flutter/Debug.xcconfig").read_bytes()),
                     "packageProjection": {"projectedConfig": {}, "packages": {}},
                     "iosPluginInputs": m.ios_plugin_inputs(mobile),
                     "localPodPaths": local_paths, "localPodInputs": m.local_pod_inputs(root, local_paths),
                     "nativePluginRefresh": {"nativeRegistrant": m.generated_registrant_hashes(mobile)}}
            (root / "setup.json").write_text(json.dumps(proof))
            base = SimpleNamespace(simulator_framework=lambda path: path / "simulator")
            with patch.object(m, "module", return_value=base), \
                 patch.object(m, "git_source_types", return_value={"owned.dart": stat.S_IFREG}), \
                 patch.object(m, "verify_protected_source", return_value={"owned.dart": "fixed"}), \
                 patch.object(m, "pods_project_selection", return_value={"targetCount": 8, "sha256": "a" * 64}), \
                 patch.object(m, "runner_build_selection", return_value="b" * 64), \
                 patch.object(m, "effective_runner_inputs", return_value={"Runner": "fixture"}), \
                 patch.dict(os.environ, EXPECTED_HEAD="fixture-head"), contextlib.redirect_stdout(io.StringIO()):
                m.verify(target, root, target)
                for name in registrations:
                    with self.subTest(removed=name):
                        registrant.write_bytes(raw.replace((name + "\n").encode(), b""))
                        with self.assertRaises(ValueError): m.verify(target, root, target)
                registrant.write_bytes(raw)
                m.verify(target, root, target)

                production, projected, _, checksums = self.graph(local_paths)
                ios = mobile / "ios"
                lock = ios / "Podfile.lock"
                manifest = ios / "Pods/Manifest.lock"
                manifest.parent.mkdir()
                production_file = root / "production-Podfile.lock"
                production_file.write_text(json.dumps(production))
                projected["PODFILE CHECKSUM"] = hashlib.sha1((ios / "Podfile").read_bytes()).hexdigest()
                lock.write_text(json.dumps(projected))
                manifest.write_bytes(lock.read_bytes())
                support = self.write_pod_build_inputs(ios, local_paths, proof["iosPluginInputs"])
                proof.update(opencvObjectCount=1, opencvPlatformIds=[7],
                             ortSimulatorImageCount=1, ortPlatformIds=[7])
                proof["podsBuildSelection"] = m.pods_build_selection(ios, local_paths, proof["iosPluginInputs"])
                proof["runnerVerifierScript"] = m.runner_verifier_script(target)
                proof["runnerEffectiveInputs"] = {"Runner": "fixture"}
                (root / "setup.json").write_text(json.dumps(proof))
                debug = ios / "Flutter/Debug.xcconfig"
                original = debug.read_bytes()
                with patch.object(m, "PRODUCTION_LOCK_SHA256", m.sha(production_file.read_bytes())), \
                     patch.object(m, "local_podspec_checksums", return_value=checksums):
                    m.verify(target, root, target, pods=True)
                    verification = root / "verification.json"
                    prepared = json.loads(verification.read_bytes())
                    self.assertEqual(prepared["graphVerifiedAt"], "prepared")
                    # Xcode resolves python3 from its own environment. Exercise
                    # the registered command with only the older hashlib APIs.
                    with patch.object(m, "hashlib", SimpleNamespace(sha1=hashlib.sha1, sha256=hashlib.sha256)), \
                         patch.object(m, "context", return_value=(target, root, target, None)), \
                         patch.object(sys, "argv", [str(MODULE), "verify-build-pods"]):
                        m.run_cli()
                    plugin_file = mobile / ".flutter-plugins-dependencies"
                    original_plugins = plugin_file.read_bytes()
                    plugins = json.loads(original_plugins)
                    cycle = root / "cyclic-plugin"
                    cycle.symlink_to(cycle.name)
                    plugins["plugins"]["ios"][0]["path"] = str(cycle)
                    plugin_file.write_text(json.dumps(plugins))
                    stdout, stderr = io.StringIO(), io.StringIO()
                    try:
                        with patch.object(m, "context", return_value=(target, root, target, None)), \
                             patch.object(sys, "argv", [str(MODULE), "verify"]), contextlib.redirect_stdout(stdout), \
                             contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as rejection:
                            m.run_cli()
                        self.assertEqual(rejection.exception.code, 98)
                        self.assertEqual(stdout.getvalue(), "")
                        self.assertEqual(stderr.getvalue(), "ios_arm64_acceptance_setup_rejected\n")
                    finally:
                        plugin_file.write_bytes(original_plugins)
                    normal_lock = lock.read_bytes()
                    malformed = dict(projected, PODS=[{}])
                    lock.write_text(json.dumps(malformed))
                    manifest.write_bytes(lock.read_bytes())
                    stderr = io.StringIO()
                    with patch.object(m, "context", return_value=(target, root, target, None)), \
                         patch.object(sys, "argv", [str(MODULE), "verify"]), contextlib.redirect_stderr(stderr):
                        with self.assertRaises(SystemExit) as rejected:
                            m.run_cli()
                    self.assertEqual(rejected.exception.code, 98)
                    self.assertEqual(stderr.getvalue(), "ios_arm64_acceptance_setup_rejected\n")
                    lock.write_bytes(normal_lock)
                    manifest.write_bytes(normal_lock)
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
                    frozen_lock, frozen_manifest = lock.read_bytes(), manifest.read_bytes()
                    workspace = ios / "Runner.xcworkspace/contents.xcworkspacedata"
                    workspace_xml = workspace.read_text()
                    original_project = (ios / "Pods/Pods.xcodeproj/project.pbxproj").read_bytes()
                    for reference in ("group:Runner.xcodeproj", "group:Pods/Pods.xcodeproj"):
                        with self.subTest(redirected=reference):
                            workspace.write_text(workspace_xml.replace(reference, "group:Other/Replacement.xcodeproj"))
                            self.assertEqual(lock.read_bytes(), frozen_lock)
                            self.assertEqual(manifest.read_bytes(), frozen_manifest)
                            self.assertEqual(m.local_pod_inputs(root, local_paths), proof["localPodInputs"])
                            self.assertEqual((ios / "Pods/Pods.xcodeproj/project.pbxproj").read_bytes(), original_project)
                            with self.assertRaises(ValueError):
                                m.verify_build_pods(root, target)
                            with self.assertRaises(ValueError):
                                m.verify(target, root, target, pods=True, stage="after_test_command")
                    workspace.write_text(workspace_xml)
                    alternate = ios / "Other.xcworkspace"
                    alternate.mkdir()
                    with self.assertRaises(ValueError):
                        m.verify_build_pods(root, target)
                    alternate.rmdir()
                    m.verify_build_pods(root, target)
                    generated = support / "onnxruntime-objc/onnxruntime-objc.debug.xcconfig"
                    contents = generated.read_text()
                    for replacement in (
                        contents.replace(os.path.relpath(local_paths["onnxruntime-objc"], ios / "Pods"),
                                         os.path.relpath(local_paths["Yams"], ios / "Pods")),
                        contents.replace("FRAMEWORK_SEARCH_PATHS = $(inherited)",
                                         "FRAMEWORK_SEARCH_PATHS = $(inherited) /unreviewed"),
                    ):
                        generated.write_text(replacement)
                        self.assertEqual(m.local_pod_inputs(root, local_paths), proof["localPodInputs"])
                        self.assertEqual(lock.read_bytes(), frozen_lock)
                        self.assertEqual(manifest.read_bytes(), frozen_manifest)
                        with self.assertRaises(ValueError):
                            m.verify_build_pods(root, target)
                    generated.write_text(contents)
                    for pod_input in (objc_source, yams_source, header):
                        with self.subTest(changed=pod_input.name):
                            contents = pod_input.read_bytes()
                            pod_input.write_bytes(b"changed without modifying specs or locks")
                            self.assertEqual(lock.read_bytes(), frozen_lock)
                            self.assertEqual(manifest.read_bytes(), frozen_manifest)
                            with self.assertRaises(ValueError):
                                m.verify_build_pods(root, target)
                            with self.assertRaises(ValueError):
                                m.verify(target, root, target, pods=True, stage="after_test_command")
                            pod_input.write_bytes(contents)
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
            fixtures = repo / "apps/mobile/test/fixtures/receipt_ocr"
            copied = bundle / "receipt_ocr_acceptance"
            shutil.copytree(fixtures, copied)
            model_assets = bundle / "Frameworks/App.framework/flutter_assets" / m.MODEL_ASSET_DIRECTORY
            shutil.copytree(repo / "apps/mobile" / m.MODEL_ASSET_DIRECTORY, model_assets)
            framework_info = bundle / "Frameworks/App.framework/Info.plist"
            framework_info.write_bytes(plistlib.dumps({
                "CFBundleIdentifier": "io.flutter.flutter.app",
            }))
            (bundle / "Info.plist").write_bytes(plistlib.dumps({
                "CFBundleIdentifier": m.RUNNER_BUNDLE_ID, "CFBundleExecutable": "Runner",
                "FLTAssetsPath": "unused-when-App-framework-is-selected",
            }))
            m.retire_first_bundle(target, target)
            saved = target / "first-ios-acceptance-runner.app"
            self.assertTrue(saved.is_dir())
            shutil.copytree(saved, bundle.with_name("Redirected.app"))
            with self.assertRaises(ValueError):
                m.verify_test_bundle(repo, target, target)
            shutil.copytree(saved, bundle)
            with patch.object(m, "hashlib", SimpleNamespace(sha256=hashlib.sha256)):
                m.verify_test_bundle(repo, target, target)
            xml = b'<?xml version="1.0"?><plist version="1.0">'
            bad_plists = {
                "array root": plistlib.dumps(["unexpected metadata"]),
                "truncated XML": xml + b"<dict>",
                "invalid date": xml + b"<date>invalid</date></plist>",
                "orphan key": xml + b"<key>CFBundleIdentifier</key></plist>",
            }
            for info in (framework_info, bundle / "Info.plist"):
                original_info = info.read_bytes()
                for name, content in bad_plists.items():
                    with self.subTest(plist=info.parent.name, malformed=name):
                        info.write_bytes(content)
                        stderr = io.StringIO()
                        with patch.object(m, "context", return_value=(repo, target / "setup", target, None)), \
                             patch.object(sys, "argv", [str(MODULE), "verify-test-bundle"]), \
                             contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as rejection:
                            m.run_cli()
                        self.assertEqual(rejection.exception.code, 98)
                        self.assertEqual(stderr.getvalue(), "ios_arm64_acceptance_setup_rejected\n")
                info.write_bytes(original_info)
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
            manifest = json.loads((fixtures / "manifest.json").read_bytes())
            test_image = copied / manifest["fixtures"][0]["file"]
            image = test_image.read_bytes()
            test_image.write_bytes(b"changed bundled receipt")
            with self.assertRaises(ValueError):
                m.verify_test_bundle(repo, target, target)
            test_image.write_bytes(image)
            catalog = json.loads((model_assets / "catalog.json").read_bytes())
            first_model = catalog["packs"][0]
            asset = Path(first_model["assetDirectory"]) / first_model["files"][0]["name"]
            shadow = bundle / "en.lproj/Frameworks/App.framework/flutter_assets" / asset
            shadow.parent.mkdir(parents=True)
            source_model = bundle / "Frameworks/App.framework/flutter_assets" / asset
            shutil.copyfile(source_model, shadow)
            m.verify_test_bundle(repo, target, target)
            with shadow.open("r+b") as stream:
                byte = stream.read(1)
                stream.seek(0)
                stream.write(bytes([byte[0] ^ 1]))
            self.assertEqual(shadow.stat().st_size, source_model.stat().st_size)
            with self.assertRaises(ValueError):
                m.verify_test_bundle(repo, target, target)


if __name__ == "__main__": unittest.main()
