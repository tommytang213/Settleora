typedef SettleoraFutureBillStatus = String;

class SettleoraFutureBillStatusValues {
  const SettleoraFutureBillStatusValues._();

  static const draft = 'draft';
  static const pendingConfirmation = 'pending_confirmation';
  static const confirmed = 'confirmed';
  static const rejected = 'rejected';
  static const cancelled = 'cancelled';
}

enum SettleoraFutureBillFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraFutureBillFailure implements Exception {
  const SettleoraFutureBillFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraFutureBillFailure.from(Object error) {
    if (error is SettleoraFutureBillFailure) {
      return error;
    }

    return const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraFutureBillFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraFutureBillFailureKind.sessionRequired => 'Sign in required',
      SettleoraFutureBillFailureKind.sessionExpired => 'Sign in again',
      SettleoraFutureBillFailureKind.denied => 'Future bills unavailable',
      SettleoraFutureBillFailureKind.unavailable => 'Future bill unavailable',
      SettleoraFutureBillFailureKind.conflict => 'Needs refresh',
      SettleoraFutureBillFailureKind.validation => 'Unsupported request',
      SettleoraFutureBillFailureKind.network => 'Server unavailable',
      SettleoraFutureBillFailureKind.server => 'Future bills unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraFutureBillFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraFutureBillSummary {
  const SettleoraFutureBillSummary({
    required this.id,
    required this.merchantName,
    required this.dueDate,
    required this.status,
    required this.settlementEffective,
    required this.totalAmount,
    required this.totalCurrency,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.archivedAtUtc,
    required this.isGroupScoped,
  });

  final String id;
  final String? merchantName;
  final String dueDate;
  final SettleoraFutureBillStatus status;
  final bool settlementEffective;
  final String totalAmount;
  final String totalCurrency;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final DateTime? archivedAtUtc;
  final bool isGroupScoped;

  String get displayName {
    final trimmed = merchantName?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return isGroupScoped ? 'Group future bill' : 'Future bill';
    }

    return trimmed;
  }

  bool get canCancel => status == SettleoraFutureBillStatusValues.draft;
}

class SettleoraFutureBillDetail extends SettleoraFutureBillSummary {
  const SettleoraFutureBillDetail({
    required super.id,
    required super.merchantName,
    required super.dueDate,
    required super.status,
    required super.settlementEffective,
    required super.totalAmount,
    required super.totalCurrency,
    required super.createdAtUtc,
    required super.updatedAtUtc,
    required super.archivedAtUtc,
    required super.isGroupScoped,
    required this.items,
  });

  final List<SettleoraFutureBillItem> items;
}

class SettleoraFutureBillItem {
  const SettleoraFutureBillItem({
    required this.name,
    required this.amount,
    required this.currency,
    required this.note,
    required this.splitCount,
  });

  final String name;
  final String amount;
  final String currency;
  final String? note;
  final int splitCount;
}

class SettleoraFutureBillCreateDraft {
  const SettleoraFutureBillCreateDraft({
    required this.merchantName,
    required this.amount,
    required this.currency,
    required this.dueDate,
    required this.note,
    this.groupId,
    this.participantUserProfileIds = const [],
  });

  final String? merchantName;
  final String amount;
  final String currency;
  final String dueDate;
  final String? note;
  final String? groupId;
  final List<String> participantUserProfileIds;

  bool get isGroupScoped => groupId?.trim().isNotEmpty == true;
}

class SettleoraFutureBillUpdateDraft {
  const SettleoraFutureBillUpdateDraft({
    required this.merchantName,
    required this.dueDate,
  });

  final String? merchantName;
  final String? dueDate;
}

abstract interface class SettleoraFutureBillRepository {
  Future<List<SettleoraFutureBillSummary>> listFutureBills({
    SettleoraFutureBillStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    bool includeArchived = false,
    int maxItems = 100,
  });

  Future<SettleoraFutureBillDetail> getFutureBill(String futureBillId);

  Future<SettleoraFutureBillDetail> createFutureBill(
    SettleoraFutureBillCreateDraft draft,
  );

  Future<SettleoraFutureBillDetail> updateFutureBill({
    required String futureBillId,
    required SettleoraFutureBillUpdateDraft draft,
  });

  Future<SettleoraFutureBillDetail> cancelFutureBill(String futureBillId);

  Future<SettleoraFutureBillDetail> postFutureBill(String futureBillId);
}

String settleoraFutureBillStatusLabel(SettleoraFutureBillStatus status) {
  return switch (status) {
    SettleoraFutureBillStatusValues.draft => 'Draft',
    SettleoraFutureBillStatusValues.pendingConfirmation =>
      'Pending confirmation',
    SettleoraFutureBillStatusValues.confirmed => 'Confirmed',
    SettleoraFutureBillStatusValues.rejected => 'Rejected',
    SettleoraFutureBillStatusValues.cancelled => 'Cancelled',
    _ =>
      status
          .split('_')
          .where((part) => part.isNotEmpty)
          .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
          .join(' '),
  };
}
