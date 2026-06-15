typedef SettleoraMonthlyReportStatus = String;

enum SettleoraMonthlyReportFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  validation,
  network,
  server,
}

class SettleoraMonthlyReportFailure implements Exception {
  const SettleoraMonthlyReportFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraMonthlyReportFailure.from(Object error) {
    if (error is SettleoraMonthlyReportFailure) {
      return error;
    }

    return const SettleoraMonthlyReportFailure(
      kind: SettleoraMonthlyReportFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraMonthlyReportFailureKind kind;
  final String message;
  final int? statusCode;

  String get userMessage {
    if (_isUnsafeFailureMessage(message)) {
      return switch (kind) {
        SettleoraMonthlyReportFailureKind.sessionRequired =>
          'Sign in before loading monthly reports.',
        SettleoraMonthlyReportFailureKind.sessionExpired =>
          'Your session has expired. Sign in again before loading monthly reports.',
        SettleoraMonthlyReportFailureKind.denied =>
          'Monthly reports are not available to this account.',
        SettleoraMonthlyReportFailureKind.validation =>
          'The monthly report request is no longer valid. Refresh and try again.',
        SettleoraMonthlyReportFailureKind.network =>
          'The server is unavailable. Try again when the connection is back.',
        SettleoraMonthlyReportFailureKind.unavailable ||
        SettleoraMonthlyReportFailureKind.server =>
          'Monthly reports are unavailable right now. Try again later.',
      };
    }

    return message;
  }

  String get title {
    return switch (kind) {
      SettleoraMonthlyReportFailureKind.sessionRequired => 'Sign in required',
      SettleoraMonthlyReportFailureKind.sessionExpired => 'Sign in again',
      SettleoraMonthlyReportFailureKind.denied => 'Report unavailable',
      SettleoraMonthlyReportFailureKind.unavailable => 'Report unavailable',
      SettleoraMonthlyReportFailureKind.validation => 'Unsupported request',
      SettleoraMonthlyReportFailureKind.network => 'Server unavailable',
      SettleoraMonthlyReportFailureKind.server => 'Report unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraMonthlyReportFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraMonthlyReport {
  const SettleoraMonthlyReport({
    required this.month,
    required this.groupId,
    required this.generatedAtUtc,
    required this.billCount,
    required this.totalByCurrency,
    required this.actorShareByCurrency,
    required this.actorPaidByCurrency,
    required this.reconciliationCounts,
    required this.settlementRequestCounts,
    required this.settlementPaymentCounts,
  });

  final String month;
  final String? groupId;
  final DateTime generatedAtUtc;
  final int billCount;
  final List<SettleoraMonthlyReportCurrencyTotal> totalByCurrency;
  final List<SettleoraMonthlyReportCurrencyTotal> actorShareByCurrency;
  final List<SettleoraMonthlyReportCurrencyTotal> actorPaidByCurrency;
  final List<SettleoraMonthlyReportStatusCount> reconciliationCounts;
  final List<SettleoraMonthlyReportStatusCount> settlementRequestCounts;
  final List<SettleoraMonthlyReportStatusCount> settlementPaymentCounts;

  bool get hasReportActivity {
    return billCount > 0 ||
        totalByCurrency.isNotEmpty ||
        actorShareByCurrency.isNotEmpty ||
        actorPaidByCurrency.isNotEmpty ||
        reconciliationCounts.any((item) => item.count > 0) ||
        settlementRequestCounts.any((item) => item.count > 0) ||
        settlementPaymentCounts.any((item) => item.count > 0);
  }
}

class SettleoraMonthlyReportCurrencyTotal {
  const SettleoraMonthlyReportCurrencyTotal({
    required this.currency,
    required this.amount,
  });

  final String currency;
  final String amount;
}

class SettleoraMonthlyReportStatusCount {
  const SettleoraMonthlyReportStatusCount({
    required this.status,
    required this.count,
  });

  final SettleoraMonthlyReportStatus status;
  final int count;
}

abstract interface class SettleoraMonthlyReportRepository {
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  });
}

String normalizeSettleoraReportMonth(String value) {
  final trimmed = value.trim();
  final match = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(trimmed);
  if (match == null) {
    throw const SettleoraMonthlyReportFailure(
      kind: SettleoraMonthlyReportFailureKind.validation,
      message: 'Choose a report month in yyyy-MM format.',
    );
  }

  final year = int.tryParse(match.group(1)!);
  final month = int.tryParse(match.group(2)!);
  if (year == null || year < 1 || month == null || month < 1 || month > 12) {
    throw const SettleoraMonthlyReportFailure(
      kind: SettleoraMonthlyReportFailureKind.validation,
      message: 'Choose a valid report month.',
    );
  }

  return trimmed;
}

String settleoraReportReconciliationStatusLabel(String status) {
  return _safeStatusLabel(status, const {
    'unreconciled': 'Unreconciled',
    'reconciled': 'Reconciled',
    'ignored': 'Ignored',
  });
}

String settleoraReportSettlementRequestStatusLabel(String status) {
  return _safeStatusLabel(status, const {
    'requested': 'Requested',
    'partially_paid': 'Partially paid',
    'marked_paid': 'Marked paid',
    'confirmed': 'Confirmed',
    'disputed': 'Disputed',
    'cancelled': 'Cancelled',
  });
}

String settleoraReportSettlementPaymentStatusLabel(String status) {
  return _safeStatusLabel(status, const {
    'marked_paid': 'Marked paid',
    'confirmed': 'Confirmed',
    'disputed': 'Disputed',
    'cancelled': 'Cancelled',
  });
}

String _safeStatusLabel(String status, Map<String, String> knownLabels) {
  final code = status.trim();
  if (code.isEmpty) {
    return 'Unknown';
  }

  final known = knownLabels[code];
  if (known != null) {
    return known;
  }

  final words = RegExp(r'[A-Za-z0-9]+')
      .allMatches(code)
      .map((match) => match.group(0))
      .whereType<String>()
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');

  if (words.isEmpty) {
    return 'Unknown';
  }

  final label = 'Other status: $words';
  if (label.length <= 56) {
    return label;
  }

  return '${label.substring(0, 53)}...';
}

bool _isUnsafeFailureMessage(String message) {
  final normalized = message.toLowerCase();
  const unsafeMarkers = [
    '/api/',
    'http://',
    'https://',
    'bearer ',
    'token',
    'stacktrace',
    'stack trace',
    'exception',
    'generated client',
    '.dart',
    '.cs',
    '.js',
    '/workspace/',
    '\\',
  ];

  return unsafeMarkers.any(normalized.contains);
}
