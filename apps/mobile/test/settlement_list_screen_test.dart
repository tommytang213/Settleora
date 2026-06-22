import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/ui/settleora_components.dart';

void main() {
  testWidgets('settlement list opens detail and confirms residuals', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      balances: [sampleBalance()],
      requests: [sampleRequest()],
      detail: sampleRequest(),
      payments: [samplePayment()],
      paymentDetails: samplePaymentDetails(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _creditorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Settlements'), findsOneWidget);
    expect(find.text('Outgoing balance'), findsOneWidget);
    expect(find.text('7.50 USD'), findsOneWidget);
    expect(find.text('10.00 USD'), findsOneWidget);
    expectMoneyText('7.50', 'USD');
    expectMoneyText('10.00', 'USD');
    expect(repository.listBalancesCalls, 1);
    expect(repository.listRequestsCalls, 1);

    await scrollTo(
      tester,
      find.byKey(const ValueKey('settlement-request-tile-0')),
    );
    await tester.tap(find.byKey(const ValueKey('settlement-request-tile-0')));
    await tester.pumpAndSettle();

    expectMoneyText('10.00', 'USD');
    await scrollTo(tester, find.text('Counterparty Payment Details'));
    expect(find.text('Counterparty Payment Details'), findsOneWidget);
    expect(find.text('Bank transfer'), findsOneWidget);
    await scrollTo(tester, find.text('Request Lines'));
    expect(find.text('Request Lines'), findsOneWidget);
    expectMoneyText('10.00', 'USD');
    expect(find.text('Open'), findsWidgets);
    await scrollTo(tester, find.text('Payments'));
    expect(find.text('Payments'), findsOneWidget);
    expect(find.text('2.50 USD'), findsWidgets);
    expectMoneyText('2.50', 'USD');
    expect(find.text('Allocation 1'), findsOneWidget);
    expectMoneyText('7.50', 'USD');
    expect(
      find.text(
        'Receipt confirmation is blocked until pending receiver-confirmation residuals are resolved by the API.',
      ),
      findsOneWidget,
    );
    expect(repository.getRequestCalls, 1);
    expect(repository.listPaymentsCalls, 1);
    expect(repository.paymentDetailsCalls, 1);
    expect(repository.lastPaymentDetailsUserProfileId, _debtorUserProfileId);

    final residualConfirm = find.byKey(
      const ValueKey('settlement-residual-confirm-0-0'),
    );
    await scrollTo(tester, residualConfirm);
    await tester.tap(residualConfirm);
    await tester.pumpAndSettle();
    expect(find.text('Confirm residual?'), findsOneWidget);

    await tester.tap(find.text('Confirm residual'));
    await tester.pumpAndSettle();

    expect(repository.confirmResidualCalls, 1);
    expect(repository.lastResidualId, _residualId);
    expect(find.text('Residual confirmed.'), findsOneWidget);
  });

  testWidgets('settlement landing summary shortcuts filter requests', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      requests: [
        sampleRequest(amount: '10.00', currency: 'USD'),
        sampleRequest(
          id: _secondSettlementId,
          amount: '25.00',
          currency: 'EUR',
          status: SettleoraSettlementRequestStatusValues.confirmed,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _debtorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await scrollTo(
      tester,
      find.byKey(const Key('settlement-list-landing-summary')),
    );
    expect(find.text('Settle landing'), findsOneWidget);
    expect(find.text('1 needing action'), findsOneWidget);

    await tester.tap(
      find.byKey(const Key('settlement-list-summary-needs-action')),
    );
    await tester.pumpAndSettle();

    await scrollListBy(tester, 500);
    await tester.pumpAndSettle();
    expect(find.text('10.00 USD'), findsOneWidget);
    expect(find.text('25.00 EUR'), findsNothing);

    await scrollTo(
      tester,
      find.byKey(const Key('settlement-list-landing-summary')),
    );
    await tester.tap(find.byKey(const Key('settlement-list-summary-all')));
    await tester.pumpAndSettle();

    await scrollListBy(tester, 500);
    await tester.pumpAndSettle();
    expect(find.text('10.00 USD'), findsOneWidget);
    expect(find.text('25.00 EUR'), findsOneWidget);
  });

  testWidgets(
    'settlement list search filters requests by safe visible values',
    (tester) async {
      final repository = FakeSettlementRepository(
        requests: [
          sampleRequest(),
          sampleRequest(
            id: _secondSettlementId,
            amount: '25.00',
            currency: 'EUR',
            status: SettleoraSettlementRequestStatusValues.confirmed,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraSettlementListScreen(
            repository: repository,
            currentUserProfileId: _creditorUserProfileId,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('10.00 USD'), findsOneWidget);
      expect(find.text('25.00 EUR'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('settlement-list-search')),
        'incoming confirmed eur 25.00',
      );
      await tester.pumpAndSettle();

      expect(find.text('10.00 USD'), findsNothing);
      await scrollListBy(tester, -260);
      expect(find.text('25.00 EUR'), findsOneWidget);
      expect(find.text('No matching settlements'), findsNothing);
    },
  );

  testWidgets('settlement list search does not match raw identifiers', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      requests: [
        sampleRequest(
          groupId: _groupId,
          requestedByUserProfileId: _requesterUserProfileId,
          sourceBillRevisionId: _sourceBillRevisionId,
          sourceCandidateKey: _sourceCandidateKey,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _creditorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('10.00 USD'), findsOneWidget);

    final rawIdentifiers = <String>[
      _settlementId,
      _billId,
      _groupId,
      _debtorUserProfileId,
      _creditorUserProfileId,
      _requesterUserProfileId,
      _lineId,
      _sourceBillRevisionId,
      _sourceCandidateKey,
    ];

    for (final rawIdentifier in rawIdentifiers) {
      await tester.enterText(
        find.byKey(const Key('settlement-list-search')),
        rawIdentifier,
      );
      await tester.pumpAndSettle();

      expect(
        find.text('10.00 USD'),
        findsNothing,
        reason: 'Raw identifier matched list search: $rawIdentifier',
      );
      expect(find.text('No matching settlements'), findsOneWidget);
    }
  });

  testWidgets('settlement list filter chips combine with search', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      requests: [
        sampleRequest(amount: '10.00', currency: 'USD'),
        sampleRequest(
          id: _secondSettlementId,
          amount: '25.00',
          currency: 'EUR',
          status: SettleoraSettlementRequestStatusValues.confirmed,
        ),
        sampleRequest(
          id: _thirdSettlementId,
          amount: '30.00',
          currency: 'HKD',
          status: SettleoraSettlementRequestStatusValues.disputed,
          debtorUserProfileId: _creditorUserProfileId,
          creditorUserProfileId: _debtorUserProfileId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _creditorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Incoming (2)'), findsOneWidget);
    expect(find.text('Outgoing (1)'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('settlement-list-search')),
      'outgoing hkd',
    );
    await scrollFilterChipsBy(tester, -700);
    await tester.tap(find.byKey(const Key('settlement-list-filter-disputed')));
    await tester.pumpAndSettle();

    expect(find.text('10.00 USD'), findsNothing);
    expect(find.text('25.00 EUR'), findsNothing);
    await scrollListBy(tester, -260);
    expect(find.text('30.00 HKD'), findsOneWidget);
  });

  testWidgets('settlement list clear filters restores loaded requests', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      requests: [
        sampleRequest(),
        sampleRequest(
          id: _secondSettlementId,
          amount: '25.00',
          currency: 'EUR',
          status: SettleoraSettlementRequestStatusValues.confirmed,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _creditorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('settlement-list-search')),
      'eur',
    );
    await scrollFilterChipsBy(tester, -520);
    await tester.tap(find.byKey(const Key('settlement-list-filter-confirmed')));
    await tester.pumpAndSettle();

    expect(find.text('10.00 USD'), findsNothing);
    expect(find.text('25.00 EUR'), findsOneWidget);

    await tester.tap(find.byKey(const Key('settlement-list-clear-filters')));
    await tester.pumpAndSettle();

    expect(find.text('10.00 USD'), findsOneWidget);
    expect(find.text('25.00 EUR'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('settlement-list-search')))
          .controller
          ?.text,
      isEmpty,
    );
  });

  testWidgets(
    'settlement list clears startup needs-action filter and restores requests',
    (tester) async {
      final repository = FakeSettlementRepository(
        requests: [
          sampleRequest(),
          sampleRequest(
            id: _secondSettlementId,
            amount: '25.00',
            currency: 'EUR',
            status: SettleoraSettlementRequestStatusValues.confirmed,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraSettlementListScreen(
            repository: repository,
            currentUserProfileId: _debtorUserProfileId,
            openNeedsActionOnStart: true,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<FilterChip>(
              find.byKey(const Key('settlement-list-filter-needs-action')),
            )
            .selected,
        isTrue,
      );
      expect(find.text('10.00 USD'), findsOneWidget);
      expect(find.text('25.00 EUR'), findsNothing);

      await tester.tap(find.byKey(const Key('settlement-list-clear-filters')));
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<FilterChip>(
              find.byKey(const Key('settlement-list-filter-all')),
            )
            .selected,
        isTrue,
      );
      expect(find.text('10.00 USD'), findsOneWidget);
      expect(find.text('25.00 EUR'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('settlement-list-search')))
            .controller
            ?.text,
        isEmpty,
      );
    },
  );

  testWidgets('settlement list shows compact empty state for no matches', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(requests: [sampleRequest()]);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _creditorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('settlement-list-search')),
      'not-a-visible-settlement',
    );
    await tester.pumpAndSettle();

    expect(find.text('No matching settlements'), findsOneWidget);
    expect(
      find.text(
        'No loaded settlement requests match this local search and filter. Clear filters to review loaded rows; no-match is not a server search, authorization result, or settlement truth.',
      ),
      findsOneWidget,
    );
    expect(find.text('No settlement requests'), findsNothing);
  });

  testWidgets('settlement list search controller is disposed safely', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(requests: [sampleRequest()]);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _creditorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('settlement-list-search')),
      'usd',
    );
    await tester.pumpAndSettle();

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('debtor marks requested settlement paid after confirmation', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(),
      payments: const [],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _debtorUserProfileId,
    );

    await tester.tap(find.byKey(const Key('settlement-request-mark-paid')));
    await tester.pumpAndSettle();

    expect(find.text('Mark settlement paid?'), findsOneWidget);
    expect(
      find.text(
        'Mark paid only after sending payment. Access, settlement state, residual handling, audit, and money are checked before the claim is saved.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining(_settlementId), findsNothing);

    await tester.enterText(
      find.byKey(const Key('settlement-mark-paid-date')),
      '2026-05-18',
    );
    await tester.tap(find.byKey(const Key('settlement-mark-paid-submit')));
    await tester.pumpAndSettle();

    expect(repository.markPaymentPaidCalls, 1);
    expect(repository.lastMarkedPaidSettlementId, _settlementId);
    expect(repository.lastMarkedPaidAmount, '10.00');
    expect(repository.lastMarkedPaidCurrency, 'USD');
    expect(repository.lastMarkedPaidPaymentDate, '2026-05-18');
    expect(repository.getRequestCalls, 2);
    expect(repository.listPaymentsCalls, 2);
    expect(find.text('Payment marked paid.'), findsOneWidget);
  });

  testWidgets(
    'request action success with refresh failure keeps state and avoids repeat',
    (tester) async {
      final repository = FakeSettlementRepository(
        detail: sampleRequest(),
        payments: const [],
        failRefreshAfterMutation: true,
      );

      await pumpSettlementDetail(
        tester,
        repository: repository,
        currentUserProfileId: _debtorUserProfileId,
      );

      await tester.tap(find.byKey(const Key('settlement-request-mark-paid')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('settlement-mark-paid-submit')));
      await tester.pumpAndSettle();

      expect(repository.markPaymentPaidCalls, 1);
      expect(repository.getRequestCalls, 2);
      expect(find.text('10.00 USD'), findsWidgets);
      expect(
        find.text(
          'Payment marked paid. Refresh failed. Use Refresh to reload server state before repeating any settlement action.',
        ),
        findsOneWidget,
      );
      expect(find.text('Server unavailable'), findsNothing);
    },
  );

  testWidgets(
    'request action failure shows bounded safe copy and preserves state',
    (tester) async {
      final repository = FakeSettlementRepository(
        detail: sampleRequest(),
        payments: const [],
        actionFailure: const SettleoraSettlementFailure(
          kind: SettleoraSettlementFailureKind.server,
          message:
              'POST /api/v1/settlements/111 token=secret /home/user stack trace raw body',
        ),
      );

      await pumpSettlementDetail(
        tester,
        repository: repository,
        currentUserProfileId: _debtorUserProfileId,
      );

      await tester.tap(find.byKey(const Key('settlement-request-mark-paid')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('settlement-mark-paid-submit')));
      await tester.pumpAndSettle();

      expect(repository.markPaymentPaidCalls, 1);
      expect(find.text('10.00 USD'), findsWidgets);
      expect(
        find.text(
          'The API could not complete this settlement action right now. The loaded settlement state was kept.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('/api/v1'), findsNothing);
      expect(find.textContaining('token=secret'), findsNothing);
      expect(find.textContaining('/home/user'), findsNothing);
      expect(find.textContaining('raw body'), findsNothing);
    },
  );

  testWidgets('settlement detail shows loaded review summary facts', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleMultiLineRequest(),
      payments: [
        samplePayment(),
        samplePayment(
          id: _secondPaymentId,
          amount: '5.00',
          residualId: _secondResidualId,
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
      ],
      paymentDetails: samplePaymentDetails(),
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    expect(find.text('Review Summary'), findsOneWidget);
    expect(find.text('Loaded settlement facts'), findsOneWidget);
    expect(find.textContaining('Requested - You receive'), findsOneWidget);
    expect(
      find.textContaining(
        'does not expand baskets, decide eligibility, or calculate settlement totals',
      ),
      findsOneWidget,
    );
    expect(find.text('2 lines'), findsOneWidget);
    expect(find.text('Selected total'), findsWidgets);
    expectMoneyText('22.00', 'USD');
    expect(find.text('2 payments'), findsOneWidget);
    expect(find.text('1 need confirmation'), findsOneWidget);
    expect(find.text('Payment details Available'), findsOneWidget);
    expect(find.textContaining(_settlementId), findsNothing);
  });

  testWidgets('settlement list shows full server balance readouts', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      balances: [
        sampleBalance(
          selectedLineAmount: '22.00',
          pendingClaimedAmount: '8.00',
          confirmedClearedAmount: '4.00',
          remainingUnclaimedAmount: '10.00',
          confirmedRemainingResidualAmount: '1.50',
          waivedResidualAmount: '0.25',
          creditResidualAmount: '0.75',
          lineCount: 3,
          pendingPaymentCount: 2,
          confirmedPaymentCount: 1,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _debtorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Selected lines'), findsOneWidget);
    expect(find.text('22.00 USD'), findsOneWidget);
    expectMoneyText('22.00', 'USD');
    expect(find.text('Confirmed residual'), findsOneWidget);
    expect(find.text('1.50 USD'), findsOneWidget);
    expectMoneyText('1.50', 'USD');
    expect(find.text('Waived residual'), findsOneWidget);
    expect(find.text('0.25 USD'), findsOneWidget);
    expect(find.text('Credit residual'), findsOneWidget);
    expect(find.text('0.75 USD'), findsOneWidget);
    expect(find.text('3 lines'), findsOneWidget);
    expect(find.text('2 pending payments'), findsOneWidget);
    expect(find.text('1 confirmed payments'), findsOneWidget);
    expect(
      find.textContaining('Refresh before acting if anything looks stale'),
      findsOneWidget,
    );
  });

  testWidgets('settlement detail filters request lines locally', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleMultiLineRequest(),
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    await scrollTo(
      tester,
      find.byKey(const Key('settlement-detail-lines-search')),
    );
    await tester.enterText(
      find.byKey(const Key('settlement-detail-lines-search')),
      'eur closed',
    );
    await tester.pumpAndSettle();

    expectMoneyText('10.00', 'USD', findsNothing);
    expectMoneyText('12.00', 'EUR');
    expect(find.text('Closed'), findsOneWidget);
    expect(find.text('No matching request lines'), findsNothing);
    expect(find.text('Loaded selected scope'), findsOneWidget);
    expect(find.text('2 loaded lines'), findsOneWidget);
    expect(find.text('1 visible after filter'), findsOneWidget);
    expect(
      find.textContaining('does not expand baskets or decide line eligibility'),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('settlement-detail-lines-search')),
      'no-line-match',
    );
    await tester.pumpAndSettle();

    expectMoneyText('12.00', 'EUR', findsNothing);
    expect(find.text('No matching request lines'), findsOneWidget);
    expect(
      find.textContaining('Clear the filter to restore the rows'),
      findsOneWidget,
    );
    expect(find.text('No request lines'), findsNothing);
  });

  testWidgets(
    'settlement detail filters payments and keeps residual action bound',
    (tester) async {
      final repository = FakeSettlementRepository(
        detail: sampleMultiLineRequest(),
        payments: [
          samplePayment(
            amount: '2.50',
            currency: 'USD',
            residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
          ),
          samplePayment(
            id: _secondPaymentId,
            amount: '8.00',
            currency: 'EUR',
            residualId: _secondResidualId,
            residualAmount: '1.00',
            residualCurrency: 'EUR',
            residualStatus: SettleoraSettlementResidualStatusValues
                .pendingReceiverConfirmation,
          ),
        ],
      );

      await pumpSettlementDetail(
        tester,
        repository: repository,
        currentUserProfileId: _creditorUserProfileId,
      );

      await scrollTo(
        tester,
        find.byKey(const Key('settlement-detail-payments-search')),
      );
      await tester.enterText(
        find.byKey(const Key('settlement-detail-payments-search')),
        'eur pending',
      );
      await tester.pumpAndSettle();

      expect(find.text('2.50 USD'), findsNothing);
      expect(find.text('8.00 EUR'), findsWidgets);
      expect(find.text('Loaded payment filters'), findsOneWidget);
      expect(find.text('2 loaded payments'), findsOneWidget);
      expect(find.text('1 visible after filter'), findsOneWidget);
      expect(
        find.textContaining(
          'They do not authorize, mutate, calculate, allocate, or reconcile',
        ),
        findsOneWidget,
      );
      expect(find.text('Actual paid'), findsOneWidget);
      expect(find.text('Allocation 1'), findsOneWidget);
      expect(
        find.textContaining('clearing details for the loaded selected lines'),
        findsOneWidget,
      );
      expect(find.text('Underpayment / Remaining Balance'), findsOneWidget);
      expect(find.text('Pending receiver confirmation'), findsWidgets);

      final residualConfirm = find.byKey(
        const ValueKey('settlement-residual-confirm-0-0'),
      );
      await tester.tap(residualConfirm);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm residual'));
      await tester.pumpAndSettle();

      expect(repository.confirmResidualCalls, 1);
      expect(repository.lastPaymentId, _secondPaymentId);
      expect(repository.lastResidualId, _secondResidualId);
    },
  );

  testWidgets('settlement detail explains filtered-empty payments separately', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleMultiLineRequest(),
      payments: [
        samplePayment(
          amount: '2.50',
          currency: 'USD',
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
      ],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    await scrollTo(
      tester,
      find.byKey(const Key('settlement-detail-payments-search')),
    );
    await tester.enterText(
      find.byKey(const Key('settlement-detail-payments-search')),
      'no-payment-match',
    );
    await tester.pumpAndSettle();

    expect(find.text('No matching payments'), findsOneWidget);
    expect(
      find.textContaining('Clear filters to restore rows'),
      findsOneWidget,
    );
    expect(find.text('No payments'), findsNothing);
  });

  testWidgets('counterparty details explain settlement-scoped visibility', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(),
      paymentDetails: samplePaymentDetails(),
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _debtorUserProfileId,
    );

    await scrollTo(tester, find.text('Counterparty Payment Details'));

    expect(find.text('Settlement-scoped visibility'), findsOneWidget);
    expect(
      find.textContaining(
        'Only people involved in an eligible settlement can see these payment details',
      ),
      findsOneWidget,
    );
    expect(find.text('Relationship-backed'), findsOneWidget);
    expect(find.text('settlement_counterparties_only'), findsOneWidget);
    expect(find.textContaining(_settlementId), findsNothing);
    expect(find.textContaining('/api/'), findsNothing);
    expect(find.textContaining('storage'), findsNothing);
  });

  testWidgets('mark-paid dialog validates empty inputs locally', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(),
      payments: const [],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _debtorUserProfileId,
    );

    await tester.tap(find.byKey(const Key('settlement-request-mark-paid')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('settlement-mark-paid-amount')),
      '',
    );
    await tester.tap(find.byKey(const Key('settlement-mark-paid-submit')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Enter amount, currency, and payment date before marking paid.',
      ),
      findsOneWidget,
    );
    expect(repository.markPaymentPaidCalls, 0);
  });

  testWidgets('creditor does not see payer-only mark-paid action', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(),
      payments: const [],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    await scrollTo(tester, find.text('Waiting for payer'));
    expect(find.byKey(const Key('settlement-request-mark-paid')), findsNothing);
    expect(find.text('Waiting for payer'), findsOneWidget);
  });

  testWidgets('mark-paid action blocks duplicate taps while in flight', (
    tester,
  ) async {
    final markPaidCompleter = Completer<void>();
    final repository = FakeSettlementRepository(
      detail: sampleRequest(),
      payments: const [],
      markPaymentPaidCompleter: markPaidCompleter,
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _debtorUserProfileId,
    );

    final markPaid = find.byKey(const Key('settlement-request-mark-paid'));
    await tester.tap(markPaid);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('settlement-mark-paid-submit')));
    await tester.pump();

    expect(repository.markPaymentPaidCalls, 1);
    expect(tester.widget<FilledButton>(markPaid).onPressed, isNull);

    await tester.tap(markPaid);
    await tester.pump();

    expect(repository.markPaymentPaidCalls, 1);
    markPaidCompleter.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('receiver confirms marked-paid payment after confirmation', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(
        status: SettleoraSettlementRequestStatusValues.markedPaid,
      ),
      payments: [
        samplePayment(
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
      ],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    await scrollTo(tester, find.text('Confirm receipt'));
    expect(find.text('Confirm receipt'), findsOneWidget);
    final confirm = find.byKey(const ValueKey('settlement-payment-confirm-0'));
    await scrollTo(tester, confirm);
    await tester.tap(confirm);
    await tester.pumpAndSettle();

    expect(find.text('Confirm receipt?'), findsOneWidget);
    expect(
      find.text(
        'Confirm only if you received this payment. Access, settlement state, residual handling, and audit details are checked before the confirmation is saved.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Confirm receipt'));
    await tester.pumpAndSettle();

    expect(repository.confirmPaymentCalls, 1);
    expect(find.text('Payment confirmed.'), findsOneWidget);
  });

  testWidgets('payer cancels payment claim after confirmation', (tester) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(
        status: SettleoraSettlementRequestStatusValues.markedPaid,
      ),
      payments: [
        samplePayment(
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
      ],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _debtorUserProfileId,
    );

    final cancel = find.byKey(const ValueKey('settlement-payment-cancel-0'));
    await scrollTo(tester, cancel);
    await tester.tap(cancel);
    await tester.pumpAndSettle();

    expect(find.text('Cancel payment claim?'), findsOneWidget);
    expect(
      find.text(
        'This asks the API to cancel your marked-paid claim. The loaded payer role only guides this button; the server decides whether the transition is allowed.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Cancel claim'));
    await tester.pumpAndSettle();

    expect(repository.cancelPaymentCalls, 1);
    expect(repository.lastPaymentId, _paymentId);
    expect(find.text('Payment cancelled.'), findsOneWidget);
  });

  testWidgets('receiver disputes payment claim after confirmation', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(
        status: SettleoraSettlementRequestStatusValues.markedPaid,
      ),
      payments: [
        samplePayment(
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
      ],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    final dispute = find.byKey(const ValueKey('settlement-payment-dispute-0'));
    await scrollTo(tester, dispute);
    await tester.tap(dispute);
    await tester.pumpAndSettle();

    expect(find.text('Dispute payment?'), findsOneWidget);
    expect(
      find.text(
        'This marks the payment claim as disputed so it can be corrected. A reason cannot be added from mobile yet.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Dispute payment'));
    await tester.pumpAndSettle();

    expect(repository.disputePaymentCalls, 1);
    expect(repository.lastPaymentId, _paymentId);
    expect(find.text('Payment disputed.'), findsOneWidget);
  });

  testWidgets('payment action blocks duplicate taps while in flight', (
    tester,
  ) async {
    final confirmCompleter = Completer<void>();
    final repository = FakeSettlementRepository(
      detail: sampleRequest(
        status: SettleoraSettlementRequestStatusValues.markedPaid,
      ),
      payments: [
        samplePayment(
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
      ],
      confirmPaymentCompleter: confirmCompleter,
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    final confirm = find.byKey(const ValueKey('settlement-payment-confirm-0'));
    await scrollTo(tester, confirm);
    await tester.tap(confirm);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm receipt'));
    await tester.pump();

    expect(repository.confirmPaymentCalls, 1);
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull);

    await tester.tap(confirm);
    await tester.pump();

    expect(repository.confirmPaymentCalls, 1);
    confirmCompleter.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('request dispute uses safe confirmation and no reason input', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(detail: sampleRequest());

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _debtorUserProfileId,
    );

    await tester.tap(find.byKey(const Key('settlement-request-dispute')));
    await tester.pumpAndSettle();

    expect(find.text('Dispute settlement?'), findsOneWidget);
    expect(
      find.text(
        'This marks the settlement as disputed so it can be corrected. A reason cannot be added from mobile yet.',
      ),
      findsOneWidget,
    );
    expect(find.byType(TextField), findsNothing);

    await tester.tap(find.widgetWithText(FilledButton, 'Dispute'));
    await tester.pumpAndSettle();

    expect(repository.disputeRequestCalls, 1);
    expect(find.text('Settlement disputed.'), findsOneWidget);
  });

  testWidgets('confirmed settlement hides lifecycle actions', (tester) async {
    final repository = FakeSettlementRepository(
      detail: sampleRequest(
        status: SettleoraSettlementRequestStatusValues.confirmed,
      ),
      payments: [
        samplePayment(
          status: SettleoraSettlementPaymentStatusValues.confirmed,
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
      ],
    );

    await pumpSettlementDetail(
      tester,
      repository: repository,
      currentUserProfileId: _creditorUserProfileId,
    );

    expect(
      find.text(
        'Actions shown here use the latest loaded status. Access, settlement state, audit, and money are checked again before changes are saved.',
      ),
      findsOneWidget,
    );
    await scrollTo(tester, find.text('No action needed'));
    expect(find.text('No action needed'), findsOneWidget);
    expect(find.byKey(const Key('settlement-request-cancel')), findsNothing);
    expect(find.byKey(const Key('settlement-request-dispute')), findsNothing);
    expect(
      find.byKey(const ValueKey('settlement-payment-confirm-0')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('settlement-payment-dispute-0')),
      findsNothing,
    );
  });

  testWidgets('settlement list shows bounded session failure state', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: FakeSettlementRepository(
            failure: const SettleoraSettlementFailure(
              kind: SettleoraSettlementFailureKind.sessionRequired,
              message: 'Sign in before loading settlements.',
            ),
          ),
          currentUserProfileId: _debtorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in required'), findsOneWidget);
    expect(find.text('Sign in before loading settlements.'), findsOneWidget);
    expect(find.textContaining(_settlementId), findsNothing);
    expect(find.byKey(const Key('settlement-list-search')), findsNothing);
    expect(
      find.byKey(const Key('settlement-list-clear-filters')),
      findsNothing,
    );
  });
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  FakeSettlementRepository({
    this.failure,
    this.balances = const [],
    this.requests = const [],
    SettleoraSettlementRequest? detail,
    this.payments = const [],
    this.paymentDetails,
    this.markPaymentPaidCompleter,
    this.confirmPaymentCompleter,
    this.actionFailure,
    this.failRefreshAfterMutation = false,
  }) : detail = detail ?? sampleRequest();

  final SettleoraSettlementFailure? failure;
  final List<SettleoraSettlementBalance> balances;
  final List<SettleoraSettlementRequest> requests;
  SettleoraSettlementRequest detail;
  List<SettleoraSettlementPayment> payments;
  final SettleoraSettlementCounterpartyPaymentDetails? paymentDetails;
  final Completer<void>? markPaymentPaidCompleter;
  final Completer<void>? confirmPaymentCompleter;
  final SettleoraSettlementFailure? actionFailure;
  final bool failRefreshAfterMutation;
  bool _mutationCompleted = false;
  int listBalancesCalls = 0;
  int listRequestsCalls = 0;
  int getRequestCalls = 0;
  int listPaymentsCalls = 0;
  int paymentDetailsCalls = 0;
  int cancelRequestCalls = 0;
  int disputeRequestCalls = 0;
  int markPaymentPaidCalls = 0;
  int confirmPaymentCalls = 0;
  int cancelPaymentCalls = 0;
  int disputePaymentCalls = 0;
  int confirmResidualCalls = 0;
  String? lastPaymentDetailsUserProfileId;
  String? lastMarkedPaidSettlementId;
  String? lastMarkedPaidAmount;
  String? lastMarkedPaidCurrency;
  String? lastMarkedPaidPaymentDate;
  String? lastPaymentId;
  String? lastResidualId;

  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() async {
    listBalancesCalls += 1;
    _throwIfNeeded();
    return SettleoraSettlementBalanceSnapshot(
      generatedAtUtc: _generatedAtUtc,
      balances: balances,
    );
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() async {
    listRequestsCalls += 1;
    _throwIfNeeded();
    return requests;
  }

  @override
  Future<SettleoraSettlementRequest> getSettlementRequest(
    String settlementId,
  ) async {
    getRequestCalls += 1;
    _throwRefreshFailureIfNeeded();
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) async {
    listPaymentsCalls += 1;
    _throwRefreshFailureIfNeeded();
    _throwIfNeeded();
    return payments;
  }

  @override
  Future<SettleoraSettlementPayment> markSettlementPaymentPaid({
    required String settlementId,
    required String amount,
    required String currency,
    required String paymentDate,
  }) async {
    markPaymentPaidCalls += 1;
    lastMarkedPaidSettlementId = settlementId;
    lastMarkedPaidAmount = amount;
    lastMarkedPaidCurrency = currency;
    lastMarkedPaidPaymentDate = paymentDate;
    _throwActionIfNeeded();
    final completer = markPaymentPaidCompleter;
    if (completer != null) {
      await completer.future;
    }
    final payment = samplePayment(
      amount: amount,
      currency: currency,
      paymentDate: paymentDate,
      residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
    );
    detail = sampleRequest(
      status: SettleoraSettlementRequestStatusValues.markedPaid,
    );
    payments = [payment];
    _mutationCompleted = true;
    return payment;
  }

  @override
  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  }) async {
    paymentDetailsCalls += 1;
    lastPaymentDetailsUserProfileId = userProfileId;
    _throwIfNeeded();
    return paymentDetails ?? samplePaymentDetails();
  }

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) async {
    cancelRequestCalls += 1;
    _throwActionIfNeeded();
    detail = sampleRequest(
      status: SettleoraSettlementRequestStatusValues.cancelled,
    );
    _mutationCompleted = true;
    return detail;
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) async {
    disputeRequestCalls += 1;
    _throwActionIfNeeded();
    detail = sampleRequest(
      status: SettleoraSettlementRequestStatusValues.disputed,
    );
    _mutationCompleted = true;
    return detail;
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) async {
    confirmPaymentCalls += 1;
    lastPaymentId = paymentId;
    _throwActionIfNeeded();
    final completer = confirmPaymentCompleter;
    if (completer != null) {
      await completer.future;
    }
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.confirmed,
      residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
    );
    payments = [payment];
    _mutationCompleted = true;
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(
    String paymentId,
  ) async {
    cancelPaymentCalls += 1;
    lastPaymentId = paymentId;
    _throwActionIfNeeded();
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.cancelled,
    );
    payments = [payment];
    _mutationCompleted = true;
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) async {
    disputePaymentCalls += 1;
    lastPaymentId = paymentId;
    _throwActionIfNeeded();
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.disputed,
    );
    payments = [payment];
    _mutationCompleted = true;
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  }) async {
    confirmResidualCalls += 1;
    lastPaymentId = paymentId;
    lastResidualId = residualId;
    _throwActionIfNeeded();
    final payment = samplePayment(
      residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
    );
    payments = [payment];
    _mutationCompleted = true;
    return payment;
  }

  void _throwActionIfNeeded() {
    final failure = actionFailure;
    if (failure != null) {
      throw failure;
    }
  }

  void _throwRefreshFailureIfNeeded() {
    if (failRefreshAfterMutation && _mutationCompleted) {
      throw const SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.server,
        message: 'Settlements are unavailable right now. Try again later.',
      );
    }
  }

  void _throwIfNeeded() {
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }
  }
}

