import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_revision_review_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_revision_review_screen_test.dart' as revision;
import '../helpers/settleora_visual_test_fonts.dart';
import '../receipt_ocr_review_screen_test.dart' as ocr;

const _output =
    '/workspace/logs/settleora-visual-qa/20260907-1141-status-chips';
const _captureKey = Key('status-chip-adoption-capture');

void main() {
  testWidgets(
    'default clamp and opt-in wrap retain light theme static labels',
    (tester) async {
      await _setup(tester, width: 320);
      final semantics = tester.ensureSemantics();
      const compact = 'A long compact status label';
      const wrapped = 'Unsupported review status';
      await _pump(
        tester,
        const Scaffold(
          body: Center(
            child: SizedBox(
              width: 180,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  StatusChip(label: compact),
                  SizedBox(height: SettleoraSpacing.md),
                  StatusChip(
                    label: wrapped,
                    icon: Icons.info_outline,
                    wrap: true,
                  ),
                ],
              ),
            ),
          ),
        ),
        scale: 2,
        light: true,
      );
      for (final label in [compact, wrapped]) {
        _expectStatic(tester, label);
        final paragraph = tester.renderObject<RenderParagraph>(
          find.descendant(of: _chip(label), matching: find.byType(Text)),
        );
        expect(paragraph.didExceedMaxLines, label == compact);
      }
      await _capture(tester, 'shared-light-clamp-wrap-2.0x.png');
      semantics.dispose();
    },
  );
  for (final scale in [1.0, 2.0]) {
    testWidgets('shared chips wrap safely with icons and without at $scale', (
      tester,
    ) async {
      await _setup(tester, width: 320);
      final semantics = tester.ensureSemantics();
      const longLabel = 'Unsupported review source requiring manual review';
      await _pump(
        tester,
        const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(SettleoraSpacing.md),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusChip(
                  label: longLabel,
                  icon: Icons.info_outline,
                  wrap: true,
                ),
                StatusChip(label: 'Missing line total', wrap: true),
                StatusChip(
                  label: 'Provisional',
                  icon: Icons.pending_actions_outlined,
                  wrap: true,
                ),
                StatusChip(label: 'Reviewed', size: StatusChipSize.small),
              ],
            ),
          ),
        ),
        scale: scale,
      );
      for (final label in [
        longLabel,
        'Missing line total',
        'Provisional',
        'Reviewed',
      ]) {
        _expectStatic(tester, label);
        final text = find.descendant(
          of: _chip(label),
          matching: find.byType(Text),
        );
        final paragraph = tester.renderObject<RenderParagraph>(text);
        expect(paragraph.didExceedMaxLines, isFalse);
        expect(
          tester.getRect(_chip(label)).contains(tester.getRect(text).topLeft),
          isTrue,
        );
        expect(
          tester
              .getRect(_chip(label))
              .contains(tester.getRect(text).bottomRight),
          isTrue,
        );
      }
      expect(
        find.descendant(
          of: _chip(longLabel),
          matching: find.byIcon(Icons.info_outline),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: _chip('Missing line total'),
          matching: find.byType(Icon),
        ),
        findsNothing,
      );
      expect(tester.getSize(find.text(longLabel)).height, greaterThan(20));

      await _capture(tester, 'shared-long-label-${scale}x.png');
      semantics.dispose();
    });

    testWidgets('OCR queue and detail preserve chip labels at $scale', (
      tester,
    ) async {
      await _setup(tester);
      final semantics = tester.ensureSemantics();
      final route = ocr.sampleRoute();
      const merchant =
          'Corner Market grocery receipt with household essentials';
      final lines = ocr.discoveryLines();
      final first = lines.first;
      lines[0] = ReceiptOcrReviewLine(
        id: first.id,
        sortOrder: first.sortOrder,
        text: 'Whole milk and household groceries for the weekend',
        quantity: first.quantity,
        unitPriceAmount: first.unitPriceAmount,
        lineTotalAmount: first.lineTotalAmount,
        createdAtUtc: first.createdAtUtc,
        updatedAtUtc: first.updatedAtUtc,
      );
      final repository = ocr.FakeReceiptOcrReviewRepository(
        listResponse: [
          ocr.sampleSummary(
            status: ReceiptOcrReviewStatusValues.provisional,
            merchantText: merchant,
          ),
        ],
        reviewResponse: ocr.sampleReview(
          route,
          merchantText: merchant,
          lines: lines,
        ),
        previewResponse: ocr.samplePreview(
          route,
          canApply: false,
          blockedReasons: const [
            ReceiptOcrReviewApplyPreviewIssueCodeValues.unsupportedReviewStatus,
          ],
          warnings: const [
            ReceiptOcrReviewApplyPreviewIssueCodeValues.lineTotalMismatch,
          ],
        ),
      );
      await _pump(
        tester,
        ReceiptOcrReviewQueueScreen(repository: repository),
        scale: scale,
      );
      expect(_chip('Provisional'), findsOneWidget);
      _expectTrailingChipWidth(tester, _chip('Provisional'));
      expect(find.byIcon(Icons.pending_actions_outlined), findsOneWidget);
      // The parent row remains the sole navigation target and owns its label.
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Open personal bill receipt review.*Status: Provisional',
            dotAll: true,
          ),
        ),
        findsOneWidget,
      );
      expect(repository.getCalls, 0);
      await _capture(tester, 'ocr-queue-${scale}x.png');
      await _pump(
        tester,
        ReceiptOcrReviewDetailScreen.forRoute(
          repository: repository,
          route: route,
        ),
        scale: scale,
      );
      _expectStatic(tester, 'Reviewed');
      _expectTrailingChipWidth(tester, _chip('Reviewed'));
      await _capture(tester, 'ocr-detail-status-${scale}x.png');
      await Scrollable.ensureVisible(
        tester.element(find.text('Missing line total')),
        alignment: 0.25,
      );
      await tester.pumpAndSettle();
      _expectStatic(tester, 'Missing line total');
      _expectTrailingChipWidth(tester, _chip('Missing line total'));
      _expectTrailingChipWidth(tester, _chip('Ready').first);
      expect(_chip('Qty needs review'), findsWidgets);
      expect(_chip('Unit needs review'), findsWidgets);
      expect(_chip('Line needs review'), findsOneWidget);
      await _capture(tester, 'ocr-line-chips-${scale}x.png');
      await tester.ensureVisible(
        find.widgetWithText(OutlinedButton, 'Preview changes'),
      );
      await tester.tap(find.widgetWithText(OutlinedButton, 'Preview changes'));
      await tester.pumpAndSettle();
      await Scrollable.ensureVisible(
        tester.element(find.text('Unsupported review status')),
        alignment: 0.35,
      );
      await tester.pumpAndSettle();
      for (final label in [
        'Unsupported review status',
        'Line total mismatch',
      ]) {
        _expectStatic(tester, label);
      }
      expect(find.bySemanticsLabel('OCR review issue'), findsNWidgets(2));
      await _capture(tester, 'ocr-issue-chips-${scale}x.png');
      expect(repository.previewCalls, 1);
      expect(repository.saveCalls, 0);
      expect(repository.applyCalls, 0);
      expect(repository.deleteCalls, 0);
      expect(
        repository.reviewResponse!.status,
        ReceiptOcrReviewStatusValues.reviewed,
      );

      semantics.dispose();
    });

    testWidgets('revision scope and impact stay static at $scale', (
      tester,
    ) async {
      await _setup(tester);
      final semantics = tester.ensureSemantics();
      final repository = revision.FakeBillRevisionRepository(
        revision: revision.sampleRevision(),
      );
      await _pump(
        tester,
        SettleoraBillRevisionReviewScreen(
          repository: repository,
          billId: repository.revision.billId,
          revisionId: repository.revision.id,
          billLabel: 'Corner Market',
        ),
        scale: scale,
      );
      await tester.scrollUntilVisible(
        _chip('Direct money impact'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(_chip('Bill total')),
        alignment: 0.3,
      );
      await tester.pumpAndSettle();
      for (final label in ['Bill total', 'Direct money impact']) {
        _expectStatic(tester, label);
        final paragraph = tester.renderObject<RenderParagraph>(
          find.descendant(of: _chip(label), matching: find.byType(Text)),
        );
        expect(paragraph.didExceedMaxLines, isFalse);
      }
      expect(
        find.descendant(
          of: _chip('Bill total'),
          matching: find.byIcon(Icons.label_outline),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: _chip('Direct money impact'),
          matching: find.byIcon(Icons.person_search_outlined),
        ),
        findsOneWidget,
      );
      await _capture(tester, 'revision-chips-${scale}x.png');
      expect(repository.approveCalls, 0);
      expect(repository.rejectCalls, 0);
      expect(repository.confirmPayerCalls, 0);
      expect(repository.applyCalls, 0);
      expect(repository.submitCalls, 0);
      expect(repository.withdrawCalls, 0);
      expect(repository.reviseCalls, 0);

      semantics.dispose();
    });
  }
}

