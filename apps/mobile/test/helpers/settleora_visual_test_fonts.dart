import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

const settleoraVisualOutputRootEnvironmentVariable =
    'SETTLEORA_VISUAL_OUTPUT_ROOT';
const _materialFontsRelativePath = 'bin/cache/artifacts/material_fonts';

final class SettleoraFlutterTestFonts {
  const SettleoraFlutterTestFonts({
    required this.sdkRoot,
    required this.robotoRegular,
    required this.materialIcons,
  });

  final String sdkRoot;
  final String robotoRegular;
  final String materialIcons;
}

SettleoraFlutterTestFonts resolveSettleoraFlutterTestFonts({
  Map<String, String>? environment,
  String? resolvedExecutable,
}) {
  final effectiveEnvironment = environment ?? Platform.environment;
  final configuredRoot = effectiveEnvironment['FLUTTER_ROOT']?.trim();
  if (configuredRoot != null && configuredRoot.isNotEmpty) {
    return _fontPathsForSdkRoot(configuredRoot, source: 'FLUTTER_ROOT');
  }

  final executable = resolvedExecutable ?? Platform.resolvedExecutable;
  var candidate = File(executable).absolute.parent;
  while (true) {
    if (_containsMaterialTestFonts(candidate.path)) {
      return _fontPathsForSdkRoot(
        candidate.path,
        source: 'the Flutter test runtime executable',
      );
    }
    final parent = candidate.parent;
    if (parent.path == candidate.path) {
      break;
    }
    candidate = parent;
  }

  throw StateError(
    'Unable to locate Flutter SDK material fonts from the Flutter test '
    'runtime executable "${_boundedPath(executable)}". Set FLUTTER_ROOT to '
    'the Flutter SDK root.',
  );
}

String settleoraVisualOutputDirectory(
  String evidenceDirectory, {
  Map<String, String>? environment,
  String? workingDirectory,
}) {
  final segments = evidenceDirectory.split(RegExp(r'[/\\]'));
  if (evidenceDirectory.trim().isEmpty ||
      _isAbsolutePath(evidenceDirectory) ||
      segments.any(
        (segment) => segment.isEmpty || segment == '.' || segment == '..',
      )) {
    throw ArgumentError.value(
      evidenceDirectory,
      'evidenceDirectory',
      'must be a non-empty relative path without traversal segments',
    );
  }

  final effectiveEnvironment = environment ?? Platform.environment;
  final configuredRoot =
      effectiveEnvironment[settleoraVisualOutputRootEnvironmentVariable]
          ?.trim();
  final cwd = Directory(
    workingDirectory ?? Directory.current.path,
  ).absolute.path;
  final root = configuredRoot == null || configuredRoot.isEmpty
      ? _joinPath(cwd, 'build/settleora-visual-qa')
      : _isAbsolutePath(configuredRoot)
      ? Directory(configuredRoot).path
      : _joinPath(cwd, configuredRoot);
  return _joinPath(root, evidenceDirectory);
}

Future<void> loadSettleoraVisualTestFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  final fonts = resolveSettleoraFlutterTestFonts();
  final robotoBytes = await File(fonts.robotoRegular).readAsBytes();
  final materialIconBytes = await File(fonts.materialIcons).readAsBytes();

  await ui.loadFontFromList(
    Uint8List.fromList(robotoBytes),
    fontFamily: 'Roboto',
  );
  await ui.loadFontFromList(
    Uint8List.fromList(materialIconBytes),
    fontFamily: 'MaterialIcons',
  );
}

SettleoraFlutterTestFonts _fontPathsForSdkRoot(
  String sdkRoot, {
  required String source,
}) {
  try {
    final canonicalRoot = Directory(
      sdkRoot,
    ).absolute.resolveSymbolicLinksSync();
    final roboto = File(
      _joinPath(
        canonicalRoot,
        '$_materialFontsRelativePath/Roboto-Regular.ttf',
      ),
    );
    final materialIcons = File(
      _joinPath(
        canonicalRoot,
        '$_materialFontsRelativePath/MaterialIcons-Regular.otf',
      ),
    );
    if (!roboto.existsSync() || !materialIcons.existsSync()) {
      throw const FileSystemException(
        'required material font files are missing',
      );
    }

    final canonicalRoboto = roboto.resolveSymbolicLinksSync();
    final canonicalMaterialIcons = materialIcons.resolveSymbolicLinksSync();
    if (!_isWithin(canonicalRoot, canonicalRoboto) ||
        !_isWithin(canonicalRoot, canonicalMaterialIcons)) {
      throw const FileSystemException(
        'resolved material font files escape the Flutter SDK root',
      );
    }
    return SettleoraFlutterTestFonts(
      sdkRoot: canonicalRoot,
      robotoRegular: canonicalRoboto,
      materialIcons: canonicalMaterialIcons,
    );
  } on FileSystemException catch (error) {
    throw StateError(
      '$source does not identify a usable Flutter SDK at '
      '"${_boundedPath(sdkRoot)}": ${error.message}. Expected '
      '$_materialFontsRelativePath/{Roboto-Regular.ttf,'
      'MaterialIcons-Regular.otf}.',
    );
  }
}

bool _containsMaterialTestFonts(String sdkRoot) =>
    File(
      _joinPath(sdkRoot, '$_materialFontsRelativePath/Roboto-Regular.ttf'),
    ).existsSync() &&
    File(
      _joinPath(
        sdkRoot,
        '$_materialFontsRelativePath/MaterialIcons-Regular.otf',
      ),
    ).existsSync();

bool _isWithin(String root, String path) {
  final prefix = root.endsWith(Platform.pathSeparator)
      ? root
      : '$root${Platform.pathSeparator}';
  return path.startsWith(prefix);
}

String _joinPath(String parent, String child) {
  final normalizedChild = child.replaceAll('/', Platform.pathSeparator);
  return parent.endsWith(Platform.pathSeparator)
      ? '$parent$normalizedChild'
      : '$parent${Platform.pathSeparator}$normalizedChild';
}

bool _isAbsolutePath(String path) =>
    path.startsWith(Platform.pathSeparator) ||
    (Platform.isWindows && RegExp(r'^(?:[A-Za-z]:[/\\]|\\\\)').hasMatch(path));

String _boundedPath(String value) {
  final singleLine = value.replaceAll(RegExp(r'[\r\n]'), ' ');
  return singleLine.length <= 200
      ? singleLine
      : '${singleLine.substring(0, 197)}...';
}

Future<void> setSettleoraMobileViewport(
  WidgetTester tester, {
  double width = 390,
  double height = 844,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
