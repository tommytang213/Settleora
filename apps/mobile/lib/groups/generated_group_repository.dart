import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'group_repository.dart';

abstract interface class SettleoraGroupGeneratedClient {
  Future<api.GroupListResponse> listGroups({required String accessToken});

  Future<api.GroupResponse> createGroup(
    api.CreateGroupRequest request, {
    required String accessToken,
  });

  Future<api.GroupResponse> getGroup(
    String groupId, {
    required String accessToken,
  });

  Future<api.GroupResponse> updateGroup(
    String groupId,
    api.UpdateGroupRequest request, {
    required String accessToken,
  });

  Future<api.GroupMemberListResponse> listGroupMembers(
    String groupId, {
    required String accessToken,
  });

  Future<api.GroupMemberResponse> addGroupMember(
    String groupId,
    api.AddGroupMemberRequest request, {
    required String accessToken,
  });

  Future<api.GroupMemberResponse> updateGroupMember(
    String groupId,
    String userProfileId,
    api.UpdateGroupMemberRequest request, {
    required String accessToken,
  });

  Future<void> removeGroupMember(
    String groupId,
    String userProfileId, {
    required String accessToken,
  });
}

class SettleoraGeneratedGroupClient implements SettleoraGroupGeneratedClient {
  const SettleoraGeneratedGroupClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.GroupListResponse> listGroups({required String accessToken}) {
    return _client.listGroups(accessToken: accessToken);
  }

  @override
  Future<api.GroupResponse> createGroup(
    api.CreateGroupRequest request, {
    required String accessToken,
  }) {
    return _client.createGroup(request, accessToken: accessToken);
  }

  @override
  Future<api.GroupResponse> getGroup(
    String groupId, {
    required String accessToken,
  }) {
    return _client.getGroup(groupId, accessToken: accessToken);
  }

  @override
  Future<api.GroupResponse> updateGroup(
    String groupId,
    api.UpdateGroupRequest request, {
    required String accessToken,
  }) {
    return _client.updateGroup(groupId, request, accessToken: accessToken);
  }

  @override
  Future<api.GroupMemberListResponse> listGroupMembers(
    String groupId, {
    required String accessToken,
  }) {
    return _client.listGroupMembers(groupId, accessToken: accessToken);
  }

  @override
  Future<api.GroupMemberResponse> addGroupMember(
    String groupId,
    api.AddGroupMemberRequest request, {
    required String accessToken,
  }) {
    return _client.addGroupMember(groupId, request, accessToken: accessToken);
  }

  @override
  Future<api.GroupMemberResponse> updateGroupMember(
    String groupId,
    String userProfileId,
    api.UpdateGroupMemberRequest request, {
    required String accessToken,
  }) {
    return _client.updateGroupMember(
      groupId,
      userProfileId,
      request,
      accessToken: accessToken,
    );
  }

