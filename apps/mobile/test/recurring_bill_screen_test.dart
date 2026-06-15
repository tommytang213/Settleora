import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_screen.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  testWidgets('recurring bill screen shows loading and loaded content', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository.manual();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pump();

    expect(find.text('Loading recurring bills'), findsOneWidget);

    repository.completeTemplates([sampleTemplate()]);
    await tester.pump();
    repository.completeForecast([sampleOccurrence()]);
    await tester.pumpAndSettle();

    expect(find.text('Templates'), findsWidgets);
    expect(find.text('Forecast'), findsWidgets);
    expect(find.text('Rent'), findsWidgets);
    expect(find.text('1200.00 USD'), findsWidgets);
    expect(find.text('Every month'), findsWidgets);
    expect(find.text('Next occurrence: 2026-06-01.'), findsOneWidget);
    expect(
      find.text(
        'Review the estimate, then generate a draft when you are ready.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('recurring-bill-generate-0')),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains(_templateId)));
  });

  testWidgets('recurring bill screen renders empty state', (tester) async {
    final repository = FakeRecurringBillRepository(
      templates: const [],
      forecast: const [],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No recurring bills'), findsOneWidget);
    expect(find.text('No forecast'), findsOneWidget);
    expect(repository.listTemplateCalls, 1);
    expect(repository.forecastCalls, 1);
  });

  testWidgets('recurring bill search filters templates and forecast locally', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      templates: [
        sampleTemplate(merchantName: 'Rent'),
        sampleTemplate(
          id: '55555555-5555-5555-5555-555555555555',
          merchantName: 'Gym',
          description: 'Wellness membership',
          forecastAmount: '80.00',
        ),
      ],
      forecast: [
        sampleOccurrence(merchantName: 'Rent'),
        sampleOccurrence(
          templateId: '55555555-5555-5555-5555-555555555555',
          merchantName: 'Gym',
          forecastAmount: '80.00',
          occurrenceDate: '2026-06-15',
          dueDate: '2026-06-15',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('recurring-bill-search')),
      'gym',
    );
    await tester.pumpAndSettle();

    expect(find.text('Gym'), findsWidgets);
    expect(find.text('Rent'), findsNothing);
    expect(repository.listTemplateCalls, 1);
    expect(repository.forecastCalls, 1);
  });

  testWidgets('recurring bill filter chips show counts and filter by scope', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      templates: [
        sampleTemplate(merchantName: 'Rent'),
        sampleTemplate(
          id: '55555555-5555-5555-5555-555555555555',
          merchantName: 'Office rent',
          isGroupScoped: true,
        ),
      ],
      forecast: [
        sampleOccurrence(merchantName: 'Rent'),
        sampleOccurrence(
          templateId: '55555555-5555-5555-5555-555555555555',
          merchantName: 'Office rent',
          isGroupScoped: true,
          occurrenceDate: '2026-06-15',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('All (2)'), findsNWidgets(2));
    expect(find.text('Personal (1)'), findsNWidgets(2));
    expect(find.text('Group (1)'), findsNWidgets(2));

    await tapRecurringFilterChip(
      tester,
      const Key('recurring-bill-template-filter-group'),
    );
    await tapRecurringFilterChip(
      tester,
      const Key('recurring-bill-forecast-filter-group'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Office rent'), findsWidgets);
    expect(find.text('Rent'), findsNothing);
    expect(
      find.byKey(const Key('recurring-bill-clear-discovery')),
      findsOneWidget,
    );
  });

  testWidgets('recurring bill search combines with forecast filter chips', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      templates: const [],
      forecast: [
        sampleOccurrence(merchantName: 'Rent'),
        sampleOccurrence(
          templateId: '55555555-5555-5555-5555-555555555555',
          merchantName: 'Gym',
          status: SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
          draftGenerated: true,
          generatedBillId: _generatedBillId,
          occurrenceDate: '2026-06-15',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('recurring-bill-search')),
      'gym',
    );
    await tester.pumpAndSettle();
    await tapRecurringFilterChip(
      tester,
      const Key('recurring-bill-forecast-filter-draft-generated'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Gym'), findsWidgets);
    expect(find.text('Rent'), findsNothing);
    expect(find.text('Draft Ready'), findsOneWidget);
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const ValueKey('recurring-bill-generate-0')),
          )
          .onPressed,
      isNull,
    );
  });

  testWidgets('recurring bill clear control resets search and filters', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      templates: [
        sampleTemplate(merchantName: 'Rent'),
        sampleTemplate(
          id: '55555555-5555-5555-5555-555555555555',
          merchantName: 'Gym',
          isGroupScoped: true,
        ),
      ],
      forecast: [
        sampleOccurrence(merchantName: 'Rent'),
        sampleOccurrence(
          templateId: '55555555-5555-5555-5555-555555555555',
          merchantName: 'Gym',
          isGroupScoped: true,
          occurrenceDate: '2026-06-15',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('recurring-bill-search')),
      'gym',
    );
    await tapRecurringFilterChip(
      tester,
      const Key('recurring-bill-template-filter-group'),
    );
    await tapRecurringFilterChip(
      tester,
      const Key('recurring-bill-forecast-filter-group'),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('recurring-bill-clear-discovery')));
    await tester.pumpAndSettle();

    expect(
      tester
          .widget<TextField>(find.byKey(const Key('recurring-bill-search')))
          .controller
          ?.text,
      isEmpty,
    );
    expect(
      find.byKey(const Key('recurring-bill-clear-discovery')),
      findsNothing,
    );
    expect(find.text('Rent'), findsWidgets);
    expect(find.text('Gym'), findsWidgets);
  });

  testWidgets(
    'recurring bill screen can start on needs-draft forecast and clear it',
    (tester) async {
      final repository = FakeRecurringBillRepository(
        templates: const [],
        forecast: [
          sampleOccurrence(merchantName: 'Rent'),
          sampleOccurrence(
            templateId: '55555555-5555-5555-5555-555555555555',
            merchantName: 'Gym',
            status: SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
            draftGenerated: true,
            generatedBillId: _generatedBillId,
            occurrenceDate: '2026-06-15',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraRecurringBillScreen(
            repository: repository,
            openNeedsDraftOnStart: true,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<FilterChip>(
              find.byKey(
                const Key('recurring-bill-forecast-filter-needs-draft'),
              ),
            )
            .selected,
        isTrue,
      );
      expect(find.text('Rent'), findsWidgets);
      expect(find.text('Gym'), findsNothing);
      expect(
        find.byKey(const Key('recurring-bill-clear-discovery')),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('recurring-bill-clear-discovery')));
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<FilterChip>(
              find.byKey(const Key('recurring-bill-forecast-filter-all')),
            )
            .selected,
        isTrue,
      );
      expect(find.text('Rent'), findsWidgets);
      expect(find.text('Gym'), findsWidgets);
      expect(
        find.byKey(const Key('recurring-bill-clear-discovery')),
        findsNothing,
      );
    },
  );

  testWidgets('recurring bill screen distinguishes filtered empty states', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      templates: [sampleTemplate(merchantName: 'Rent')],
      forecast: [sampleOccurrence(merchantName: 'Rent')],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('recurring-bill-search')),
      'internet',
    );
    await tester.pumpAndSettle();

    expect(find.text('No matching templates'), findsOneWidget);
    expect(find.text('No matching forecast'), findsOneWidget);
    expect(find.text('No recurring bills'), findsNothing);
    expect(find.text('No forecast'), findsNothing);
  });

  testWidgets('recurring bill search controller disposes cleanly', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('recurring-bill-search')),
      'rent',
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('recurring bill screen retries bounded load failures', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      listFailures: [
        const SettleoraRecurringBillFailure(
          kind: SettleoraRecurringBillFailureKind.network,
          message:
              'The server is unavailable. Try again when the connection is back.',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Server unavailable'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    await tester.tap(find.byKey(const Key('recurring-bill-retry')));
    await tester.pumpAndSettle();

    expect(find.text('Rent'), findsWidgets);
    expect(repository.listTemplateCalls, 2);
  });

  testWidgets('recurring bill screen opens template detail', (tester) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('recurring-bill-template-0')));
    await tester.pumpAndSettle();

    expect(repository.getTemplateCalls, 1);
    expect(find.text('Recurring bill'), findsWidgets);
    expect(find.text('Schedule'), findsOneWidget);
    expect(
      find.text(
        'Watch the forecast for the next draft opportunity on 2026-06-01.',
      ),
      findsOneWidget,
    );
    expect(find.text('Due 3 days after each occurrence.'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Payload'), 120);
    expect(find.text('Payload'), findsOneWidget);
    expect(find.text('Version 1'), findsOneWidget);
  });

  testWidgets('explicit draft generation shows success and reloads', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tapGenerateDraftButton(tester);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(repository.generateDraftCalls, 0);
    expect(find.text('Generate draft?'), findsOneWidget);
    expect(
      find.textContaining('Estimated total: 1200.00 USD.'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('recurring-bill-generate-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(repository.generateDraftCalls, 1);
    expect(repository.lastTemplateId, _templateId);
    expect(repository.lastOccurrenceDate, '2026-06-01');
    expect(find.text('Draft ready: 1200.00 USD.'), findsOneWidget);
    expect(find.text('Draft Ready'), findsOneWidget);
    expect(find.text('Generated draft ready'), findsOneWidget);
    expect(find.textContaining('Open the draft from Bills.'), findsOneWidget);
  });

  testWidgets('idempotent draft state is displayed without new mutation copy', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      templates: const [],
      forecast: [
        sampleOccurrence(
          status: SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
          draftGenerated: true,
          generatedBillId: _generatedBillId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Draft Ready'), findsOneWidget);
    expect(
      find.textContaining('A draft exists for this occurrence.'),
      findsOneWidget,
    );
    expect(find.text('Draft generated: 1200.00 USD.'), findsNothing);
    expect(repository.generateDraftCalls, 0);
  });

  testWidgets(
    'refresh failure after draft generation preserves generated context',
    (tester) async {
      final repository = FakeRecurringBillRepository(
        forecastFailureCallNumbers: const {2},
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tapGenerateDraftButton(tester);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(
        find.byKey(const Key('recurring-bill-generate-confirm')),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));

      expect(repository.generateDraftCalls, 1);
      expect(repository.forecastCalls, 2);
      expect(find.text('Generated draft ready'), findsOneWidget);
      expect(
        find.textContaining('The server returned a draft bill'),
        findsOneWidget,
      );
      expect(find.textContaining('could not be refreshed'), findsOneWidget);

      await tester.tap(
        find.byKey(const Key('recurring-bill-refresh-after-generate')),
      );
      await tester.pumpAndSettle();

      expect(repository.generateDraftCalls, 1);
      expect(repository.forecastCalls, 3);
      expect(find.text('Generated draft ready'), findsOneWidget);
    },
  );

  testWidgets('draft generation failure stays bounded', (tester) async {
    final repository = FakeRecurringBillRepository(
      generateFailure: const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.conflict,
        message: 'Refresh recurring bills and try again.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tapGenerateDraftButton(tester);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tap(find.byKey(const Key('recurring-bill-generate-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(repository.generateDraftCalls, 1);
    expect(find.text('Refresh recurring bills and try again.'), findsOneWidget);
  });

  testWidgets('draft generation blocks duplicate taps while confirming', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tapGenerateDraftButton(tester);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('Generate draft?'), findsOneWidget);
    expect(repository.generateDraftCalls, 0);
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const ValueKey('recurring-bill-generate-0')),
          )
          .onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('recurring-bill-generate-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(repository.generateDraftCalls, 1);
  });

  testWidgets('inactive recurring bill state is read-only guidance', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository(
      templates: [
        sampleTemplate(
          status: SettleoraRecurringBillTemplateStatusValues.paused,
          nextOccurrenceDate: null,
          isGroupScoped: true,
        ),
      ],
      forecast: [
        sampleOccurrence(
          status: SettleoraRecurringBillOccurrenceStatusValues.cancelled,
          dueDate: null,
          isGroupScoped: true,
        ),
      ],
      detail: sampleDetail(
        status: SettleoraRecurringBillTemplateStatusValues.paused,
        nextOccurrenceDate: null,
        isGroupScoped: true,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Paused; no new drafts will be generated until resumed.'),
      findsOneWidget,
    );
    expect(find.text('Shared group bill'), findsOneWidget);
    expect(
      find.text('Occurrence: 2026-06-01. No due date was returned.'),
      findsOneWidget,
    );
    expect(
      find.text('This occurrence was cancelled and has no future action.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const ValueKey('recurring-bill-generate-0')),
          )
          .onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const ValueKey('recurring-bill-template-0')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'This template is paused. Resume asks the server to recompute the next occurrence.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('No upcoming occurrence is available from the server.'),
      findsOneWidget,
    );
  });

  testWidgets('create form validates input before calling repository', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('recurring-bill-create')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('recurring-bill-form-save')),
    );
    await tester.tap(find.byKey(const Key('recurring-bill-form-save')));
    await tester.pumpAndSettle();

    expect(find.text('Enter a date.'), findsOneWidget);
    expect(find.text('Enter item name.'), findsOneWidget);
    expect(repository.createTemplateCalls, 0);
  });

  testWidgets('create success calls repository once and refreshes', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('recurring-bill-create')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-merchant')),
      'Internet',
    );
    await tester.ensureVisible(
      find.byKey(
        const Key('recurring-bill-form-start-date'),
        skipOffstage: false,
      ),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-start-date')),
      '2026-07-01',
    );
    await tester.ensureVisible(
      find.byKey(
        const Key('recurring-bill-form-item-name'),
        skipOffstage: false,
      ),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-item-name')),
      'Fiber plan',
    );
    await tester.ensureVisible(
      find.byKey(
        const Key('recurring-bill-form-item-amount'),
        skipOffstage: false,
      ),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-item-amount')),
      '88.50',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('recurring-bill-form-save')),
    );
    await tester.tap(find.byKey(const Key('recurring-bill-form-save')));
    await tester.pumpAndSettle();

    expect(repository.createTemplateCalls, 1);
    expect(repository.lastCreateDraft?.merchantName, 'Internet');
    expect(repository.lastCreateDraft?.items.single.amount, '88.50');
    expect(repository.listTemplateCalls, 2);
    expect(find.text('Internet'), findsWidgets);
  });

  testWidgets('duplicate create tap is blocked while saving', (tester) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('recurring-bill-create')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(
        const Key('recurring-bill-form-start-date'),
        skipOffstage: false,
      ),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-start-date')),
      '2026-07-01',
    );
    await tester.ensureVisible(
      find.byKey(
        const Key('recurring-bill-form-item-name'),
        skipOffstage: false,
      ),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-item-name')),
      'Fiber plan',
    );
    await tester.ensureVisible(
      find.byKey(
        const Key('recurring-bill-form-item-amount'),
        skipOffstage: false,
      ),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-item-amount')),
      '88.50',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('recurring-bill-form-save')),
    );
    await tester.tap(find.byKey(const Key('recurring-bill-form-save')));
    await tester.tap(
      find.byKey(const Key('recurring-bill-form-save')),
      warnIfMissed: false,
    );
    await tester.pumpAndSettle();

    expect(repository.createTemplateCalls, 1);
  });

  testWidgets('edit form opens with returned values and updates detail', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('recurring-bill-template-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recurring-bill-detail-edit')));
    await tester.pumpAndSettle();

    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('recurring-bill-form-merchant')),
          )
          .controller
          ?.text,
      'Rent',
    );

    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-merchant')),
      'Rent v2',
    );
    await tester.ensureVisible(
      find.byKey(
        const Key('recurring-bill-form-start-date'),
        skipOffstage: false,
      ),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-start-date')),
      '2026-05-08',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('recurring-bill-form-save')),
    );
    await tester.tap(find.byKey(const Key('recurring-bill-form-save')));
    await tester.pumpAndSettle();

    expect(repository.updateTemplateCalls, 1);
    expect(repository.getTemplateCalls, 2);
    expect(repository.lastUpdateDraft?.merchantName, 'Rent v2');
    expect(find.text('Rent v2'), findsWidgets);
  });

  testWidgets('pause resume and archive require confirmation and refresh', (
    tester,
  ) async {
    final repository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('recurring-bill-template-0')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('recurring-bill-pause')));
    await tester.pumpAndSettle();
    expect(find.text('Pause recurring bill?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('recurring-bill-pause-confirm')));
    await tester.pumpAndSettle();

    expect(repository.pauseTemplateCalls, 1);
    expect(repository.getTemplateCalls, 2);
    expect(find.byKey(const Key('recurring-bill-resume')), findsOneWidget);

    await tester.tap(find.byKey(const Key('recurring-bill-resume')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recurring-bill-resume-confirm')));
    await tester.pumpAndSettle();
    expect(repository.resumeTemplateCalls, 1);

    await tester.tap(find.byKey(const Key('recurring-bill-archive')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recurring-bill-archive-confirm')));
    await tester.pumpAndSettle();

    expect(repository.archiveTemplateCalls, 1);
    expect(find.text('Archived template'), findsOneWidget);
    expect(find.byKey(const Key('recurring-bill-detail-edit')), findsNothing);
  });

  testWidgets('lifecycle failure shows bounded retry copy', (tester) async {
    final repository = FakeRecurringBillRepository(
      lifecycleFailure: const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.conflict,
        message: 'Refresh recurring bills and try again.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('recurring-bill-template-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recurring-bill-pause')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recurring-bill-pause-confirm')));
    await tester.pumpAndSettle();

    expect(repository.pauseTemplateCalls, 1);
    expect(find.text('Refresh recurring bills and try again.'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('/api/v1')));
  });

  testWidgets('authenticated server shell opens recurring bills', (
    tester,
  ) async {
    final recurringRepository = FakeRecurringBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: FakeBillRepository(),
          settlementRepository: FakeSettlementRepository(),
          recurringBillRepository: recurringRepository,
          groupRepository: FakeGroupRepository(),
          notificationRepository: FakeNotificationRepository(),
          reportRepository: FakeMonthlyReportRepository(),
          profileRepository: FakeProfileRepository(),
          billSyncController: sampleSyncController(),
          authRepository: FakeAuthRepository(),
          accessTokenProvider: const FakeAccessTokenProvider('redacted-token'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const Key('server-shell-recurring-bills')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('server-shell-recurring-bills')));
    await tester.pumpAndSettle();

    expect(find.text('Recurring bills'), findsWidgets);
    expect(find.text('Rent'), findsWidgets);
    expect(recurringRepository.listTemplateCalls, 2);
    expect(recurringRepository.forecastCalls, 2);
  });
}

