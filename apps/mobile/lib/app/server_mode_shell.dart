import 'dart:async';

import 'package:flutter/material.dart';

import '../api/settleora_api_client.dart';
import '../bills/bill_attachment_file_input.dart';
import '../bills/bill_attachment_repository.dart';
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
import '../sync/sync_queue_processor.dart';
import 'auth_session_repository.dart';

typedef SettleoraSessionEndedCallback =
    Future<void> Function(String? noticeMessage);

class SettleoraAuthenticatedServerShell extends StatefulWidget {
  const SettleoraAuthenticatedServerShell({
    super.key,
    required this.currentUser,
    required this.receiptOcrReviewRepository,
    required this.billRepository,
    this.billAttachmentRepository,
    this.billAttachmentFileInput,
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
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
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
  bool _isLoadingOverview = true;
  bool _isFlushingBillSync = false;
  Future<void>? _overviewLoadFuture;
  _SettleoraDashboardOverview? _overview;
  _SettleoraDashboardFailure? _overviewFailure;
  SettleoraBillSyncSnapshot? _billSyncSnapshot;
  int _overviewLoadVersion = 0;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_loadOverview);
  }

  Future<void> _loadOverview() {
    final activeLoad = _overviewLoadFuture;
    if (activeLoad != null) {
      return activeLoad;
    }

    late final Future<void> load;
    load = _runOverviewLoad().whenComplete(() {
      if (_overviewLoadFuture == load) {
        _overviewLoadFuture = null;
      }
    });
    _overviewLoadFuture = load;

    return load;
  }

