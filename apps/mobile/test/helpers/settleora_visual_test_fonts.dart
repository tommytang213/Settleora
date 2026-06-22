import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

const _robotoRegularPath =
    '/opt/flutter/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf';
const _materialIconsPath =
    '/opt/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf';

Future<void> loadSettleoraVisualTestFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  final robotoBytes = await File(_robotoRegularPath).readAsBytes();
  final materialIconBytes = await File(_materialIconsPath).readAsBytes();

  await ui.loadFontFromList(
    Uint8List.fromList(robotoBytes),
    fontFamily: 'Roboto',
  );
  await ui.loadFontFromList(
    Uint8List.fromList(materialIconBytes),
    fontFamily: 'MaterialIcons',
  );
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
