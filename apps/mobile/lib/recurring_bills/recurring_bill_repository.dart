typedef SettleoraRecurringBillScheduleType = String;
typedef SettleoraRecurringBillTemplateStatus = String;
typedef SettleoraRecurringBillOccurrenceStatus = String;
typedef SettleoraExpenseBillStatus = String;

class SettleoraRecurringBillScheduleTypeValues {
  const SettleoraRecurringBillScheduleTypeValues._();

  static const weekly = 'weekly';
  static const monthly = 'monthly';
  static const yearly = 'yearly';
  static const customIntervalDays = 'custom_interval_days';
}

class SettleoraRecurringBillTemplateStatusValues {
  const SettleoraRecurringBillTemplateStatusValues._();

  static const active = 'active';
  static const paused = 'paused';
  static const archived = 'archived';
}

class SettleoraRecurringBillOccurrenceStatusValues {
  const SettleoraRecurringBillOccurrenceStatusValues._();

  static const forecasted = 'forecasted';
  static const draftGenerated = 'draft_generated';
  static const skipped = 'skipped';
  static const cancelled = 'cancelled';
}

enum SettleoraRecurringBillFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraRecurringBillFailure implements Exception {
  const SettleoraRecurringBillFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraRecurringBillFailure.from(Object error) {
    if (error is SettleoraRecurringBillFailure) {
      return error;
    }

    return const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraRecurringBillFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraRecurringBillFailureKind.sessionRequired => 'Sign in required',
      SettleoraRecurringBillFailureKind.sessionExpired => 'Sign in again',
      SettleoraRecurringBillFailureKind.denied => 'Recurring bills unavailable',
      SettleoraRecurringBillFailureKind.unavailable =>
        'Recurring bill unavailable',
      SettleoraRecurringBillFailureKind.conflict => 'Needs refresh',
      SettleoraRecurringBillFailureKind.validation => 'Unsupported request',
      SettleoraRecurringBillFailureKind.network => 'Server unavailable',
      SettleoraRecurringBillFailureKind.server => 'Recurring bills unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraRecurringBillFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraRecurringBillSchedule {
  const SettleoraRecurringBillSchedule({
    required this.type,
    required this.intervalCount,
    required this.intervalDays,
    required this.startDate,
    required this.endDate,
    required this.dueOffsetDays,
  });

  final SettleoraRecurringBillScheduleType type;
  final int? intervalCount;
  final int? intervalDays;
  final String startDate;
  final String? endDate;
  final int? dueOffsetDays;
}

class SettleoraRecurringBillTemplateSummary {
  const SettleoraRecurringBillTemplateSummary({
    required this.id,
    required this.merchantName,
    required this.description,
    required this.status,
    required this.schedule,
    required this.forecastAmount,
    required this.forecastCurrency,
    required this.nextOccurrenceDate,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.archivedAtUtc,
    required this.isGroupScoped,
  });

  final String id;
  final String? merchantName;
  final String? description;
  final SettleoraRecurringBillTemplateStatus status;
  final SettleoraRecurringBillSchedule schedule;
  final String forecastAmount;
  final String forecastCurrency;
  final String? nextOccurrenceDate;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final DateTime? archivedAtUtc;
  final bool isGroupScoped;

  String get displayName {
    final trimmed = merchantName?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return isGroupScoped ? 'Group recurring bill' : 'Recurring bill';
    }

    return trimmed;
  }
}

class SettleoraRecurringBillTemplateDetail
    extends SettleoraRecurringBillTemplateSummary {
  const SettleoraRecurringBillTemplateDetail({
    required super.id,
    required super.merchantName,
    required super.description,
    required super.status,
    required super.schedule,
    required super.forecastAmount,
    required super.forecastCurrency,
    required super.nextOccurrenceDate,
    required super.createdAtUtc,
    required super.updatedAtUtc,
    required super.archivedAtUtc,
    required super.isGroupScoped,
    required this.payloadVersion,
  });

  final int payloadVersion;
}

class SettleoraRecurringBillForecastOccurrence {
  const SettleoraRecurringBillForecastOccurrence({
    required this.templateId,
    required this.occurrenceId,
    required this.occurrenceDate,
    required this.dueDate,
    required this.status,
    required this.draftGenerated,
    required this.generatedBillId,
    required this.forecastAmount,
    required this.forecastCurrency,
    required this.merchantName,
    required this.isGroupScoped,
  });

  final String templateId;
  final String? occurrenceId;
  final String occurrenceDate;
  final String? dueDate;
  final SettleoraRecurringBillOccurrenceStatus status;
  final bool draftGenerated;
  final String? generatedBillId;
  final String forecastAmount;
  final String forecastCurrency;
  final String? merchantName;
  final bool isGroupScoped;

  bool get canGenerateDraft {
    return !draftGenerated &&
        status == SettleoraRecurringBillOccurrenceStatusValues.forecasted;
  }

  String get displayName {
    final trimmed = merchantName?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return isGroupScoped ? 'Group recurring bill' : 'Recurring bill';
    }

    return trimmed;
  }
}

class SettleoraRecurringBillDraftResult {
  const SettleoraRecurringBillDraftResult({
    required this.templateId,
    required this.occurrenceId,
    required this.occurrenceDate,
    required this.dueDate,
    required this.occurrenceStatus,
    required this.generatedBillId,
    required this.billStatus,
    required this.totalAmount,
    required this.totalCurrency,
  });

