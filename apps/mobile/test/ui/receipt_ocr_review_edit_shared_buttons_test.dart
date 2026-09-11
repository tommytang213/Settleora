import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../receipt_ocr_review_screen_test.dart' as ocr;

const _captureKey = Key('receipt-review-edit-actions-capture');
const _cancelKey = Key('receipt-review-edit-cancel');
const _saveKey = Key('receipt-review-edit-save');
const _deleteKey = Key('receipt-review-edit-delete');
final _output = settleoraVisualOutputDirectory(
  '20260908-1224-receipt-review-edit-actions',
);

Future<void> _mountEditing(
  WidgetTester tester, {
  required ocr.FakeReceiptOcrReviewRepository repository,
  required double width,
  required double scale,
}) async {
  await setSettleoraMobileViewport(tester, width: width);
  final route = ocr.sampleRoute();
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: ReceiptOcrReviewDetailScreen.forRoute(
          repository: repository,
          route: route,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('Edit receipt review'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.byKey(_saveKey));
  await tester.pumpAndSettle();
}

Future<void> _capture(WidgetTester tester, String name) async {
  await tester.pump();
  expect(tester.takeException(), isNull, reason: name);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

Future<void> _focusAction(WidgetTester tester, Key key) async {
  for (var attempt = 0; attempt < 30; attempt++) {
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final focusContext = FocusManager.instance.primaryFocus?.context;
    if (focusContext == null) {
      continue;
    }
    final focusedElement = find
        .ancestor(
          of: find.byElementPredicate(
            (element) => identical(element, focusContext),
          ),
          matching: find.byKey(key),
        )
        .evaluate();
    if (focusedElement.isNotEmpty) {
      await tester.pump(const Duration(milliseconds: 300));
      final rect = tester.getRect(find.byKey(key));
      final viewportSize =
          tester.view.physicalSize / tester.view.devicePixelRatio;
      expect(rect.top, greaterThanOrEqualTo(0), reason: '$key top');
      expect(
        rect.bottom,
        lessThanOrEqualTo(viewportSize.height),
        reason: '$key bottom',
      );
      return;
    }
  }
  fail('Could not focus $key through deterministic keyboard traversal.');
}

void _expectSharedActions() {
  expect(find.byKey(_cancelKey), findsOneWidget);
  expect(find.byKey(_saveKey), findsOneWidget);
  expect(find.byType(AppButton), findsNWidgets(2));
  expect(find.text('Cancel'), findsOneWidget);
  expect(find.text('Save'), findsOneWidget);
}

void main() {
  setUpAll(loadSettleoraVisualTestFonts);

  for (final viewport in const [
    (width: 390.0, scale: 1.0, tag: '390-1x'),
    (width: 320.0, scale: 2.0, tag: '320-2x'),
  ]) {
    testWidgets('production edit actions capture ${viewport.tag}', (
      tester,
    ) async {
      final originalHighlightStrategy = FocusManager.instance.highlightStrategy;
      FocusManager.instance.highlightStrategy =
          FocusHighlightStrategy.alwaysTraditional;
      addTearDown(() {
        FocusManager.instance.highlightStrategy = originalHighlightStrategy;
      });
      await _mountEditing(
        tester,
        repository: ocr.FakeReceiptOcrReviewRepository(
          reviewResponse: ocr.sampleReview(ocr.sampleRoute()),
        ),
        width: viewport.width,
        scale: viewport.scale,
      );
      _expectSharedActions();
      expect(
        tester.getSize(find.byKey(_cancelKey)).height,
        greaterThanOrEqualTo(48),
      );
      expect(
        tester.getSize(find.byKey(_saveKey)).height,
        greaterThanOrEqualTo(48),
      );
      await _capture(tester, '${viewport.tag}-idle');

      await _focusAction(tester, _cancelKey);
      await _capture(tester, '${viewport.tag}-cancel-focus');

      await _mountEditing(
        tester,
        repository: ocr.FakeReceiptOcrReviewRepository(
          reviewResponse: ocr.sampleReview(ocr.sampleRoute()),
        ),
        width: viewport.width,
        scale: viewport.scale,
      );
      await _focusAction(tester, _saveKey);
      await _capture(tester, '${viewport.tag}-save-focus');

      final saveCompleter = Completer<ReceiptOcrReviewDetail>();
      final savingRepository = ocr.FakeReceiptOcrReviewRepository(
        reviewResponse: ocr.sampleReview(ocr.sampleRoute()),
        saveCompleter: saveCompleter,
      );
      await _mountEditing(
        tester,
        repository: savingRepository,
        width: viewport.width,
        scale: viewport.scale,
      );
      await tester.tap(find.byKey(_saveKey));
      await tester.pump();
      expect(tester.widget<AppButton>(find.byKey(_saveKey)).isLoading, isTrue);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await _capture(tester, '${viewport.tag}-saving');

      final deleteCompleter = Completer<void>();
      final deletingRepository = ocr.FakeReceiptOcrReviewRepository(
        reviewResponse: ocr.sampleReview(ocr.sampleRoute()),
        deleteCompleter: deleteCompleter,
      );
      await _mountEditing(
        tester,
        repository: deletingRepository,
        width: viewport.width,
        scale: viewport.scale,
      );
      await tester.ensureVisible(find.byKey(_deleteKey));
      await tester.tap(find.byKey(_deleteKey));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
      expect(deletingRepository.deleteCalls, 1);
      await tester.ensureVisible(find.byKey(_saveKey));
      await tester.pump();
      expect(tester.widget<AppButton>(find.byKey(_saveKey)).isLoading, isFalse);
      expect(tester.widget<AppButton>(find.byKey(_saveKey)).onPressed, isNull);
      expect(
        tester.widget<AppButton>(find.byKey(_cancelKey)).onPressed,
        isNull,
      );
      await _capture(tester, '${viewport.tag}-delete-busy-disabled');
    });
  }
}
