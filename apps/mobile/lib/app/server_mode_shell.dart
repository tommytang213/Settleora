import 'package:flutter/material.dart';

import '../api/settleora_api_client.dart';
import '../bills/bill_revision_repository.dart';
import '../bills/bill_list_screen.dart';
import '../bills/bill_repository.dart';
import '../bills/bill_sync_controller.dart';
import '../groups/group_list_screen.dart';
import '../groups/group_repository.dart';
import '../notifications/notification_repository.dart';
import '../notifications/notification_screen.dart';
import '../profile/profile_repository.dart';
import '../profile/profile_screen.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_screen.dart';
import '../recurring_bills/recurring_bill_repository.dart';
import '../recurring_bills/recurring_bill_screen.dart';
import '../reports/monthly_report_screen.dart';
import '../reports/report_repository.dart';
import '../settlements/settlement_list_screen.dart';
import '../settlements/settlement_repository.dart';
import 'auth_session_repository.dart';

typedef SettleoraSessionEndedCallback =
    Future<void> Function(String? noticeMessage);

class SettleoraAuthenticatedServerShell extends StatefulWidget {
  const SettleoraAuthenticatedServerShell({
    super.key,
    required this.currentUser,
    required this.receiptOcrReviewRepository,
    required this.billRepository,
    this.billRevisionRepository,
    required this.settlementRepository,
    required this.recurringBillRepository,
    required this.groupRepository,
    required this.notificationRepository,
    required this.reportRepository,
    required this.profileRepository,
    required this.billSyncController,
    required this.authRepository,
    required this.accessTokenProvider,
    required this.onSessionEnded,
  });

  final SettleoraCurrentUser currentUser;
  final ReceiptOcrReviewRepository receiptOcrReviewRepository;
  final SettleoraBillRepository billRepository;
  final SettleoraBillRevisionRepository? billRevisionRepository;
  final SettleoraSettlementRepository settlementRepository;
  final SettleoraRecurringBillRepository recurringBillRepository;
  final SettleoraGroupRepository groupRepository;
  final SettleoraNotificationRepository notificationRepository;
  final SettleoraMonthlyReportRepository reportRepository;
  final SettleoraProfileRepository profileRepository;
  final SettleoraBillSyncController billSyncController;
  final SettleoraAuthRepository authRepository;
  final SettleoraAccessTokenProvider accessTokenProvider;
  final SettleoraSessionEndedCallback onSessionEnded;

  @override
  State<SettleoraAuthenticatedServerShell> createState() =>
      _SettleoraAuthenticatedServerShellState();
}

