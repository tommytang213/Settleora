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
  static const syncOperation = 'sync_operation';
  static const receiptOcrReview = 'receipt_ocr_review';
}

class SettleoraNotificationEventTypeValues {
  const SettleoraNotificationEventTypeValues._();

  static const billSubmitted = 'bill.submitted';
  static const billParticipantAccepted = 'bill.participant_accepted';
  static const billParticipantRejected = 'bill.participant_rejected';
  static const billConfirmed = 'bill.confirmed';
  static const billRevisionProposed = 'bill.revision_proposed';
  static const billRevisionResubmitted = 'bill.revision_resubmitted';
  static const billRevisionSubmitted = 'bill.revision_submitted';
  static const billRevisionWithdrawn = 'bill.revision_withdrawn';
  static const billRevisionApproved = 'bill.revision_approved';
  static const billRevisionRejected = 'bill.revision_rejected';
  static const billRevisionPayerConfirmed = 'bill.revision_payer_confirmed';
  static const billRevisionApplied = 'bill.revision_applied';
  static const settlementRequestCreated = 'settlement.request_created';
  static const settlementPaymentMarkedPaid = 'settlement.payment_marked_paid';
  static const settlementPaymentPartiallyPaid =
      'settlement.payment_partially_paid';
  static const settlementPaymentConfirmed = 'settlement.payment_confirmed';
  static const settlementRequestDisputed = 'settlement.request_disputed';
  static const settlementPaymentDisputed = 'settlement.payment_disputed';
  static const settlementRequestCancelled = 'settlement.request_cancelled';
  static const settlementPaymentCancelled = 'settlement.payment_cancelled';
  static const settlementProofAttached = 'settlement.proof_attached';
  static const settlementResidualReviewNeeded =
      'settlement.residual_review_needed';
  static const recurringBillDueSoon = 'recurring_bill.due_soon';
  static const recurringBillDraftGenerated = 'recurring_bill.draft_generated';
  static const ocrNeedsReview = 'ocr.needs_review';
  static const syncConflictDetected = 'sync.conflict_detected';
  static const syncOperationFailed = 'sync.operation_failed';

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

  static const billWorkflowEvents = <SettleoraNotificationEventType>{
    billSubmitted,
    billParticipantAccepted,
    billParticipantRejected,
    billConfirmed,
  };

  static const settlementEvents = <SettleoraNotificationEventType>{
    settlementRequestCreated,
    settlementPaymentMarkedPaid,
    settlementPaymentPartiallyPaid,
    settlementPaymentConfirmed,
    settlementRequestDisputed,
    settlementPaymentDisputed,
    settlementRequestCancelled,
    settlementPaymentCancelled,
    settlementProofAttached,
    settlementResidualReviewNeeded,
  };

  static const recurringEvents = <SettleoraNotificationEventType>{
    recurringBillDueSoon,
    recurringBillDraftGenerated,
  };

