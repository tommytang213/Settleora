import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/notifications/notification_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../notification_screen_test.dart' as f;

const _id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const _capture = Key('notification-actions-capture');
const _output =
    '/workspace/logs/settleora-visual-qa/20260907-1906-notifications';
final _bulk = find.byKey(const Key('notification-mark-visible-read'));
Finder _primary(String kind) =>
    find.byKey(ValueKey('notification-open-$kind-0'));

class _RouteObserver extends NavigatorObserver {
  int pushes = 0;
  int pops = 0;
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    pushes++;
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    pops++;
  }
}

class _HeldRepository extends f.FakeNotificationRepository {
  _HeldRepository({required super.notifications});
  final release = Completer<void>();
  final events = <String>[];

  @override
  Future<SettleoraNotificationRow> markNotificationRead(String id) async {
    events.add('mark:$id');
    await release.future;
    return super.markNotificationRead(id);
  }

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() {
    events.add('summary');
    return super.getNotificationSummary();
  }

  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) {
    events.add('list');
    return super.listNotifications(
      status: status,
      limit: limit,
      before: before,
    );
  }
}

Future<void> _mount(
  WidgetTester tester,
  f.FakeNotificationRepository repository, {
  double width = 390,
  double scale = 1,
  f.FakeSyncRepository? sync,
  _RouteObserver? observer,
}) async {
  await setSettleoraMobileViewport(tester, width: width);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _capture,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        navigatorObservers: [if (observer != null) observer],
        theme: SettleoraTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: SettleoraNotificationScreen(
          repository: repository,
          currentUserProfileId: _id,
          billRepository: f.FakeBillRepository(),
          groupRepository: f.FakeGroupRepository(),
          billRevisionRepository: f.FakeBillRevisionRepository(),
          settlementRepository: f.FakeSettlementRepository(),
          recurringBillRepository: f.FakeRecurringBillRepository(),
          receiptOcrReviewRepository: f.FakeReceiptOcrReviewRepository(),
          syncRepository: sync ?? f.FakeSyncRepository(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _show(
  WidgetTester tester,
  Finder finder, {
  bool busy = false,
}) async {
  final scroll = tester.state<ScrollableState>(
    find
        .descendant(
          of: find.byType(ListView).last,
          matching: find.byType(Scrollable),
        )
        .first,
  );
  scroll.position.jumpTo(0);
  await tester.pump();
  for (var i = 0; finder.evaluate().isEmpty && i < 30; i++) {
    scroll.position.jumpTo(
      (scroll.position.pixels + 250).clamp(0, scroll.position.maxScrollExtent),
    );
    await tester.pump();
  }
  await Scrollable.ensureVisible(tester.element(finder), alignment: 0.5);
  if (busy) {
    await tester.pump(const Duration(milliseconds: 120));
  } else {
    await tester.pumpAndSettle();
  }
}

Future<void> _captureImage(WidgetTester tester, String name) async {
  expect(tester.takeException(), isNull);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_capture),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  final cases = [
    (
      kind: 'revision',
      label: 'Review bill',
      icon: Icons.open_in_new_outlined,
      row: f.sampleNotification(
        eventType: 'bill.revision_submitted',
        expenseBillId: _id,
        expenseBillRevisionId: _id,
      ),
    ),
    (
      kind: 'group-bill',
      label: 'Open bill',
      icon: Icons.receipt_long_outlined,
      row: f.sampleNotification(groupId: _id, expenseBillId: _id),
    ),
    (
      kind: 'personal-bill',
      label: 'Open bill',
      icon: Icons.receipt_outlined,
      row: f.sampleNotification(expenseBillId: _id),
    ),
    (
      kind: 'settlement',
      label: 'Review settlement',
      icon: Icons.account_balance_wallet_outlined,
      row: f.sampleNotification(
        eventType: 'settlement.request_created',
        subjectType: 'settlement_request',
        settlementRequestId: _id,
      ),
    ),
    (
      kind: 'recurring',
      label: 'Review bill',
      icon: Icons.event_repeat_outlined,
      row: f.sampleNotification(
        eventType: 'recurring_bill.draft_generated',
        subjectType: 'recurring_bill_occurrence',
        recurringBillTemplateId: _id,
        recurringBillOccurrenceId: _id,
      ),
    ),
    (
      kind: 'receipt-review',
      label: 'Review receipt',
      icon: Icons.document_scanner_outlined,
      row: f.sampleNotification(
        eventType: 'ocr.needs_review',
        subjectType: 'receipt_ocr_review',
        expenseBillId: _id,
        receiptOcrReviewId: _id,
        receiptAttachmentFileId: _id,
      ),
    ),
    (
      kind: 'sync',
      label: 'Review sync issue',
      icon: Icons.sync_problem_outlined,
      row: f.sampleNotification(
        eventType: 'sync.conflict_detected',
        subjectType: 'sync_operation',
        syncOperationId: _id,
      ),
    ),
  ];
  for (final c in cases) {
    testWidgets(
      '${c.kind} preserves production key label icon width and busy semantics',
      (tester) async {
        final semantics = tester.ensureSemantics();

        final repository = _HeldRepository(notifications: [c.row]);
        final observer = _RouteObserver();
        await _mount(tester, repository, observer: observer);
        final primary = _primary(c.kind);
        await _show(tester, primary);
        expect(primary, findsOneWidget);
        final sharedFinder = find.descendant(
          of: primary,
          matching: find.byType(AppButton),
        );
        final button = tester.widget<AppButton>(sharedFinder);
        expect(button.label, c.label);
        expect(button.icon, c.icon);
        expect(button.expanded, isTrue);
        expect(button.onPressed, isNotNull);
        final card = find
            .ancestor(of: primary, matching: find.byType(AppCard))
            .first;
        expect(
          tester.getSize(primary).width,
          greaterThan(tester.getSize(card).width - 50),
        );
        expect(tester.getSize(primary).height, greaterThanOrEqualTo(48));
        expect(find.bySemanticsLabel(c.label), findsOneWidget);
        expect(
          tester
              .getSemantics(find.bySemanticsLabel(c.label))
              .getSemanticsData()
              .hasAction(ui.SemanticsAction.tap),
          isTrue,
        );
        await _show(tester, _bulk);
        await tester.tap(_bulk);
        await tester.pump();
        await _show(tester, primary, busy: true);
        expect(tester.widget<AppButton>(sharedFinder).onPressed, isNull);
        expect(
          tester
              .getSemantics(find.bySemanticsLabel(c.label))
              .getSemanticsData()
              .hasAction(ui.SemanticsAction.tap),
          isFalse,
        );
        repository.release.complete();
        await tester.pumpAndSettle();
        expect(repository.markReadCalls, 1);
        await _show(tester, primary);
        final staleOpen = tester.widget<AppButton>(sharedFinder).onPressed!;
        final node = tester.getSemantics(find.bySemanticsLabel(c.label));
        await tester.tap(primary);
        tester.binding.pipelineOwner.semanticsOwner!.performAction(
          node.id,
          ui.SemanticsAction.tap,
        );
        staleOpen();
        await tester.pumpAndSettle();
        expect(
          observer.pushes,
          2,
        ); // Initial inbox plus exactly one destination.
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(observer.pops, 1);
        expect(
          repository.markReadCalls,
          1,
        ); // Already read, no repeated mutation.
        semantics.dispose();
      },
    );
  }

  for (final viewport in [(390.0, 1.0), (320.0, 2.0)]) {
    testWidgets(
      'production actions capture ${viewport.$1}/${viewport.$2} and bulk single flight',
      (tester) async {
        final semantics = tester.ensureSemantics();

        await tester.runAsync(loadSettleoraVisualTestFonts);
        final repository = _HeldRepository(
          notifications: [
            cases.last.row,
            f.sampleNotification(id: 'second'),
          ],
        );
        await _mount(
          tester,
          repository,
          width: viewport.$1,
          scale: viewport.$2,
        );
        final tag = '${viewport.$1.toInt()}-${viewport.$2.toInt()}x';
        await _show(tester, _primary('sync'));
        await _captureImage(tester, 'typed-primary-$tag');
        await _show(tester, _bulk);
        expect(
          tester.widget(_bulk),
          isA<TextButton>(),
        ); // Transparent compact hierarchy is intentionally retained.
        expect(
          find.descendant(
            of: _bulk,
            matching: find.byIcon(Icons.mark_email_read_outlined),
          ),
          findsOneWidget,
        );
        expect(tester.getSize(_bulk).height, greaterThanOrEqualTo(48));
        expect(tester.getSize(_bulk).width, lessThan(viewport.$1));
        await _captureImage(tester, 'bulk-idle-$tag');
        final staleCallback = tester.widget<TextButton>(_bulk).onPressed!;
        final node = tester.getSemantics(_bulk);
        tester.binding.pipelineOwner.semanticsOwner!.performAction(
          node.id,
          ui.SemanticsAction.tap,
        );
        staleCallback();
        await tester.tap(_bulk);
        await tester.pump();
        expect(repository.events, [
          'summary',
          'list',
          'mark:${cases.last.row.id}',
        ]);
        expect(tester.widget<TextButton>(_bulk).onPressed, isNull);
        expect(
          find.descendant(
            of: _bulk,
            matching: find.byType(CircularProgressIndicator),
          ),
          findsOneWidget,
        );
        await tester.pump(const Duration(milliseconds: 200));
        await _captureImage(tester, 'bulk-loading-$tag');
        await _show(tester, _primary('sync'), busy: true);
        await _captureImage(tester, 'typed-disabled-$tag');
        repository.release.complete();
        await tester.pumpAndSettle();
        expect(repository.events, [
          'summary',
          'list',
          'mark:${cases.last.row.id}',
          'mark:second',
          'summary',
          'list',
        ]);
        expect(repository.markReadIds, [cases.last.row.id, 'second']);
        expect(repository.markReadCalls, 2);
        await _show(tester, _bulk);
        expect(find.text('Unread (0)'), findsOneWidget);
        expect(find.text('Read (2)'), findsOneWidget);
        await _show(tester, _bulk);
        expect(tester.widget<TextButton>(_bulk).onPressed, isNull);
        expect(
          find.descendant(
            of: _bulk,
            matching: find.byType(CircularProgressIndicator),
          ),
          findsNothing,
        );
        await _captureImage(tester, 'bulk-disabled-$tag');
        semantics.dispose();
      },
    );

    testWidgets('sync shared back pops once ${viewport.$1}/${viewport.$2}', (
      tester,
    ) async {
      await tester.runAsync(loadSettleoraVisualTestFonts);
      final sync = f.FakeSyncRepository();
      final repository = f.FakeNotificationRepository(
        notifications: [cases.last.row],
      );
      await _mount(
        tester,
        repository,
        width: viewport.$1,
        scale: viewport.$2,
        sync: sync,
      );
      await _show(tester, _primary('sync'));
      await tester.tap(_primary('sync'));
      await tester.pumpAndSettle();
      expect(sync.getOperationCalls, 1);
      final back = find.widgetWithText(AppButton, 'Back to notifications');
      await _show(tester, back);
      final button = tester.widget<AppButton>(back);
      expect(button.variant, AppButtonVariant.secondary);
      expect(button.icon, Icons.arrow_back_outlined);
      expect(tester.getSize(back).height, greaterThanOrEqualTo(48));
      await _captureImage(
        tester,
        'sync-back-${viewport.$1.toInt()}-${viewport.$2.toInt()}x',
      );
      await tester.tap(back);
      await tester.pumpAndSettle();
      expect(find.byType(SettleoraNotificationScreen), findsOneWidget);
      expect(back, findsNothing);
      expect(sync.getOperationCalls, 1);
      expect(repository.markReadCalls, 1);
    });
  }
}
