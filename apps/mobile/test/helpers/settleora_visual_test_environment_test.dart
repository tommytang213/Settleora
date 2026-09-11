import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'settleora_visual_test_fonts.dart';

void main() {
  late Directory temporaryDirectory;

  setUp(() {
    temporaryDirectory = Directory.systemTemp.createTempSync(
      'settleora-visual-environment-',
    );
  });

  tearDown(() {
    temporaryDirectory.deleteSync(recursive: true);
  });

  test('resolves material fonts from a valid FLUTTER_ROOT', () {
    final sdk = _fakeFlutterSdk(temporaryDirectory);

    final fonts = resolveSettleoraFlutterTestFonts(
      environment: {'FLUTTER_ROOT': sdk.path},
      resolvedExecutable: '/ignored/runtime/dart',
    );

    expect(fonts.sdkRoot, sdk.resolveSymbolicLinksSync());
    expect(
      fonts.robotoRegular,
      startsWith('${fonts.sdkRoot}${Platform.pathSeparator}'),
    );
    expect(
      fonts.materialIcons,
      startsWith('${fonts.sdkRoot}${Platform.pathSeparator}'),
    );
    expect(File(fonts.robotoRegular).existsSync(), isTrue);
    expect(File(fonts.materialIcons).existsSync(), isTrue);
  });

  test('falls back through the Flutter test runtime executable ancestors', () {
    final sdk = _fakeFlutterSdk(temporaryDirectory);
    final executable = File(
      '${sdk.path}${Platform.pathSeparator}bin${Platform.pathSeparator}cache'
      '${Platform.pathSeparator}dart-sdk${Platform.pathSeparator}bin'
      '${Platform.pathSeparator}dart',
    )..createSync(recursive: true);

    final fonts = resolveSettleoraFlutterTestFonts(
      environment: const {},
      resolvedExecutable: executable.path,
    );

    expect(fonts.sdkRoot, sdk.resolveSymbolicLinksSync());
  });

  test('invalid configured root fails with a bounded diagnostic', () {
    final invalidRoot = Directory('${temporaryDirectory.path}/not-flutter')
      ..createSync();

    expect(
      () => resolveSettleoraFlutterTestFonts(
        environment: {
          'FLUTTER_ROOT': invalidRoot.path,
          'UNRELATED_SECRET': 'must-not-appear',
        },
      ),
      throwsA(
        isA<StateError>()
            .having((error) => '$error', 'message', contains('FLUTTER_ROOT'))
            .having(
              (error) => '$error',
              'expected files',
              contains('Roboto-Regular.ttf,MaterialIcons-Regular.otf'),
            )
            .having(
              (error) => '$error',
              'unrelated environment omitted',
              isNot(contains('must-not-appear')),
            ),
      ),
    );
  });

  test('missing fallback root fails with a bounded diagnostic', () {
    expect(
      () => resolveSettleoraFlutterTestFonts(
        environment: const {},
        resolvedExecutable: '/not-a-flutter-sdk/bin/dart',
      ),
      throwsA(
        isA<StateError>().having(
          (error) => '$error',
          'message',
          contains('Set FLUTTER_ROOT'),
        ),
      ),
    );
  });

  test('rejects a material font that resolves outside the SDK root', () {
    final sdk = _fakeFlutterSdk(temporaryDirectory);
    final roboto = File(
      '${sdk.path}/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf',
    );
    roboto.deleteSync();
    final outside = File('${temporaryDirectory.path}/outside.ttf')
      ..writeAsBytesSync([1]);
    Link(roboto.path).createSync(outside.path);

    expect(
      () => resolveSettleoraFlutterTestFonts(
        environment: {'FLUTTER_ROOT': sdk.path},
      ),
      throwsA(
        isA<StateError>().having(
          (error) => '$error',
          'message',
          contains('escape the Flutter SDK root'),
        ),
      ),
    );
  });

  test('visual output accepts an explicit portable root', () {
    final configuredRoot = '${temporaryDirectory.path}/configured-output';

    final output = settleoraVisualOutputDirectory(
      'task/candidate-a',
      environment: {
        settleoraVisualOutputRootEnvironmentVariable: configuredRoot,
      },
      workingDirectory: '/ignored',
    );

    expect(output, '$configuredRoot/task/candidate-a');
  });

  test('visual output defaults to a writable build directory', () {
    final output = settleoraVisualOutputDirectory(
      'task-evidence',
      environment: const {},
      workingDirectory: temporaryDirectory.path,
    );
    final outputDirectory = Directory(output)..createSync(recursive: true);
    final evidence = File('${outputDirectory.path}/evidence.png')
      ..writeAsBytesSync([0x89, 0x50, 0x4e, 0x47]);

    expect(
      output,
      '${temporaryDirectory.path}/build/settleora-visual-qa/task-evidence',
    );
    expect(evidence.lengthSync(), greaterThan(0));
  });

  testWidgets('loads the real Roboto and Material Icons font files', (
    tester,
  ) async {
    await tester.runAsync(loadSettleoraVisualTestFonts);
  });
}

Directory _fakeFlutterSdk(Directory parent) {
  final sdk = Directory('${parent.path}/flutter')..createSync();
  final fontDirectory = Directory(
    '${sdk.path}/bin/cache/artifacts/material_fonts',
  )..createSync(recursive: true);
  File('${fontDirectory.path}/Roboto-Regular.ttf').writeAsBytesSync([1]);
  File('${fontDirectory.path}/MaterialIcons-Regular.otf').writeAsBytesSync([2]);
  return sdk;
}
