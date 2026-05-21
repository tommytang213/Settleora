typedef SettleoraNotificationStatus = String;
typedef SettleoraNotificationPriority = String;
typedef SettleoraNotificationSubjectType = String;
typedef SettleoraNotificationEventType = String;

class SettleoraNotificationStatusValues {
  const SettleoraNotificationStatusValues._();

  static const unread = 'unread';
  static const read = 'read';
  static const archived = 'archived';

  static const values = <SettleoraNotificationStatus>{unread, read, archived};
}

class SettleoraNotificationPriorityValues {
  const SettleoraNotificationPriorityValues._();

  static const normal = 'normal';
  static const attention = 'attention';
  static const urgent = 'urgent';
}

class SettleoraNotificationSubjectTypeValues {
  const SettleoraNotificationSubjectTypeValues._();

  static const expenseBill = 'expense_bill';
  static const settlementRequest = 'settlement_request';
  static const settlementPayment = 'settlement_payment';
  static const recurringBillOccurrence = 'recurring_bill_occurrence';
}

class SettleoraNotificationEventTypeValues {
  const SettleoraNotificationEventTypeValues._();

  static const billRevisionProposed = 'bill.revision_proposed';
  static const billRevisionResubmitted = 'bill.revision_resubmitted';
  static const billRevisionSubmitted = 'bill.revision_submitted';
  static const billRevisionWithdrawn = 'bill.revision_withdrawn';
  static const billRevisionApproved = 'bill.revision_approved';
  static const billRevisionRejected = 'bill.revision_rejected';
  static const billRevisionPayerConfirmed = 'bill.revision_payer_confirmed';
  static const billRevisionApplied = 'bill.revision_applied';

  static const billRevisionEvents = <SettleoraNotificationEventType>{
    billRevisionProposed,
    billRevisionResubmitted,
    billRevisionSubmitted,
    billRevisionWithdrawn,
    billRevisionApproved,
    billRevisionRejected,
    billRevisionPayerConfirmed,
    billRevisionApplied,
  };
}

enum SettleoraNotificationFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraNotificationFailure implements Exception {
  const SettleoraNotificationFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraNotificationFailure.from(Object error) {
    if (error is SettleoraNotificationFailure) {
      return error;
    }

    return const SettleoraNotificationFailure(
      kind: SettleoraNotificationFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraNotificationFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraNotificationFailureKind.sessionRequired => 'Sign in required',
      SettleoraNotificationFailureKind.sessionExpired => 'Sign in again',
      SettleoraNotificationFailureKind.denied => 'Notifications unavailable',
      SettleoraNotificationFailureKind.unavailable =>
        'Notification unavailable',
      SettleoraNotificationFailureKind.conflict => 'Needs refresh',
      SettleoraNotificationFailureKind.validation => 'Unsupported request',
      SettleoraNotificationFailureKind.network => 'Server unavailable',
      SettleoraNotificationFailureKind.server => 'Notifications unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraNotificationFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraNotificationSummary {
  const SettleoraNotificationSummary({
    required this.unreadCount,
    required this.attentionCount,
    required this.urgentCount,
  });

  final int unreadCount;
  final int attentionCount;
  final int urgentCount;
}

class SettleoraNotificationRow {
  const SettleoraNotificationRow({
    required this.id,
    required this.eventType,
    required this.status,
    required this.priority,
    required this.subjectType,
    required this.safeSummary,
    required this.actionUrl,
    required this.groupId,
    required this.expenseBillId,
    required this.expenseBillRevisionId,
    required this.createdAtUtc,
    required this.readAtUtc,
    required this.archivedAtUtc,
  });

  final String id;
  final SettleoraNotificationEventType eventType;
  final SettleoraNotificationStatus status;
  final SettleoraNotificationPriority priority;
  final SettleoraNotificationSubjectType subjectType;
  final String? safeSummary;
  final String? actionUrl;
  final String? groupId;
  final String? expenseBillId;
  final String? expenseBillRevisionId;
  final DateTime createdAtUtc;
  final DateTime? readAtUtc;
  final DateTime? archivedAtUtc;

  bool get isUnread => status == SettleoraNotificationStatusValues.unread;

  bool get hasBillRevisionReviewTarget {
    return SettleoraNotificationEventTypeValues.billRevisionEvents.contains(
          eventType,
        ) &&
        subjectType == SettleoraNotificationSubjectTypeValues.expenseBill &&
        _nonEmptyId(expenseBillId) != null &&
        _nonEmptyId(expenseBillRevisionId) != null;
  }

  String get displayTitle => settleoraNotificationEventLabel(eventType);

  String get displaySummary {
    final summary = _boundedText(safeSummary, maxLength: 240);
    if (summary != null) {
      return summary;
    }

    return settleoraNotificationSubjectTypeLabel(subjectType);
  }
}

abstract interface class SettleoraNotificationRepository {
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  });

