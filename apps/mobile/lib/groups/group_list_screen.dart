import 'package:flutter/material.dart';

import '../bills/bill_attachment_file_input.dart';
import '../bills/bill_attachment_repository.dart';
import '../bills/bill_revision_repository.dart';
import '../bills/bill_list_screen.dart';
import '../bills/bill_repository.dart';
import '../receipt_ocr_capture/receipt_image_intake.dart';
import '../receipt_ocr_capture/receipt_ocr_provider.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../ui/settleora_components.dart';
import 'group_repository.dart';

class SettleoraGroupListScreen extends StatefulWidget {
  const SettleoraGroupListScreen({
    super.key,
    required this.repository,
    required this.billRepository,
    this.openCreateOnStart = false,
    this.openGroupBillCreateOnPick = false,
    this.currentUserProfileId,
    this.defaultCurrency,
    this.billAttachmentRepository,
    this.billAttachmentFileInput,
    this.receiptImageIntake,
    this.receiptOcrProvider,
    this.receiptOcrReviewRepository,
    this.billRevisionRepository,
    this.onTopLevelDestinationSelected,
  });

  final SettleoraGroupRepository repository;
  final SettleoraBillRepository billRepository;
  final bool openCreateOnStart;
  final bool openGroupBillCreateOnPick;
  final String? currentUserProfileId;
  final String? defaultCurrency;
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
  final ReceiptImageIntake? receiptImageIntake;
  final ReceiptOcrProvider? receiptOcrProvider;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? billRevisionRepository;
  final ValueChanged<SettleoraNavDestination>? onTopLevelDestinationSelected;

  @override
  State<SettleoraGroupListScreen> createState() =>
      _SettleoraGroupListScreenState();
}

class _SettleoraGroupListScreenState extends State<SettleoraGroupListScreen> {
  final _searchController = TextEditingController();