class FakeRecurringBillRepository implements SettleoraRecurringBillRepository {
  FakeRecurringBillRepository({
    List<SettleoraRecurringBillTemplateSummary>? templates,
    List<SettleoraRecurringBillForecastOccurrence>? forecast,
    SettleoraRecurringBillTemplateDetail? detail,
    this.listFailures = const [],
    this.forecastFailureCallNumbers = const {},
    this.generateFailure,
    this.createFailure,
    this.updateFailure,
    this.lifecycleFailure,
  }) : templates = templates ?? [sampleTemplate()],
       forecast = forecast ?? [sampleOccurrence()],
       detail = detail ?? sampleDetail(),
       _templateCompleter = null,
       _forecastCompleter = null;

  FakeRecurringBillRepository.manual()
    : templates = const [],
      forecast = const [],
      detail = sampleDetail(),
      listFailures = const [],
      forecastFailureCallNumbers = const {},
      generateFailure = null,
      createFailure = null,
      updateFailure = null,
      lifecycleFailure = null,
      _templateCompleter =
          Completer<List<SettleoraRecurringBillTemplateSummary>>(),
      _forecastCompleter =
          Completer<List<SettleoraRecurringBillForecastOccurrence>>();

  List<SettleoraRecurringBillTemplateSummary> templates;
  List<SettleoraRecurringBillForecastOccurrence> forecast;
  SettleoraRecurringBillTemplateDetail detail;
  final List<SettleoraRecurringBillFailure> listFailures;
  final Set<int> forecastFailureCallNumbers;
  final SettleoraRecurringBillFailure? generateFailure;
  final SettleoraRecurringBillFailure? createFailure;
  final SettleoraRecurringBillFailure? updateFailure;
  final SettleoraRecurringBillFailure? lifecycleFailure;
  final Completer<List<SettleoraRecurringBillTemplateSummary>>?
  _templateCompleter;
  final Completer<List<SettleoraRecurringBillForecastOccurrence>>?
  _forecastCompleter;
  int listTemplateCalls = 0;
  int forecastCalls = 0;
  int getTemplateCalls = 0;
  int createTemplateCalls = 0;
  int updateTemplateCalls = 0;
  int pauseTemplateCalls = 0;
  int resumeTemplateCalls = 0;
  int archiveTemplateCalls = 0;
  int generateDraftCalls = 0;
  SettleoraRecurringBillCreateDraft? lastCreateDraft;
  SettleoraRecurringBillUpdateDraft? lastUpdateDraft;
  String? lastTemplateId;
  String? lastOccurrenceDate;

