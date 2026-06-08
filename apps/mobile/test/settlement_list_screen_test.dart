import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/settlements/settlement_repository.dart';

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
    expect(repository.listBalancesCalls, 1);
    expect(repository.listRequestsCalls, 1);

    await scrollTo(
      tester,
      find.byKey(const ValueKey('settlement-request-tile-0')),
    );
    await tester.tap(find.byKey(const ValueKey('settlement-request-tile-0')));
    await tester.pumpAndSettle();

    await scrollTo(tester, find.text('Counterparty Payment Details'));
    expect(find.text('Counterparty Payment Details'), findsOneWidget);
    expect(find.text('Bank transfer'), findsOneWidget);
    await scrollTo(tester, find.text('Payments'));
    expect(find.text('Payments'), findsOneWidget);
    expect(find.text('2.50 USD'), findsOneWidget);
    expect(
      find.text(
        'Receipt confirmation is blocked until pending residuals are confirmed.',
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

  testWidgets(
    'settlement list search filters requests by currency and status',
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
        'confirmed eur',
      );
      await tester.pumpAndSettle();

      expect(find.text('10.00 USD'), findsNothing);
      await scrollListBy(tester, -260);
      expect(find.text('25.00 EUR'), findsOneWidget);
      expect(find.text('No matching settlements'), findsNothing);
    },
  );

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
      find.text('No settlements match this search and filter.'),
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

    expect(find.text('Next step'), findsOneWidget);
    expect(find.text('You are expected to pay'), findsOneWidget);
    expect(find.text('Payment needed'), findsOneWidget);
    expect(find.text('Mark paid available'), findsOneWidget);

    await tester.tap(find.byKey(const Key('settlement-request-mark-paid')));
    await tester.pumpAndSettle();

    expect(find.text('Mark settlement paid?'), findsOneWidget);
    expect(
      find.text(
        'Mark paid only after sending payment. The server will verify the claim, update settlement state, and keep the audit trail.',
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
    expect(find.text('Requested - You receive'), findsOneWidget);
    expect(find.text('2 lines'), findsOneWidget);
    expect(find.text('2 payments'), findsOneWidget);
    expect(find.text('1 need confirmation'), findsOneWidget);
    expect(find.text('Payment details Available'), findsOneWidget);
    expect(find.textContaining(_settlementId), findsNothing);
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

    expect(find.text('10.00 USD - Open'), findsNothing);
    expect(find.text('12.00 EUR - Closed'), findsOneWidget);
    expect(find.text('No matching request lines'), findsNothing);

    await tester.enterText(
      find.byKey(const Key('settlement-detail-lines-search')),
      'no-line-match',
    );
    await tester.pumpAndSettle();

    expect(find.text('12.00 EUR - Closed'), findsNothing);
    expect(find.text('No matching request lines'), findsOneWidget);
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
      expect(find.text('8.00 EUR'), findsOneWidget);

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

    expect(find.text('Confirm receipt'), findsOneWidget);
    final confirm = find.byKey(const ValueKey('settlement-payment-confirm-0'));
    await scrollTo(tester, confirm);
    await tester.tap(confirm);
    await tester.pumpAndSettle();

    expect(find.text('Confirm receipt?'), findsOneWidget);
    await tester.tap(find.text('Confirm receipt'));
    await tester.pumpAndSettle();

    expect(repository.confirmPaymentCalls, 1);
    expect(find.text('Payment confirmed.'), findsOneWidget);
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
        'This flags the settlement for correction. This mobile seam does not support sending a reason yet.',
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
  }) : detail = detail ?? sampleRequest();

  final SettleoraSettlementFailure? failure;
  final List<SettleoraSettlementBalance> balances;
  final List<SettleoraSettlementRequest> requests;
  SettleoraSettlementRequest detail;
  List<SettleoraSettlementPayment> payments;
  final SettleoraSettlementCounterpartyPaymentDetails? paymentDetails;
  final Completer<void>? markPaymentPaidCompleter;
  final Completer<void>? confirmPaymentCompleter;
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
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) async {
    listPaymentsCalls += 1;
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
    detail = sampleRequest(
      status: SettleoraSettlementRequestStatusValues.cancelled,
    );
    return detail;
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) async {
    disputeRequestCalls += 1;
    detail = sampleRequest(
      status: SettleoraSettlementRequestStatusValues.disputed,
    );
    return detail;
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) async {
    confirmPaymentCalls += 1;
    lastPaymentId = paymentId;
    final completer = confirmPaymentCompleter;
    if (completer != null) {
      await completer.future;
    }
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.confirmed,
      residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
    );
    payments = [payment];
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(
    String paymentId,
  ) async {
    cancelPaymentCalls += 1;
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.cancelled,
    );
    payments = [payment];
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) async {
    disputePaymentCalls += 1;
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.disputed,
    );
    payments = [payment];
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
    final payment = samplePayment(
      residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
    );
    payments = [payment];
    return payment;
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

SettleoraSettlementBalance sampleBalance() {
  return const SettleoraSettlementBalance(
    counterpartyUserProfileId: _creditorUserProfileId,
    groupId: null,
    direction: SettleoraSettlementBalanceDirectionValues.outgoing,
    currency: 'USD',
    selectedLineAmount: '10.00',
    pendingClaimedAmount: '2.50',
    confirmedClearedAmount: '0.00',
    remainingUnclaimedAmount: '7.50',
    confirmedRemainingResidualAmount: '0.00',
    waivedResidualAmount: '0.00',
    creditResidualAmount: '0.00',
    requestCount: 1,
    lineCount: 1,
    pendingPaymentCount: 1,
    confirmedPaymentCount: 0,
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
        id: _lineId,
        sourceExpenseBillId: sourceExpenseBillId,
        sourceBillRevisionId: null,
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
const _lineId = '55555555-5555-5555-5555-555555555555';
const _secondLineId = '55555555-5555-5555-5555-555555555556';
const _allocationId = '66666666-6666-6666-6666-666666666666';
const _debtorUserProfileId = '77777777-7777-7777-7777-777777777777';
const _creditorUserProfileId = '88888888-8888-8888-8888-888888888888';
final _generatedAtUtc = DateTime.utc(2026, 5, 17, 9);
final _requestedAtUtc = DateTime.utc(2026, 5, 17, 10);
final _claimedAtUtc = DateTime.utc(2026, 5, 17, 10, 30);
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