  Future<void> _runOverviewLoad() async {
    setState(() {
      _isLoadingOverview = true;
      _overviewFailure = null;
    });

    final loadVersion = _overviewLoadVersion + 1;
    _overviewLoadVersion = loadVersion;
    final billSyncSnapshotFuture = _readBillSyncSnapshot();

    try {
      final overviewResults = await Future.wait<Object>([
        widget.billRepository.listPersonalBills(limit: 3),
        widget.notificationRepository.getNotificationSummary(),
        widget.settlementRepository.listBalances(),
        widget.settlementRepository.listSettlementRequests(),
        widget.recurringBillRepository.listTemplates(maxItems: 3),
        widget.recurringBillRepository.listForecast(limit: 3),
      ]);
      if (!mounted) {
        return;
      }

      setState(() {
        _overview = _SettleoraDashboardOverview(
          personalBills: overviewResults[0] as List<SettleoraBillSummary>,
          notificationSummary:
              overviewResults[1] as SettleoraNotificationSummary,
          settlementBalances:
              overviewResults[2] as SettleoraSettlementBalanceSnapshot,
          settlementRequests:
              overviewResults[3] as List<SettleoraSettlementRequest>,
          recurringTemplates:
              overviewResults[4] as List<SettleoraRecurringBillTemplateSummary>,
          recurringForecast:
              overviewResults[5]
                  as List<SettleoraRecurringBillForecastOccurrence>,
        );
        _isLoadingOverview = false;
      });
      unawaited(_applyBillSyncSnapshot(billSyncSnapshotFuture, loadVersion));
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _overviewFailure = _SettleoraDashboardFailure.from(error);
        _isLoadingOverview = false;
      });
      unawaited(_applyBillSyncSnapshot(billSyncSnapshotFuture, loadVersion));
    }
  }

  Future<SettleoraBillSyncSnapshot?> _readBillSyncSnapshot() async {
    try {
      return await widget.billSyncController.readSnapshot();
    } catch (_) {
      return null;
    }
  }

  Future<void> _applyBillSyncSnapshot(
    Future<SettleoraBillSyncSnapshot?> snapshotFuture,
    int loadVersion,
  ) async {
    final snapshot = await snapshotFuture;
    if (!mounted || loadVersion != _overviewLoadVersion) {
      return;
    }

    setState(() {
      _billSyncSnapshot = snapshot;
    });
  }

  Future<void> _openDashboardDestination(WidgetBuilder builder) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: builder));

    if (!mounted) {
      return;
    }

    await _loadOverview();
  }

  Future<void> _openBills() async {
    await _openDashboardDestination(
      (_) => SettleoraBillListScreen(
        repository: widget.billRepository,
        syncController: widget.billSyncController,
        attachmentRepository: widget.billAttachmentRepository,
        attachmentFileInput: widget.billAttachmentFileInput,
        receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
        revisionRepository: widget.billRevisionRepository,
      ),
    );
  }

  Future<void> _flushBillSyncNow() async {
    if (_isFlushingBillSync) {
      return;
    }

    setState(() {
      _isFlushingBillSync = true;
    });

    try {
      final outcome = await widget.billSyncController.flushPending(limit: 25);
      if (!mounted) {
        return;
      }

      setState(() {
        _billSyncSnapshot = outcome.snapshot;
      });

      final result = outcome.result;
      if (result.sessionRequired) {
        await widget.onSessionEnded(
          result.safeMessage ?? 'Sign in again to sync pending changes.',
        );
        return;
      }

      _showSnackBar(_billSyncFlushMessage(result));
    } catch (_) {
      if (!mounted) {
        return;
      }

      _showSnackBar('Sync is unavailable right now.');
    } finally {
      if (mounted) {
        setState(() {
          _isFlushingBillSync = false;
        });
      }
    }
  }

  Future<void> _openCreatePersonalBill() async {
    final createdBill = await Navigator.of(context).push<SettleoraBillDetail>(
      MaterialPageRoute(
        builder: (_) => SettleoraPersonalBillCreateScreen(
          repository: widget.billRepository,
          attachmentRepository: widget.billAttachmentRepository,
          attachmentFileInput: widget.billAttachmentFileInput,
        ),
      ),
    );

    if (!mounted || createdBill == null) {
      return;
    }

    await _loadOverview();
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
    await _openDashboardDestination(
      (_) => SettleoraNotificationScreen(
        repository: widget.notificationRepository,
        currentUserProfileId: widget.currentUser.userProfileId,
        billRepository: widget.billRepository,
        groupRepository: widget.groupRepository,
        settlementRepository: widget.settlementRepository,
        recurringBillRepository: widget.recurringBillRepository,
        billAttachmentRepository: widget.billAttachmentRepository,
        billAttachmentFileInput: widget.billAttachmentFileInput,
        receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
        billRevisionRepository: widget.billRevisionRepository,
        onSessionEnded: widget.onSessionEnded,
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
    await _openDashboardDestination(
      (_) => ReceiptOcrReviewQueueScreen(
        repository: widget.receiptOcrReviewRepository,
      ),
    );
  }

  Future<void> _openSettlements() async {
    await _openDashboardDestination(
      (_) => SettleoraSettlementListScreen(
        repository: widget.settlementRepository,
        currentUserProfileId: widget.currentUser.userProfileId,
      ),
    );
  }

  Future<void> _openSettlementActions() async {
    await _openDashboardDestination(
      (_) => SettleoraSettlementListScreen(
        repository: widget.settlementRepository,
        currentUserProfileId: widget.currentUser.userProfileId,
        openNeedsActionOnStart: true,
      ),
    );
  }

  Future<void> _openRecurringBills() async {
    await _openDashboardDestination(
      (_) => SettleoraRecurringBillScreen(
        repository: widget.recurringBillRepository,
      ),
    );
  }

  Future<void> _openRecurringDrafts() async {
    await _openDashboardDestination(
      (_) => SettleoraRecurringBillScreen(
        repository: widget.recurringBillRepository,
        openNeedsDraftOnStart: true,
      ),
    );
  }

  Future<void> _openGroups() async {
    await _openDashboardDestination(
      (_) => SettleoraGroupListScreen(
        repository: widget.groupRepository,
        billRepository: widget.billRepository,
        currentUserProfileId: widget.currentUser.userProfileId,
        billAttachmentRepository: widget.billAttachmentRepository,
        billAttachmentFileInput: widget.billAttachmentFileInput,
        receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
        billRevisionRepository: widget.billRevisionRepository,
      ),
    );
  }

  Future<void> _openCreateGroup() async {
    await _openDashboardDestination(
      (_) => SettleoraGroupListScreen(
        repository: widget.groupRepository,
        billRepository: widget.billRepository,
        openCreateOnStart: true,
        currentUserProfileId: widget.currentUser.userProfileId,
        billAttachmentRepository: widget.billAttachmentRepository,
        billAttachmentFileInput: widget.billAttachmentFileInput,
        receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
        billRevisionRepository: widget.billRevisionRepository,
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
    final overview = _overview;
    final overviewFailure = _overviewFailure;

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
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxWidth = constraints.maxWidth >= 560 ? 480.0 : 680.0;

            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              child: Center(
                child: ConstrainedBox(
                  key: const Key('server-shell-dashboard-surface'),
                  constraints: BoxConstraints(maxWidth: maxWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _DashboardHero(
                        currentUser: currentUser,
                        defaultCurrency: defaultCurrency,
                        overview: overview,
                        isLoadingOverview: _isLoadingOverview,
                        onRefresh: _loadOverview,
                        onOpenProfile: _openProfile,
                        onOpenNotifications: _openNotifications,
                      ),
                      if (overview != null) ...[
                        const SizedBox(height: 16),
                        _DashboardSummaryCards(overview: overview),
                      ],
                      const SizedBox(height: 16),
                      _DashboardQuickActions(
                        onCreatePersonalBill: _openCreatePersonalBill,
                        onCreateGroup: _openCreateGroup,
                      ),
                      const SizedBox(height: 16),
                      if (_isLoadingOverview && overview == null)
                        const _DashboardLoadingCard()
                      else if (overviewFailure != null && overview == null)
                        _DashboardErrorCard(
                          failure: overviewFailure,
                          onRetry: _loadOverview,
                        )
                      else if (overview != null) ...[
                        if (_isLoadingOverview)
                          const _DashboardRefreshIndicator(),
                        if (overviewFailure != null)
                          _DashboardInlineErrorCard(
                            failure: overviewFailure,
                            onRetry: _loadOverview,
                          ),
                        _DashboardOverviewContent(
                          overview: overview,
                          billSyncSnapshot: _billSyncSnapshot,
                          isFlushingBillSync: _isFlushingBillSync,
                          onOpenBills: _openBills,
                          onSyncNow: _flushBillSyncNow,
                          onOpenGroups: _openGroups,
                          onOpenSettlements: _openSettlements,
                          onOpenSettlementActions: _openSettlementActions,
                          onOpenRecurringBills: _openRecurringBills,
                          onOpenRecurringDrafts: _openRecurringDrafts,
                          onOpenNotifications: _openNotifications,
                        ),
                      ],
                      const SizedBox(height: 16),
                      _DashboardMoreSection(
                        onOpenProfile: _openProfile,
                        onOpenReceiptReviews: _openReceiptReviews,
                        onOpenSessions: _openSessions,
                        onOpenMonthlyReport: _openMonthlyReport,
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SettleoraDashboardOverview {
  const _SettleoraDashboardOverview({
    required this.personalBills,
    required this.notificationSummary,
    required this.settlementBalances,
    required this.settlementRequests,
    required this.recurringTemplates,
    required this.recurringForecast,
  });

  final List<SettleoraBillSummary> personalBills;
  final SettleoraNotificationSummary notificationSummary;
  final SettleoraSettlementBalanceSnapshot settlementBalances;
  final List<SettleoraSettlementRequest> settlementRequests;
  final List<SettleoraRecurringBillTemplateSummary> recurringTemplates;
  final List<SettleoraRecurringBillForecastOccurrence> recurringForecast;

  int get activePersonalBillCount =>
      personalBills.where((bill) => !bill.isArchived).length;

  int get settlementActionCount {
    return settlementRequests
        .where(
          (request) =>
              request.status ==
                  SettleoraSettlementRequestStatusValues.requested ||
              request.status ==
                  SettleoraSettlementRequestStatusValues.partiallyPaid ||
              request.status ==
                  SettleoraSettlementRequestStatusValues.markedPaid,
        )
        .length;
  }

  int get openBalanceCount => settlementBalances.balances
      .where(
        (balance) =>
            _amountStringLooksNonZero(balance.remainingUnclaimedAmount),
      )
      .length;

  int get activeRecurringTemplateCount => recurringTemplates
      .where(
        (template) =>
            template.status ==
            SettleoraRecurringBillTemplateStatusValues.active,
      )
      .length;

  int get upcomingForecastCount => recurringForecast
      .where((occurrence) => occurrence.canGenerateDraft)
      .length;

  bool get isEmpty =>
      personalBills.isEmpty &&
      notificationSummary.unreadCount == 0 &&
      notificationSummary.attentionCount == 0 &&
      notificationSummary.urgentCount == 0 &&
      settlementBalances.balances.isEmpty &&
      settlementRequests.isEmpty &&
      recurringTemplates.isEmpty &&
      recurringForecast.isEmpty;
}

class _SettleoraDashboardFailure {
  const _SettleoraDashboardFailure({
    required this.title,
    required this.message,
  });

  factory _SettleoraDashboardFailure.from(Object error) {
    if (error is SettleoraBillFailure) {
      return _SettleoraDashboardFailure(
        title: error.title,
        message: error.message,
      );
    }
    if (error is SettleoraNotificationFailure) {
      return _SettleoraDashboardFailure(
        title: error.title,
        message: error.message,
      );
    }
    if (error is SettleoraSettlementFailure) {
      return _SettleoraDashboardFailure(
        title: error.title,
        message: error.message,
      );
    }
    if (error is SettleoraRecurringBillFailure) {
      return _SettleoraDashboardFailure(
        title: error.title,
        message: error.message,
      );
    }

    return const _SettleoraDashboardFailure(
      title: 'Overview unavailable',
      message: 'Open a section below, or retry when the server is reachable.',
    );
  }

  final String title;
  final String message;
}

class _DashboardHero extends StatelessWidget {
  const _DashboardHero({
    required this.currentUser,
    required this.defaultCurrency,
    required this.overview,
    required this.isLoadingOverview,
    required this.onRefresh,
    required this.onOpenProfile,
    required this.onOpenNotifications,
  });

  final SettleoraCurrentUser currentUser;
  final String? defaultCurrency;
  final _SettleoraDashboardOverview? overview;
  final bool isLoadingOverview;
  final Future<void> Function() onRefresh;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenNotifications;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final overview = this.overview;
    final attentionCount = overview == null
        ? 0
        : overview.settlementActionCount +
              overview.upcomingForecastCount +
              overview.notificationSummary.attentionCount +
              overview.notificationSummary.urgentCount;

    return LayoutBuilder(
      builder: (context, constraints) {
        final isCompact = constraints.maxWidth < 460;

        return Container(
          key: const Key('server-shell-current-user'),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (isCompact) ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      backgroundColor: theme.colorScheme.onPrimaryContainer,
                      foregroundColor: theme.colorScheme.primaryContainer,
                      child: const Icon(Icons.person_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _DashboardHeroTitle(
                  currentUser: currentUser,
                  defaultCurrency: defaultCurrency,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    IconButton(
                      key: const Key('dashboard-overview-refresh'),
                      tooltip: 'Refresh overview',
                      onPressed: isLoadingOverview ? null : onRefresh,
                      icon: isLoadingOverview
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.refresh),
                    ),
                    IconButton(
                      key: const Key('server-shell-notifications-header'),
                      tooltip: 'Notifications',
                      onPressed: onOpenNotifications,
                      icon: const Icon(Icons.notifications_outlined),
                    ),
                    IconButton(
                      key: const Key('server-shell-profile'),
                      tooltip: 'Profile',
                      onPressed: onOpenProfile,
                      icon: const Icon(Icons.account_circle_outlined),
                    ),
                  ],
                ),
              ] else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      backgroundColor: theme.colorScheme.onPrimaryContainer,
                      foregroundColor: theme.colorScheme.primaryContainer,
                      child: const Icon(Icons.person_outline),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _DashboardHeroTitle(
                        currentUser: currentUser,
                        defaultCurrency: defaultCurrency,
                      ),
                    ),
                    IconButton(
                      key: const Key('dashboard-overview-refresh'),
                      tooltip: 'Refresh overview',
                      onPressed: isLoadingOverview ? null : onRefresh,
                      icon: isLoadingOverview
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.refresh),
                    ),
                    IconButton(
                      key: const Key('server-shell-notifications-header'),
                      tooltip: 'Notifications',
                      onPressed: onOpenNotifications,
                      icon: const Icon(Icons.notifications_outlined),
                    ),
                    IconButton(
                      key: const Key('server-shell-profile'),
                      tooltip: 'Profile',
                      onPressed: onOpenProfile,
                      icon: const Icon(Icons.account_circle_outlined),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _DashboardMetricChip(
                    icon: Icons.priority_high_outlined,
                    label: attentionCount == 0
                        ? 'No urgent items'
                        : '$attentionCount item${_plural(attentionCount)} to review',
                  ),
                  _DashboardMetricChip(
                    icon: Icons.receipt_long_outlined,
                    label: overview == null
                        ? 'Bills loading'
                        : '${overview.activePersonalBillCount} active bill${_plural(overview.activePersonalBillCount)}',
                  ),
                  _DashboardMetricChip(
                    icon: Icons.notifications_outlined,
                    label: overview == null
                        ? 'Activity loading'
                        : '${overview.notificationSummary.unreadCount} unread',
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DashboardSummaryCards extends StatelessWidget {
  const _DashboardSummaryCards({required this.overview});

  final _SettleoraDashboardOverview overview;

  @override
  Widget build(BuildContext context) {
    final attentionCount =
        overview.settlementActionCount +
        overview.upcomingForecastCount +
        overview.notificationSummary.attentionCount +
        overview.notificationSummary.urgentCount;
    final cards = [
      _DashboardSummaryCard(
        icon: Icons.priority_high_outlined,
        title: 'Attention',
        value: attentionCount == 0 ? '0 due' : '$attentionCount to review',
        caption: attentionCount == 0
            ? 'No urgent dashboard items'
            : 'Open the attention queue',
      ),
      _DashboardSummaryCard(
        icon: Icons.account_balance_wallet_outlined,
        title: 'Balances',
        value: overview.openBalanceCount == 0
            ? 'No balances yet'
            : '${overview.openBalanceCount} open',
        caption: overview.activePersonalBillCount == 0
            ? 'Create or review bills'
            : '${overview.activePersonalBillCount} active bill${_plural(overview.activePersonalBillCount)}',
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 380) {
          return Row(
            children: [
              Expanded(child: cards.first),
              const SizedBox(width: 12),
              Expanded(child: cards.last),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [cards.first, const SizedBox(height: 8), cards.last],
        );
      },
    );
  }
}

class _DashboardSummaryCard extends StatelessWidget {
  const _DashboardSummaryCard({
    required this.icon,
    required this.title,
    required this.value,
    required this.caption,
  });

  final IconData icon;
  final String title;
  final String value;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20),
                const SizedBox(width: 8),
                Expanded(child: Text(title, style: theme.textTheme.labelLarge)),
              ],
            ),
            const SizedBox(height: 10),
            Text(value, style: theme.textTheme.titleLarge),
            const SizedBox(height: 2),
            Text(caption, style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _DashboardHeroTitle extends StatelessWidget {
  const _DashboardHeroTitle({
    required this.currentUser,
    required this.defaultCurrency,
  });

  final SettleoraCurrentUser currentUser;
  final String? defaultCurrency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Today', style: theme.textTheme.labelLarge),
        const SizedBox(height: 4),
        Text(
          'Welcome back, ${currentUser.displayName}',
          style: theme.textTheme.headlineSmall,
        ),
        const SizedBox(height: 4),
        Text(
          defaultCurrency == null
              ? 'Signed in'
              : 'Signed in - $defaultCurrency',
        ),
      ],
    );
  }
}

class _DashboardMetricChip extends StatelessWidget {
  const _DashboardMetricChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 220),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18),
            const SizedBox(width: 6),
            Flexible(child: Text(label)),
          ],
        ),
      ),
    );
  }
}

class _DashboardQuickActions extends StatelessWidget {
  const _DashboardQuickActions({
    required this.onCreatePersonalBill,
    required this.onCreateGroup,
  });

  final VoidCallback onCreatePersonalBill;
  final VoidCallback onCreateGroup;

  @override
  Widget build(BuildContext context) {
    return _DashboardSection(
      title: 'Quick actions',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth >= 620;
          final buttons = [
            FilledButton.icon(
              key: const Key('server-shell-create-personal-bill'),
              onPressed: onCreatePersonalBill,
              icon: const Icon(Icons.add),
              label: const Text('Create bill'),
            ),
            FilledButton.tonalIcon(
              key: const Key('server-shell-create-group'),
              onPressed: onCreateGroup,
              icon: const Icon(Icons.group_add_outlined),
              label: const Text('Create group'),
            ),
          ];

          if (isWide) {
            return Row(
              children: [
                for (var index = 0; index < buttons.length; index += 1) ...[
                  if (index > 0) const SizedBox(width: 12),
                  Expanded(child: buttons[index]),
                ],
              ],
            );
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [buttons.first, const SizedBox(height: 8), buttons.last],
          );
        },
      ),
    );
  }
}