  Future<SettleoraNotificationSummary> getNotificationSummary();

  Future<SettleoraNotificationRow> markNotificationRead(String notificationId);

  Future<SettleoraNotificationSummary> markAllNotificationsRead();

  Future<SettleoraNotificationRow> archiveNotification(String notificationId);
}

String settleoraNotificationStatusLabel(SettleoraNotificationStatus status) {
  return switch (status) {
    SettleoraNotificationStatusValues.unread => 'Unread',
    SettleoraNotificationStatusValues.read => 'Read',
    SettleoraNotificationStatusValues.archived => 'Archived',
    _ => _titleFromCode(status),
  };
}

String settleoraNotificationPriorityLabel(
  SettleoraNotificationPriority priority,
) {
  return switch (priority) {
    SettleoraNotificationPriorityValues.normal => 'Normal',
    SettleoraNotificationPriorityValues.attention => 'Attention',
    SettleoraNotificationPriorityValues.urgent => 'Urgent',
    _ => _titleFromCode(priority),
  };
}

String settleoraNotificationSubjectTypeLabel(
  SettleoraNotificationSubjectType subjectType,
) {
  return switch (subjectType) {
    SettleoraNotificationSubjectTypeValues.expenseBill => 'Bill',
    SettleoraNotificationSubjectTypeValues.settlementRequest =>
      'Settlement request',
    SettleoraNotificationSubjectTypeValues.settlementPayment =>
      'Settlement payment',
    SettleoraNotificationSubjectTypeValues.recurringBillOccurrence =>
      'Recurring bill',
    _ => _titleFromCode(subjectType),
  };
}

String settleoraNotificationEventLabel(SettleoraNotificationEventType event) {
  return switch (event) {
    'bill.submitted' => 'Bill submitted',
    'bill.participant_accepted' => 'Bill accepted',
    'bill.participant_rejected' => 'Bill rejected',
    'bill.confirmed' => 'Bill confirmed',
    SettleoraNotificationEventTypeValues.billRevisionProposed =>
      'Bill revision proposed',
    SettleoraNotificationEventTypeValues.billRevisionResubmitted =>
      'Bill revision resubmitted',
    SettleoraNotificationEventTypeValues.billRevisionSubmitted =>
      'Bill revision submitted',
    SettleoraNotificationEventTypeValues.billRevisionWithdrawn =>
      'Bill revision withdrawn',
    SettleoraNotificationEventTypeValues.billRevisionApproved =>
      'Bill revision approved',
    SettleoraNotificationEventTypeValues.billRevisionRejected =>
      'Bill revision rejected',
    SettleoraNotificationEventTypeValues.billRevisionPayerConfirmed =>
      'Bill revision payer confirmed',
    SettleoraNotificationEventTypeValues.billRevisionApplied =>
      'Bill revision applied',
    'settlement.request_created' => 'Settlement requested',
    'settlement.payment_marked_paid' => 'Payment marked paid',
    'settlement.payment_partially_paid' => 'Partial payment marked paid',
    'settlement.payment_confirmed' => 'Payment confirmed',
    'settlement.request_disputed' => 'Settlement disputed',
    'settlement.payment_disputed' => 'Payment disputed',
    'settlement.request_cancelled' => 'Settlement cancelled',
    'settlement.payment_cancelled' => 'Payment cancelled',
    'settlement.proof_attached' => 'Proof attached',
    'recurring_bill.draft_generated' => 'Recurring draft generated',
    _ => _titleFromCode(event.replaceAll('.', '_')),
  };
}

String? settleoraNotificationMetadataId(String? value) => _nonEmptyId(value);

String? _boundedText(String? value, {required int maxLength}) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return '${trimmed.substring(0, maxLength - 3)}...';
}

String? _nonEmptyId(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