  bool _isLoading = true;
  bool _isCreating = false;
  bool _didOpenCreateOnStart = false;
  List<SettleoraGroup> _groups = const [];
  String _searchQuery = '';
  SettleoraGroupRole? _selectedRole;
  SettleoraGroupMembershipStatus? _selectedStatus;
  SettleoraGroupFailure? _failure;
  SettleoraGroupFailure? _actionFailure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(() async {
      await _load();
      if (widget.openCreateOnStart) {
        await _openCreateOnStart();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
      _actionFailure = null;
    });

    try {
      final groups = await widget.repository.listGroups();
      if (!mounted) {
        return;
      }

      setState(() {
        _groups = groups;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraGroupFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _openCreateOnStart() async {
    if (_didOpenCreateOnStart || _failure != null || !mounted) {
      return;
    }

    _didOpenCreateOnStart = true;
    await _createGroup();
  }

  void _updateSearchQuery(String value) {
    setState(() {
      _searchQuery = value;
    });
  }

  void _toggleRoleFilter(SettleoraGroupRole role) {
    setState(() {
      _selectedRole = _selectedRole == role ? null : role;
    });
  }

  void _toggleStatusFilter(SettleoraGroupMembershipStatus status) {
    setState(() {
      _selectedStatus = _selectedStatus == status ? null : status;
    });
  }

  void _clearFilters() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _selectedRole = null;
      _selectedStatus = null;
    });
  }

  bool get _hasActiveDiscoveryFilter {
    return _searchQuery.trim().isNotEmpty ||
        _selectedRole != null ||
        _selectedStatus != null;
  }

  List<SettleoraGroup> get _filteredGroups {
    final query = _searchQuery.trim().toLowerCase();

    return [
      for (final group in _groups)
        if ((_selectedRole == null || group.currentUserRole == _selectedRole) &&
            (_selectedStatus == null ||
                group.currentUserStatus == _selectedStatus) &&
            (query.isEmpty || _groupMatchesQuery(group, query)))
          group,
    ];
  }

  bool _groupMatchesQuery(SettleoraGroup group, String query) {
    return group.displayName.toLowerCase().contains(query) ||
        settleoraGroupRoleLabel(
          group.currentUserRole,
        ).toLowerCase().contains(query) ||
        settleoraGroupMembershipStatusLabel(
          group.currentUserStatus,
        ).toLowerCase().contains(query);
  }

  Future<void> _createGroup() async {
    if (_isCreating) {
      return;
    }

    final request = await _showGroupForm(context, title: 'Create Group');
    if (request == null) {
      return;
    }

    setState(() {
      _isCreating = true;
      _actionFailure = null;
    });

    try {
      final group = await widget.repository.createGroup(request);
      if (!mounted) {
        return;
      }

      setState(() {
        _groups = [group, ..._groups.where((item) => item.id != group.id)];
      });
      _showSnackBar('Group created.');
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraGroupFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isCreating = false;
        });
      }
    }
  }

  Future<void> _openGroup(SettleoraGroup group) async {
    if (widget.openGroupBillCreateOnPick) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraGroupBillListScreen(
            repository: widget.billRepository,
            groupRepository: widget.repository,
            currentUserProfileId: widget.currentUserProfileId,
            attachmentRepository: widget.billAttachmentRepository,
            attachmentFileInput: widget.billAttachmentFileInput,
            receiptImageIntake: widget.receiptImageIntake,
            receiptOcrProvider: widget.receiptOcrProvider,
            receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
            revisionRepository: widget.billRevisionRepository,
            groupId: group.id,
            groupName: group.displayName,
            defaultCurrency: widget.defaultCurrency,
            openCreateOnStart: true,
            onTopLevelDestinationSelected: null,
          ),
        ),
      );

      if (mounted) {
        await _load();
      }
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraGroupDetailScreen(
          repository: widget.repository,
          billRepository: widget.billRepository,
          billAttachmentRepository: widget.billAttachmentRepository,
          billAttachmentFileInput: widget.billAttachmentFileInput,
          receiptImageIntake: widget.receiptImageIntake,
          receiptOcrProvider: widget.receiptOcrProvider,
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          billRevisionRepository: widget.billRevisionRepository,
          currentUserProfileId: widget.currentUserProfileId,
          defaultCurrency: widget.defaultCurrency,
          groupId: group.id,
          onTopLevelDestinationSelected: widget.onTopLevelDestinationSelected,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final actionFailure = _actionFailure;
    final filteredGroups = _filteredGroups;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Groups'),
        actions: [
          IconButton(
            key: const Key('group-list-create'),
            tooltip: 'Create group',
            onPressed: _isLoading || _isCreating ? null : _createGroup,
            icon: _isCreating
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.group_add_outlined),
          ),
          IconButton(
            key: const Key('group-list-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading groups');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  if (actionFailure != null) ...[
                    _InlineFailure(failure: actionFailure),
                    const SizedBox(height: 12),
                  ],
                  if (_groups.isEmpty) ...[
                    const SizedBox(height: 56),
                    _StatePanel(
                      icon: Icons.groups_outlined,
                      title: 'No groups',
                      message: widget.openGroupBillCreateOnPick
                          ? 'Create a group first, then pick it to start a group bill.'
                          : 'Groups visible to this account will appear here. Create a group to start a shared bill flow.',
                      action: FilledButton.icon(
                        key: const Key('group-list-empty-create'),
                        onPressed: _isCreating ? null : _createGroup,
                        icon: const Icon(Icons.group_add_outlined),
                        label: const Text('Create group'),
                      ),
                    ),
                  ] else ...[
                    _GroupDiscoveryControls(
                      groups: _groups,
                      visibleCount: filteredGroups.length,
                      searchController: _searchController,
                      selectedRole: _selectedRole,
                      selectedStatus: _selectedStatus,
                      hasActiveFilter: _hasActiveDiscoveryFilter,
                      onSearchChanged: _updateSearchQuery,
                      onRoleSelected: _toggleRoleFilter,
                      onStatusSelected: _toggleStatusFilter,
                      onClear: _clearFilters,
                    ),
                    const SizedBox(height: 14),
                    if (filteredGroups.isEmpty)
                      const _StatePanel(
                        icon: Icons.filter_alt_off_outlined,
                        title: 'No matching groups',
                        message:
                            'No loaded visible groups match these local filters. Clear filters to review loaded server-returned groups; no-match is not an authorization result or server search.',
                        compact: true,
                      )
                    else
                      for (
                        var index = 0;
                        index < filteredGroups.length;
                        index += 1
                      )
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _GroupSummaryTile(
                            group: filteredGroups[index],
                            onTap: () => _openGroup(filteredGroups[index]),
                          ),
                        ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class SettleoraGroupDetailScreen extends StatefulWidget {
  const SettleoraGroupDetailScreen({
    super.key,
    required this.repository,
    required this.billRepository,
    required this.groupId,
    this.currentUserProfileId,
    this.defaultCurrency,
    this.billAttachmentRepository,
    this.billAttachmentFileInput,
    this.receiptImageIntake,
    this.receiptOcrProvider,
    this.receiptOcrReviewRepository,
    this.billRevisionRepository,
    this.onTopLevelDestinationSelected,
  });

  final SettleoraGroupRepository repository;
  final SettleoraBillRepository billRepository;
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
  final ReceiptImageIntake? receiptImageIntake;
  final ReceiptOcrProvider? receiptOcrProvider;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? billRevisionRepository;
  final ValueChanged<SettleoraNavDestination>? onTopLevelDestinationSelected;
  final String? currentUserProfileId;
  final String? defaultCurrency;
  final String groupId;

  @override
  State<SettleoraGroupDetailScreen> createState() =>
      _SettleoraGroupDetailScreenState();
}

class _SettleoraGroupDetailScreenState
    extends State<SettleoraGroupDetailScreen> {
  final _memberProfileIdController = TextEditingController();
  final _memberSearchController = TextEditingController();

  bool _isLoading = true;
  bool _isSavingGroup = false;
  bool _isAddingMember = false;
  String? _busyMemberProfileId;
  SettleoraGroupRole _memberRole = SettleoraGroupRoleValues.member;
  String _memberSearchQuery = '';
  SettleoraGroupRole? _selectedMemberRole;
  SettleoraGroupMembershipStatus? _selectedMemberStatus;
  SettleoraGroup? _group;
  List<SettleoraGroupMember> _members = const [];
  SettleoraGroupFailure? _loadFailure;
  SettleoraGroupFailure? _actionFailure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _memberProfileIdController.dispose();
    _memberSearchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _loadFailure = null;
      _actionFailure = null;
    });

    try {
      final group = await widget.repository.getGroup(widget.groupId);
      final members = await widget.repository.listGroupMembers(widget.groupId);
      if (!mounted) {
        return;
      }

      setState(() {
        _group = group;
        _members = members;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadFailure = SettleoraGroupFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _editGroup() async {
    final group = _group;
    if (group == null || _isSavingGroup) {
      return;
    }

    final request = await _showGroupForm(
      context,
      title: 'Edit Group',
      initialName: group.name,
    );
    if (request == null) {
      return;
    }

    setState(() {
      _isSavingGroup = true;
      _actionFailure = null;
    });

    try {
      final updated = await widget.repository.updateGroup(group.id, request);
      if (!mounted) {
        return;
      }

      setState(() {
        _group = updated;
      });
      _showSnackBar('Group updated.');
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraGroupFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingGroup = false;
        });
      }
    }
  }

  Future<void> _addMember() async {
    if (_isAddingMember || _busyMemberProfileId != null) {
      return;
    }

    setState(() {
      _isAddingMember = true;
      _actionFailure = null;
    });

    try {
      final member = await widget.repository.addGroupMember(
        widget.groupId,
        SettleoraGroupMemberAddRequest(
          userProfileId: _memberProfileIdController.text,
          role: _memberRole,
        ),
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _memberProfileIdController.clear();
        _memberRole = SettleoraGroupRoleValues.member;
        _members = [
          member,
          ..._members.where(
            (item) => item.userProfileId != member.userProfileId,
          ),
        ];
      });
      _showSnackBar('Member added.');
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraGroupFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isAddingMember = false;
        });
      }
    }
  }

  Future<void> _updateMemberRole(
    SettleoraGroupMember member,
    SettleoraGroupRole role,
  ) async {
    if (_busyMemberProfileId != null || role == member.role) {
      return;
    }

    setState(() {
      _busyMemberProfileId = member.userProfileId;
      _actionFailure = null;
    });

    try {
      final updated = await widget.repository.updateGroupMember(
        widget.groupId,
        member.userProfileId,
        SettleoraGroupMemberRoleUpdate(role: role),
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _members = [
          for (final item in _members)
            if (item.userProfileId == updated.userProfileId) updated else item,
        ];
      });
      _showSnackBar('Member updated.');
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraGroupFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _busyMemberProfileId = null;
        });
      }
    }
  }

  Future<void> _removeMember(SettleoraGroupMember member) async {
    if (_busyMemberProfileId != null) {
      return;
    }

    final confirmed = await _confirmMemberRemoval(member);
    if (!confirmed) {
      return;
    }

    setState(() {
      _busyMemberProfileId = member.userProfileId;
      _actionFailure = null;
    });

    try {
      await widget.repository.removeGroupMember(
        widget.groupId,
        member.userProfileId,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _members = [
          for (final item in _members)
            if (item.userProfileId != member.userProfileId) item,
        ];
      });
      _showSnackBar('Member removed.');
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraGroupFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _busyMemberProfileId = null;
        });
      }
    }
  }

  Future<void> _openGroupBills(SettleoraGroup group) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraGroupBillListScreen(
          repository: widget.billRepository,
          groupRepository: widget.repository,
          participantDisplayNames: _participantDisplayNamesByProfileId(),
          currentUserProfileId: widget.currentUserProfileId,
          attachmentRepository: widget.billAttachmentRepository,
          attachmentFileInput: widget.billAttachmentFileInput,
          receiptImageIntake: widget.receiptImageIntake,
          receiptOcrProvider: widget.receiptOcrProvider,
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          revisionRepository: widget.billRevisionRepository,
          groupId: group.id,
          groupName: group.displayName,
          defaultCurrency: widget.defaultCurrency,
          onTopLevelDestinationSelected: widget.onTopLevelDestinationSelected,
        ),
      ),
    );
  }

  Map<String, String> _participantDisplayNamesByProfileId() {
    return {
      for (final member in _members)
        if (member.userProfileId.trim().isNotEmpty &&
            member.safeDisplayName.trim().isNotEmpty)
          member.userProfileId.trim(): member.safeDisplayName.trim(),
    };
  }

  void _updateMemberSearchQuery(String value) {
    setState(() {
      _memberSearchQuery = value;
    });
  }

  void _toggleMemberRoleFilter(SettleoraGroupRole role) {
    setState(() {
      _selectedMemberRole = _selectedMemberRole == role ? null : role;
    });
  }

  void _toggleMemberStatusFilter(SettleoraGroupMembershipStatus status) {
    setState(() {
      _selectedMemberStatus = _selectedMemberStatus == status ? null : status;
    });
  }

  void _clearMemberFilters() {
    _memberSearchController.clear();
    setState(() {
      _memberSearchQuery = '';
      _selectedMemberRole = null;
      _selectedMemberStatus = null;
    });
  }

  bool get _hasActiveMemberDiscoveryFilter {
    return _memberSearchQuery.trim().isNotEmpty ||
        _selectedMemberRole != null ||
        _selectedMemberStatus != null;
  }

  List<SettleoraGroupMember> get _filteredMembers {
    final query = _memberSearchQuery.trim().toLowerCase();

    return [
      for (final member in _members)
        if ((_selectedMemberRole == null ||
                member.role == _selectedMemberRole) &&
            (_selectedMemberStatus == null ||
                member.status == _selectedMemberStatus) &&
            (query.isEmpty || _memberMatchesQuery(member, query)))
          member,
    ];
  }

  bool _memberMatchesQuery(SettleoraGroupMember member, String query) {
    return member.safeDisplayName.toLowerCase().contains(query) ||
        settleoraGroupRoleLabel(member.role).toLowerCase().contains(query) ||
        settleoraGroupMembershipStatusLabel(
          member.status,
        ).toLowerCase().contains(query);
  }

  Future<bool> _confirmMemberRemoval(SettleoraGroupMember member) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove Member?'),
        content: Text('Remove ${member.safeDisplayName} from this group?'),
        actions: [
          TextButton(
            key: const Key('group-member-remove-cancel'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('group-member-remove-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    return result ?? false;
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final group = _group;
    final actionFailure = _actionFailure;
    final filteredMembers = _filteredMembers;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Group'),
        actions: [
          IconButton(
            key: const Key('group-detail-edit'),
            tooltip: 'Edit group',
            onPressed: _isLoading || _isSavingGroup ? null : _editGroup,
            icon: _isSavingGroup
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.edit_outlined),
          ),
          IconButton(
            key: const Key('group-detail-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading group');
            }

            final failure = _loadFailure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            if (group == null) {
              return _FailurePanel(
                failure: const SettleoraGroupFailure(
                  kind: SettleoraGroupFailureKind.unavailable,
                  message: 'The group is no longer available.',
                ),
                onRetry: _load,
              );
            }

            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                children: [
                  _GroupDetailHeader(group: group),
                  if (actionFailure != null) ...[
                    const SizedBox(height: 14),
                    _InlineFailure(failure: actionFailure),
                  ],
                  const SizedBox(height: 14),
                  _GroupBillsHandoffCard(
                    group: group,
                    memberCount: _members.length,
                    onOpenGroupBills: () => _openGroupBills(group),
                  ),
                  const SizedBox(height: 22),
                  _Section(
                    title: 'Add Member',
                    children: [
                      TextField(
                        key: const Key('group-member-profile-id'),
                        controller: _memberProfileIdController,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: 'User profile ID',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Role',
                          border: OutlineInputBorder(),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            key: const Key('group-member-role'),
                            value: _memberRole,
                            isExpanded: true,
                            items: [
                              for (final role
                                  in SettleoraGroupRoleValues.values)
                                DropdownMenuItem(
                                  value: role,
                                  child: Text(settleoraGroupRoleLabel(role)),
                                ),
                            ],
                            onChanged: _isAddingMember
                                ? null
                                : (value) {
                                    if (value == null) {
                                      return;
                                    }

                                    setState(() {
                                      _memberRole = value;
                                    });
                                  },
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        key: const Key('group-member-add'),
                        onPressed: _isAddingMember ? null : _addMember,
                        icon: _isAddingMember
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.person_add_alt_1_outlined),
                        label: const Text('Add Member'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _Section(
                    title: 'Members',
                    children: [
                      if (_members.isEmpty)
                        const _StatePanel(
                          icon: Icons.people_outline,
                          title: 'No members',
                          message: 'No active members are visible.',
                          compact: true,
                        )
                      else ...[
                        _MemberDiscoveryControls(
                          members: _members,
                          visibleCount: filteredMembers.length,
                          searchController: _memberSearchController,
                          selectedRole: _selectedMemberRole,
                          selectedStatus: _selectedMemberStatus,
                          hasActiveFilter: _hasActiveMemberDiscoveryFilter,
                          onSearchChanged: _updateMemberSearchQuery,
                          onRoleSelected: _toggleMemberRoleFilter,
                          onStatusSelected: _toggleMemberStatusFilter,
                          onClear: _clearMemberFilters,
                        ),
                        const SizedBox(height: 14),
                        if (filteredMembers.isEmpty)
                          const _StatePanel(
                            icon: Icons.person_search_outlined,
                            title: 'No matching members',
                            message:
                                'No loaded visible members match these local filters. Clear filters to review loaded server-returned members; no-match is not membership or authorization truth.',
                            compact: true,
                          )
                        else
                          for (
                            var index = 0;
                            index < filteredMembers.length;
                            index += 1
                          )
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _MemberTile(
                                member: filteredMembers[index],
                                isBusy:
                                    _busyMemberProfileId ==
                                    filteredMembers[index].userProfileId,
                                menuKey: ValueKey(
                                  'group-member-actions-${filteredMembers[index].userProfileId}',
                                ),
                                onUpdateRole: (role) => _updateMemberRole(
                                  filteredMembers[index],
                                  role,
                                ),
                                onRemove: () =>
                                    _removeMember(filteredMembers[index]),
                              ),
                            ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 14),
                  const _GroupWorkspaceReadinessCard(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _GroupBillsHandoffCard extends StatelessWidget {
  const _GroupBillsHandoffCard({
    required this.group,
    required this.memberCount,
    required this.onOpenGroupBills,
  });

  final SettleoraGroup group;
  final int memberCount;
  final VoidCallback onOpenGroupBills;

  @override
  Widget build(BuildContext context) {
    final name = group.displayName;
    final safeName = name.trim().isEmpty ? 'this group' : name.trim();

    return Card(
      key: const Key('group-detail-bills-handoff'),
      child: ListTile(
        leading: const Icon(Icons.receipt_long_outlined),
        title: const Text('Shared bill workspace'),
        subtitle: Text(
          '$memberCount loaded member${_plural(memberCount)} - Open group bills for $safeName.',
        ),
        trailing: FilledButton.icon(
          key: const Key('group-detail-bills'),
          onPressed: onOpenGroupBills,
          icon: const Icon(Icons.arrow_forward),
          label: const Text('Open'),
        ),
      ),
    );
  }
}

class _GroupWorkspaceReadinessCard extends StatelessWidget {
  const _GroupWorkspaceReadinessCard();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Card(
      key: const Key('group-detail-workspace-readiness'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Group workspace readiness', style: textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(
              'This group detail plus group bills is the current mobile group workspace. A full multi-section group dashboard with balances, pending actions, reports, recurring, notifications, receipt review, settlements, and settings is not implemented yet.',
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 8),
            Text(
              'Use the shell routes for settlements, recurring bills, notifications, receipt reviews, reports, and sync status. Each subject screen reloads through its own repository/API seam before mutation; group labels, member rows, dashboard cards, notification metadata, cached route state, and local filters are not access signals.',
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 8),
            Text(
              'Unsupported for now: saved group dashboard layouts, per-group dashboard defaults, saved dashboard profiles, dashboard personalization persistence, and saved cross-surface search/filter views.',
              style: TextStyle(color: muted),
            ),
          ],
        ),
      ),
    );
  }
}

class _MemberDiscoveryControls extends StatelessWidget {
  const _MemberDiscoveryControls({
    required this.members,
    required this.visibleCount,
    required this.searchController,
    required this.selectedRole,
    required this.selectedStatus,
    required this.hasActiveFilter,
    required this.onSearchChanged,
    required this.onRoleSelected,
    required this.onStatusSelected,
    required this.onClear,
  });

  final List<SettleoraGroupMember> members;
  final int visibleCount;
  final TextEditingController searchController;
  final SettleoraGroupRole? selectedRole;
  final SettleoraGroupMembershipStatus? selectedStatus;
  final bool hasActiveFilter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<SettleoraGroupRole> onRoleSelected;
  final ValueChanged<SettleoraGroupMembershipStatus> onStatusSelected;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final roles = _orderedMemberRoles(members);
    final statuses = _orderedMemberStatuses(members);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          key: const Key('group-member-search'),
          controller: searchController,
          onChanged: onSearchChanged,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search members',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.search),
            suffixIcon: searchController.text.trim().isEmpty
                ? null
                : IconButton(
                    key: const Key('group-member-search-clear'),
                    tooltip: 'Clear search',
                    onPressed: () {
                      searchController.clear();
                      onSearchChanged('');
                    },
                    icon: const Icon(Icons.close),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(
                'Showing $visibleCount of ${members.length} loaded members',
                key: const Key('group-member-visible-count'),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            if (hasActiveFilter)
              TextButton.icon(
                key: const Key('group-member-clear-filters'),
                onPressed: onClear,
                icon: const Icon(Icons.filter_alt_off_outlined),
                label: const Text('Clear'),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Member search and filters narrow loaded visible rows only. Member labels and hidden controls are not permission signals.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final role in roles)
              ChoiceChip(
                key: ValueKey('group-member-role-filter-$role'),
                label: Text(
                  '${settleoraGroupRoleLabel(role)} (${_memberRoleCount(members, role)})',
                ),
                selected: selectedRole == role,
                onSelected: (_) => onRoleSelected(role),
              ),
            for (final status in statuses)
              ChoiceChip(
                key: ValueKey('group-member-status-filter-$status'),
                label: Text(
                  '${settleoraGroupMembershipStatusLabel(status)} (${_memberStatusCount(members, status)})',
                ),
                selected: selectedStatus == status,
                onSelected: (_) => onStatusSelected(status),
              ),
          ],
        ),
      ],
    );
  }
}

class _GroupDiscoveryControls extends StatelessWidget {
  const _GroupDiscoveryControls({
    required this.groups,
    required this.visibleCount,
    required this.searchController,
    required this.selectedRole,
    required this.selectedStatus,
    required this.hasActiveFilter,
    required this.onSearchChanged,
    required this.onRoleSelected,
    required this.onStatusSelected,
    required this.onClear,
  });

  final List<SettleoraGroup> groups;
  final int visibleCount;
  final TextEditingController searchController;
  final SettleoraGroupRole? selectedRole;
  final SettleoraGroupMembershipStatus? selectedStatus;
  final bool hasActiveFilter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<SettleoraGroupRole> onRoleSelected;
  final ValueChanged<SettleoraGroupMembershipStatus> onStatusSelected;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final roles = _orderedGroupRoles(groups);
    final statuses = _orderedGroupStatuses(groups);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          key: const Key('group-list-search'),
          controller: searchController,
          onChanged: onSearchChanged,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search groups',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.search),
            suffixIcon: searchController.text.trim().isEmpty
                ? null
                : IconButton(
                    key: const Key('group-list-search-clear'),
                    tooltip: 'Clear search',
                    onPressed: () {
                      searchController.clear();
                      onSearchChanged('');
                    },
                    icon: const Icon(Icons.close),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(
                'Showing $visibleCount of ${groups.length} loaded groups',
                key: const Key('group-list-visible-count'),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            if (hasActiveFilter)
              TextButton.icon(
                key: const Key('group-list-clear-filters'),
                onPressed: onClear,
                icon: const Icon(Icons.filter_alt_off_outlined),
                label: const Text('Clear'),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Group search and filters narrow loaded visible rows only. Group labels, route state, and dashboard visibility are not authorization.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final role in roles)
              ChoiceChip(
                key: ValueKey('group-list-role-filter-$role'),
                label: Text(
                  '${settleoraGroupRoleLabel(role)} (${_roleCount(groups, role)})',
                ),
                selected: selectedRole == role,
                onSelected: (_) => onRoleSelected(role),
              ),
            for (final status in statuses)
              ChoiceChip(
                key: ValueKey('group-list-status-filter-$status'),
                label: Text(
                  '${settleoraGroupMembershipStatusLabel(status)} (${_statusCount(groups, status)})',
                ),
                selected: selectedStatus == status,
                onSelected: (_) => onStatusSelected(status),
              ),
          ],
        ),
      ],
    );
  }
}

class _GroupSummaryTile extends StatelessWidget {
  const _GroupSummaryTile({required this.group, required this.onTap});

  final SettleoraGroup group;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        onTap: onTap,
        leading: const CircleAvatar(child: Icon(Icons.groups_outlined)),
        title: Text(
          group.displayName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${settleoraGroupRoleLabel(group.currentUserRole)} - ${settleoraGroupMembershipStatusLabel(group.currentUserStatus)}',
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _GroupDetailHeader extends StatelessWidget {
  const _GroupDetailHeader({required this.group});

  final SettleoraGroup group;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(group.displayName, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        _KeyValueText(
          label: 'Role',
          value: settleoraGroupRoleLabel(group.currentUserRole),
        ),
        _KeyValueText(
          label: 'Status',
          value: settleoraGroupMembershipStatusLabel(group.currentUserStatus),
        ),
        _KeyValueText(
          label: 'Updated',
          value: _formatTimestamp(group.updatedAtUtc),
        ),
      ],
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({
    required this.member,
    required this.isBusy,
    required this.menuKey,
    required this.onUpdateRole,
    required this.onRemove,
  });

  final SettleoraGroupMember member;
  final bool isBusy;
  final Key menuKey;
  final void Function(SettleoraGroupRole role) onUpdateRole;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person_outline)),
        title: Text(
          member.safeDisplayName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${settleoraGroupRoleLabel(member.role)} - ${settleoraGroupMembershipStatusLabel(member.status)}',
        ),
        trailing: isBusy
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : PopupMenuButton<String>(
                key: menuKey,
                tooltip: 'Member actions',
                onSelected: (value) {
                  switch (value) {
                    case SettleoraGroupRoleValues.owner:
                    case SettleoraGroupRoleValues.member:
                      onUpdateRole(value);
                    case 'remove':
                      onRemove();
                  }
                },
                itemBuilder: (context) => [
                  for (final role in SettleoraGroupRoleValues.values)
                    PopupMenuItem(
                      value: role,
                      enabled: role != member.role,
                      child: Text('Make ${settleoraGroupRoleLabel(role)}'),
                    ),
                  const PopupMenuItem(value: 'remove', child: Text('Remove')),
                ],
              ),
      ),
    );
  }
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({required this.failure, required this.onRetry});

  final SettleoraGroupFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      action: OutlinedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _InlineFailure extends StatelessWidget {
  const _InlineFailure({required this.failure});

  final SettleoraGroupFailure failure;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.error),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(
              _failureIcon(failure.kind),
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(failure.message)),
          ],
        ),
      ),
    );
  }
}

