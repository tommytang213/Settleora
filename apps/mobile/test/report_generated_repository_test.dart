import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/reports/generated_report_repository.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraMonthlyReportRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeMonthlyReportGeneratedClient();
      final repository = GeneratedSettleoraMonthlyReportRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureMonthlyReportFailure(() {
        return repository.getMonthlyReport(month: '2026-05');
      });

      expect(failure.kind, SettleoraMonthlyReportFailureKind.sessionRequired);
      expect(client.calls, 0);
    });

    test(
      'maps all monthly report sections and preserves money strings',
      () async {
        final tokenProvider = FakeAccessTokenProvider('  redacted-token  ');
        final client = FakeMonthlyReportGeneratedClient();
        final repository = GeneratedSettleoraMonthlyReportRepository(
          client: client,
          accessTokenProvider: tokenProvider,
        );

        final report = await repository.getMonthlyReport(
          month: ' 2026-05 ',
          groupId: ' $_groupId ',
        );

        expect(report.month, '2026-05');
        expect(report.groupId, _groupId);
        expect(report.generatedAtUtc.isUtc, isTrue);
        expect(report.billCount, 3);
        expect(report.totalByCurrency.single.amount, '123.4500');
        expect(report.totalByCurrency.single.currency, 'USD');
        expect(report.actorShareByCurrency.single.amount, '41.1500');
        expect(report.actorPaidByCurrency.single.amount, '90.00');
        expect(report.reconciliationCounts.map((row) => row.status), [
          'unreconciled',
          'reconciled',
          'unknown_future_status',
        ]);
        expect(report.settlementRequestCounts.single.count, 2);
        expect(report.settlementPaymentCounts.single.count, 1);
        expect(client.lastMonth, '2026-05');
        expect(client.lastGroupId, _groupId);
        expect(client.accessTokens, ['redacted-token']);
        expect(tokenProvider.calls, 1);
      },
    );

    test('normalizes blank group IDs to omitted query values', () async {
      final client = FakeMonthlyReportGeneratedClient();
      final repository = GeneratedSettleoraMonthlyReportRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      await repository.getMonthlyReport(month: '2026-05', groupId: '   ');

      expect(client.calls, 1);
      expect(client.lastGroupId, isNull);
    });

    test('validates month before generated calls', () async {
      final client = FakeMonthlyReportGeneratedClient();
      final repository = GeneratedSettleoraMonthlyReportRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      for (final month in ['2026-5', '2026-00', '2026-13', '']) {
        final failure = await captureMonthlyReportFailure(() {
          return repository.getMonthlyReport(month: month);
        });
        expect(failure.kind, SettleoraMonthlyReportFailureKind.validation);
      }
      expect(client.calls, 0);
    });

    test('maps generated HTTP failures to bounded safe failures', () async {
      const cases = [
        FailureCase(
          api.SettleoraApiException(400, 'Bad Request', _hiddenBody),
          SettleoraMonthlyReportFailureKind.validation,
          400,
        ),
        FailureCase(
          api.SettleoraApiException(401, 'Unauthorized', _hiddenBody),
          SettleoraMonthlyReportFailureKind.sessionExpired,
          401,
        ),
        FailureCase(
          api.SettleoraApiException(403, 'Forbidden', _hiddenBody),
          SettleoraMonthlyReportFailureKind.denied,
          403,
        ),
        FailureCase(
          api.SettleoraApiException(404, 'Not Found', _hiddenBody),
          SettleoraMonthlyReportFailureKind.unavailable,
          404,
        ),
        FailureCase(
          api.SettleoraApiException(410, 'Gone', _hiddenBody),
          SettleoraMonthlyReportFailureKind.unavailable,
          410,
        ),
        FailureCase(
          api.SettleoraApiException(422, 'Unprocessable Content', _hiddenBody),
          SettleoraMonthlyReportFailureKind.validation,
          422,
        ),
        FailureCase(
          api.SettleoraApiException(503, 'Unavailable', _hiddenBody),
          SettleoraMonthlyReportFailureKind.server,
          503,
        ),
      ];

      for (final failureCase in cases) {
        final repository = GeneratedSettleoraMonthlyReportRepository(
          client: FakeMonthlyReportGeneratedClient(error: failureCase.error),
          accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
        );

        final failure = await captureMonthlyReportFailure(() {
          return repository.getMonthlyReport(month: '2026-05');
        });

        expect(failure.kind, failureCase.kind);
        expect(failure.statusCode, failureCase.statusCode);
        expect(failure.message, isNot(contains('internal-detail')));
        expect(failure.toString(), isNot(contains('internal-detail')));
      }
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraMonthlyReportRepository(
        client: FakeMonthlyReportGeneratedClient(
          error: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final failure = await captureMonthlyReportFailure(() {
        return repository.getMonthlyReport(month: '2026-05');
      });

      expect(failure.kind, SettleoraMonthlyReportFailureKind.network);
      expect(failure.message, isNot(contains('internal socket detail')));
    });
  });
}

