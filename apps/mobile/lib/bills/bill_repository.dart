typedef SettleoraBillArchiveState = String;

class SettleoraBillArchiveStateValues {
  const SettleoraBillArchiveStateValues._();

  static const SettleoraBillArchiveState active = 'active';
  static const SettleoraBillArchiveState archived = 'archived';
}

typedef SettleoraBillStatus = String;
typedef SettleoraBillReconciliationStatus = String;
typedef SettleoraBillParticipantStatus = String;
typedef SettleoraBillParticipantRejectionReasonCode = String;

class SettleoraBillParticipantStatusValues {
  const SettleoraBillParticipantStatusValues._();

  static const pendingAcceptance = 'pending_acceptance';
  static const accepted = 'accepted';
  static const rejected = 'rejected';
  static const settled = 'settled';
}

class SettleoraBillParticipantRejectionReasonCodeValues {
  const SettleoraBillParticipantRejectionReasonCodeValues._();

  static const wrongAmount = 'wrong_amount';
  static const wrongItems = 'wrong_items';
  static const wrongSplit = 'wrong_split';
  static const duplicate = 'duplicate';
  static const notMine = 'not_mine';
  static const other = 'other';

  static const values = <SettleoraBillParticipantRejectionReasonCode>[
    wrongAmount,
    wrongItems,
    wrongSplit,
    duplicate,
    notMine,
    other,
  ];
}

enum SettleoraBillFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraBillFailure implements Exception {
  const SettleoraBillFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraBillFailure.from(Object error) {
    if (error is SettleoraBillFailure) {
      return error;
    }

    return const SettleoraBillFailure(
      kind: SettleoraBillFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraBillFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraBillFailureKind.sessionRequired => 'Sign in required',
      SettleoraBillFailureKind.sessionExpired => 'Sign in again',
      SettleoraBillFailureKind.denied => 'Bills unavailable',
      SettleoraBillFailureKind.unavailable => 'Bill unavailable',
      SettleoraBillFailureKind.conflict => 'Needs review',
      SettleoraBillFailureKind.validation => 'Unsupported request',
      SettleoraBillFailureKind.network => 'Server unavailable',
      SettleoraBillFailureKind.server => 'Bills unavailable',
    };
  }

  @override
  String toString() => 'SettleoraBillFailure($kind, statusCode: $statusCode)';
}

class SettleoraBillSummary {
  const SettleoraBillSummary({
    required this.id,
    required this.merchantName,
    required this.billDate,
    required this.status,
    required this.reconciliationStatus,
    required this.totalAmount,
    required this.totalCurrency,
    required this.archiveState,
    required this.itemCount,
    required this.participantCount,
    required this.payerCount,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    this.displayNameFallback = 'Personal bill',
  });

  final String id;
  final String? merchantName;
  final String billDate;
  final SettleoraBillStatus status;
  final SettleoraBillReconciliationStatus reconciliationStatus;
  final String totalAmount;
  final String totalCurrency;
  final SettleoraBillArchiveState archiveState;
  final int itemCount;
  final int participantCount;
  final int payerCount;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final String displayNameFallback;

  bool get isArchived =>
      archiveState == SettleoraBillArchiveStateValues.archived;

  String get displayName {
    final trimmed = merchantName?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return displayNameFallback;
    }

    return trimmed;
  }
}

class SettleoraBillDetail {
  const SettleoraBillDetail({
    required this.id,
    required this.merchantName,
    required this.billDate,
    required this.status,
    required this.reconciliationStatus,
    required this.reconciliationNote,
    required this.revisionCreationActions,
    required this.totalAmount,
    required this.totalCurrency,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.items,
    required this.participants,
    required this.payers,
    required this.adjustments,
    this.displayNameFallback = 'Personal bill',
  });

  final String id;
  final String? merchantName;
  final String billDate;
  final SettleoraBillStatus status;
  final SettleoraBillReconciliationStatus reconciliationStatus;
  final String? reconciliationNote;
  final SettleoraBillRevisionCreationActions revisionCreationActions;
  final String totalAmount;
  final String totalCurrency;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final List<SettleoraBillItem> items;
  final List<SettleoraBillParticipant> participants;
  final List<SettleoraBillPayer> payers;
  final List<SettleoraBillAdjustment> adjustments;
  final String displayNameFallback;

  String get displayName {
    final trimmed = merchantName?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return displayNameFallback;
    }

    return trimmed;
  }
}

class SettleoraBillRevisionCreationActions {
  const SettleoraBillRevisionCreationActions({required this.canCreateRevision});

  final bool canCreateRevision;
}

class SettleoraBillItem {
  const SettleoraBillItem({
    required this.id,
    required this.name,
    required this.note,
    required this.amount,
    required this.currency,
    required this.sortOrder,
  });

  final String id;
  final String name;
  final String? note;
  final String amount;
  final String currency;
  final int sortOrder;
}

class SettleoraBillParticipant {
  const SettleoraBillParticipant({
    required this.userProfileId,
    required this.status,
    required this.resolvedShareAmount,
    required this.resolvedShareCurrency,
  });

  final String userProfileId;
  final SettleoraBillParticipantStatus status;
  final String resolvedShareAmount;
  final String resolvedShareCurrency;
}

class SettleoraBillPayer {
  const SettleoraBillPayer({
    required this.userProfileId,
    required this.amount,
    required this.currency,
  });

  final String userProfileId;
  final String amount;
  final String currency;
}

class SettleoraBillAdjustment {
  const SettleoraBillAdjustment({
    required this.id,
    required this.type,
    required this.direction,
    required this.amount,
    required this.currency,
    required this.reasonNote,
    required this.sortOrder,
  });