  @override
  Future<void> removeGroupMember(
    String groupId,
    String userProfileId, {
    required String accessToken,
  }) {
    return _client.removeGroupMember(
      groupId,
      userProfileId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraGroupRepository implements SettleoraGroupRepository {
  GeneratedSettleoraGroupRepository({
    required SettleoraGroupGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraGroupRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraGroupRepository(
      client: SettleoraGeneratedGroupClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraGroupGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<SettleoraGroup>> listGroups() {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listGroups(accessToken: accessToken);
        return response.groups.map(_mapGroup).toList(growable: false);
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) {
    final name = _normalizeGroupName(request.name);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.createGroup(
          api.CreateGroupRequest(name: name),
          accessToken: accessToken,
        );
        return _mapGroup(response);
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before opening details.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getGroup(
          trimmedGroupId,
          accessToken: accessToken,
        );
        return _mapGroup(response);
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before saving changes.',
    );
    final name = _normalizeGroupName(request.name);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.updateGroup(
          trimmedGroupId,
          api.UpdateGroupRequest(name: name),
          accessToken: accessToken,
        );
        return _mapGroup(response);
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before loading members.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listGroupMembers(
          trimmedGroupId,
          accessToken: accessToken,
        );
        return response.members.map(_mapMember).toList(growable: false);
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  ) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before adding members.',
    );
    final userProfileId = _requiredId(
      request.userProfileId,
      blankMessage: 'Enter an existing user profile ID.',
    );
    final role = _normalizeRole(request.role);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.addGroupMember(
          trimmedGroupId,
          api.AddGroupMemberRequest(userProfileId: userProfileId, role: role),
          accessToken: accessToken,
        );
        return _mapMember(response);
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  ) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before updating members.',
    );
    final trimmedUserProfileId = _requiredId(
      userProfileId,
      blankMessage: 'Choose a member before updating their role.',
    );
    final role = _normalizeRole(update.role);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.updateGroupMember(
          trimmedGroupId,
          trimmedUserProfileId,
          api.UpdateGroupMemberRequest(role: role),
          accessToken: accessToken,
        );
        return _mapMember(response);
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<void> removeGroupMember(String groupId, String userProfileId) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before removing members.',
    );
    final trimmedUserProfileId = _requiredId(
      userProfileId,
      blankMessage: 'Choose a member before removing them.',
    );

    return _withAccessToken((accessToken) async {
      try {
        await _client.removeGroupMember(
          trimmedGroupId,
          trimmedUserProfileId,
          accessToken: accessToken,
        );
      } on SettleoraGroupFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<T> _withAccessToken<T>(
    Future<T> Function(String accessToken) operation,
  ) async {
    final accessToken = await _readAccessToken();
    if (accessToken == null) {
      throw const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.sessionRequired,
        message: 'Sign in before loading groups.',
      );
    }

    return operation(accessToken);
  }

  Future<String?> _readAccessToken() async {
    try {
      final accessToken = await _accessTokenProvider.accessToken();
      final trimmed = accessToken?.trim();
      if (trimmed == null || trimmed.isEmpty) {
        return null;
      }

      return trimmed;
    } catch (_) {
      return null;
    }
  }
}

SettleoraGroup _mapGroup(api.GroupResponse response) {
  return SettleoraGroup(
    id: response.id,
    name: response.name,
    currentUserRole: response.currentUserRole,
    currentUserStatus: response.currentUserStatus,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

SettleoraGroupMember _mapMember(api.GroupMemberResponse response) {
  return SettleoraGroupMember(
    userProfileId: response.userProfileId,
    displayName: response.displayName,
    role: response.role,
    status: response.status,
    joinedAtUtc: response.joinedAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

SettleoraGroupFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.validation,
        message: 'The group request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading groups.',
        statusCode: 401,
      ),
      403 => const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.denied,
        message: 'Groups are not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.unavailable,
        message: 'The group is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.conflict,
        message: 'Refresh the group and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.server,
        message: 'Groups are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.server,
        message: 'Groups are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraGroupFailure(
      kind: SettleoraGroupFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraGroupFailure(
    kind: SettleoraGroupFailureKind.server,
    message: 'Groups are unavailable right now. Try again later.',
  );
}

String _normalizeGroupName(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw const SettleoraGroupFailure(
      kind: SettleoraGroupFailureKind.validation,
      message: 'Enter a group name.',
    );
  }

  if (trimmed.length > 160) {
    throw const SettleoraGroupFailure(
      kind: SettleoraGroupFailureKind.validation,
      message: 'Group name must be 160 characters or fewer.',
    );
  }

  return trimmed;
}

String _requiredId(String value, {required String blankMessage}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraGroupFailure(
      kind: SettleoraGroupFailureKind.validation,
      message: blankMessage,
    );
  }

  return trimmed;
}

SettleoraGroupRole _normalizeRole(SettleoraGroupRole value) {
  final trimmed = value.trim();
  if (!SettleoraGroupRoleValues.values.contains(trimmed)) {
    throw const SettleoraGroupFailure(
      kind: SettleoraGroupFailureKind.validation,
      message: 'Choose a supported group role.',
    );
  }

  return trimmed;
}