class _DashboardMoreSection extends StatelessWidget {
  const _DashboardMoreSection({
    required this.onOpenProfile,
    required this.onOpenReceiptReviews,
    required this.onOpenSessions,
    required this.onOpenMonthlyReport,
  });

  final VoidCallback onOpenProfile;
  final VoidCallback onOpenReceiptReviews;
  final VoidCallback onOpenSessions;
  final VoidCallback onOpenMonthlyReport;

  @override
  Widget build(BuildContext context) {
    return _DashboardSection(
      title: 'More',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth >= 380
              ? (constraints.maxWidth - 8) / 2
              : constraints.maxWidth;
          final items = [
            _DashboardCompactAction(
              width: width,
              icon: Icons.account_circle_outlined,
              title: 'Profile',
              onTap: onOpenProfile,
            ),
            _DashboardCompactAction(
              key: const Key('server-shell-receipt-reviews'),
              width: width,
              icon: Icons.receipt_long_outlined,
              title: 'Receipt Reviews',
              onTap: onOpenReceiptReviews,
            ),
            _DashboardCompactAction(
              key: const Key('server-shell-sessions'),
              width: width,
              icon: Icons.devices_outlined,
              title: 'Sessions',
              onTap: onOpenSessions,
            ),
            _DashboardCompactAction(
              key: const Key('server-shell-reports'),
              width: width,
              icon: Icons.summarize_outlined,
              title: 'Monthly report',
              onTap: onOpenMonthlyReport,
            ),
          ];

          return Wrap(spacing: 8, runSpacing: 8, children: items);
        },
      ),
    );
  }
}