class _SettleoraAuthenticatedServerShellState
    extends State<SettleoraAuthenticatedServerShell> {
  bool _isSigningOut = false;

  Future<void> _openBills() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraBillListScreen(
          repository: widget.billRepository,
          syncController: widget.billSyncController,
          revisionRepository: widget.billRevisionRepository,
        ),
      ),
    );
  }

  Future<void> _openProfile() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraProfileScreen(
          repository: widget.profileRepository,
          currentUser: widget.currentUser,
          onSessionEnded: widget.onSessionEnded,
        ),
      ),
    );
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraNotificationScreen(
          repository: widget.notificationRepository,
          onSessionEnded: widget.onSessionEnded,
        ),
      ),
    );
  }

  Future<void> _openMonthlyReport() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraMonthlyReportScreen(
          repository: widget.reportRepository,
          onSessionEnded: widget.onSessionEnded,
        ),
      ),
    );
  }

  Future<void> _openReceiptReviews() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ReceiptOcrReviewQueueScreen(
          repository: widget.receiptOcrReviewRepository,
        ),
      ),
    );
  }

  Future<void> _openSettlements() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraSettlementListScreen(
          repository: widget.settlementRepository,
          currentUserProfileId: widget.currentUser.userProfileId,
        ),
      ),
    );
  }

  Future<void> _openRecurringBills() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraRecurringBillScreen(
          repository: widget.recurringBillRepository,
        ),
      ),
    );
  }

  Future<void> _openGroups() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraGroupListScreen(
          repository: widget.groupRepository,
          billRepository: widget.billRepository,
          billRevisionRepository: widget.billRevisionRepository,
        ),
      ),
    );
  }

  Future<void> _openSessions() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraSessionListScreen(
          authRepository: widget.authRepository,
          accessTokenProvider: widget.accessTokenProvider,
          onSessionEnded: widget.onSessionEnded,
        ),
      ),
    );
  }

  Future<void> _signOutCurrentSession() async {
    if (_isSigningOut) {
      return;
    }

    setState(() {
      _isSigningOut = true;
    });

    try {
      final accessToken = await _readAccessToken();
      if (accessToken == null) {
        await widget.onSessionEnded('Your session has expired. Sign in again.');
        return;
      }

      await widget.authRepository.signOutCurrentSession(
        accessToken: accessToken,
      );
      await widget.onSessionEnded('Signed out.');
    } on SettleoraAuthFailure catch (failure) {
      if (!mounted) {
        return;
      }

      if (failure.kind == SettleoraAuthFailureKind.sessionExpired) {
        await widget.onSessionEnded(failure.message);
        return;
      }

      if (failure.kind == SettleoraAuthFailureKind.network ||
          failure.kind == SettleoraAuthFailureKind.server) {
        final shouldClear = await _confirmLocalSignOut(failure);
        if (shouldClear) {
          await widget.onSessionEnded(
            'Signed out on this device. The server may still show this session until it can be revoked.',
          );
        }
        return;
      }

      _showSnackBar(failure.message);
    } finally {
      if (mounted) {
        setState(() {
          _isSigningOut = false;
        });
      }
    }
  }

  Future<String?> _readAccessToken() async {
    try {
      final accessToken = await widget.accessTokenProvider.accessToken();
      final trimmed = accessToken?.trim();
      if (trimmed == null || trimmed.isEmpty) {
        return null;
      }

      return trimmed;
    } on SettleoraAuthFailure {
      rethrow;
    } catch (_) {
      throw const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Session management is unavailable right now.',
      );
    }
  }

  Future<bool> _confirmLocalSignOut(SettleoraAuthFailure failure) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(failure.title),
        content: const Text(
          'The server could not confirm sign-out. You can clear the saved session on this device and sign in again later.',
        ),
        actions: [
          TextButton(
            key: const Key('sign-out-local-cancel'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep Session'),
          ),
          FilledButton(
            key: const Key('sign-out-local-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign Out Here'),
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
    final currentUser = widget.currentUser;
    final defaultCurrency = currentUser.defaultCurrency;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settleora'),
        actions: [
          IconButton(
            key: const Key('server-shell-sign-out'),
            tooltip: 'Sign out',
            onPressed: _isSigningOut ? null : _signOutCurrentSession,
            icon: _isSigningOut
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.logout_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            ListTile(
              key: const Key('server-shell-current-user'),
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(currentUser.displayName),
              subtitle: Text(
                defaultCurrency == null
                    ? 'Signed in'
                    : 'Signed in - $defaultCurrency',
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-profile'),
              onPressed: _openProfile,
              icon: const Icon(Icons.account_circle_outlined),
              label: const Text('Profile'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-notifications'),
              onPressed: _openNotifications,
              icon: const Icon(Icons.notifications_outlined),
              label: const Text('Notifications'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-bills'),
              onPressed: _openBills,
              icon: const Icon(Icons.list_alt_outlined),
              label: const Text('Bills'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-recurring-bills'),
              onPressed: _openRecurringBills,
              icon: const Icon(Icons.event_repeat_outlined),
              label: const Text('Recurring bills'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-settlements'),
              onPressed: _openSettlements,
              icon: const Icon(Icons.handshake_outlined),
              label: const Text('Settlements'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-groups'),
              onPressed: _openGroups,
              icon: const Icon(Icons.groups_outlined),
              label: const Text('Groups'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-receipt-reviews'),
              onPressed: _openReceiptReviews,
              icon: const Icon(Icons.receipt_long_outlined),
              label: const Text('Receipt Reviews'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              key: const Key('server-shell-sessions'),
              onPressed: _openSessions,
              icon: const Icon(Icons.devices_outlined),
              label: const Text('Sessions'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('server-shell-reports'),
              onPressed: _openMonthlyReport,
              icon: const Icon(Icons.summarize_outlined),
              label: const Text('Monthly report'),
            ),
          ],
        ),
      ),
    );
  }
}

class SettleoraSessionListScreen extends StatefulWidget {
  const SettleoraSessionListScreen({
    super.key,
    required this.authRepository,
    required this.accessTokenProvider,
    required this.onSessionEnded,
  });

  final SettleoraAuthRepository authRepository;
  final SettleoraAccessTokenProvider accessTokenProvider;
  final SettleoraSessionEndedCallback onSessionEnded;

  @override
  State<SettleoraSessionListScreen> createState() =>
      _SettleoraSessionListScreenState();
}

class _SettleoraSessionListScreenState
    extends State<SettleoraSessionListScreen> {
  bool _isLoading = true;
  bool _isSigningOutAll = false;
  String? _revokingSessionId;
  List<SettleoraSessionSummary> _sessions = const [];
  SettleoraAuthFailure? _failure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
    });

    try {
      final accessToken = await _readAccessToken();
      if (accessToken == null) {
        _failure = const SettleoraAuthFailure(
          kind: SettleoraAuthFailureKind.sessionExpired,
          message: 'Your session has expired. Sign in again.',
        );
        _sessions = const [];
      } else {
        _sessions = await widget.authRepository.listSessions(
          accessToken: accessToken,
        );
      }
    } on SettleoraAuthFailure catch (failure) {
      _failure = failure;
      _sessions = const [];
    } catch (_) {
      _failure = const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Session management is unavailable right now.',
      );
      _sessions = const [];
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<String?> _readAccessToken() async {
    final accessToken = await widget.accessTokenProvider.accessToken();
    final trimmed = accessToken?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }

    return trimmed;
  }

  Future<void> _endSession(String? noticeMessage) async {
    final onSessionEnded = widget.onSessionEnded;
    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }

    await onSessionEnded(noticeMessage);
  }

  Future<void> _revokeSession(SettleoraSessionSummary session) async {
    if (session.isCurrent || _revokingSessionId != null) {
      return;
    }

    final confirmed = await _confirm(
      title: 'Revoke Session?',
      message: 'This signs out that device if the server still has it active.',
      confirmLabel: 'Revoke',
    );
    if (!confirmed) {
      return;
    }

    setState(() {
      _revokingSessionId = session.id;
      _failure = null;
    });

    try {
      final accessToken = await _readAccessToken();
      if (accessToken == null) {
        await _endSession('Your session has expired. Sign in again.');
        return;
      }

      await widget.authRepository.revokeSession(
        sessionId: session.id,
        accessToken: accessToken,
      );
      await _load();
    } on SettleoraAuthFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _revokingSessionId = null;
        });
      }
    }
  }

  Future<void> _signOutAll() async {
    if (_isSigningOutAll) {
      return;
    }

    final confirmed = await _confirm(
      title: 'Sign Out All Sessions?',
      message: 'This signs out this device and every other active session.',
      confirmLabel: 'Sign Out All',
    );
    if (!confirmed) {
      return;
    }

    setState(() {
      _isSigningOutAll = true;
      _failure = null;
    });

    try {
      final accessToken = await _readAccessToken();
      if (accessToken == null) {
        await _endSession('Your session has expired. Sign in again.');
        return;
      }

      await widget.authRepository.signOutAllCurrentAccountSessions(
        accessToken: accessToken,
      );
      await _endSession('Signed out on all sessions.');
    } on SettleoraAuthFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSigningOutAll = false;
        });
      }
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );

    return result ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;

    return Scaffold(
      appBar: AppBar(title: const Text('Sessions')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              if (_isLoading)
                const Padding(
                  padding: EdgeInsets.only(top: 72),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (failure != null)
                _SessionStatePanel(
                  failure: failure,
                  onRetry: _load,
                  onSessionEnded: _endSession,
                )
              else ...[
                OutlinedButton.icon(
                  key: const Key('session-list-sign-out-all'),
                  onPressed: _isSigningOutAll ? null : _signOutAll,
                  icon: _isSigningOutAll
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.logout_outlined),
                  label: const Text('Sign Out All Sessions'),
                ),
                const SizedBox(height: 12),
                if (_sessions.isEmpty)
                  const _EmptySessions()
                else
                  for (var index = 0; index < _sessions.length; index += 1)
                    _SessionTile(
                      revokeButtonKey: ValueKey('session-revoke-$index'),
                      session: _sessions[index],
                      isRevoking: _revokingSessionId == _sessions[index].id,
                      onRevoke: () => _revokeSession(_sessions[index]),
                    ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({
    required this.revokeButtonKey,
    required this.session,
    required this.isRevoking,
    required this.onRevoke,
  });

  final Key revokeButtonKey;
  final SettleoraSessionSummary session;
  final bool isRevoking;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final lastSeen = session.lastSeenAtUtc;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(session.displayLabel),
        subtitle: Text(
          [
            'Status: ${session.status}',
            'Issued: ${_formatTimestamp(session.issuedAtUtc)}',
            'Expires: ${_formatTimestamp(session.expiresAtUtc)}',
            if (lastSeen != null) 'Last seen: ${_formatTimestamp(lastSeen)}',
          ].join('\n'),
        ),
        trailing: session.isCurrent
            ? const Chip(label: Text('Current'))
            : IconButton(
                key: revokeButtonKey,
                tooltip: 'Revoke session',
                onPressed: isRevoking ? null : onRevoke,
                icon: isRevoking
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.logout_outlined),
              ),
      ),
    );
  }
}