  static const syncEvents = <SettleoraNotificationEventType>{
    syncConflictDetected,
    syncOperationFailed,
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

enum SettleoraNotificationOpenFallbackState {
  missing,
  archived,
  unsupported,
  signInRequired,
  wrongAccount,
  localOnly,
  offline,
  stale,
  unauthorized,
  resolved,
  providerUnconfigured,
}

String settleoraNotificationOpenFallbackMessage(
  SettleoraNotificationOpenFallbackState state,
) {
  return switch (state) {
    SettleoraNotificationOpenFallbackState.missing =>
      'This notification is no longer available.',
    SettleoraNotificationOpenFallbackState.archived =>
      'This notification is archived. Restore it before opening from Notifications.',
    SettleoraNotificationOpenFallbackState.unsupported =>
      'This notification cannot be opened safely here yet. Refresh notifications or use the related section if it is available to this account.',
    SettleoraNotificationOpenFallbackState.signInRequired =>
      'Sign in to view this notification.',
    SettleoraNotificationOpenFallbackState.wrongAccount =>
      'This item is not available to this account.',
    SettleoraNotificationOpenFallbackState.localOnly =>
      'Connect to the server to refresh this notification.',
    SettleoraNotificationOpenFallbackState.offline =>
      'Connect to the server to refresh this notification. Cached notification details are not enough to open it.',
    SettleoraNotificationOpenFallbackState.stale =>
      'This notification is no longer available.',
    SettleoraNotificationOpenFallbackState.unauthorized =>
      'This item is not available to this account.',
    SettleoraNotificationOpenFallbackState.resolved =>
      'This item no longer needs action.',
    SettleoraNotificationOpenFallbackState.providerUnconfigured =>
      'Push notifications are off for this server. In-app notifications still work.',
  };
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
    required this.settlementRequestId,
    required this.settlementPaymentId,
    required this.recurringBillTemplateId,
    required this.recurringBillOccurrenceId,
    required this.receiptOcrReviewId,
    required this.receiptAttachmentFileId,
    required this.syncOperationId,
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
  final String? settlementRequestId;
  final String? settlementPaymentId;
  final String? recurringBillTemplateId;
  final String? recurringBillOccurrenceId;
  final String? receiptOcrReviewId;
  final String? receiptAttachmentFileId;
  final String? syncOperationId;
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

  bool get hasGroupBillTarget {
    return !hasBillRevisionReviewTarget &&
        SettleoraNotificationEventTypeValues.billWorkflowEvents.contains(
          eventType,
        ) &&
        subjectType == SettleoraNotificationSubjectTypeValues.expenseBill &&
        _nonEmptyId(groupId) != null &&
        _nonEmptyId(expenseBillId) != null;
  }

  bool get hasPersonalBillTarget {
    return !hasBillRevisionReviewTarget &&
        !hasGroupBillTarget &&
        SettleoraNotificationEventTypeValues.billWorkflowEvents.contains(
          eventType,
        ) &&
        subjectType == SettleoraNotificationSubjectTypeValues.expenseBill &&
        _nonEmptyId(expenseBillId) != null &&
        _nonEmptyId(groupId) == null;
  }

  bool get hasSettlementTarget {
    return (subjectType ==
                SettleoraNotificationSubjectTypeValues.settlementRequest ||
            subjectType ==
                SettleoraNotificationSubjectTypeValues.settlementPayment) &&
        SettleoraNotificationEventTypeValues.settlementEvents.contains(
          eventType,
        ) &&
        _nonEmptyId(settlementRequestId) != null;
  }

  bool get hasRecurringBillTarget {
    return subjectType ==
            SettleoraNotificationSubjectTypeValues.recurringBillOccurrence &&
        SettleoraNotificationEventTypeValues.recurringEvents.contains(
          eventType,
        ) &&
        _nonEmptyId(recurringBillTemplateId) != null;
  }

  bool get hasReceiptOcrReviewTarget {
    return eventType == SettleoraNotificationEventTypeValues.ocrNeedsReview &&
        subjectType ==
            SettleoraNotificationSubjectTypeValues.receiptOcrReview &&
        _nonEmptyId(expenseBillId) != null &&
        _nonEmptyId(receiptAttachmentFileId) != null &&
        _nonEmptyId(receiptOcrReviewId) != null;
  }

  bool get hasSyncOperationTarget {
    return SettleoraNotificationEventTypeValues.syncEvents.contains(
          eventType,
        ) &&
        subjectType == SettleoraNotificationSubjectTypeValues.syncOperation &&
        _nonEmptyId(syncOperationId) != null;
  }

  bool get hasTypedOpenTarget =>
      hasBillRevisionReviewTarget ||
      hasGroupBillTarget ||
      hasPersonalBillTarget ||
      hasSettlementTarget ||
      hasRecurringBillTarget ||
      hasReceiptOcrReviewTarget ||
      hasSyncOperationTarget;

  String get displayTitle => settleoraNotificationEventLabel(eventType);

  String get displaySummary {
    final summary = _boundedSafeText(safeSummary, maxLength: 240);
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

abstract interface class SettleoraNotificationRestoreRepository {
  Future<SettleoraNotificationRow> restoreNotification(String notificationId);
}

String settleoraNotificationStatusLabel(SettleoraNotificationStatus status) {
  if (_looksUnsafeForDisplay(status)) {
    return 'Status';
  }

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
  if (_looksUnsafeForDisplay(priority)) {
    return 'Priority';
  }

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
  if (_looksUnsafeForDisplay(subjectType)) {
    return 'Notification type';
  }

  return switch (subjectType) {
    SettleoraNotificationSubjectTypeValues.expenseBill => 'Bill',
    SettleoraNotificationSubjectTypeValues.settlementRequest =>
      'Settlement request',
    SettleoraNotificationSubjectTypeValues.settlementPayment =>
      'Settlement payment',
    SettleoraNotificationSubjectTypeValues.recurringBillOccurrence =>
      'Recurring bill',
    SettleoraNotificationSubjectTypeValues.syncOperation => 'Sync issue',
    SettleoraNotificationSubjectTypeValues.receiptOcrReview => 'Receipt review',
    _ => _titleFromCode(subjectType),
  };
}

String settleoraNotificationEventLabel(SettleoraNotificationEventType event) {
  if (_looksUnsafeForDisplay(event)) {
    return 'Notification';
  }

  return switch (event) {
    SettleoraNotificationEventTypeValues.billSubmitted => 'Bill submitted',
    SettleoraNotificationEventTypeValues.billParticipantAccepted =>
      'Bill accepted',
    SettleoraNotificationEventTypeValues.billParticipantRejected =>
      'Bill rejected',
    SettleoraNotificationEventTypeValues.billConfirmed => 'Bill confirmed',
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
    SettleoraNotificationEventTypeValues.settlementRequestCreated =>
      'Settlement requested',
    SettleoraNotificationEventTypeValues.settlementPaymentMarkedPaid =>
      'Payment marked paid',
    SettleoraNotificationEventTypeValues.settlementPaymentPartiallyPaid =>
      'Partial payment marked paid',
    SettleoraNotificationEventTypeValues.settlementPaymentConfirmed =>
      'Payment confirmed',
    SettleoraNotificationEventTypeValues.settlementRequestDisputed =>
      'Settlement disputed',
    SettleoraNotificationEventTypeValues.settlementPaymentDisputed =>
      'Payment disputed',
    SettleoraNotificationEventTypeValues.settlementRequestCancelled =>
      'Settlement cancelled',
    SettleoraNotificationEventTypeValues.settlementPaymentCancelled =>
      'Payment cancelled',
    SettleoraNotificationEventTypeValues.settlementProofAttached =>
      'Proof attached',
    SettleoraNotificationEventTypeValues.settlementResidualReviewNeeded =>
      'Settlement review',
    SettleoraNotificationEventTypeValues.recurringBillDueSoon =>
      'Recurring bill due soon',
    SettleoraNotificationEventTypeValues.recurringBillDraftGenerated =>
      'Recurring draft generated',
    SettleoraNotificationEventTypeValues.ocrNeedsReview => 'Receipt review',
    SettleoraNotificationEventTypeValues.syncConflictDetected => 'Sync issue',
    SettleoraNotificationEventTypeValues.syncOperationFailed => 'Sync issue',
    _ => _titleFromCode(event.replaceAll('.', '_')),
  };
}

String? settleoraNotificationMetadataId(String? value) => _nonEmptyId(value);

String? _boundedSafeText(String? value, {required int maxLength}) {
  final bounded = _boundedText(value, maxLength: maxLength);
  if (bounded == null || _looksUnsafeForDisplay(bounded)) {
    return null;
  }

  return bounded;
}

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

bool _looksUnsafeForDisplay(String value) {
  final lower = value.toLowerCase();
  return _uuidPattern.hasMatch(value) ||
      lower.contains('token=') ||
      lower.contains('secret') ||
      lower.contains('bearer ') ||
      lower.contains('http://') ||
      lower.contains('https://') ||
      value.contains('/api/') ||
      value.contains('?');
}

final _uuidPattern = RegExp(
  r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
);

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