class _DashboardCompactAction extends StatelessWidget {
  const _DashboardCompactAction({
    super.key,
    required this.width,
    required this.icon,
    required this.title,
    required this.onTap,
  });

  final double width;
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon),
        label: Text(title, overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

class _DashboardSection extends StatelessWidget {
  const _DashboardSection({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

class _DashboardLoadingCard extends StatelessWidget {
  const _DashboardLoadingCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: ListTile(
        leading: SizedBox.square(
          dimension: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        title: Text('Loading dashboard overview'),
      ),
    );
  }
}

class _DashboardErrorCard extends StatelessWidget {
  const _DashboardErrorCard({required this.failure, required this.onRetry});

  final _SettleoraDashboardFailure failure;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(failure.title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(failure.message),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              key: const Key('dashboard-overview-retry'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardRefreshIndicator extends StatelessWidget {
  const _DashboardRefreshIndicator();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox.square(
            dimension: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 8),
          Text('Refreshing overview'),
        ],
      ),
    );
  }
}

class _DashboardInlineErrorCard extends StatelessWidget {
  const _DashboardInlineErrorCard({
    required this.failure,
    required this.onRetry,
  });

  final _SettleoraDashboardFailure failure;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            const Icon(Icons.info_outline),
            const SizedBox(width: 12),
            Expanded(child: Text('${failure.title}. Showing last overview.')),
            TextButton(
              key: const Key('dashboard-overview-inline-retry'),
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardOverviewContent extends StatelessWidget {
  const _DashboardOverviewContent({
    required this.overview,
    required this.billSyncSnapshot,
    required this.isFlushingBillSync,
    required this.onOpenBills,
    required this.onSyncNow,
    required this.onOpenGroups,
    required this.onOpenSettlements,
    required this.onOpenSettlementActions,
    required this.onOpenRecurringBills,
    required this.onOpenRecurringDrafts,
    required this.onOpenNotifications,
  });

  final _SettleoraDashboardOverview overview;
  final SettleoraBillSyncSnapshot? billSyncSnapshot;
  final bool isFlushingBillSync;
  final VoidCallback onOpenBills;
  final VoidCallback onSyncNow;
  final VoidCallback onOpenGroups;
  final VoidCallback onOpenSettlements;
  final VoidCallback onOpenSettlementActions;
  final VoidCallback onOpenRecurringBills;
  final VoidCallback onOpenRecurringDrafts;
  final VoidCallback onOpenNotifications;

  @override
  Widget build(BuildContext context) {
    final needsAttention = Column(
      children: [
        if (overview.isEmpty) ...[
          const _DashboardEmptyCard(),
          const SizedBox(height: 8),
        ],
        _DashboardSyncStatusCard(
          snapshot: billSyncSnapshot,
          isFlushing: isFlushingBillSync,
          onOpenBills: onOpenBills,
          onSyncNow: onSyncNow,
        ),
        if (overview.settlementActionCount > 0)
          _DashboardSettlementActionsCard(
            count: overview.settlementActionCount,
            onTap: onOpenSettlementActions,
          ),
        if (overview.upcomingForecastCount > 0)
          _DashboardRecurringDraftsAction(
            count: overview.upcomingForecastCount,
            onTap: onOpenRecurringDrafts,
          ),
        if (!overview.isEmpty &&
            overview.settlementActionCount == 0 &&
            overview.upcomingForecastCount == 0 &&
            overview.notificationSummary.attentionCount == 0 &&
            overview.notificationSummary.urgentCount == 0)
          const _DashboardCalmCard(),
      ],
    );

    final upcomingBills = Column(
      children: [
        _DashboardNavigationTile(
          key: const Key('server-shell-bills'),
          icon: Icons.list_alt_outlined,
          title: 'Personal bills',
          subtitle: overview.activePersonalBillCount == 0
              ? 'Open bills to create or review personal records'
              : '${overview.activePersonalBillCount} recent active bill${_plural(overview.activePersonalBillCount)}',
          detail: overview.personalBills.isEmpty
              ? null
              : 'Latest: ${overview.personalBills.first.displayName}',
          onTap: onOpenBills,
        ),
        _DashboardNavigationTile(
          key: const Key('server-shell-recurring-bills'),
          icon: Icons.event_repeat_outlined,
          title: 'Recurring bills',
          subtitle: overview.upcomingForecastCount == 0
              ? 'Review templates and forecast'
              : '${overview.upcomingForecastCount} forecast item${_plural(overview.upcomingForecastCount)} ready for draft review',
          detail: overview.activeRecurringTemplateCount == 0
              ? null
              : '${overview.activeRecurringTemplateCount} active template${_plural(overview.activeRecurringTemplateCount)} loaded',
          onTap: onOpenRecurringBills,
        ),
      ],
    );

    final groupActivity = Column(
      children: [
        _DashboardNavigationTile(
          key: const Key('server-shell-groups'),
          icon: Icons.groups_outlined,
          title: 'Shared bills',
          subtitle: 'Open groups to review shared bills and group activity',
          onTap: onOpenGroups,
        ),
        _DashboardNavigationTile(
          key: const Key('server-shell-notifications'),
          icon: Icons.notifications_outlined,
          title: 'Notifications',
          subtitle: overview.notificationSummary.unreadCount == 0
              ? 'Open notifications for recent activity'
              : '${overview.notificationSummary.unreadCount} unread notification${_plural(overview.notificationSummary.unreadCount)}',
          detail:
              overview.notificationSummary.attentionCount == 0 &&
                  overview.notificationSummary.urgentCount == 0
              ? null
              : '${overview.notificationSummary.attentionCount} attention, ${overview.notificationSummary.urgentCount} urgent',
          onTap: onOpenNotifications,
        ),
      ],
    );

    final thisMonth = Column(
      children: [
        _DashboardNavigationTile(
          key: const Key('server-shell-settlements'),
          icon: Icons.handshake_outlined,
          title: 'Settlements',
          subtitle: overview.settlementActionCount == 0
              ? 'Review balances and requests'
              : '${overview.settlementActionCount} request${_plural(overview.settlementActionCount)} may need review',
          detail: overview.openBalanceCount == 0
              ? null
              : '${overview.openBalanceCount} open balance row${_plural(overview.openBalanceCount)}',
          onTap: onOpenSettlements,
        ),
      ],
    );

    return Column(
      children: [
        _DashboardSection(title: 'Needs attention', child: needsAttention),
        const SizedBox(height: 16),
        _DashboardSection(title: 'Upcoming bills', child: upcomingBills),
        const SizedBox(height: 16),
        _DashboardSection(title: 'Group activity', child: groupActivity),
        const SizedBox(height: 16),
        _DashboardSection(title: 'This month', child: thisMonth),
      ],
    );
  }
}

class _DashboardEmptyCard extends StatelessWidget {
  const _DashboardEmptyCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: ListTile(
        leading: Icon(Icons.inbox_outlined),
        title: Text(
          'No overview items yet. Open a section below to create or review Day 1 records.',
        ),
      ),
    );
  }
}

class _DashboardCalmCard extends StatelessWidget {
  const _DashboardCalmCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: ListTile(
        leading: Icon(Icons.check_circle_outline),
        title: Text(
          'Nothing urgent right now. Check recent activity or start a new bill when you are ready.',
        ),
      ),
    );
  }
}

