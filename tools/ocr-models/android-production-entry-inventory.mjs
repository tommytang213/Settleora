// Exact reviewed APK entry identities are keyed by the tracked source tree.
// The inventory file itself is excluded from that tree fingerprint to avoid a
// circular commitment when adding a newly reviewed package representation.
// An older package digest is never accepted for a changed source tree.
export const expectedAndroidPackageDigestsBySource = Object.freeze({
  // Simulator Runner roots its own test-only link anchor and records the
  // observed iOS shader bytes. Clean Flutter 3.44.8 Release passed preceding
  // local package gates; hosted signer and ZIP representation need proof.
  "8919dccd7e8b2127eb6d425b7f12be7abe6e16833fa95883942b2bd7ca3bcb78": Object.freeze([
    "56c48d4e2765b6dc4542e15bb445b48381dd657d109055009c682cbc9260608f",
  ]),
  // Exact simulator needed-l link probe and trusted iOS notice-byte identity.
  // Clean Flutter 3.44.8 Release projection passed preceding local package
  // gates; hosted signer and ZIP representation remain exact-head proof.
  "e0585c22dadfd083e9131fe09b2777aff750cdc2f4c8b67c95be84e9c28e75f3": Object.freeze([
    "08e582da8d85657eea3f67bc2372b9a2d1510b2c1023aab7ec25e6721c4e09c7",
  ]),
  // Exact simulator forced-symbol link follow-up and bounded iOS asset-path
  // diagnostic. Clean Flutter 3.44.8 Release projection passed preceding
  // local package gates; hosted signer and ZIP representation need proof.
  "ee46898f12864323ed0f978a1279a3a28d02b2d6ea1364ab51b689586a2b2fc5": Object.freeze([
    "e5c67b451bd79f6f42d8db74df2942961bdfe0e1083285109d2db299e1db860c",
  ]),
  // Exact geometry-bound acceptance source and nested iOS privacy resource.
  // Clean Flutter 3.44.8 production-plugin Release projection passed the
  // preceding local package gates; hosted signer and ZIP representation
  // still require exact-head proof.
  "cb824935b15a5f5df86a31dc879f064bdba28d2ed06b3375e8dafaa5a920108b": Object.freeze([
    "3cb6d6166427f6575fed50d91103b31af73a104ec68870f64bb158334800b923",
  ]),
  // Simulator-only C link anchor and exact nested privacy resource. Clean
  // Flutter 3.44.8 local Release projection passed the preceding package
  // gates; hosted signer and ZIP representation require exact-head proof.
  "b5d1a225ff9ff282075c2c0696b9482a39a399f2f6c1a695d659d4df8a8dda37": Object.freeze([
    "c5271c7b8ac25ea19179ec324c994dc851454b33cabc7adb7e3349cd1fbe487d",
  ]),
  // Exact local Flutter 3.44.8 Release projection after the simulator-only
  // symbol probe and pinned Flutter engine resource inventory. Hosted signer
  // and ZIP representation still require this exact-source job evidence.
  "0dc6740398efde64750dd2fa1bb54726f97562f1b5d246d557c9e692b36fd190": Object.freeze([
    "281700fb57f84dca0a52cd970f29ed9616aa31c523f45ce5e1269c0f7a1a1c0e",
  ]),
  // The Runner simulator link now proves both inputs on one exact invocation;
  // iOS admits the observed GoogleUtilities plist.
  // Canonical Flutter 3.44.8 local APK strict verification passed; hosted
  // signer and ZIP representation remain exact-head requirements.
  "ecf77098a60ff25255ea9ec2852d847c5e4a5632e5642ba6a417f54ca109620c": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Simulator-only forced load command replaces the failing Swift symbol
  // probe; exact GoogleUtilities privacy sibling is admitted on iOS. The
  // canonical Flutter 3.44.8 local APK passed strict package verification.
  // Hosted signer and ZIP representation remain exact-head requirements.
  "66660afee3239cfa866958d7a11fd1ec3c3d15b4a217111b222b6e90cc365e2d": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Exact iOS nested privacy-bundle and bounded linker-diagnostic follow-up.
  // Canonical Flutter 3.44.8 plugin projection passed the strict local APK
  // verifier; exact-head hosted signer and ZIP evidence remain required.
  "40c99f472fa30946adbb1172b351e2d9ab6e60ed9d6ba9a4638738be4f40f813": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Bounded stdin link diagnostics and actual-provider Apply option proof.
  // Exact Flutter 3.44.8 production-plugin projection passed local package
  // gates; the hosted signer and ZIP representation require exact-head proof.
  "b010342f4de3c20b9ce17b764c5c5396e54a9f535974a13046068e8d3090279a": Object.freeze([
    "7a3a7d935b7e8ce24dcf5b03f3e56a761d9ba87d014a43bd095c98c4ac05c2ff",
  ]),
  // Exact iOS native-link diagnostics and FBLPromises privacy path. The
  // retained clean Flutter 3.44.8 Release projection passed local catalog,
  // model, fixture-absence, path, and entry checks; hosted signer and ZIP
  // representation must still be proven on this exact source head.
  "48fde73c108b23cb362826bb1d0a175d18b6ffbf610e65943eece2ab63ea6db4": Object.freeze([
    "60fbb95aab20b7c5ed3cb59a9f5ca466a1f1221f954a265cc1c09910d231cd62",
  ]),
  // Simulator AppDelegate link probe and pinned UI fixture with exact
  // source-SHA guard. Clean Flutter 3.44.8 Release projection passed local
  // package gates; hosted signer and ZIP representation remain required.
  "54506c84415345f1aa112f43251b898707ce1713a67c8d0fea1535d5506dd35d": Object.freeze([
    "60fbb95aab20b7c5ed3cb59a9f5ca466a1f1221f954a265cc1c09910d231cd62",
  ]),
  // Exact simulator linker-search and nested privacy-resource follow-up.
  // Clean Flutter 3.44.8 Release projection passed local package gates;
  // hosted signer and ZIP representation remain required.
  "89abdc913e515e9e8653e522bc5908bce73714051ccadd504c143d4162763503": Object.freeze([
    "b5add95a4e2eba96f15e7b06b2b4830c16452fef4c29e29303c99e10d9293c8f",
    // Exact-head hosted job 108333798391 passed signer, path, catalog,
    // model, and fixture-absence checks before reporting this representation.
    "9a79e9675943035b6f9887de3b99f2de62ac39c210b7382956ffb63f34f0b985",
  ]),
  // Exact seven-path iOS simulator link and unsigned-resource follow-up.
  // Clean Flutter 3.44.8 Release projection passed every local package gate;
  // hosted signer and representation remain exact-head requirements.
  "231a09bad33fae0a509fcd633848a95cba9c43c976e543586a13407d97226b0a": Object.freeze([
    "abe08a0d15e5c042ec0ade32354c4113da2d683120083525313e085f7f8c91e1",
    // Exact-head hosted job 108327752348 passed signer, path, catalog,
    // model, and fixture-absence gates before reporting this representation.
    "9a79e9675943035b6f9887de3b99f2de62ac39c210b7382956ffb63f34f0b985",
  ]),
  // Exact follow-up after validating the built Runner scheme settings. The
  // projected Flutter 3.44.8 Release APK passed local strict verification;
  // hosted signer and ZIP representation still require exact-head proof.
  "0dfcca217029e5c853c2ee9f4740fbb9f73add735e8f061b11820164ff3385ac": Object.freeze([
    "a49272491c9a47c170361ec06f0b3bceb3d9258c4e9c6fbab6559a56d607cbd5",
    // Exact-head hosted job 108318930976 passed signer, path, catalog,
    // model, and fixture-absence checks before reporting this representation.
    "9a79e9675943035b6f9887de3b99f2de62ac39c210b7382956ffb63f34f0b985",
  ]),
  // Bounded Apply handoff diagnostics with the acceptance source rebound in
  // the trusted catalog. Clean local Flutter 3.44.8 Release projection;
  // hosted signer and ZIP representation still require exact-head proof.
  "b33412a769497759afa1652afa39244435b27e9570a9a97aa392e7a242ea59fe": Object.freeze([
    "d34226db4c9d49b0480033ef290607bca3f84ab0adf048032c80b64fcbbfc6e6",
    // Exact-head hosted job 108311257068 passed signer, path, model, and
    // fixture-absence checks before reporting this ZIP representation.
    "86693b38ae65bc5ed245c29e6a928aaac3f1644764ec6020db34c83e5ae7f041",
  ]),
  // Test-only iOS simulator link verification and reviewed compiled nib
  // classification. Android build inputs are unchanged; hosted exact-head
  // signer and ZIP representation still require proof.
  "5757b13b2301696fe9bd74e89578eb25eda87caf6f4a8d661b13302aa83d2438": Object.freeze([
    "ab04b0e09a523c20338627ffd2c57b3924aa84c9169b4a2894235b71cf0d7d69",
  ]),
  // Canonical DateField UI proof, Debug dylib preflight, and bounded iOS
  // opaque-resource diagnostics. Clean Flutter 3.44.8 Release projection;
  // hosted job 108273080304 proved signer and the second representation.
  "53a5a4dbe5393ccd2ccfacf629e9ad33b5dae70b463f0f88061a59f0a6185091": Object.freeze([
    "184c0f967f667215d39777a506af6222c6f6c9f0e404707b36d9abcfa3c31b4a",
    // Exact-head hosted job 108273080304 passed signer, path, model, and
    // fixture-absence checks before reporting this ZIP representation.
    "20ab78ea9e2248abfa34ab6f8f081dc4c82ad79ed6bb96d64691ab580a8f9ec1",
  ]),
  // Exact iOS Xcode Debug dylib link check and bounded opaque-resource
  // diagnostics. Android inputs are unchanged; the prior clean Flutter
  // 3.44.8 Release APK passed strict verification under this source tree.
  "ed20e3296e4986f725f62e29b207e9957def9364112745f83c30103f9d430d2b": Object.freeze([
    "7cec98e06c6eb872af8b6fc219faa16e183257465b5f776ea3b45a2d028487c9",
  ]),
  // Exact bounded UI stages and controlled Apply handoff proof. Clean
  // Flutter 3.44.8 Release projection; hosted signer, exact paths, model,
  // and fixture-absence checks observed the second digest in job 108262217243.
  "4f57028560ef7bf369cf1f6343f7127f2d36838b5b0d1acb12d62704998f64ee": Object.freeze([
    "7cec98e06c6eb872af8b6fc219faa16e183257465b5f776ea3b45a2d028487c9",
    "b4aed0d10c8a62460a3c1cdf4c928f040f9296d5ce3a5405c8a5533ea561f92e",
  ]),
// Exact selected Apply destination proof with bound catalog. Clean Flutter
  // 3.44.8 Release projection; hosted signer and representation need proof.
  "ee613e60e009570ccd62803060505e49c52b6bcc77c59ef0c480cd401467fdf2": Object.freeze([
    "70b9d8be2674c297e701fa67eb84cde08257d671e1d35e6c13d592cdb862089e",
  ]),
  // Exact native UI handoff and Xcode resource correction, with the acceptance
  // catalog rebound to the updated real-provider test. Clean Flutter 3.44.8
  // Release projection; hosted signer and representation still require proof.
  "42c540b5404f6ce3d25d970d1c0f226cc0f6579f2f73bd95d9e6cec8680f4f98": Object.freeze([
    "29a2d524987132092f6460fbe24bcd95d917697cec360e07d799be17e087fff9",
  ]),
  // UI handoff now binds the real provider response while the complete corpus
  // retains semantic truth checks. Clean Flutter 3.44.8 Release projection;
  // hosted exact-head representation still requires reproof.
  "0bef102f66cecb7e05d3869d04ca426df94ac50af05cba332a85b17652f239e4": Object.freeze([
    "59a8e71dbc2b643ec9632f8524262be08f37f448f38d737d85f262c7ac4b09be",
  ]),
  // Hosted review follow-up strengthens iOS package and UI evidence; Android
  // package inputs are unchanged. Local representation passed strict review;
  // the second representation was observed after signer, exact path, model,
  // legal-artifact, and fixture-absence checks in hosted job 108224162571.
  "0dc9f2201df46a5031621867ce6a5df9e5b13a36814f939fa857900650781a30": Object.freeze([
    "0caceaa079326b5e1de3a4e5a681ec4f9917056094b45cec25d93bf92ce702dd",
    "054b05fbe3ac3e5987c1a00109c763d63dbbc48cf2d8d023cd643b51a13a0bc3",
  ]),
  // Fixed-command nested-bundle policy regression; APK inputs unchanged.
  // Local representation passed strict verification, hosted reproof required.
  "123ea0885d2060c98bb89849a3815d42715775b1590d241d224ec1469009f03f": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact iOS Debug config and package-resource correction. Android inputs
  // are unchanged; local representation verified, hosted reproof required.
  "f7464e6457fabff7dddd30d233c312c05b24fed143bf9e50fb48eede552cd311": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact bounded iOS diagnostic follow-up. Android package inputs remain
  // unchanged; the first representation passed the complete local Release
  // projection, while the second requires exact-head hosted reproof.
  "a5a90b2b46d7b5794f2eaa0763ae9a36a6f36a692a0149847f716937f9ebb251": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact iOS acceptance-link and locked-framework inventory correction.
  // Android package inputs are unchanged; the complete local Release
  // projection produced the first digest. The second
  // digest is the reviewed hosted representation from job 108134556526 and
  // must be re-proven on the new exact head before acceptance.
  "32a7e3d69a5d91ddfe7df97d81891172965a91fcb25e65b0a3d4aae99fff0ab9": Object.freeze([
    "754737d69df2409e1e1fe265b3eb003335980e6bc450f2d1a4a44adf57b601f2",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
  // Exact candidate tracked tree excluding this inventory file. Clean local
  // Flutter 3.44.8 Release projection with strict Gradle evidence, the
  // production plugin graph, and the updated bound acceptance catalog.
  // The second entry was observed after signer, exact path, expanded model,
  // legal artifact, and fixture-absence checks in exact-head hosted job
  // 108134556526 on GitHub-hosted ubuntu-24.04.
  "4895cd8dd88f33c39c5513128d1b64fbce8a7da880bf873077fc86ca46087c62": Object.freeze([
    "57de81460d733fe85576ffc60d532ccff23d40d8b58fd3f621962b36d0345fd8",
    "69470e8594e11481160ef3b1415f22bae77a4901d2bacb89e813e60196946a8c",
  ]),
});
export const expectedAndroidNonOcrEntries = Object.freeze([
  "AndroidManifest.xml",
  "DebugProbesKt.bin",
  "META-INF/DEPENDENCIES",
  "META-INF/androidx.activity_activity.version",
  "META-INF/androidx.annotation_annotation-experimental.version",
  "META-INF/androidx.appcompat_appcompat-resources.version",
  "META-INF/androidx.appcompat_appcompat.version",
  "META-INF/androidx.arch.core_core-runtime.version",
  "META-INF/androidx.compose.runtime_runtime-annotation.version",
  "META-INF/androidx.core_core-ktx.version",
  "META-INF/androidx.core_core-viewtree.version",
  "META-INF/androidx.core_core.version",
  "META-INF/androidx.cursoradapter_cursoradapter.version",
  "META-INF/androidx.customview_customview.version",
  "META-INF/androidx.drawerlayout_drawerlayout.version",
  "META-INF/androidx.emoji2_emoji2-views-helper.version",
  "META-INF/androidx.emoji2_emoji2.version",
  "META-INF/androidx.exifinterface_exifinterface.version",
  "META-INF/androidx.fragment_fragment.version",
  "META-INF/androidx.interpolator_interpolator.version",
  "META-INF/androidx.lifecycle_lifecycle-livedata-core-ktx.version",
  "META-INF/androidx.lifecycle_lifecycle-livedata-core.version",
  "META-INF/androidx.lifecycle_lifecycle-livedata.version",
  "META-INF/androidx.lifecycle_lifecycle-process.version",
  "META-INF/androidx.lifecycle_lifecycle-runtime.version",
  "META-INF/androidx.lifecycle_lifecycle-viewmodel-savedstate.version",
  "META-INF/androidx.lifecycle_lifecycle-viewmodel.version",
  "META-INF/androidx.loader_loader.version",
  "META-INF/androidx.navigationevent_navigationevent.version",
  "META-INF/androidx.profileinstaller_profileinstaller.version",
  "META-INF/androidx.savedstate_savedstate.version",
  "META-INF/androidx.startup_startup-runtime.version",
  "META-INF/androidx.tracing_tracing.version",
  "META-INF/androidx.vectordrawable_vectordrawable-animated.version",
  "META-INF/androidx.vectordrawable_vectordrawable.version",
  "META-INF/androidx.versionedparcelable_versionedparcelable.version",
  "META-INF/androidx.viewpager_viewpager.version",
  "META-INF/androidx.window.extensions.core_core.version",
  "META-INF/androidx.window_window-java.version",
  "META-INF/androidx.window_window.version",
  "META-INF/androidx/annotation/annotation/LICENSE.txt",
  "META-INF/com/android/build/gradle/app-metadata.properties",
  "META-INF/kotlinx_coroutines_android.version",
  "META-INF/kotlinx_coroutines_core.version",
  "META-INF/services/C2.a",
  "META-INF/services/C2.b",
  "META-INF/services/org.apache.tika.metadata.filter.MetadataFilter",
  "META-INF/version-control-info.textproto",
  "META-INF/versions/9/OSGI-INF/MANIFEST.MF",
  "assets/dexopt/baseline.prof",
  "assets/dexopt/baseline.profm",
  "assets/flutter_assets/AssetManifest.bin",
  "assets/flutter_assets/FontManifest.json",
  "assets/flutter_assets/NOTICES.Z",
  "assets/flutter_assets/NativeAssetsManifest.json",
  "assets/flutter_assets/fonts/MaterialIcons-Regular.otf",
  "assets/flutter_assets/packages/cupertino_icons/assets/CupertinoIcons.ttf",
  "assets/flutter_assets/shaders/ink_sparkle.frag",
  "assets/flutter_assets/shaders/stretch_effect.frag",
  "assets/mlkit-google-ocr-models/aksara/aksara_page_layout_analysis_rpn_gcn.binarypb",
  "assets/mlkit-google-ocr-models/aksara/aksara_page_layout_analysis_ti_rpn_gcn.binarypb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc/optical/assets.extra/LabelMap.pb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc/optical/conv_model.fb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc/optical/lstm_model.fb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/Latn_ctc_cpu.binarypb",
  "assets/mlkit-google-ocr-models/gocr/gocr_models/line_recognition_legacy_mobile/tflite_langid.tflite",
  "assets/mlkit-google-ocr-models/gocr/layout/line_clustering_custom_ops/model.tflite",
  "assets/mlkit-google-ocr-models/gocr/layout/line_splitting_custom_ops/model.tflite",
  "assets/mlkit-google-ocr-models/taser/detector/region_proposal_text_detector_tflite_vertical_mbv2_v1.bincfg",
  "assets/mlkit-google-ocr-models/taser/detector/rpn_text_detector_mobile_space_to_depth_quantized_mbv2_v1.tflite",
  "assets/mlkit-google-ocr-models/taser/rpn_text_detection_tflite_mobile_mbv2.binarypb",
  "assets/mlkit-google-ocr-models/taser/segmenter/tflite_script_detector_0.3.bincfg",
  "assets/mlkit-google-ocr-models/taser/segmenter/tflite_script_detector_0.3.conv_model",
  "assets/mlkit-google-ocr-models/taser/segmenter/tflite_script_detector_0.3.lstm_model",
  "assets/mlkit-google-ocr-models/taser/taser_script_identification_tflite_mobile.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_engine.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_engine_ti.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_recognizer.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_runner.binarypb",
  "assets/mlkit-google-ocr-models/taser_tflite_gocrlatin_mbv2_scriptid_aksara_layout_gcn_mobile_runner_ti.binarypb",
  "classes.dex",
  "common.properties",
  "firebase-annotations.properties",
  "firebase-components.properties",
  "firebase-encoders-json.properties",
  "firebase-encoders.properties",
  "image.properties",
  "kotlin-tooling-metadata.json",
  "kotlin/annotation/annotation.kotlin_builtins",
  "kotlin/collections/collections.kotlin_builtins",
  "kotlin/concurrent/atomics/atomics.kotlin_builtins",
  "kotlin/coroutines/coroutines.kotlin_builtins",
  "kotlin/internal/internal.kotlin_builtins",
  "kotlin/kotlin.kotlin_builtins",
  "kotlin/ranges/ranges.kotlin_builtins",
  "kotlin/reflect/reflect.kotlin_builtins",
  "lib/arm64-v8a/libapp.so",
  "lib/arm64-v8a/libc++_shared.so",
  "lib/arm64-v8a/libdartjni.so",
  "lib/arm64-v8a/libflutter.so",
  "lib/arm64-v8a/libmlkit_google_ocr_pipeline.so",
  "lib/arm64-v8a/libonnxruntime.so",
  "lib/arm64-v8a/libonnxruntime4j_jni.so",
  "lib/arm64-v8a/libopencv_java4.so",
  "lib/armeabi-v7a/libapp.so",
  "lib/armeabi-v7a/libc++_shared.so",
  "lib/armeabi-v7a/libdartjni.so",
  "lib/armeabi-v7a/libflutter.so",
  "lib/armeabi-v7a/libmlkit_google_ocr_pipeline.so",
  "lib/armeabi-v7a/libonnxruntime.so",
  "lib/armeabi-v7a/libonnxruntime4j_jni.so",
  "lib/armeabi-v7a/libopencv_java4.so",
  "lib/x86_64/libapp.so",
  "lib/x86_64/libc++_shared.so",
  "lib/x86_64/libdartjni.so",
  "lib/x86_64/libflutter.so",
  "lib/x86_64/libmlkit_google_ocr_pipeline.so",
  "lib/x86_64/libonnxruntime.so",
  "lib/x86_64/libonnxruntime4j_jni.so",
  "lib/x86_64/libopencv_java4.so",
  "org/apache/tika/detect/tika-example.nnmodel",
  "org/apache/tika/mime/tika-mimetypes.xml",
  "org/apache/tika/parser/external/tika-external-parsers.xml",
  "pipes-fork-server-default-log4j2.xml",
  "play-services-base.properties",
  "play-services-basement.properties",
  "play-services-mlkit-text-recognition-common.properties",
  "play-services-mlkit-text-recognition.properties",
  "play-services-tasks.properties",
  "res/-8.xml",
  "res/-B.png",
  "res/-N.png",
  "res/-p.png",
  "res/0c.9.png",
  "res/1C.9.png",
  "res/1I.9.png",
  "res/1J.9.png",
  "res/1e.9.png",
  "res/27.xml",
  "res/2K.9.png",
  "res/2P.png",
  "res/2d.png",
  "res/2f.xml",
  "res/2j.xml",
  "res/33.9.png",
  "res/3A.xml",
  "res/46.xml",
  "res/47.xml",
  "res/49.png",
  "res/4k.png",
  "res/4u.xml",
  "res/5D.9.png",
  "res/5J.9.png",
  "res/5U.png",
  "res/5c.png",
  "res/62.9.png",
  "res/6Q.xml",
  "res/6f.xml",
  "res/6t.png",
  "res/79.9.png",
  "res/7C.9.png",
  "res/7H.xml",
  "res/7I.9.png",
  "res/7N.xml",
  "res/7R.png",
  "res/7_.9.png",
  "res/7i.png",
  "res/7o.9.png",
  "res/80.xml",
  "res/8h.png",
  "res/9N.9.png",
  "res/9P.xml",
  "res/9T.xml",
  "res/9T1.xml",
  "res/9T2.xml",
  "res/9X.9.png",
  "res/9m.xml",
  "res/9n.9.png",
  "res/9w.png",
  "res/9z.png",
  "res/A1.xml",
  "res/A4.xml",
  "res/Af.9.png",
  "res/BG.9.png",
  "res/BL.9.png",
  "res/BM.png",
  "res/BQ.9.png",
  "res/Bl.xml",
  "res/Bz.xml",
  "res/C_.9.png",
  "res/DL.9.png",
  "res/DZ.xml",
  "res/D_.9.png",
  "res/Dd.png",
  "res/EA.9.png",
  "res/EP.png",
  "res/EQ.xml",
  "res/Eg.xml",
  "res/Eh.png",
  "res/FS.png",
  "res/FW.png",
  "res/G2.9.png",
  "res/GD.xml",
  "res/GK.xml",
  "res/Gf.png",
  "res/Gt.9.png",
  "res/H-.png",
  "res/I3.9.png",
  "res/IX.9.png",
  "res/In.xml",
  "res/JJ.9.png",
  "res/Jl.xml",
  "res/K-.xml",
  "res/K5.xml",
  "res/KH.9.png",
  "res/KM.png",
  "res/K_.9.png",
  "res/Ke.xml",
  "res/Lf.xml",
  "res/Li.9.png",
  "res/Lr.xml",
  "res/M7.xml",
  "res/MF.9.png",
  "res/MQ.png",
  "res/Ma.9.png",
  "res/NA.9.png",
  "res/NF.xml",
  "res/NG.png",
  "res/NM.xml",
  "res/NZ.9.png",
  "res/Nk.9.png",
  "res/No.9.png",
  "res/Nu.xml",
  "res/Ol.xml",
  "res/Pa.9.png",
  "res/Pb.png",
  "res/Pb.xml",
  "res/QJ.9.png",
  "res/QZ.xml",
  "res/Qd.9.png",
  "res/Qd.xml",
  "res/Qt.xml",
  "res/RJ.png",
  "res/RV.png",
  "res/Rt.xml",
  "res/SN.xml",
  "res/Su.9.png",
  "res/T5.xml",
  "res/TK.xml",
  "res/Th.png",
  "res/Tj.9.png",
  "res/Tn.xml",
  "res/U-.9.png",
  "res/U8.xml",
  "res/UR.png",
  "res/V1.xml",
  "res/VM.xml",
  "res/VT.xml",
  "res/W3.xml",
  "res/Wh.png",
  "res/Wr.png",
  "res/Wz.png",
  "res/X4.9.png",
  "res/XK.xml",
  "res/XW.xml",
  "res/Xx.xml",
  "res/YG.9.png",
  "res/YW.xml",
  "res/Yw.9.png",
  "res/Z8.png",
  "res/ZI.png",
  "res/ZL.9.png",
  "res/ZL.xml",
  "res/Zg.xml",
  "res/Zn.xml",
  "res/_G.xml",
  "res/_o.xml",
  "res/_p.png",
  "res/_q.png",
  "res/_y.xml",
  "res/aG.xml",
  "res/aU.9.png",
  "res/aW.xml",
  "res/ar.png",
  "res/bL.xml",
  "res/bb.xml",
  "res/bt.xml",
  "res/c5.xml",
  "res/c6.xml",
  "res/cL.xml",
  "res/cV.xml",
  "res/cm.xml",
  "res/color-v23/abc_tint_btn_checkable.xml",
  "res/color-v23/abc_tint_default.xml",
  "res/color-v23/abc_tint_edittext.xml",
  "res/color-v23/abc_tint_seek_thumb.xml",
  "res/color-v23/abc_tint_spinner.xml",
  "res/color-v23/abc_tint_switch_track.xml",
  "res/color/common_google_signin_btn_text_dark.xml",
  "res/color/common_google_signin_btn_text_light.xml",
  "res/color/common_google_signin_btn_tint.xml",
  "res/d3.png",
  "res/d5.9.png",
  "res/dB.9.png",
  "res/dO.xml",
  "res/dW.png",
  "res/dY.png",
  "res/df.xml",
  "res/eA.xml",
  "res/eG.xml",
  "res/eR.png",
  "res/eT.9.png",
  "res/ej.9.png",
  "res/f9.png",
  "res/fM.9.png",
  "res/g-.png",
  "res/gK.9.png",
  "res/gR.xml",
  "res/gX.xml",
  "res/gZ.9.png",
  "res/gj.9.png",
  "res/gt.9.png",
  "res/h4.xml",
  "res/h7.9.png",
  "res/hP.9.png",
  "res/hP.xml",
  "res/hZ.9.png",
  "res/hq.xml",
  "res/i6.9.png",
  "res/iO.png",
  "res/iQ.png",
  "res/iR.9.png",
  "res/iW.png",
  "res/io.9.png",
  "res/j3.xml",
  "res/j4.png",
  "res/jS.9.png",
  "res/jW.png",
  "res/je.9.png",
  "res/kJ.9.png",
  "res/kj.xml",
  "res/kn.xml",
  "res/kp.png",
  "res/lN.xml",
  "res/lP.9.png",
  "res/lR.xml",
  "res/ly.png",
  "res/m0.png",
  "res/mm.9.png",
  "res/nC.9.png",
  "res/nI.9.png",
  "res/nT.xml",
  "res/nf.png",
  "res/nz.xml",
  "res/o-.png",
  "res/oO.9.png",
  "res/oP.xml",
  "res/o_.9.png",
  "res/o_.png",
  "res/op.9.png",
  "res/p7.xml",
  "res/pI.xml",
  "res/pY.png",
  "res/pk.png",
  "res/ps.9.png",
  "res/pu.png",
  "res/qD.9.png",
  "res/qp.png",
  "res/qx.xml",
  "res/qz.xml",
  "res/rJ.xml",
  "res/rW.xml",
  "res/rj.9.png",
  "res/rx.xml",
  "res/s0.png",
  "res/s4.png",
  "res/sA.9.png",
  "res/sA.xml",
  "res/sg.9.png",
  "res/sn.xml",
  "res/tG.png",
  "res/tL.xml",
  "res/tS.png",
  "res/tZ.9.png",
  "res/te.png",
  "res/tr.9.png",
  "res/u0.xml",
  "res/u3.png",
  "res/uJ.xml",
  "res/uL.9.png",
  "res/uj.9.png",
  "res/us.9.png",
  "res/ut.9.png",
  "res/uu.9.png",
  "res/vJ.xml",
  "res/vL.9.png",
  "res/vZ.xml",
  "res/vo.png",
  "res/vz.9.png",
  "res/w2.9.png",
  "res/wL.9.png",
  "res/wN.9.png",
  "res/w_.png",
  "res/xH.png",
  "res/xR.9.png",
  "res/xa.9.png",
  "res/xj.xml",
  "res/y6.xml",
  "res/yH.9.png",
  "res/yY.9.png",
  "res/yg.9.png",
  "res/yn.png",
  "res/z-.9.png",
  "res/z9.9.png",
  "res/zE.png",
  "res/zV.9.png",
  "res/zw.9.png",
  "resources.arsc",
  "text-recognition-bundled-common.properties",
  "text-recognition.properties",
  "transport-api.properties",
  "transport-backend-cct.properties",
  "transport-runtime.properties",
  "vision-common.properties",
  "vision-interfaces.properties",
]);