Future<SettleoraMonthlyReportFailure> captureMonthlyReportFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraMonthlyReportFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraMonthlyReportFailure.');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;
  int calls = 0;

  @override
  Future<String?> accessToken() async {
    calls += 1;
    return _accessToken;
  }
}

class FakeMonthlyReportGeneratedClient
    implements SettleoraMonthlyReportGeneratedClient {
  FakeMonthlyReportGeneratedClient({
    this.error,
    api.MonthlyReportResponse? report,
  }) : report = report ?? sampleApiReport();

  final Object? error;
  final api.MonthlyReportResponse report;
  final accessTokens = <String>[];
  int calls = 0;
  String? lastMonth;
  String? lastGroupId;

  @override
  Future<api.MonthlyReportResponse> getMonthlyReport({
    required String month,
    String? groupId,
    required String accessToken,
  }) async {
    calls += 1;
    lastMonth = month;
    lastGroupId = groupId;
    accessTokens.add(accessToken);
    final error = this.error;
    if (error != null) {
      throw error;
    }

    return report;
  }
}

class FailureCase {
  const FailureCase(this.error, this.kind, this.statusCode);

  final Object error;
  final SettleoraMonthlyReportFailureKind kind;
  final int statusCode;
}

api.MonthlyReportResponse sampleApiReport({
  int billCount = 3,
  List<api.MonthlyReportCurrencyTotal>? totalByCurrency,
  List<api.MonthlyReportCurrencyTotal>? actorShareByCurrency,
  List<api.MonthlyReportCurrencyTotal>? actorPaidByCurrency,
  List<api.MonthlyReportStatusCount>? reconciliationCounts,
  List<api.MonthlyReportStatusCount>? settlementRequestCounts,
  List<api.MonthlyReportStatusCount>? settlementPaymentCounts,
}) {
  return api.MonthlyReportResponse(
    month: '2026-05',
    groupId: _groupId,
    generatedAtUtc: _generatedAtUtc,
    billCount: billCount,
    totalByCurrency:
        totalByCurrency ??
        const [
          api.MonthlyReportCurrencyTotal(currency: 'USD', amount: '123.4500'),
        ],
    actorShareByCurrency:
        actorShareByCurrency ??
        const [
          api.MonthlyReportCurrencyTotal(currency: 'USD', amount: '41.1500'),
        ],
    actorPaidByCurrency:
        actorPaidByCurrency ??
        const [
          api.MonthlyReportCurrencyTotal(currency: 'USD', amount: '90.00'),
        ],
    reconciliationCounts:
        reconciliationCounts ??
        const [
          api.MonthlyReportStatusCount(status: 'unreconciled', count: 1),
          api.MonthlyReportStatusCount(status: 'reconciled', count: 2),
          api.MonthlyReportStatusCount(
            status: 'unknown_future_status',
            count: 1,
          ),
        ],
    settlementRequestCounts:
        settlementRequestCounts ??
        const [api.MonthlyReportStatusCount(status: 'requested', count: 2)],
    settlementPaymentCounts:
        settlementPaymentCounts ??
        const [api.MonthlyReportStatusCount(status: 'marked_paid', count: 1)],
  );
}

const _groupId = '66666666-6666-6666-6666-666666666666';
const _hiddenBody = {'detail': 'internal-detail'};
final _generatedAtUtc = DateTime.utc(2026, 5, 18, 9);
