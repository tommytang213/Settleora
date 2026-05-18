typedef SettleoraGroupRole = String;
typedef SettleoraGroupMembershipStatus = String;

class SettleoraGroupRoleValues {
  const SettleoraGroupRoleValues._();

  static const owner = 'owner';
  static const member = 'member';

  static const values = <SettleoraGroupRole>{owner, member};
}

class SettleoraGroupMembershipStatusValues {
  const SettleoraGroupMembershipStatusValues._();

  static const active = 'active';
  static const removed = 'removed';

  static const values = <SettleoraGroupMembershipStatus>{active, removed};
}

enum SettleoraGroupFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraGroupFailure implements Exception {
  const SettleoraGroupFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraGroupFailure.from(Object error) {
    if (error is SettleoraGroupFailure) {
      return error;
    }

    return const SettleoraGroupFailure(
      kind: SettleoraGroupFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraGroupFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraGroupFailureKind.sessionRequired => 'Sign in required',
      SettleoraGroupFailureKind.sessionExpired => 'Sign in again',
      SettleoraGroupFailureKind.denied => 'Groups unavailable',
      SettleoraGroupFailureKind.unavailable => 'Group unavailable',
      SettleoraGroupFailureKind.conflict => 'Needs refresh',
      SettleoraGroupFailureKind.validation => 'Check details',
      SettleoraGroupFailureKind.network => 'Server unavailable',
      SettleoraGroupFailureKind.server => 'Groups unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraGroupFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraGroup {
  const SettleoraGroup({
    required this.id,
    required this.name,
    required this.currentUserRole,
    required this.currentUserStatus,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String id;
  final String name;
  final SettleoraGroupRole currentUserRole;
  final SettleoraGroupMembershipStatus currentUserStatus;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;

  String get displayName {
    final trimmed = name.trim();
    if (trimmed.isEmpty) {
      return 'Group';
    }

    return trimmed;
  }
}

class SettleoraGroupSaveRequest {
  const SettleoraGroupSaveRequest({required this.name});

  final String name;
}

class SettleoraGroupMember {
  const SettleoraGroupMember({
    required this.userProfileId,
    required this.displayName,
    required this.role,
    required this.status,
    required this.joinedAtUtc,
    required this.updatedAtUtc,
  });

  final String userProfileId;
  final String displayName;
  final SettleoraGroupRole role;
  final SettleoraGroupMembershipStatus status;
  final DateTime joinedAtUtc;
  final DateTime updatedAtUtc;

  String get safeDisplayName {
    final trimmed = displayName.trim();
    if (trimmed.isEmpty) {
      return 'Group member';
    }

    return trimmed;
  }
}

class SettleoraGroupMemberAddRequest {
  const SettleoraGroupMemberAddRequest({
    required this.userProfileId,
    required this.role,
  });

  final String userProfileId;
  final SettleoraGroupRole role;
}

class SettleoraGroupMemberRoleUpdate {
  const SettleoraGroupMemberRoleUpdate({required this.role});

  final SettleoraGroupRole role;
}

abstract interface class SettleoraGroupRepository {
  Future<List<SettleoraGroup>> listGroups();

  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request);

  Future<SettleoraGroup> getGroup(String groupId);

  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  );

  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId);

  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  );

  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  );

  Future<void> removeGroupMember(String groupId, String userProfileId);
}

String settleoraGroupRoleLabel(SettleoraGroupRole role) {
  return switch (role) {
    SettleoraGroupRoleValues.owner => 'Owner',
    SettleoraGroupRoleValues.member => 'Member',
    _ => _titleFromCode(role),
  };
}

String settleoraGroupMembershipStatusLabel(
  SettleoraGroupMembershipStatus status,
) {
  return switch (status) {
    SettleoraGroupMembershipStatusValues.active => 'Active',
    SettleoraGroupMembershipStatusValues.removed => 'Removed',
    _ => _titleFromCode(status),
  };
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