class _SessionStatePanel extends StatelessWidget {
  const _SessionStatePanel({
    required this.failure,
    required this.onRetry,
    required this.onSessionEnded,
  });

  final SettleoraAuthFailure failure;
  final Future<void> Function() onRetry;
  final SettleoraSessionEndedCallback onSessionEnded;

  @override
  Widget build(BuildContext context) {
    final requiresSignIn =
        failure.kind == SettleoraAuthFailureKind.sessionExpired;

    return Padding(
      padding: const EdgeInsets.only(top: 56),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            requiresSignIn ? Icons.lock_outline : Icons.cloud_off_outlined,
            size: 42,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 12),
          Text(
            failure.title,
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(failure.message, textAlign: TextAlign.center),
          const SizedBox(height: 14),
          if (requiresSignIn)
            FilledButton.icon(
              key: const Key('session-list-sign-in-required'),
              onPressed: () => onSessionEnded(failure.message),
              icon: const Icon(Icons.login_outlined),
              label: const Text('Sign In'),
            )
          else
            OutlinedButton.icon(
              key: const Key('session-list-retry'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
        ],
      ),
    );
  }
}

class _EmptySessions extends StatelessWidget {
  const _EmptySessions();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(top: 48),
      child: Column(
        children: [
          Icon(Icons.devices_other_outlined, size: 42),
          SizedBox(height: 12),
          Text('No active sessions'),
        ],
      ),
    );
  }
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}
