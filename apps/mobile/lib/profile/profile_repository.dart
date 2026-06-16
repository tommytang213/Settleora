typedef SettleoraPaymentDetailsVisibility = String;

class SettleoraPaymentDetailsVisibilityValues {
  const SettleoraPaymentDetailsVisibilityValues._();

  static const private = 'private';
  static const settlementCounterpartiesOnly = 'settlement_counterparties_only';
  static const groupMembersWhenShared = 'group_members_when_shared';

  static const values = <SettleoraPaymentDetailsVisibility>{
    private,
    settlementCounterpartiesOnly,
    groupMembersWhenShared,
  };
}

enum SettleoraProfileFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraProfileFailure implements Exception {
  const SettleoraProfileFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraProfileFailure.from(Object error) {
    if (error is SettleoraProfileFailure) {
      return error;
    }

    return const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraProfileFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraProfileFailureKind.sessionRequired => 'Sign in required',
      SettleoraProfileFailureKind.sessionExpired => 'Sign in again',
      SettleoraProfileFailureKind.denied => 'Account unavailable',
      SettleoraProfileFailureKind.unavailable => 'Profile unavailable',
      SettleoraProfileFailureKind.conflict => 'Needs refresh',
      SettleoraProfileFailureKind.validation => 'Check details',
      SettleoraProfileFailureKind.network => 'Server unavailable',
      SettleoraProfileFailureKind.server => 'Profile unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraProfileFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraSelfProfile {
  const SettleoraSelfProfile({
    required this.id,
    required this.displayName,
    required this.defaultCurrency,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String id;
  final String displayName;
  final String? defaultCurrency;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
}

class SettleoraSelfProfileUpdate {
  const SettleoraSelfProfileUpdate({
    required this.displayName,
    required this.defaultCurrency,
  });

  final String displayName;
  final String? defaultCurrency;
}

class SettleoraSelfPaymentDetails {
  const SettleoraSelfPaymentDetails({
    required this.isConfigured,
    required this.id,
    required this.preferredMethodLabel,
    required this.paymentHandle,
    required this.paymentNote,
    required this.visibility,
    required this.qrFile,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final bool isConfigured;
  final String? id;
  final String? preferredMethodLabel;
  final String? paymentHandle;
  final String? paymentNote;
  final SettleoraPaymentDetailsVisibility visibility;
  final SettleoraSelfPaymentQrFile? qrFile;
  final DateTime? createdAtUtc;
  final DateTime? updatedAtUtc;
}

class SettleoraSelfPaymentQrFile {
  const SettleoraSelfPaymentQrFile({
    required this.contentType,
    required this.sizeBytes,
    required this.updatedAtUtc,
  });

  final String contentType;
  final int sizeBytes;
  final DateTime updatedAtUtc;
}

class SettleoraSelfPaymentDetailsUpdate {
  const SettleoraSelfPaymentDetailsUpdate({
    required this.preferredMethodLabel,
    required this.paymentHandle,
    required this.paymentNote,
    required this.visibility,
  });

  final String? preferredMethodLabel;
  final String? paymentHandle;
  final String? paymentNote;
  final SettleoraPaymentDetailsVisibility visibility;
}

abstract interface class SettleoraProfileRepository {
  Future<SettleoraSelfProfile> getSelfProfile();

  Future<SettleoraSelfProfile> updateSelfProfile(
    SettleoraSelfProfileUpdate update,
  );

  Future<SettleoraSelfPaymentDetails> getSelfPaymentDetails();

  Future<SettleoraSelfPaymentDetails> updateSelfPaymentDetails(
    SettleoraSelfPaymentDetailsUpdate update,
  );
}

String settleoraPaymentDetailsVisibilityLabel(
  SettleoraPaymentDetailsVisibility visibility,
) {
  return switch (visibility) {
    SettleoraPaymentDetailsVisibilityValues.private => 'Private',
    SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly =>
      'Settlement counterparties',
    SettleoraPaymentDetailsVisibilityValues.groupMembersWhenShared =>
      'Group members when shared',
    _ => _titleFromCode(visibility),
  };
}

String settleoraPaymentDetailsVisibilityDescription(
  SettleoraPaymentDetailsVisibility visibility,
) {
  return switch (visibility) {
    SettleoraPaymentDetailsVisibilityValues.private =>
      'Private means this self profile readout is for you only and does not grant counterparty access.',
    SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly =>
      'Settlement counterparties means the API may show details only inside a server-authorized settlement or payment relationship.',
    SettleoraPaymentDetailsVisibilityValues.groupMembersWhenShared =>
      'Group members when shared means the API may show details only in a concrete shared group, bill, settlement, or payment context.',
    _ =>
      'This server-returned visibility is shown for readout only; API authorization still decides access.',
  };
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