  final String templateId;
  final String occurrenceId;
  final String occurrenceDate;
  final String? dueDate;
  final SettleoraRecurringBillOccurrenceStatus occurrenceStatus;
  final String generatedBillId;
  final SettleoraExpenseBillStatus billStatus;
  final String totalAmount;
  final String totalCurrency;
}

class SettleoraRecurringBillScheduleDraft {
  const SettleoraRecurringBillScheduleDraft({
    required this.type,
    required this.intervalCount,
    required this.intervalDays,
    required this.startDate,
    required this.endDate,
    required this.dueOffsetDays,
  });

  final SettleoraRecurringBillScheduleType type;
  final int? intervalCount;
  final int? intervalDays;
  final String startDate;
  final String? endDate;
  final int? dueOffsetDays;
}

class SettleoraRecurringBillTemplatePayloadItemDraft {
  const SettleoraRecurringBillTemplatePayloadItemDraft({
    required this.name,
    required this.amount,
    required this.note,
  });

  final String name;
  final String amount;
  final String? note;
}

class SettleoraRecurringBillCreateDraft {
  const SettleoraRecurringBillCreateDraft({
    required this.groupId,
    required this.merchantName,
    required this.description,
    required this.schedule,
    required this.currency,
    required this.items,
  });

  final String? groupId;
  final String? merchantName;
  final String? description;
  final SettleoraRecurringBillScheduleDraft schedule;
  final String currency;
  final List<SettleoraRecurringBillTemplatePayloadItemDraft> items;
}

class SettleoraRecurringBillUpdateDraft {
  const SettleoraRecurringBillUpdateDraft({
    required this.merchantName,
    required this.description,
    required this.schedule,
  });

  final String? merchantName;
  final String? description;
  final SettleoraRecurringBillScheduleDraft schedule;
}

abstract interface class SettleoraRecurringBillRepository {
  Future<List<SettleoraRecurringBillTemplateSummary>> listTemplates({
    SettleoraRecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    int maxItems = 100,
  });

  Future<List<SettleoraRecurringBillForecastOccurrence>> listForecast({
    String? fromDate,
    String? toDate,
    int limit = 30,
    String? groupId,
  });

  Future<SettleoraRecurringBillTemplateDetail> getTemplate(String templateId);

  Future<SettleoraRecurringBillTemplateDetail> createTemplate(
    SettleoraRecurringBillCreateDraft draft,
  );

  Future<SettleoraRecurringBillTemplateDetail> updateTemplate({
    required String templateId,
    required SettleoraRecurringBillUpdateDraft draft,
  });

  Future<SettleoraRecurringBillTemplateDetail> pauseTemplate(String templateId);

  Future<SettleoraRecurringBillTemplateDetail> resumeTemplate(
    String templateId,
  );

  Future<SettleoraRecurringBillTemplateDetail> archiveTemplate(
    String templateId,
  );

  Future<SettleoraRecurringBillDraftResult> generateDraft({
    required String templateId,
    required String occurrenceDate,
  });
}

String settleoraRecurringBillTemplateStatusLabel(
  SettleoraRecurringBillTemplateStatus status,
) {
  return switch (status) {
    SettleoraRecurringBillTemplateStatusValues.active => 'Active',
    SettleoraRecurringBillTemplateStatusValues.paused => 'Paused',
    SettleoraRecurringBillTemplateStatusValues.archived => 'Archived',
    _ => _titleFromCode(status),
  };
}

String settleoraRecurringBillOccurrenceStatusLabel(
  SettleoraRecurringBillOccurrenceStatus status,
) {
  return switch (status) {
    SettleoraRecurringBillOccurrenceStatusValues.forecasted => 'Forecasted',
    SettleoraRecurringBillOccurrenceStatusValues.draftGenerated =>
      'Draft generated',
    SettleoraRecurringBillOccurrenceStatusValues.skipped => 'Skipped',
    SettleoraRecurringBillOccurrenceStatusValues.cancelled => 'Cancelled',
    _ => _titleFromCode(status),
  };
}

String settleoraRecurringBillScheduleLabel(
  SettleoraRecurringBillSchedule schedule,
) {
  return switch (schedule.type) {
    SettleoraRecurringBillScheduleTypeValues.weekly => _intervalLabel(
      schedule.intervalCount,
      singular: 'week',
      plural: 'weeks',
    ),
    SettleoraRecurringBillScheduleTypeValues.monthly => _intervalLabel(
      schedule.intervalCount,
      singular: 'month',
      plural: 'months',
    ),
    SettleoraRecurringBillScheduleTypeValues.yearly => _intervalLabel(
      schedule.intervalCount,
      singular: 'year',
      plural: 'years',
    ),
    SettleoraRecurringBillScheduleTypeValues.customIntervalDays =>
      _intervalLabel(schedule.intervalDays, singular: 'day', plural: 'days'),
    _ => _titleFromCode(schedule.type),
  };
}

String _intervalLabel(
  int? interval, {
  required String singular,
  required String plural,
}) {
  final count = interval ?? 1;
  if (count <= 1) {
    return 'Every $singular';
  }

  return 'Every $count $plural';
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
