import 'package:flutter/material.dart';

import '../bills/bill_attachment_file_input.dart';
import '../bills/bill_attachment_repository.dart';
import '../bills/bill_revision_repository.dart';
import '../bills/bill_list_screen.dart';
import '../bills/bill_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'group_repository.dart';

class SettleoraGroupListScreen extends StatefulWidget {
  const SettleoraGroupListScreen({
    super.key,
    required this.repository,
    required this.billRepository,
    this.currentUserProfileId,
    this.billAttachmentRepository,
    this.billAttachmentFileInput,
    this.receiptOcrReviewRepository,
    this.billRevisionRepository,
  });

  final SettleoraGroupRepository repository;
  final SettleoraBillRepository billRepository;
  final String? currentUserProfileId;
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? billRevisionRepository;

  @override
  State<SettleoraGroupListScreen> createState() =>
      _SettleoraGroupListScreenState();
}

class _SettleoraGroupListScreenState extends State<SettleoraGroupListScreen> {
  bool _isLoading = true;
  bool _isCreating = false;
  List<SettleoraGroup> _groups = const [];
  SettleoraGroupFailure? _failure;
  SettleoraGroupFailure? _actionFailure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
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
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraGroupDetailScreen(
          repository: widget.repository,
          billRepository: widget.billRepository,
          billAttachmentRepository: widget.billAttachmentRepository,
          billAttachmentFileInput: widget.billAttachmentFileInput,
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          billRevisionRepository: widget.billRevisionRepository,
          currentUserProfileId: widget.currentUserProfileId,
          groupId: group.id,
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
                    const _StatePanel(
                      icon: Icons.groups_outlined,
                      title: 'No groups',
                      message:
                          'Groups visible to this account will appear here.',
                    ),
                  ] else
                    for (var index = 0; index < _groups.length; index += 1)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _GroupSummaryTile(
                          group: _groups[index],
                          onTap: () => _openGroup(_groups[index]),
                        ),
                      ),
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
    this.billAttachmentRepository,
    this.billAttachmentFileInput,
    this.receiptOcrReviewRepository,
    this.billRevisionRepository,
  });

  final SettleoraGroupRepository repository;
  final SettleoraBillRepository billRepository;
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? billRevisionRepository;
  final String? currentUserProfileId;
  final String groupId;

  @override
  State<SettleoraGroupDetailScreen> createState() =>
      _SettleoraGroupDetailScreenState();
}

class _SettleoraGroupDetailScreenState
    extends State<SettleoraGroupDetailScreen> {
  final _memberProfileIdController = TextEditingController();

  bool _isLoading = true;
  bool _isSavingGroup = false;
  bool _isAddingMember = false;
  String? _busyMemberProfileId;
  SettleoraGroupRole _memberRole = SettleoraGroupRoleValues.member;
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
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          revisionRepository: widget.billRevisionRepository,
          groupId: group.id,
          groupName: group.displayName,
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
                  OutlinedButton.icon(
                    key: const Key('group-detail-bills'),
                    onPressed: () => _openGroupBills(group),
                    icon: const Icon(Icons.receipt_long_outlined),
                    label: const Text('Group bills'),
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
                      else
                        for (var index = 0; index < _members.length; index += 1)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _MemberTile(
                              member: _members[index],
                              isBusy:
                                  _busyMemberProfileId ==
                                  _members[index].userProfileId,
                              menuKey: ValueKey('group-member-actions-$index'),
                              onUpdateRole: (role) =>
                                  _updateMemberRole(_members[index], role),
                              onRemove: () => _removeMember(_members[index]),
                            ),
                          ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
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