  void completeTemplates(List<SettleoraRecurringBillTemplateSummary> value) {
    _templateCompleter?.complete(value);
  }

  void completeForecast(List<SettleoraRecurringBillForecastOccurrence> value) {
    _forecastCompleter?.complete(value);
  }

  @override
  Future<List<SettleoraRecurringBillTemplateSummary>> listTemplates({
    SettleoraRecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    int maxItems = 100,
  }) async {
    listTemplateCalls += 1;
    if (listFailures.length >= listTemplateCalls) {
      throw listFailures[listTemplateCalls - 1];
    }

    final completer = _templateCompleter;
    if (completer != null) {
      templates = await completer.future;
      return templates;
    }

    return templates;
  }

  @override
  Future<List<SettleoraRecurringBillForecastOccurrence>> listForecast({
    String? fromDate,
    String? toDate,
    int limit = 30,
    String? groupId,
  }) async {
    forecastCalls += 1;
    if (forecastFailureCallNumbers.contains(forecastCalls)) {
      throw const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.network,
        message:
            'The server is unavailable. Try again when the connection is back.',
      );
    }

    final completer = _forecastCompleter;
    if (completer != null) {
      forecast = await completer.future;
      return forecast;
    }

    return forecast;
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> getTemplate(
    String templateId,
  ) async {
    getTemplateCalls += 1;
    lastTemplateId = templateId;
    return detail;
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> createTemplate(
    SettleoraRecurringBillCreateDraft draft,
  ) async {
    createTemplateCalls += 1;
    lastCreateDraft = draft;
    final failure = createFailure;
    if (failure != null) {
      throw failure;
    }

    detail = sampleDetail();
    templates = [sampleTemplate(merchantName: draft.merchantName?.trim())];
    return detail;
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> updateTemplate({
    required String templateId,
    required SettleoraRecurringBillUpdateDraft draft,
  }) async {
    updateTemplateCalls += 1;
    lastTemplateId = templateId;
    lastUpdateDraft = draft;
    final failure = updateFailure;
    if (failure != null) {
      throw failure;
    }

    detail = sampleDetail(
      merchantName: draft.merchantName?.trim(),
      description: draft.description?.trim(),
      schedule: SettleoraRecurringBillSchedule(
        type: draft.schedule.type,
        intervalCount: draft.schedule.intervalCount,
        intervalDays: draft.schedule.intervalDays,
        startDate: draft.schedule.startDate.trim(),
        endDate: draft.schedule.endDate?.trim(),
        dueOffsetDays: draft.schedule.dueOffsetDays,
      ),
    );
    templates = [detail];
    return detail;
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> pauseTemplate(
    String templateId,
  ) async {
    pauseTemplateCalls += 1;
    lastTemplateId = templateId;
    return _lifecycleResult(SettleoraRecurringBillTemplateStatusValues.paused);
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> resumeTemplate(
    String templateId,
  ) async {
    resumeTemplateCalls += 1;
    lastTemplateId = templateId;
    return _lifecycleResult(SettleoraRecurringBillTemplateStatusValues.active);
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> archiveTemplate(
    String templateId,
  ) async {
    archiveTemplateCalls += 1;
    lastTemplateId = templateId;
    return _lifecycleResult(
      SettleoraRecurringBillTemplateStatusValues.archived,
    );
  }

  SettleoraRecurringBillTemplateDetail _lifecycleResult(String status) {
    final failure = lifecycleFailure;
    if (failure != null) {
      throw failure;
    }
    detail = sampleDetail(status: status);
    templates = [detail];
    return detail;
  }

  @override
  Future<SettleoraRecurringBillDraftResult> generateDraft({
    required String templateId,
    required String occurrenceDate,
  }) async {
    generateDraftCalls += 1;
    lastTemplateId = templateId;
    lastOccurrenceDate = occurrenceDate;
    final failure = generateFailure;
    if (failure != null) {
      throw failure;
    }

    forecast = [
      sampleOccurrence(
        status: SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
        draftGenerated: true,
        generatedBillId: _generatedBillId,
      ),
    ];
    return sampleDraftResult();
  }
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) {
    throw UnimplementedError();
  }
}

class FakeBillRepository implements SettleoraBillRepository {
  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> submitGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    return const [];
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    return const [];
  }
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() async {
    return SettleoraSettlementBalanceSnapshot(
      generatedAtUtc: _updatedAtUtc,
      balances: const [],
    );
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() async {
    return const [];
  }

  @override
  Future<SettleoraSettlementRequest> getSettlementRequest(String settlementId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> markSettlementPaymentPaid({
    required String settlementId,
    required String amount,
    required String currency,
    required String paymentDate,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(String paymentId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  }) {
    throw UnimplementedError();
  }
}

class FakeGroupRepository implements SettleoraGroupRepository {
  @override
  Future<List<SettleoraGroup>> listGroups() async {
    return const [];
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> removeGroupMember(String groupId, String userProfileId) {
    throw UnimplementedError();
  }
}

class FakeNotificationRepository implements SettleoraNotificationRepository {
  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) async {
    return const [];
  }

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() async {
    return const SettleoraNotificationSummary(
      unreadCount: 0,
      attentionCount: 0,
      urgentCount: 0,
    );
  }

  @override
  Future<SettleoraNotificationRow> markNotificationRead(String notificationId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationSummary> markAllNotificationsRead() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationRow> archiveNotification(String notificationId) {
    throw UnimplementedError();
  }
}

class FakeProfileRepository implements SettleoraProfileRepository {
  @override
  Future<SettleoraSelfProfile> getSelfProfile() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfProfile> updateSelfProfile(
    SettleoraSelfProfileUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> getSelfPaymentDetails() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> updateSelfPaymentDetails(
    SettleoraSelfPaymentDetailsUpdate update,
  ) {
    throw UnimplementedError();
  }
}

class FakeMonthlyReportRepository implements SettleoraMonthlyReportRepository {
  @override
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  }) async {
    return SettleoraMonthlyReport(
      month: month,
      groupId: groupId,
      generatedAtUtc: DateTime.utc(2026, 5, 18, 9),
      billCount: 0,
      totalByCurrency: const [],
      actorShareByCurrency: const [],
      actorPaidByCurrency: const [],
      reconciliationCounts: const [],
      settlementRequestCounts: const [],
      settlementPaymentCounts: const [],
    );
  }
}

class FakeAuthRepository implements SettleoraAuthRepository {
  @override
  Future<SettleoraCurrentUser> currentUser({
    required String accessToken,
  }) async {
    return sampleCurrentUser();
  }

  @override
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraServerSessionMaterial> refreshSession({
    required String refreshCredential,
    String? deviceLabel,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) async {}

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) async {}

  @override
  Future<List<SettleoraSessionSummary>> listSessions({
    required String accessToken,
  }) async {
    return const [];
  }

  @override
  Future<void> revokeSession({
    required String sessionId,
    required String accessToken,
  }) async {}
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  const FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

class MemorySyncQueueStore extends SettleoraSyncQueueStore {
  var state = SettleoraSyncQueueState.empty();

  @override
  final int maxItemCount = 100;

  @override
  Future<SettleoraSyncQueueState> read() async => state;

  @override
  Future<void> write(SettleoraSyncQueueState state) async {
    this.state = state;
  }
}

class FakeSyncRepository implements SettleoraSyncRepository {
  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSyncChangeFeed> listChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  }) {
    throw UnimplementedError();
  }
}

SettleoraBillSyncController sampleSyncController() {
  final store = MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: store,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: store,
      repository: FakeSyncRepository(),
    ),
  );
}

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: _profileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['user'],
    sessionExpiresAtUtc: DateTime.utc(2026, 5, 19),
  );
}

SettleoraRecurringBillTemplateSummary sampleTemplate({
  String id = _templateId,
  String? merchantName = 'Rent',
  String? description = 'Monthly apartment rent',
  String status = SettleoraRecurringBillTemplateStatusValues.active,
  String? nextOccurrenceDate = '2026-06-01',
  bool isGroupScoped = false,
  String forecastAmount = '1200.00',
  String forecastCurrency = 'USD',
}) {
  return SettleoraRecurringBillTemplateSummary(
    id: id,
    merchantName: merchantName,
    description: description,
    status: status,
    schedule: sampleSchedule(),
    forecastAmount: forecastAmount,
    forecastCurrency: forecastCurrency,
    nextOccurrenceDate: nextOccurrenceDate,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    archivedAtUtc: null,
    isGroupScoped: isGroupScoped,
  );
}

SettleoraRecurringBillTemplateDetail sampleDetail({
  String? merchantName = 'Rent',
  String? description = 'Monthly apartment rent',
  String status = SettleoraRecurringBillTemplateStatusValues.active,
  String? nextOccurrenceDate = '2026-06-01',
  bool isGroupScoped = false,
  SettleoraRecurringBillSchedule? schedule,
}) {
  final template = sampleTemplate(
    merchantName: merchantName,
    description: description,
    status: status,
    nextOccurrenceDate: nextOccurrenceDate,
    isGroupScoped: isGroupScoped,
  );
  return SettleoraRecurringBillTemplateDetail(
    id: template.id,
    merchantName: template.merchantName,
    description: template.description,
    status: template.status,
    schedule: schedule ?? template.schedule,
    forecastAmount: template.forecastAmount,
    forecastCurrency: template.forecastCurrency,
    nextOccurrenceDate: template.nextOccurrenceDate,
    createdAtUtc: template.createdAtUtc,
    updatedAtUtc: template.updatedAtUtc,
    archivedAtUtc: template.archivedAtUtc,
    isGroupScoped: template.isGroupScoped,
    payloadVersion: 1,
  );
}

SettleoraRecurringBillSchedule sampleSchedule() {
  return const SettleoraRecurringBillSchedule(
    type: SettleoraRecurringBillScheduleTypeValues.monthly,
    intervalCount: 1,
    intervalDays: null,
    startDate: '2026-05-01',
    endDate: null,
    dueOffsetDays: 3,
  );
}

SettleoraRecurringBillForecastOccurrence sampleOccurrence({
  String templateId = _templateId,
  String? occurrenceId = _occurrenceId,
  String occurrenceDate = '2026-06-01',
  String status = SettleoraRecurringBillOccurrenceStatusValues.forecasted,
  bool draftGenerated = false,
  String? generatedBillId,
  String? dueDate = '2026-06-04',
  bool isGroupScoped = false,
  String forecastAmount = '1200.00',
  String forecastCurrency = 'USD',
  String? merchantName = 'Rent',
}) {
  return SettleoraRecurringBillForecastOccurrence(
    templateId: templateId,
    occurrenceId: occurrenceId,
    occurrenceDate: occurrenceDate,
    dueDate: dueDate,
    status: status,
    draftGenerated: draftGenerated,
    generatedBillId: generatedBillId,
    forecastAmount: forecastAmount,
    forecastCurrency: forecastCurrency,
    merchantName: merchantName,
    isGroupScoped: isGroupScoped,
  );
}

SettleoraRecurringBillDraftResult sampleDraftResult() {
  return const SettleoraRecurringBillDraftResult(
    templateId: _templateId,
    occurrenceId: _occurrenceId,
    occurrenceDate: '2026-06-01',
    dueDate: '2026-06-04',
    occurrenceStatus:
        SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
    generatedBillId: _generatedBillId,
    billStatus: 'draft',
    totalAmount: '1200.00',
    totalCurrency: 'USD',
  );
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

Future<void> tapRecurringFilterChip(WidgetTester tester, Key key) async {
  await tester.ensureVisible(find.byKey(key));
  await tester.tap(find.byKey(key));
}

Future<void> tapGenerateDraftButton(WidgetTester tester) async {
  final finder = find.byKey(const ValueKey('recurring-bill-generate-0'));
  await tester.drag(find.byType(ListView), const Offset(0, -420));
  await tester.pumpAndSettle();
  await tester.tap(finder);
}

const _templateId = '11111111-1111-1111-1111-111111111111';
const _occurrenceId = '22222222-2222-2222-2222-222222222222';
const _generatedBillId = '33333333-3333-3333-3333-333333333333';
const _profileId = '44444444-4444-4444-4444-444444444444';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