class _StatePanel extends StatelessWidget {
  const _StatePanel({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: compact ? 28 : 42,
          color: Theme.of(context).colorScheme.primary,
        ),
        SizedBox(height: compact ? 8 : 14),
        Text(
          title,
          style: compact
              ? Theme.of(context).textTheme.titleMedium
              : Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(message, textAlign: TextAlign.center),
        if (action != null) ...[const SizedBox(height: 14), action!],
      ],
    );

    if (compact) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: content,
      );
    }

    return Center(
      child: Padding(padding: const EdgeInsets.all(24), child: content),
    );
  }
}

class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 14),
          Text(label),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 10),
        ...children,
      ],
    );
  }
}

class _KeyValueText extends StatelessWidget {
  const _KeyValueText({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}

String _plural(int count) => count == 1 ? '' : 's';

Future<SettleoraGroupSaveRequest?> _showGroupForm(
  BuildContext context, {
  required String title,
  String? initialName,
}) async {
  return showDialog<SettleoraGroupSaveRequest>(
    context: context,
    builder: (context) =>
        _GroupFormDialog(title: title, initialName: initialName),
  );
}

class _GroupFormDialog extends StatefulWidget {
  const _GroupFormDialog({required this.title, required this.initialName});

  final String title;
  final String? initialName;

  @override
  State<_GroupFormDialog> createState() => _GroupFormDialogState();
}

class _GroupFormDialogState extends State<_GroupFormDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialName ?? '');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        key: const Key('group-form-name'),
        controller: _controller,
        autofocus: true,
        maxLength: 160,
        decoration: const InputDecoration(
          labelText: 'Name',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(
          key: const Key('group-form-cancel'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('group-form-save'),
          onPressed: () {
            Navigator.of(
              context,
            ).pop(SettleoraGroupSaveRequest(name: _controller.text));
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}

List<SettleoraGroupRole> _orderedGroupRoles(List<SettleoraGroup> groups) {
  final loadedRoles = {
    for (final group in groups)
      if (group.currentUserRole.trim().isNotEmpty) group.currentUserRole,
  };

  return [
    for (final role in SettleoraGroupRoleValues.values)
      if (loadedRoles.remove(role)) role,
    ...loadedRoles.toList()..sort(),
  ];
}

List<SettleoraGroupMembershipStatus> _orderedGroupStatuses(
  List<SettleoraGroup> groups,
) {
  final loadedStatuses = {
    for (final group in groups)
      if (group.currentUserStatus.trim().isNotEmpty) group.currentUserStatus,
  };

  return [
    for (final status in SettleoraGroupMembershipStatusValues.values)
      if (loadedStatuses.remove(status)) status,
    ...loadedStatuses.toList()..sort(),
  ];
}

int _roleCount(List<SettleoraGroup> groups, SettleoraGroupRole role) {
  return groups.where((group) => group.currentUserRole == role).length;
}

int _statusCount(
  List<SettleoraGroup> groups,
  SettleoraGroupMembershipStatus status,
) {
  return groups.where((group) => group.currentUserStatus == status).length;
}

List<SettleoraGroupRole> _orderedMemberRoles(
  List<SettleoraGroupMember> members,
) {
  final loadedRoles = {
    for (final member in members)
      if (member.role.trim().isNotEmpty) member.role,
  };

  return [
    for (final role in SettleoraGroupRoleValues.values)
      if (loadedRoles.remove(role)) role,
    ...loadedRoles.toList()..sort(),
  ];
}

List<SettleoraGroupMembershipStatus> _orderedMemberStatuses(
  List<SettleoraGroupMember> members,
) {
  final loadedStatuses = {
    for (final member in members)
      if (member.status.trim().isNotEmpty) member.status,
  };

  return [
    for (final status in SettleoraGroupMembershipStatusValues.values)
      if (loadedStatuses.remove(status)) status,
    ...loadedStatuses.toList()..sort(),
  ];
}

int _memberRoleCount(
  List<SettleoraGroupMember> members,
  SettleoraGroupRole role,
) {
  return members.where((member) => member.role == role).length;
}

int _memberStatusCount(
  List<SettleoraGroupMember> members,
  SettleoraGroupMembershipStatus status,
) {
  return members.where((member) => member.status == status).length;
}

IconData _failureIcon(SettleoraGroupFailureKind kind) {
  return switch (kind) {
    SettleoraGroupFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraGroupFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraGroupFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraGroupFailureKind.unavailable => Icons.visibility_off_outlined,
    SettleoraGroupFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraGroupFailureKind.validation => Icons.report_problem_outlined,
    SettleoraGroupFailureKind.network => Icons.cloud_off_outlined,
    SettleoraGroupFailureKind.server => Icons.error_outline,
  };
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}
