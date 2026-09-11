import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_attachment_repository.dart';
import 'package:mobile/bills/bill_attachment_section.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_attachment_section_test.dart' as fixtures;
import '../helpers/settleora_visual_test_fonts.dart';

const _capture = Key('attachment-search-capture');
final _output = settleoraVisualOutputDirectory(
  '20260907-2138-attachment-search',
);
final _search = find.byKey(const Key('attachments-discovery-search'));
final _clear = find.byKey(const Key('attachments-discovery-clear-field'));
final _overall = find.byKey(const Key('attachments-discovery-clear'));
Finder _filter(String value) =>
    find.byKey(Key('attachments-discovery-filter-$value'));
TextField _field(WidgetTester tester) => tester.widget<TextField>(
  find.descendant(of: _search, matching: find.byType(TextField)),
);

fixtures.FakeBillAttachmentRepository _repository({
  Completer<void>? downloadCompleter,
}) => fixtures.FakeBillAttachmentRepository(
  downloadCompleter: downloadCompleter,
  attachments: [
    fixtures.sampleAttachment(
      fileId: 'private-file-id',
      contentType: 'image/png',
      sizeBytes: 512,
    ),
    fixtures.sampleAttachment(
      fileId: 's3://private-bucket/object-key/hidden.pdf',
      purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
      contentType: 'application/pdf',
      sizeBytes: 2048,
    ),
    fixtures.sampleAttachment(
      fileId: '/var/storage/internal-object',
      purpose: 'raw-OCR-secret',
      contentType: 'C:\\Users\\secret\\hidden.png token',
      sizeBytes: -1,
    ),
  ],
);
List<int> _calls(fixtures.FakeBillAttachmentRepository r) => [
  r.listCalls,
  r.attachCalls,
  r.downloadCalls,
  r.removeCalls,
];
Future<void> _mount(
  WidgetTester tester,
  fixtures.FakeBillAttachmentRepository repository, {
  double width = 390,
  double scale = 1,
  double inset = 0,
  String billId = 'private-bill-route',
  fixtures.FakeReceiptOcrReviewRepository? ocr,
}) async {
  await setSettleoraMobileViewport(tester, width: width);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _capture,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: inset),
          ),
          child: child!,
        ),
        home: Scaffold(
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: BillAttachmentSection(
                keyPrefix: 'attachments',
                reloadRevision: 0,
                route: SettleoraBillAttachmentRoute.personal(billId),
                repository: repository,
                fileInput: null,
                receiptOcrReviewRepository: ocr,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _tap(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> _query(WidgetTester tester, String value) async {
  await tester.ensureVisible(_search);
  await tester.enterText(_search, value);
  await tester.pumpAndSettle();
}

Future<void> _png(WidgetTester tester, String name) async {
  await tester.pump();
  expect(tester.takeException(), isNull, reason: name);
  await tester.runAsync(() async {
    final image = await tester
        .renderObject<RenderRepaintBoundary>(find.byKey(_capture))
        .toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(loadSettleoraVisualTestFonts);
  testWidgets(
    'shared discovery preserves controller listener, clear contract, focus and counts',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final repository = _repository();
      final ocr = fixtures.FakeReceiptOcrReviewRepository();
      await _mount(tester, repository, ocr: ocr);
      final calls = _calls(repository);
      expect(tester.widget(_search), isA<AppTextField>());
      final controller = _field(tester).controller!;
      expect(tester.widget<AppTextField>(_search).label, 'Search attachments');
      expect(
        _field(tester).decoration?.hintText,
        'Purpose, type, size, or date',
      );
      expect(_field(tester).textInputAction, TextInputAction.search);
      expect(_field(tester).onChanged, isNull);
      expect(_field(tester).autofocus, isFalse);
      expect(
        find.descendant(of: _search, matching: find.byIcon(Icons.search)),
        findsOneWidget,
      );
      expect(_clear, findsNothing);
      expect(_overall, findsNothing);
      for (final label in [
        'All (3)',
        'Receipts (1)',
        'Supporting (1)',
        'Reviewable OCR (1)',
        'Other (1)',
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      final value = TextEditingValue(
        text: '  PDF  ',
        selection: const TextSelection.collapsed(offset: 5),
      );
      controller.value = value;
      await tester.pumpAndSettle();
      expect(identical(_field(tester).controller, controller), isTrue);
      expect(controller.value, value);
      expect(find.text('Showing 1 of 3 attachments'), findsOneWidget);
      await _tap(tester, _filter('receipts'));
      expect(find.text('No matching attachments'), findsOneWidget);
      expect(
        find.text('Clear search or filters to show attachments again.'),
        findsOneWidget,
      );
      expect(
        tester.widget<IconButton>(_clear).tooltip,
        'Clear attachment discovery',
      );
      final size = tester.getSize(_clear);
      expect(size.width, greaterThanOrEqualTo(48));
      expect(size.height, greaterThanOrEqualTo(48));
      final clearSemantics = tester.getSemantics(_clear).getSemanticsData();
      expect(clearSemantics.tooltip, 'Clear attachment discovery');
      expect(clearSemantics.hasAction(ui.SemanticsAction.tap), isTrue);
      var clearNodes = 0;
      void countClear(SemanticsNode node) {
        if (node.getSemanticsData().tooltip == 'Clear attachment discovery') {
          clearNodes++;
        }
        node.visitChildren((child) {
          countClear(child);
          return true;
        });
      }

      countClear(tester.getSemantics(_search));
      expect(clearNodes, 1);
      var changes = 0;
      controller.addListener(() => changes++);
      await _tap(tester, _clear);
      expect(changes, 1);
      expect(controller.text, isEmpty);
      expect(tester.widget<FilterChip>(_filter('all')).selected, isTrue);
      expect(find.text('Showing 3 of 3 attachments'), findsOneWidget);
      await _tap(tester, _filter('supporting'));
      expect(controller.text, isEmpty);
      expect(_clear, findsOneWidget);
      await _tap(tester, _clear);
      expect(tester.widget<FilterChip>(_filter('all')).selected, isTrue);
      await _query(tester, 'image');
      await _tap(tester, _filter('receipts'));
      expect(find.text('Showing 1 of 3 attachments'), findsOneWidget);
      await _tap(tester, _overall);
      expect(controller.text, isEmpty);
      expect(tester.widget<FilterChip>(_filter('all')).selected, isTrue);
      await _tap(tester, _search);
      final editable = tester.widget<EditableText>(
        find.descendant(of: _search, matching: find.byType(EditableText)),
      );
      expect(editable.focusNode.hasFocus, isTrue);
      expect(tester.testTextInput.isVisible, isTrue);
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(editable.focusNode.hasFocus, isFalse);
      expect(_calls(repository), calls);
      expect(ocr.getCalls, 0);
      semantics.dispose();
    },
  );

  testWidgets(
    'safe metadata searches exclude actual private IDs and sanitized metadata',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final repository = _repository();
      await _mount(tester, repository);
      final calls = _calls(repository);
      final privateValues = [
        'private-file-id',
        'private-bill-route',
        's3://private-bucket/object-key/hidden.pdf',
        '/var/storage/internal-object',
        'raw-OCR-secret',
        'C:\\Users\\secret\\hidden.png token',
        'private-bucket',
        'object-key',
        'hidden.pdf',
      ];
      for (final value in privateValues) {
        expect(fixtures.visibleText(tester), isNot(contains(value)));
        expect(
          find.bySemanticsLabel(RegExp(RegExp.escape(value))),
          findsNothing,
        );
        await _query(tester, value);
        expect(find.text('Showing 0 of 3 attachments'), findsOneWidget);
        // Typed input is user-owned text; after clear neither field nor rows expose it.
        await _tap(tester, _clear);
        expect(
          find.bySemanticsLabel(RegExp(RegExp.escape(value))),
          findsNothing,
        );
      }
      final date = repository.attachments.first.uploadedAtUtc
          .toLocal()
          .toString()
          .split(' ')
          .first;
      for (final entry in {
        'Receipt': 1,
        'application/pdf': 1,
        '512 bytes': 1,
        '2.0 KiB': 1,
        repository.attachments.first.uploadedAtUtc
                .toLocal()
                .toString()
                .split(' ')
                .last
                .split('.')
                .first:
            3,
        repository.attachments.first.updatedAtUtc
                .toLocal()
                .toString()
                .split(' ')
                .last
                .split('.')
                .first:
            3,
        date: 3,
        'Unknown type': 1,
      }.entries) {
        await _query(tester, entry.key);
        expect(
          find.text('Showing ${entry.value} of 3 attachments'),
          findsOneWidget,
        );
      }
      expect(_calls(repository), calls);
      semantics.dispose();
    },
  );

  testWidgets(
    'route reset and busy refresh retain controller and file boundary',
    (tester) async {
      final repository = _repository();
      await _mount(tester, repository);
      final controller = _field(tester).controller;
      await _query(tester, 'pdf');
      await _tap(tester, _filter('supporting'));
      await _mount(tester, repository, billId: 'next-private-bill');
      expect(identical(_field(tester).controller, controller), isTrue);
      expect(controller!.text, isEmpty);
      expect(_clear, findsNothing);
      expect(tester.widget<FilterChip>(_filter('all')).selected, isTrue);
      repository.listCompleter = Completer<void>();
      await tester.tap(find.byKey(const Key('attachments-refresh')));
      await tester.pump();
      expect(_search, findsNothing);
      expect(_clear, findsNothing);
      expect(_overall, findsNothing);
      repository.listCompleter!.complete();
      await tester.pumpAndSettle();
      expect(identical(_field(tester).controller, controller), isTrue);
      expect(_calls(repository), [3, 0, 0, 0]);
    },
  );

  for (final width in [390.0, 320.0]) {
    testWidgets(
      'production discovery captures ${width.toInt()} and scaled field',
      (tester) async {
        final pendingDownload = Completer<void>();
        final repository = _repository(downloadCompleter: pendingDownload);
        final ocr = fixtures.FakeReceiptOcrReviewRepository();
        final scale = width == 320 ? 2.0 : 1.0;
        await _mount(tester, repository, width: width, scale: scale, ocr: ocr);
        final calls = _calls(repository);
        final prefix = '${width.toInt()}-${scale.toInt()}x';
        final label = find.descendant(
          of: _search,
          matching: find.text('Search attachments'),
        );
        final input = find.descendant(
          of: _search,
          matching: find.byType(TextField),
        );
        expect(
          tester.getBottomRight(label).dy,
          lessThan(tester.getTopLeft(input).dy),
        );
        expect(tester.getSize(label).width, lessThanOrEqualTo(width - 32));
        await _png(tester, '$prefix-normal');
        for (final query in [
          'Receipt',
          'application/pdf',
          '512 bytes',
          '2026',
          'no match',
        ]) {
          await _query(tester, query);
          expect(_clear, findsOneWidget);
          expect(tester.getSize(_clear).shortestSide, greaterThanOrEqualTo(48));
          await _png(
            tester,
            '$prefix-query-${query.replaceAll('/', '-').replaceAll(' ', '-')}',
          );
          await _tap(tester, _clear);
        }
        await _png(tester, '$prefix-field-clear');
        for (final filter in ['receipts', 'supporting', 'reviewableOcr']) {
          await _tap(tester, _filter(filter));
          expect(_clear, findsOneWidget);
          await tester.ensureVisible(_search);
          await tester.pumpAndSettle();
          await _png(tester, '$prefix-filter-$filter');
        }
        await _tap(tester, _overall);
        await tester.ensureVisible(_search);
        await tester.pumpAndSettle();
        await _png(tester, '$prefix-overall-clear');
        expect(_calls(repository), calls);
        // Download busy state avoids the separately recorded baseline narrow
        // refresh-status row overflow; existing tests cover every busy guard.
        final download = find.byKey(const ValueKey('attachments-download-0'));
        await tester.ensureVisible(download);
        await tester.pumpAndSettle();
        await tester.tap(download);
        await tester.pump(const Duration(milliseconds: 100));
        expect(_search, findsNothing);
        tester
            .state<ScrollableState>(find.byType(Scrollable).first)
            .position
            .jumpTo(0);
        await tester.pump();
        await _png(tester, '$prefix-busy');
        pendingDownload.complete();
        await tester.pumpAndSettle();
        await _mount(
          tester,
          repository,
          width: width,
          scale: scale,
          inset: 300,
          ocr: ocr,
        );
        await _tap(tester, _search);
        expect(tester.testTextInput.isVisible, isTrue);
        await _png(tester, '$prefix-focused-inset');
        // Framework reports any unsuppressed layout errors at test completion.
      },
    );
  }
}