Future<void> pumpSettlementDetail(
  WidgetTester tester, {
  required FakeSettlementRepository repository,
  required String currentUserProfileId,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: SettleoraSettlementDetailScreen(
        repository: repository,
        settlementId: _settlementId,
        currentUserProfileId: currentUserProfileId,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    320,
    scrollable: find.byWidgetPredicate(
      (widget) =>
          widget is Scrollable && widget.axisDirection == AxisDirection.down,
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> scrollListBy(WidgetTester tester, double dy) async {
  await tester.drag(find.byType(ListView), Offset(0, dy));
  await tester.pumpAndSettle();
}

Future<void> scrollFilterChipsBy(WidgetTester tester, double dx) async {
  await tester.drag(find.byType(SingleChildScrollView), Offset(dx, 0));
  await tester.pumpAndSettle();
}

void expectMoneyText(String amount, String currencyCode, [Matcher? matcher]) {
  expect(
    find.byWidgetPredicate(
      (widget) =>
          widget is MoneyText &&
          widget.amount == amount &&
          widget.currencyCode == currencyCode,
    ),
    matcher ?? findsWidgets,
  );
}

SettleoraSettlementBalance sampleBalance({
  String selectedLineAmount = '10.00',
  String pendingClaimedAmount = '2.50',
  String confirmedClearedAmount = '0.00',
  String remainingUnclaimedAmount = '7.50',
  String confirmedRemainingResidualAmount = '0.00',
  String waivedResidualAmount = '0.00',
  String creditResidualAmount = '0.00',
  int requestCount = 1,
  int lineCount = 1,
  int pendingPaymentCount = 1,
  int confirmedPaymentCount = 0,
}) {
  return SettleoraSettlementBalance(
    counterpartyUserProfileId: _creditorUserProfileId,
    groupId: null,
    direction: SettleoraSettlementBalanceDirectionValues.outgoing,
    currency: 'USD',
    selectedLineAmount: selectedLineAmount,
    pendingClaimedAmount: pendingClaimedAmount,
    confirmedClearedAmount: confirmedClearedAmount,
    remainingUnclaimedAmount: remainingUnclaimedAmount,
    confirmedRemainingResidualAmount: confirmedRemainingResidualAmount,
    waivedResidualAmount: waivedResidualAmount,
    creditResidualAmount: creditResidualAmount,
    requestCount: requestCount,
    lineCount: lineCount,
    pendingPaymentCount: pendingPaymentCount,
    confirmedPaymentCount: confirmedPaymentCount,
  );
}

SettleoraSettlementRequest sampleRequest({
  String id = _settlementId,
  String sourceExpenseBillId = _billId,
  String? groupId,
  String debtorUserProfileId = _debtorUserProfileId,
  String creditorUserProfileId = _creditorUserProfileId,
  String amount = '10.00',
  String currency = 'USD',
  String status = SettleoraSettlementRequestStatusValues.requested,
  String requestedByUserProfileId = _creditorUserProfileId,
  String lineStatus = 'open',
  String? sourceCandidateKey = 'candidate-key',
  String lineId = _lineId,
  String? sourceBillRevisionId,
}) {
  return SettleoraSettlementRequest(
    id: id,
    sourceExpenseBillId: sourceExpenseBillId,
    groupId: groupId,
    debtorUserProfileId: debtorUserProfileId,
    creditorUserProfileId: creditorUserProfileId,
    amount: amount,
    currency: currency,
    status: status,
    requestedByUserProfileId: requestedByUserProfileId,
    requestedAtUtc: _requestedAtUtc,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    lines: [
      SettleoraSettlementRequestLine(
        id: lineId,
        sourceExpenseBillId: sourceExpenseBillId,
        sourceBillRevisionId: sourceBillRevisionId,
        sourceCandidateKey: sourceCandidateKey,
        exactAmount: amount,
        currency: currency,
        allocationOrder: 0,
        status: lineStatus,
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
    ],
  );
}

SettleoraSettlementRequest sampleMultiLineRequest() {
  return SettleoraSettlementRequest(
    id: _settlementId,
    sourceExpenseBillId: _billId,
    groupId: null,
    debtorUserProfileId: _debtorUserProfileId,
    creditorUserProfileId: _creditorUserProfileId,
    amount: '22.00',
    currency: 'USD',
    status: SettleoraSettlementRequestStatusValues.requested,
    requestedByUserProfileId: _creditorUserProfileId,
    requestedAtUtc: _requestedAtUtc,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    lines: [
      SettleoraSettlementRequestLine(
        id: _lineId,
        sourceExpenseBillId: _billId,
        sourceBillRevisionId: null,
        sourceCandidateKey: null,
        exactAmount: '10.00',
        currency: 'USD',
        allocationOrder: 0,
        status: 'open',
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
      SettleoraSettlementRequestLine(
        id: _secondLineId,
        sourceExpenseBillId: _billId,
        sourceBillRevisionId: null,
        sourceCandidateKey: null,
        exactAmount: '12.00',
        currency: 'EUR',
        allocationOrder: 1,
        status: 'closed',
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
    ],
  );
}

SettleoraSettlementPayment samplePayment({
  String id = _paymentId,
  String status = SettleoraSettlementPaymentStatusValues.markedPaid,
  String amount = '2.50',
  String currency = 'USD',
  String paymentDate = '2026-05-17',
  String residualId = _residualId,
  String residualAmount = '7.50',
  String residualCurrency = 'USD',
  String residualStatus =
      SettleoraSettlementResidualStatusValues.pendingReceiverConfirmation,
}) {
  return SettleoraSettlementPayment(
    id: id,
    settlementRequestId: _settlementId,
    paidByUserProfileId: _debtorUserProfileId,
    receivedByUserProfileId: _creditorUserProfileId,
    amount: amount,
    currency: currency,
    status: status,
    paymentDate: paymentDate,
    claimedAtUtc: _claimedAtUtc,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    allocations: [
      SettleoraSettlementPaymentAllocation(
        id: _allocationId,
        settlementRequestLineId: _lineId,
        clearedAmount: amount,
        currency: currency,
        allocationOrder: 0,
        createdAtUtc: _createdAtUtc,
      ),
    ],
    residuals: [
      SettleoraSettlementPaymentResidual(
        id: residualId,
        settlementPaymentId: id,
        settlementRequestId: _settlementId,
        direction: 'underpayment',
        amount: residualAmount,
        currency: residualCurrency,
        policy: 'remaining_balance',
        status: residualStatus,
        createdAtUtc: _createdAtUtc,
        resolvedAtUtc: null,
      ),
    ],
    settlementRequestStatus:
        SettleoraSettlementRequestStatusValues.partiallyPaid,
  );
}

SettleoraSettlementCounterpartyPaymentDetails samplePaymentDetails() {
  return const SettleoraSettlementCounterpartyPaymentDetails(
    userProfileId: _creditorUserProfileId,
    isConfigured: true,
    preferredMethodLabel: 'Bank transfer',
    paymentHandle: 'pay.example/receiver',
    paymentNote: null,
    visibilityApplied: 'settlement_counterparties_only',
    hasQrFile: true,
  );
}

const _settlementId = '11111111-1111-1111-1111-111111111111';
const _secondSettlementId = '11111111-1111-1111-1111-111111111112';
const _thirdSettlementId = '11111111-1111-1111-1111-111111111113';
const _paymentId = '22222222-2222-2222-2222-222222222222';
const _secondPaymentId = '22222222-2222-2222-2222-222222222223';
const _residualId = '33333333-3333-3333-3333-333333333333';
const _secondResidualId = '33333333-3333-3333-3333-333333333334';
const _billId = '44444444-4444-4444-4444-444444444444';
const _groupId = '44444444-4444-4444-4444-444444444445';
const _lineId = '55555555-5555-5555-5555-555555555555';
const _secondLineId = '55555555-5555-5555-5555-555555555556';
const _sourceBillRevisionId = '55555555-5555-5555-5555-555555555557';
const _sourceCandidateKey = 'candidate-key-for-search-privacy';
const _allocationId = '66666666-6666-6666-6666-666666666666';
const _debtorUserProfileId = '77777777-7777-7777-7777-777777777777';
const _creditorUserProfileId = '88888888-8888-8888-8888-888888888888';
const _requesterUserProfileId = '99999999-9999-9999-9999-999999999999';
final _generatedAtUtc = DateTime.utc(2026, 5, 17, 9);
final _requestedAtUtc = DateTime.utc(2026, 5, 17, 10);
final _claimedAtUtc = DateTime.utc(2026, 5, 17, 10, 30);
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