Finder _chip(String label) =>
    find.byWidgetPredicate((w) => w is StatusChip && w.label == label);

// The chip must consume only its natural width up to its cap. A loose flex
// sibling would reserve half the row and truncate the adjacent OCR text early.
void _expectTrailingChipWidth(WidgetTester tester, Finder chip) {
  final row = find.ancestor(of: chip, matching: find.byType(Row)).first;
  expect(tester.getRect(chip).right, closeTo(tester.getRect(row).right, 0.01));
  expect(
    tester.getSize(chip).width,
    lessThanOrEqualTo(tester.getSize(row).width / 2),
  );
}

void _expectStatic(WidgetTester tester, String label) {
  expect(_chip(label), findsOneWidget);
  final nodes = find.descendant(
    of: _chip(label),
    matching: find.bySemanticsLabel(label),
  );
  expect(nodes, findsOneWidget);
  final data = tester.getSemantics(nodes).getSemanticsData();
  expect(data.hasAction(SemanticsAction.tap), isFalse);
  expect(data.flagsCollection.isButton, isFalse);
}

Future<void> _setup(WidgetTester tester, {double width = 390}) async {
  await setSettleoraMobileViewport(tester, width: width);
  await tester.runAsync(() async {
    await loadSettleoraVisualTestFonts();
    await Directory(_output).create(recursive: true);
  });
}

Future<void> _pump(
  WidgetTester tester,
  Widget home, {
  double scale = 1,
  bool light = false,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: light ? SettleoraTheme.light() : SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: home,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _capture(WidgetTester tester, String name) async {
  expect(tester.takeException(), isNull);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('$_output/$name').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
