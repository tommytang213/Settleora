import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/groups/generated_group_repository.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraGroupRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeGroupGeneratedClient();
      final repository = GeneratedSettleoraGroupRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureGroupFailure(() {
        return repository.listGroups();
      });

      expect(failure.kind, SettleoraGroupFailureKind.sessionRequired);
      expect(client.listCalls, 0);
    });

    test('maps generated groups and members safely', () async {
      final tokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeGroupGeneratedClient(
        groups: [sampleApiGroup(name: 'Trip Crew')],
        members: [sampleApiMember(displayName: 'Taylor')],
      );
      final repository = GeneratedSettleoraGroupRepository(
        client: client,
        accessTokenProvider: tokenProvider,
      );

      final groups = await repository.listGroups();
      final detail = await repository.getGroup('  $_groupId  ');
      final members = await repository.listGroupMembers(_groupId);
      final created = await repository.createGroup(
        const SettleoraGroupSaveRequest(name: '  Dinner Club  '),
      );
      final updated = await repository.updateGroup(
        _groupId,
        const SettleoraGroupSaveRequest(name: '  House  '),
      );
      final added = await repository.addGroupMember(
        _groupId,
        const SettleoraGroupMemberAddRequest(
          userProfileId: '  $_otherProfileId  ',
          role: SettleoraGroupRoleValues.member,
        ),
      );
      final memberUpdate = await repository.updateGroupMember(
        _groupId,
        _otherProfileId,
        const SettleoraGroupMemberRoleUpdate(
          role: SettleoraGroupRoleValues.owner,
        ),
      );
      await repository.removeGroupMember(_groupId, _otherProfileId);

      expect(groups.single.displayName, 'Trip Crew');
      expect(detail.id, _groupId);
      expect(members.single.safeDisplayName, 'Taylor');
      expect(created.createdAtUtc, _createdAtUtc);
      expect(updated.updatedAtUtc, _updatedAtUtc);
      expect(added.userProfileId, _profileId);
      expect(memberUpdate.role, SettleoraGroupRoleValues.member);
      expect(client.accessTokens, List.filled(8, 'redacted'));
      expect(tokenProvider.calls, 8);
      expect(client.lastCreateRequest?.toJson(), {'name': 'Dinner Club'});
      expect(client.lastUpdateRequest?.toJson(), {'name': 'House'});
      expect(client.lastAddMemberRequest?.toJson(), {
        'userProfileId': _otherProfileId,
        'role': SettleoraGroupRoleValues.member,
      });
      expect(client.lastMemberRoleUpdate?.toJson(), {
        'role': SettleoraGroupRoleValues.owner,
      });
      expect(client.lastRemovedProfileId, _otherProfileId);
    });

    test('validates simple inputs before generated calls', () async {
      final client = FakeGroupGeneratedClient();
      final repository = GeneratedSettleoraGroupRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final blankName = await captureGroupFailure(() {
        return repository.createGroup(
          const SettleoraGroupSaveRequest(name: '   '),
        );
      });
      final blankMember = await captureGroupFailure(() {
        return repository.addGroupMember(
          _groupId,
          const SettleoraGroupMemberAddRequest(
            userProfileId: '   ',
            role: SettleoraGroupRoleValues.member,
          ),
        );
      });
      final badRole = await captureGroupFailure(() {
        return repository.updateGroupMember(
          _groupId,
          _profileId,
          const SettleoraGroupMemberRoleUpdate(role: 'super_owner'),
        );
      });

      expect(blankName.kind, SettleoraGroupFailureKind.validation);
      expect(blankMember.kind, SettleoraGroupFailureKind.validation);
      expect(badRole.message, 'Choose a supported group role.');
      expect(client.createCalls, 0);
      expect(client.addMemberCalls, 0);
      expect(client.updateMemberCalls, 0);
    });

    test('maps denied and session failures to bounded messages', () async {
      final deniedRepository = GeneratedSettleoraGroupRepository(
        client: FakeGroupGeneratedClient(
          failure: api.SettleoraApiException(403, 'Forbidden', _hiddenBody),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );
      final expiredRepository = GeneratedSettleoraGroupRepository(
        client: FakeGroupGeneratedClient(
          failure: api.SettleoraApiException(401, 'Unauthorized', _hiddenBody),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final denied = await captureGroupFailure(() {
        return deniedRepository.listGroups();
      });
      final expired = await captureGroupFailure(() {
        return expiredRepository.getGroup(_groupId);
      });

      expect(denied.kind, SettleoraGroupFailureKind.denied);
      expect(expired.kind, SettleoraGroupFailureKind.sessionExpired);
      expect(denied.message, isNot(contains('secret')));
      expect(expired.toString(), isNot(contains('secret')));
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraGroupRepository(
        client: FakeGroupGeneratedClient(
          failure: const SocketException('raw socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureGroupFailure(() {
        return repository.listGroupMembers(_groupId);
      });

      expect(failure.kind, SettleoraGroupFailureKind.network);
      expect(failure.message, isNot(contains('raw socket detail')));
    });
  });
}

Future<SettleoraGroupFailure> captureGroupFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraGroupFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraGroupFailure.');
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

class FakeGroupGeneratedClient implements SettleoraGroupGeneratedClient {
  FakeGroupGeneratedClient({
    this.failure,
    List<api.GroupResponse>? groups,
    List<api.GroupMemberResponse>? members,
  }) : groups = groups ?? const [],
       members = members ?? const [];

  final Object? failure;
  final List<api.GroupResponse> groups;
  final List<api.GroupMemberResponse> members;
  final accessTokens = <String>[];
  int listCalls = 0;
  int createCalls = 0;
  int getCalls = 0;
  int updateCalls = 0;
  int listMemberCalls = 0;
  int addMemberCalls = 0;
  int updateMemberCalls = 0;
  int removeMemberCalls = 0;
  String? lastGroupId;
  String? lastRemovedProfileId;
  api.CreateGroupRequest? lastCreateRequest;
  api.UpdateGroupRequest? lastUpdateRequest;
  api.AddGroupMemberRequest? lastAddMemberRequest;
  api.UpdateGroupMemberRequest? lastMemberRoleUpdate;

  @override
  Future<api.GroupListResponse> listGroups({
    required String accessToken,
  }) async {
    listCalls += 1;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.GroupListResponse(groups: groups);
  }

  @override
  Future<api.GroupResponse> createGroup(
    api.CreateGroupRequest request, {
    required String accessToken,
  }) async {
    createCalls += 1;
    lastCreateRequest = request;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiGroup(name: request.name);
  }

  @override
  Future<api.GroupResponse> getGroup(
    String groupId, {
    required String accessToken,
  }) async {
    getCalls += 1;
    lastGroupId = groupId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiGroup();
  }

  @override
  Future<api.GroupResponse> updateGroup(
    String groupId,
    api.UpdateGroupRequest request, {
    required String accessToken,
  }) async {
    updateCalls += 1;
    lastGroupId = groupId;
    lastUpdateRequest = request;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiGroup(name: request.name ?? 'Trip Crew');
  }

  @override
  Future<api.GroupMemberListResponse> listGroupMembers(
    String groupId, {
    required String accessToken,
  }) async {
    listMemberCalls += 1;
    lastGroupId = groupId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.GroupMemberListResponse(members: members);
  }

  @override
  Future<api.GroupMemberResponse> addGroupMember(
    String groupId,
    api.AddGroupMemberRequest request, {
    required String accessToken,
  }) async {
    addMemberCalls += 1;
    lastGroupId = groupId;
    lastAddMemberRequest = request;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiMember(userProfileId: _profileId, displayName: 'Morgan');
  }

  @override
  Future<api.GroupMemberResponse> updateGroupMember(
    String groupId,
    String userProfileId,
    api.UpdateGroupMemberRequest request, {
    required String accessToken,
  }) async {
    updateMemberCalls += 1;
    lastGroupId = groupId;
    lastMemberRoleUpdate = request;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiMember(userProfileId: userProfileId);
  }

  @override
  Future<void> removeGroupMember(
    String groupId,
    String userProfileId, {
    required String accessToken,
  }) async {
    removeMemberCalls += 1;
    lastGroupId = groupId;
    lastRemovedProfileId = userProfileId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.GroupResponse sampleApiGroup({
  String id = _groupId,
  String name = 'Trip Crew',
}) {
  return api.GroupResponse(
    id: id,
    name: name,
    currentUserRole: api.GroupRoleValues.owner,
    currentUserStatus: api.GroupMembershipStatusValues.active,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

api.GroupMemberResponse sampleApiMember({
  String userProfileId = _profileId,
  String displayName = 'Taylor',
}) {
  return api.GroupMemberResponse(
    userProfileId: userProfileId,
    displayName: displayName,
    role: api.GroupRoleValues.member,
    status: api.GroupMembershipStatusValues.active,
    joinedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

const _groupId = '11111111-1111-1111-1111-111111111111';
const _profileId = '22222222-2222-2222-2222-222222222222';
const _otherProfileId = '33333333-3333-3333-3333-333333333333';
const _hiddenBody = {'detail': 'secret internal detail'};
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