  final String id;
  final String type;
  final String direction;
  final String amount;
  final String currency;
  final String? reasonNote;
  final int sortOrder;
}

class SettleoraPersonalBillCreateDraft {
  const SettleoraPersonalBillCreateDraft({
    this.merchantName,
    required this.billDate,
    required this.currency,
    required this.items,
    this.adjustments = const [],
    this.payerPaymentMethodLabelSnapshot,
  });

  final String? merchantName;
  final String billDate;
  final String currency;
  final List<SettleoraPersonalBillCreateItemDraft> items;
  final List<SettleoraPersonalBillCreateAdjustmentDraft> adjustments;
  final String? payerPaymentMethodLabelSnapshot;
}

class SettleoraPersonalBillCreateItemDraft {
  const SettleoraPersonalBillCreateItemDraft({
    required this.name,
    this.note,
    required this.amount,
    required this.currency,
  });

  final String name;
  final String? note;
  final String amount;
  final String currency;
}

class SettleoraPersonalBillCreateAdjustmentDraft {
  const SettleoraPersonalBillCreateAdjustmentDraft({
    required this.type,
    required this.direction,
    required this.allocationMethod,
    required this.amount,
    required this.currency,
    this.reasonNote,
  });

  final String type;
  final String direction;
  final String allocationMethod;
  final String amount;
  final String currency;
  final String? reasonNote;
}

class SettleoraGroupBillCreateDraft {
  const SettleoraGroupBillCreateDraft({
    this.merchantName,
    required this.billDate,
    required this.currency,
    required this.items,
    this.adjustments = const [],
    this.payers = const [],
  });

  final String? merchantName;
  final String billDate;
  final String currency;
  final List<SettleoraGroupBillCreateItemDraft> items;
  final List<SettleoraGroupBillCreateAdjustmentDraft> adjustments;
  final List<SettleoraGroupBillCreatePayerDraft> payers;
}

class SettleoraGroupBillCreateItemDraft {
  const SettleoraGroupBillCreateItemDraft({
    required this.name,
    this.note,
    required this.amount,
    required this.currency,
    required this.splits,
  });

  final String name;
  final String? note;
  final String amount;
  final String currency;
  final List<SettleoraGroupBillCreateItemSplitDraft> splits;
}

class SettleoraGroupBillCreateItemSplitDraft {
  const SettleoraGroupBillCreateItemSplitDraft({
    required this.userProfileId,
    required this.splitMethod,
    this.basisValue,
    this.allocationOrder,
  });

  final String userProfileId;
  final String splitMethod;
  final String? basisValue;
  final int? allocationOrder;
}

class SettleoraGroupBillCreateAdjustmentDraft {
  const SettleoraGroupBillCreateAdjustmentDraft({
    required this.type,
    required this.direction,
    required this.allocationMethod,
    required this.amount,
    required this.currency,
    this.reasonNote,
  });

  final String type;
  final String direction;
  final String allocationMethod;
  final String amount;
  final String currency;
  final String? reasonNote;
}

class SettleoraGroupBillCreatePayerDraft {
  const SettleoraGroupBillCreatePayerDraft({
    required this.userProfileId,
    required this.amount,
    required this.currency,
    this.paymentMethodLabelSnapshot,
  });

  final String userProfileId;
  final String amount;
  final String currency;
  final String? paymentMethodLabelSnapshot;
}

abstract class SettleoraBillRepository {
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50});

  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  );

  Future<SettleoraBillDetail> getPersonalBill(String billId);

  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  });

  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  );

  Future<void> submitGroupBill(String groupId, String billId);

  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  );

  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  );

  Future<SettleoraBillDetail> getGroupBill(String groupId, String billId);
}

String settleoraBillStatusLabel(SettleoraBillStatus status) {
  return switch (status) {
    'draft' => 'Draft',
    'pending_confirmation' => 'Pending confirmation',
    'confirmed' => 'Confirmed',
    'rejected' => 'Rejected',
    'cancelled' => 'Cancelled',
    'finalized' => 'Finalized',
    'archived' => 'Archived',
    _ => _titleFromCode(status),
  };
}

String settleoraBillReconciliationStatusLabel(
  SettleoraBillReconciliationStatus status,
) {
  return switch (status) {
    'unreconciled' => 'Unreconciled',
    'reconciled' => 'Reconciled',
    'ignored' => 'Ignored',
    _ => _titleFromCode(status),
  };
}

String settleoraBillArchiveStateLabel(SettleoraBillArchiveState archiveState) {
  return switch (archiveState) {
    SettleoraBillArchiveStateValues.active => 'Active',
    SettleoraBillArchiveStateValues.archived => 'Archived',
    _ => _titleFromCode(archiveState),
  };
}

String settleoraBillParticipantRejectionReasonLabel(
  SettleoraBillParticipantRejectionReasonCode reasonCode,
) {
  return switch (reasonCode) {
    SettleoraBillParticipantRejectionReasonCodeValues.wrongAmount =>
      'Wrong amount',
    SettleoraBillParticipantRejectionReasonCodeValues.wrongItems =>
      'Wrong items',
    SettleoraBillParticipantRejectionReasonCodeValues.wrongSplit =>
      'Wrong split',
    SettleoraBillParticipantRejectionReasonCodeValues.duplicate => 'Duplicate',
    SettleoraBillParticipantRejectionReasonCodeValues.notMine => 'Not mine',
    SettleoraBillParticipantRejectionReasonCodeValues.other => 'Other',
    _ => _titleFromCode(reasonCode),
  };
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