class _DashboardSyncStatusCard extends StatelessWidget {
  const _DashboardSyncStatusCard({
    required this.snapshot,
    required this.isFlushing,
    required this.onOpenBills,
    required this.onSyncNow,
  });

  final SettleoraBillSyncSnapshot? snapshot;
  final bool isFlushing;
  final VoidCallback onOpenBills;
  final VoidCallback onSyncNow;

  @override
  Widget build(BuildContext context) {
    final snapshot = this.snapshot;
    if (snapshot == null || !_shouldShow(snapshot)) {
      return const SizedBox.shrink();
    }

    final needsAttention =
        snapshot.failedCount > 0 || snapshot.conflictCount > 0;
    final title = needsAttention ? 'Sync needs attention' : 'Sync pending';
    final queuedOrPendingCount = snapshot.queuedCount + snapshot.syncingCount;
    final countParts = <String>[
      if (queuedOrPendingCount > 0)
        '$queuedOrPendingCount pending${_plural(queuedOrPendingCount)}',
      if (snapshot.failedCount > 0)
        '${snapshot.failedCount} failed${_plural(snapshot.failedCount)}',
      if (snapshot.conflictCount > 0)
        '${snapshot.conflictCount} conflict${_plural(snapshot.conflictCount)}',
    ];
    final canRetry = snapshot.pendingCount > 0;

    return Card(
      key: const Key('server-shell-sync-status-card'),
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              needsAttention
                  ? Icons.sync_problem_outlined
                  : Icons.sync_outlined,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  if (countParts.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(countParts.join(' - ')),
                  ],
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (canRetry) ...[
                  FilledButton.tonalIcon(
                    key: const Key('server-shell-sync-now'),
                    onPressed: isFlushing ? null : onSyncNow,
                    icon: isFlushing
                        ? const SizedBox.square(
                            key: Key('server-shell-sync-now-progress'),
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.sync),
                    label: Text(isFlushing ? 'Syncing' : 'Sync now'),
                  ),
                  const SizedBox(height: 4),
                ],
                TextButton(
                  key: const Key('server-shell-sync-status-open-bills'),
                  onPressed: onOpenBills,
                  child: const Text('Review in Bills'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  bool _shouldShow(SettleoraBillSyncSnapshot snapshot) {
    return snapshot.queuedCount > 0 ||
        snapshot.pendingCount > 0 ||
        snapshot.syncingCount > 0 ||
        snapshot.failedCount > 0 ||
        snapshot.conflictCount > 0;
  }
}

class _DashboardSettlementActionsCard extends StatelessWidget {
  const _DashboardSettlementActionsCard({
    required this.count,
    required this.onTap,
  });

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('server-shell-settlement-actions'),
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.rule_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Review settlement actions',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  Text('$count request${_plural(count)} may need review'),
                ],
              ),
            ),
            TextButton(
              key: const Key('server-shell-settlement-actions-review'),
              onPressed: onTap,
              child: const Text('Review'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardRecurringDraftsAction extends StatelessWidget {
  const _DashboardRecurringDraftsAction({
    required this.count,
    required this.onTap,
  });

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('server-shell-recurring-drafts-action'),
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.note_add_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Recurring drafts ready',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$count forecast item${_plural(count)} ready for draft review',
                  ),
                ],
              ),
            ),
            TextButton(
              key: const Key('server-shell-recurring-drafts-review'),
              onPressed: onTap,
              child: const Text('Review drafts'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardNavigationTile extends StatelessWidget {
  const _DashboardNavigationTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.detail,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String? detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final detail = this.detail;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(detail == null ? subtitle : '$subtitle\n$detail'),
        isThreeLine: detail != null,
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

String _plural(int count) => count == 1 ? '' : 's';

String _billSyncFlushMessage(SettleoraSyncQueueFlushResult result) {
  if (result.processedCount == 0) {
    return 'No pending sync changes.';
  }

  return 'Sync complete: ${result.syncedCount} synced, ${result.failedCount} failed, ${result.conflictCount} conflict${_plural(result.conflictCount)}.';
}

bool _amountStringLooksNonZero(String value) {
  final normalized = value.trim().replaceAll('-', '').replaceAll('.', '');
  return normalized.runes.any((codeUnit) => codeUnit >= 49 && codeUnit <= 57);
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
