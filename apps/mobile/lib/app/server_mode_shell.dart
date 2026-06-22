import 'dart:async';

import 'package:flutter/material.dart';

import '../api/settleora_api_client.dart';
import '../bills/bill_attachment_file_input.dart';
import '../bills/bill_attachment_repository.dart';
import '../bills/bill_revision_repository.dart';
import '../bills/bill_list_screen.dart';
import '../bills/bill_repository.dart';
import '../bills/bill_sync_controller.dart';
import '../future_bills/future_bill_repository.dart';
import '../groups/group_list_screen.dart';
import '../groups/group_repository.dart';
import '../manual_finance/manual_finance_repository.dart';
import '../manual_finance/manual_finance_screen.dart';
import '../notifications/notification_preferences.dart';
import '../notifications/notification_repository.dart';
import '../notifications/notification_screen.dart';
import '../profile/profile_repository.dart';
import '../profile/profile_screen.dart';
import '../receipt_ocr_capture/receipt_image_intake.dart';
import '../receipt_ocr_capture/receipt_ocr_provider.dart';
import '../receipt_ocr_capture/unsupported_receipt_ocr_provider.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_screen.dart';
import '../recurring_bills/recurring_bill_repository.dart';
import '../recurring_bills/recurring_bill_screen.dart';
import '../reports/monthly_report_screen.dart';
import '../reports/report_repository.dart';
import '../settlements/settlement_list_screen.dart';
import '../settlements/settlement_repository.dart';
import '../sync/sync_queue_processor.dart';
import '../ui/settleora_components.dart';
import '../ui/settleora_theme.dart';
import 'auth_session_repository.dart';
import 'local_data_backup.dart';

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
    this.receiptImageIntake,
    this.receiptOcrProvider = const UnsupportedReceiptOcrProvider(),
    this.billRevisionRepository,
    required this.settlementRepository,
    required this.recurringBillRepository,
    this.futureBillRepository,
    required this.groupRepository,
    this.manualFinanceRepository,
    required this.notificationRepository,
    required this.reportRepository,
    required this.profileRepository,
    required this.billSyncController,
    this.dataBackupService,
    required this.authRepository,
    required this.accessTokenProvider,
    required this.onSessionEnded,
  });

  final SettleoraCurrentUser currentUser;
  final ReceiptOcrReviewRepository receiptOcrReviewRepository;
  final SettleoraBillRepository billRepository;
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
  final ReceiptImageIntake? receiptImageIntake;
  final ReceiptOcrProvider receiptOcrProvider;
  final SettleoraBillRevisionRepository? billRevisionRepository;
  final SettleoraSettlementRepository settlementRepository;
  final SettleoraRecurringBillRepository recurringBillRepository;
  final SettleoraFutureBillRepository? futureBillRepository;
  final SettleoraGroupRepository groupRepository;
  final SettleoraManualFinanceRepository? manualFinanceRepository;
  final SettleoraNotificationRepository notificationRepository;
  final SettleoraMonthlyReportRepository reportRepository;
  final SettleoraProfileRepository profileRepository;
  final SettleoraBillSyncController billSyncController;
  final SettleoraLocalDataBackupService? dataBackupService;
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
  bool _isConfirmingSignOut = false;
  bool _isLoadingOverview = true;
  bool _isFlushingBillSync = false;
  Future<void>? _overviewLoadFuture;
  _SettleoraDashboardOverview? _overview;
  _SettleoraDashboardFailure? _overviewFailure;
  SettleoraBillSyncSnapshot? _billSyncSnapshot;
  SettleoraLocalDataBackupExport? _latestBackupExport;
  int _overviewLoadVersion = 0;
  SettleoraNavDestination _selectedDestination = SettleoraNavDestination.home;
  bool _isBuildingBackup = false;
  SettleoraNotificationPreferenceSettings _notificationPreferences =
      SettleoraNotificationPreferenceSettings.defaults();

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

  Future<void> _openTopLevelDestination(
    SettleoraNavDestination destination,
  ) async {
    _selectTopLevelDestination(destination);
  }

  void _selectTopLevelDestination(SettleoraNavDestination destination) {
    if (_selectedDestination == destination) {
      return;
    }

    setState(() {
      _selectedDestination = destination;
    });

    if (destination == SettleoraNavDestination.home) {
      unawaited(_loadOverview());
    }
  }

  void _openNestedTopLevelDestination(SettleoraNavDestination destination) {
    Navigator.of(context).popUntil((route) => route.isFirst);
    _selectTopLevelDestination(destination);
  }

  void _setNotificationPreferences(
    SettleoraNotificationPreferenceSettings preferences,
  ) {
    setState(() {
      _notificationPreferences = preferences;
    });
  }

  Widget _buildBillsScreen(BuildContext context) {
    return SettleoraBillListScreen(
      repository: widget.billRepository,
      syncController: widget.billSyncController,
      attachmentRepository: widget.billAttachmentRepository,
      attachmentFileInput: widget.billAttachmentFileInput,
      receiptImageIntake: widget.receiptImageIntake,
      receiptOcrProvider: widget.receiptOcrProvider,
      receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
      revisionRepository: widget.billRevisionRepository,
      defaultCurrency: widget.currentUser.defaultCurrency,
      showBottomNav: false,
      onTopLevelDestinationSelected: _openNestedTopLevelDestination,
    );
  }

  Widget _buildGroupsScreen(BuildContext context) {
    return SettleoraGroupListScreen(
      repository: widget.groupRepository,
      billRepository: widget.billRepository,
      currentUserProfileId: widget.currentUser.userProfileId,
      defaultCurrency: widget.currentUser.defaultCurrency,
      billAttachmentRepository: widget.billAttachmentRepository,
      billAttachmentFileInput: widget.billAttachmentFileInput,
      receiptImageIntake: widget.receiptImageIntake,
      receiptOcrProvider: widget.receiptOcrProvider,
      receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
      billRevisionRepository: widget.billRevisionRepository,
      onTopLevelDestinationSelected: _openNestedTopLevelDestination,
    );
  }

  Widget _buildSettlementsScreen(BuildContext context) {
    return SettleoraSettlementListScreen(
      repository: widget.settlementRepository,
      currentUserProfileId: widget.currentUser.userProfileId,
    );
  }

  Widget _buildProfileScreen(BuildContext context) {
    return SettleoraProfileScreen(
      repository: widget.profileRepository,
      currentUser: widget.currentUser,
      onSessionEnded: widget.onSessionEnded,
    );
  }

  Widget _buildReceiptReviewsScreen(BuildContext context) {
    return ReceiptOcrReviewQueueScreen(
      repository: widget.receiptOcrReviewRepository,
    );
  }

  Future<void> _openBills() async {
    await _openTopLevelDestination(SettleoraNavDestination.bills);
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
          receiptImageIntake: widget.receiptImageIntake,
          receiptOcrProvider: widget.receiptOcrProvider,
          defaultCurrency: widget.currentUser.defaultCurrency,
        ),
      ),
    );

    if (!mounted || createdBill == null) {
      return;
    }

    await _loadOverview();
  }

  Future<void> _openCreateBillChooser() async {
    final choice = await showModalBottomSheet<_CreateBillChoice>(
      context: context,
      showDragHandle: true,
      builder: (context) => const _CreateBillChooserSheet(),
    );

    if (!mounted || choice == null) {
      return;
    }

    switch (choice) {
      case _CreateBillChoice.personal:
        await _openCreatePersonalBill();
      case _CreateBillChoice.group:
        await _openCreateGroupBillFlow();
    }
  }

  Future<void> _openProfile() async {
    await _openDashboardDestination(_buildProfileScreen);
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
        preferences: _notificationPreferences,
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

  Future<void> _openManualFinance() async {
    final repository = widget.manualFinanceRepository;
    if (repository == null) {
      _showSnackBar('Accounts and income are unavailable in this build.');
      return;
    }

    await _openDashboardDestination(
      (_) => SettleoraManualFinanceScreen(
        repository: repository,
        defaultCurrency: widget.currentUser.defaultCurrency,
      ),
    );
  }

  Future<void> _openReceiptReviews() async {
    await _openDashboardDestination(_buildReceiptReviewsScreen);
  }

  Future<void> _openSettlements() async {
    await _openTopLevelDestination(SettleoraNavDestination.settle);
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
        futureBillRepository: widget.futureBillRepository,
        groupRepository: widget.groupRepository,
      ),
    );
  }

  Future<void> _openRecurringDrafts() async {
    await _openDashboardDestination(
      (_) => SettleoraRecurringBillScreen(
        repository: widget.recurringBillRepository,
        futureBillRepository: widget.futureBillRepository,
        groupRepository: widget.groupRepository,
        openNeedsDraftOnStart: true,
      ),
    );
  }

  Future<void> _openGroups() async {
    await _openTopLevelDestination(SettleoraNavDestination.groups);
  }

  Future<void> _openCreateGroupBillFlow() async {
    await _openDashboardDestination(
      (_) => SettleoraGroupListScreen(
        repository: widget.groupRepository,
        billRepository: widget.billRepository,
        openGroupBillCreateOnPick: true,
        currentUserProfileId: widget.currentUser.userProfileId,
        defaultCurrency: widget.currentUser.defaultCurrency,
        billAttachmentRepository: widget.billAttachmentRepository,
        billAttachmentFileInput: widget.billAttachmentFileInput,
        receiptImageIntake: widget.receiptImageIntake,
        receiptOcrProvider: widget.receiptOcrProvider,
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
        defaultCurrency: widget.currentUser.defaultCurrency,
        billAttachmentRepository: widget.billAttachmentRepository,
        billAttachmentFileInput: widget.billAttachmentFileInput,
        receiptImageIntake: widget.receiptImageIntake,
        receiptOcrProvider: widget.receiptOcrProvider,
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

  Future<void> _buildLocalBackupExport() async {
    if (_isBuildingBackup) {
      return;
    }

    setState(() {
      _isBuildingBackup = true;
    });

    try {
      final service = widget.dataBackupService;
      if (service == null) {
        _showSnackBar('Backup export is unavailable in this build.');
        return;
      }

      final export = await service.buildExport(currentUser: widget.currentUser);
      if (!mounted) {
        return;
      }

      setState(() {
        _latestBackupExport = export;
      });
      _showSnackBar(
        'Backup JSON generated. Save it manually; file sharing is not wired in this build.',
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      _showSnackBar('Backup export is unavailable right now.');
    } finally {
      if (mounted) {
        setState(() {
          _isBuildingBackup = false;
        });
      }
    }
  }

  Future<void> _openImportPreview() async {
    await showDialog<void>(
      context: context,
      builder: (context) =>
          _DataBackupImportPreviewDialog(service: widget.dataBackupService),
    );
  }

  Future<void> _signOutCurrentSession() async {
    if (_isSigningOut || _isConfirmingSignOut) {
      return;
    }

    setState(() {
      _isConfirmingSignOut = true;
    });

    final confirmed = await _confirmCurrentSignOut();
    if (!mounted) {
      return;
    }

    setState(() {
      _isConfirmingSignOut = false;
    });

    if (!confirmed) {
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
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Text(failure.title),
        content: const Text(
          'The server could not confirm current-session sign-out. Clear local session material on this device only? Server-side session revocation was not confirmed, so you may need to sign out from another device after connectivity returns.',
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

  Future<bool> _confirmCurrentSignOut() async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Sign out this device?'),
        content: const Text(
          'Normal sign-out asks the server to end the current session before this device clears its saved session material.',
        ),
        actions: [
          TextButton(
            key: const Key('sign-out-current-cancel'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('sign-out-current-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign Out'),
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
    final isHome = _selectedDestination == SettleoraNavDestination.home;

    return Scaffold(
      appBar: isHome
          ? AppBar(
              title: const Text('Settleora'),
              actions: [
                IconButton(
                  key: const Key('server-shell-sign-out'),
                  tooltip: 'Sign out',
                  onPressed: (_isSigningOut || _isConfirmingSignOut)
                      ? null
                      : _signOutCurrentSession,
                  icon: _isSigningOut
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.logout_outlined),
                ),
              ],
            )
          : null,
      body: isHome
          ? SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final maxWidth = constraints.maxWidth >= 560
                      ? 430.0
                      : double.infinity;

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
                              _DashboardSummaryCards(
                                overview: overview,
                                defaultCurrency: defaultCurrency,
                              ),
                            ],
                            const SizedBox(height: 16),
                            _DashboardQuickActions(
                              onCreateBill: _openCreateBillChooser,
                              onCreateGroup: _openCreateGroup,
                            ),
                            const SizedBox(height: 16),
                            if (_isLoadingOverview && overview == null)
                              const _DashboardLoadingCard()
                            else if (overviewFailure != null &&
                                overview == null)
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
                            _DashboardMorePrompt(
                              onOpenMore: () => _openTopLevelDestination(
                                SettleoraNavDestination.more,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            )
          : _buildSelectedTopLevelBody(context),
      bottomNavigationBar: _ServerShellBottomNavigation(
        selected: _selectedDestination,
        onDestinationSelected: _selectTopLevelDestination,
      ),
    );
  }

  Widget _buildSelectedTopLevelBody(BuildContext context) {
    return switch (_selectedDestination) {
      SettleoraNavDestination.home => const SizedBox.shrink(),
      SettleoraNavDestination.bills => _buildBillsScreen(context),
      SettleoraNavDestination.groups => _buildGroupsScreen(context),
      SettleoraNavDestination.settle => _buildSettlementsScreen(context),
      SettleoraNavDestination.more => _buildMoreScreen(context),
    };
  }

  Widget _buildMoreScreen(BuildContext context) {
    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final maxWidth = constraints.maxWidth >= 560
              ? 430.0
              : double.infinity;

          return ListView(
            key: const Key('server-shell-more-hub'),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: maxWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _MoreHubHeader(currentUser: widget.currentUser),
                      const SizedBox(height: 16),
                      _MoreHubSection(
                        title: 'Account',
                        children: [
                          SettingsRow(
                            key: const Key('server-shell-more-profile'),
                            icon: Icons.account_circle_outlined,
                            title: 'Profile and account',
                            subtitle:
                                'Name, email, default currency, language, and account details.',
                            statusLabel: widget.currentUser.defaultCurrency,
                            statusVariant: StatusChipVariant.info,
                            onTap: _openProfile,
                          ),
                          SettingsRow(
                            key: const Key('server-shell-more-payment-details'),
                            icon: Icons.payments_outlined,
                            title: 'Payment details',
                            subtitle:
                                'Payment profile and QR details currently open from the account screen.',
                            statusLabel: 'In profile',
                            onTap: _openProfile,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _MoreHubSection(
                        title: 'Security and privacy',
                        children: [
                          SettingsRow(
                            key: const Key('server-shell-sessions'),
                            icon: Icons.devices_outlined,
                            title: 'Sessions and devices',
                            subtitle:
                                'Review active sessions, revoke another session, or sign out all sessions.',
                            statusLabel: 'Server',
                            statusVariant: StatusChipVariant.warning,
                            onTap: _openSessions,
                          ),
                          const SettingsRow(
                            key: Key('server-shell-more-privacy-readout'),
                            icon: Icons.privacy_tip_outlined,
                            title: 'Privacy and security',
                            subtitle:
                                'Receipts, payment proof, exports, and payment details stay protected by server policy.',
                            statusLabel: 'Readout',
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _MoreHubSection(
                        title: 'Activity and records',
                        children: [
                          SettingsRow(
                            key: const Key('server-shell-more-notifications'),
                            icon: Icons.notifications_outlined,
                            title: 'Notifications',
                            subtitle:
                                'Open the notification center and review queue.',
                            onTap: _openNotifications,
                          ),
                          SettingsRow(
                            key: const Key('server-shell-receipt-reviews'),
                            icon: Icons.receipt_long_outlined,
                            title: 'Receipt reviews',
                            subtitle:
                                'Review saved OCR receipt work before it affects a bill.',
                            onTap: _openReceiptReviews,
                          ),
                          SettingsRow(
                            key: const Key('server-shell-reports'),
                            icon: Icons.summarize_outlined,
                            title: 'Monthly reports',
                            subtitle:
                                'Open the saved monthly summary for loaded report data.',
                            onTap: _openMonthlyReport,
                          ),
                          SettingsRow(
                            key: const Key('server-shell-manual-finance'),
                            icon: Icons.account_balance_wallet_outlined,
                            title: 'Accounts and income',
                            subtitle:
                                'Open manual account and income read/write surfaces when available.',
                            statusLabel: widget.manualFinanceRepository == null
                                ? 'Unavailable'
                                : null,
                            onTap: _openManualFinance,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _MoreHubSection(
                        title: 'Data and sync',
                        children: const [
                          SettingsRow(
                            key: Key('server-shell-more-mode-readout'),
                            icon: Icons.cloud_sync_outlined,
                            title: 'Local and server mode',
                            subtitle:
                                'Server mode is active here. The API remains authoritative for shared data and sync acceptance.',
                            statusLabel: 'Server mode',
                            statusVariant: StatusChipVariant.info,
                          ),
                          SettingsRow(
                            key: Key('server-shell-more-data-readout'),
                            icon: Icons.inventory_2_outlined,
                            title: 'Data, import, and export',
                            subtitle:
                                'Backup JSON generation and import preview are available below when this build includes local backup support.',
                            statusLabel: 'Preview only',
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _DashboardDataSafetySection(
                        export: _latestBackupExport,
                        isBuildingBackup: _isBuildingBackup,
                        isAvailable: widget.dataBackupService != null,
                        onBuildBackup: _buildLocalBackupExport,
                        onPreviewImport: _openImportPreview,
                      ),
                      const SizedBox(height: 16),
                      _MoreHubSection(
                        title: 'Preferences',
                        children: const [
                          SettingsRow(
                            key: Key('server-shell-more-notification-settings'),
                            icon: Icons.tune_outlined,
                            title: 'Notification settings',
                            subtitle:
                                'Mobile-local readouts filter this device only; persisted server notification preferences are not wired yet.',
                            statusLabel: 'Local',
                            statusVariant: StatusChipVariant.warning,
                          ),
                          SettingsRow(
                            key: Key('server-shell-more-appearance-readout'),
                            icon: Icons.palette_outlined,
                            title: 'Appearance and theme',
                            subtitle:
                                'Current mobile appearance uses built-in tokens; custom theme presets are readout-only here.',
                            statusLabel: 'Readout',
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SettleoraNotificationPreferencePanel(
                        settings: _notificationPreferences,
                        onChanged: _setNotificationPreferences,
                      ),
                      const SizedBox(height: 16),
                      const VisualPreferenceUnsupportedReadout(
                        key: Key('server-shell-visual-preference-readout'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ServerShellBottomNavigation extends StatelessWidget {
  const _ServerShellBottomNavigation({
    required this.selected,
    required this.onDestinationSelected,
  });

  final SettleoraNavDestination selected;
  final ValueChanged<SettleoraNavDestination> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    return SettleoraBottomNav(
      selected: selected,
      onSelected: onDestinationSelected,
    );
  }
}

enum _CreateBillChoice { personal, group }

class _CreateBillChooserSheet extends StatelessWidget {
  const _CreateBillChooserSheet();

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Create bill', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(
              'Choose the bill type to start.',
              style: TextStyle(color: colors.textMuted),
            ),
            const SizedBox(height: 14),
            _CreateBillChoiceCard(
              key: const Key('create-bill-choice-personal'),
              icon: Icons.person_outline,
              title: 'Personal bill',
              subtitle: 'Track a bill for your own account.',
              onTap: () =>
                  Navigator.of(context).pop(_CreateBillChoice.personal),
            ),
            const SizedBox(height: 10),
            _CreateBillChoiceCard(
              key: const Key('create-bill-choice-group'),
              icon: Icons.groups_outlined,
              title: 'Group bill',
              subtitle: 'Choose a group, then create a shared bill.',
              onTap: () => Navigator.of(context).pop(_CreateBillChoice.group),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateBillChoiceCard extends StatelessWidget {
  const _CreateBillChoiceCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(SettleoraRadius.lg),
        child: Padding(
          padding: const EdgeInsets.all(SettleoraSpacing.md),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: colors.primarySoft,
                foregroundColor: colors.primary,
                child: Icon(icon),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 2),
                    Text(subtitle, style: TextStyle(color: colors.textMuted)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: colors.textSubtle),
            ],
          ),
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

  List<SettleoraSettlementBalance> get outgoingBalances => settlementBalances
      .balances
      .where(
        (balance) =>
            balance.direction ==
                SettleoraSettlementBalanceDirectionValues.outgoing &&
            _amountStringLooksNonZero(balance.remainingUnclaimedAmount),
      )
      .toList(growable: false);

  List<SettleoraSettlementBalance> get incomingBalances => settlementBalances
      .balances
      .where(
        (balance) =>
            balance.direction ==
                SettleoraSettlementBalanceDirectionValues.incoming &&
            _amountStringLooksNonZero(balance.remainingUnclaimedAmount),
      )
      .toList(growable: false);

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
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
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
                      backgroundColor: theme.colorScheme.primaryContainer,
                      foregroundColor: theme.colorScheme.onPrimaryContainer,
                      child: const Icon(Icons.person_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _DashboardHeroTitle(
                  currentUser: currentUser,
                  defaultCurrency: defaultCurrency,
                ),
                const SizedBox(height: 6),
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
                      backgroundColor: theme.colorScheme.primaryContainer,
                      foregroundColor: theme.colorScheme.onPrimaryContainer,
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
              const SizedBox(height: 10),
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
  const _DashboardSummaryCards({
    required this.overview,
    required this.defaultCurrency,
  });

  final _SettleoraDashboardOverview overview;
  final String? defaultCurrency;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final youOwe = _BalanceMetric.from(
      balances: overview.outgoingBalances,
      fallbackCurrency: defaultCurrency,
    );
    final youAreOwed = _BalanceMetric.from(
      balances: overview.incomingBalances,
      fallbackCurrency: defaultCurrency,
    );
    final cards = [
      _DashboardSummaryCard(
        icon: Icons.north_east_outlined,
        title: 'You owe',
        value: youOwe.value,
        caption: youOwe.caption,
        backgroundColor: colors.dangerSoft,
        foregroundColor: colors.onDangerSoft,
      ),
      _DashboardSummaryCard(
        icon: Icons.south_west_outlined,
        title: "You're owed",
        value: youAreOwed.value,
        caption: youAreOwed.caption,
        backgroundColor: colors.successSoft,
        foregroundColor: colors.onSuccessSoft,
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
    required this.backgroundColor,
    required this.foregroundColor,
  });

  final IconData icon;
  final String title;
  final String value;
  final String caption;
  final Color backgroundColor;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      color: backgroundColor,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: foregroundColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: foregroundColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              value,
              style: theme.textTheme.titleLarge?.copyWith(
                color: foregroundColor,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              caption,
              style: theme.textTheme.bodySmall?.copyWith(
                color: foregroundColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceMetric {
  const _BalanceMetric({
    required this.value,
    required this.caption,
    required this.hasBalance,
  });

  factory _BalanceMetric.from({
    required List<SettleoraSettlementBalance> balances,
    required String? fallbackCurrency,
  }) {
    final currency = fallbackCurrency ?? 'HKD';
    if (balances.isEmpty) {
      return _BalanceMetric(
        value: '$currency 0.00',
        caption: 'No settlement balances yet',
        hasBalance: false,
      );
    }

    final first = balances.first;
    final peopleCount = balances
        .map((balance) => balance.counterpartyUserProfileId)
        .toSet()
        .length;
    return _BalanceMetric(
      value: _money(first.remainingUnclaimedAmount, first.currency),
      caption: 'Across $peopleCount people',
      hasBalance: true,
    );
  }

  final String value;
  final String caption;
  final bool hasBalance;
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
        Text('Good morning', style: theme.textTheme.labelLarge),
        const SizedBox(height: 4),
        Text(
          'Welcome back, ${currentUser.displayName}',
          style: theme.textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Chip(
          visualDensity: VisualDensity.compact,
          avatar: const Icon(Icons.verified_user_outlined, size: 16),
          label: Text(
            defaultCurrency == null
                ? 'Secure & synced'
                : 'Secure & synced - $defaultCurrency',
          ),
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
    required this.onCreateBill,
    required this.onCreateGroup,
  });

  final VoidCallback onCreateBill;
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
              onPressed: onCreateBill,
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

class _DashboardMorePrompt extends StatelessWidget {
  const _DashboardMorePrompt({required this.onOpenMore});

  final VoidCallback onOpenMore;

  @override
  Widget build(BuildContext context) {
    return _DashboardSection(
      title: 'More tools',
      child: SettingsRow(
        key: const Key('server-shell-open-more-hub'),
        icon: Icons.more_horiz,
        title: 'Open More',
        subtitle:
            'Profile, payment details, sessions, notifications, reports, receipt reviews, data, and appearance readouts.',
        onTap: onOpenMore,
      ),
    );
  }
}

class _MoreHubHeader extends StatelessWidget {
  const _MoreHubHeader({required this.currentUser});

  final SettleoraCurrentUser currentUser;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      key: const Key('server-shell-more-header'),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: colors.primarySoft,
            foregroundColor: colors.primary,
            child: const Icon(Icons.more_horiz),
          ),
          const SizedBox(width: SettleoraSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('More', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: SettleoraSpacing.xxs),
                Text(
                  'All functions hub for ${currentUser.displayName}.',
                  style: TextStyle(color: colors.textMuted),
                ),
                const SizedBox(height: SettleoraSpacing.xs),
                StatusChip(
                  label: 'Server mode',
                  icon: Icons.cloud_done_outlined,
                  variant: StatusChipVariant.info,
                  size: StatusChipSize.small,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MoreHubSection extends StatelessWidget {
  const _MoreHubSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return _DashboardSection(
      title: title,
      child: Column(
        children: [
          for (var index = 0; index < children.length; index += 1) ...[
            if (index > 0) const SizedBox(height: SettleoraSpacing.xs),
            children[index],
          ],
        ],
      ),
    );
  }
}

class _DashboardDataSafetySection extends StatelessWidget {
  const _DashboardDataSafetySection({
    required this.export,
    required this.isBuildingBackup,
    required this.isAvailable,
    required this.onBuildBackup,
    required this.onPreviewImport,
  });

  final SettleoraLocalDataBackupExport? export;
  final bool isBuildingBackup;
  final bool isAvailable;
  final VoidCallback onBuildBackup;
  final VoidCallback onPreviewImport;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final export = this.export;

    return _DashboardSection(
      title: 'Data safety',
      child: Card(
        key: const Key('server-shell-data-safety-panel'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Local backup', style: textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(
                'Export covers mobile-owned local state only. It excludes session tokens, refresh credentials, passwords, server URLs, payment details, file bytes, storage paths, receipt/OCR/proof contents, and it is not a complete server backup.',
                style: TextStyle(color: muted),
              ),
              const SizedBox(height: 12),
              const _ReadinessLine(
                label: 'Scope',
                value:
                    'App mode summary and the current mobile bill sync queue.',
              ),
              const _ReadinessLine(
                label: 'Server mode',
                value:
                    'The API remains authoritative for collaboration, authorization, storage, audit, sync acceptance, money, and policy.',
              ),
              const _ReadinessLine(
                label: 'Import',
                value:
                    'Validation and preview only; merge/replace restore is disabled until a guarded restore policy exists.',
              ),
              const _ReadinessLine(
                label: 'CSV export',
                value: 'Use server endpoints outside this local backup flow.',
              ),
              const _ReadinessLine(
                label: 'CSV import',
                value:
                    'Not handled here; imports cannot mutate bills or money.',
              ),
              const _ReadinessLine(
                label: 'Migration/link',
                value: 'Future explicit guided flow only; not a bypass.',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.icon(
                    key: const Key('data-safety-build-export'),
                    onPressed: isAvailable && !isBuildingBackup
                        ? onBuildBackup
                        : null,
                    icon: isBuildingBackup
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.download_outlined),
                    label: const Text('Generate backup JSON'),
                  ),
                  OutlinedButton.icon(
                    key: const Key('data-safety-open-import-preview'),
                    onPressed: isAvailable ? onPreviewImport : null,
                    icon: const Icon(Icons.upload_file_outlined),
                    label: const Text('Preview import'),
                  ),
                  OutlinedButton.icon(
                    key: const Key('data-safety-restore-disabled'),
                    onPressed: null,
                    icon: const Icon(Icons.restore_outlined),
                    label: const Text('Restore disabled'),
                  ),
                ],
              ),
              if (export != null) ...[
                const SizedBox(height: 12),
                _DataBackupPreviewCard(preview: export.preview),
                const SizedBox(height: 8),
                ExpansionTile(
                  key: const Key('data-safety-export-json'),
                  tilePadding: EdgeInsets.zero,
                  title: const Text('Generated backup JSON'),
                  children: [
                    SelectableText(
                      export.encodedJson,
                      key: const Key('data-safety-export-json-text'),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DataBackupPreviewCard extends StatelessWidget {
  const _DataBackupPreviewCard({required this.preview});

  final SettleoraLocalDataBackupPreview preview;

  @override
  Widget build(BuildContext context) {
    final failure = preview.failureMessage;
    final generatedAt = preview.generatedAtUtc;
    return DecoratedBox(
      key: const Key('data-safety-preview-card'),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              preview.isValid ? 'Backup preview' : 'Backup invalid',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            if (failure != null)
              Text(failure)
            else ...[
              _ReadinessLine(
                label: 'Schema',
                value: 'Version ${preview.schemaVersion}',
              ),
              _ReadinessLine(
                label: 'Generated',
                value: generatedAt == null
                    ? 'Not provided'
                    : _formatBackupUtcMinute(generatedAt),
              ),
              _ReadinessLine(
                label: 'Sections',
                value:
                    '${preview.countFor('syncQueue')} sync queue item${_plural(preview.countFor('syncQueue'))}; ${preview.countFor('appConfiguration')} app configuration record${_plural(preview.countFor('appConfiguration'))}.',
              ),
              _ReadinessLine(
                label: 'Restore mode',
                value:
                    '${preview.restoreMode}; restore apply is disabled in this build.',
              ),
              if (preview.warnings.isNotEmpty) ...[
                const SizedBox(height: 8),
                for (final warning in preview.warnings)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.info_outline, size: 18),
                        const SizedBox(width: 6),
                        Expanded(child: Text(warning)),
                      ],
                    ),
                  ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _DataBackupImportPreviewDialog extends StatefulWidget {
  const _DataBackupImportPreviewDialog({required this.service});

  final SettleoraLocalDataBackupService? service;

  @override
  State<_DataBackupImportPreviewDialog> createState() =>
      _DataBackupImportPreviewDialogState();
}

class _DataBackupImportPreviewDialogState
    extends State<_DataBackupImportPreviewDialog> {
  final TextEditingController _controller = TextEditingController();
  SettleoraLocalDataBackupPreview? _preview;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _previewImport() {
    setState(() {
      _preview =
          widget.service?.previewImport(_controller.text) ??
          const SettleoraLocalDataBackupPreview(
            isValid: false,
            schemaVersion: null,
            generatedAtUtc: null,
            sectionCounts: {},
            warnings: [],
            failureMessage: 'Backup preview is unavailable in this build.',
            restoreMode: 'preview_only',
          );
    });
  }

  @override
  Widget build(BuildContext context) {
    final preview = _preview;

    return AlertDialog(
      title: const Text('Preview backup import'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Paste Settleora backup JSON to validate it before any restore. This build previews only and will not overwrite local or server-mode data.',
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('data-safety-import-json'),
                controller: _controller,
                minLines: 5,
                maxLines: 8,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'Backup JSON',
                ),
              ),
              if (preview != null) ...[
                const SizedBox(height: 12),
                _DataBackupPreviewCard(preview: preview),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
        FilledButton.icon(
          key: const Key('data-safety-preview-import'),
          onPressed: _previewImport,
          icon: const Icon(Icons.fact_check_outlined),
          label: const Text('Preview'),
        ),
      ],
    );
  }
}

String _formatBackupUtcMinute(DateTime value) {
  final utc = value.toUtc();
  return '${utc.year.toString().padLeft(4, '0')}-'
      '${utc.month.toString().padLeft(2, '0')}-'
      '${utc.day.toString().padLeft(2, '0')} '
      '${utc.hour.toString().padLeft(2, '0')}:'
      '${utc.minute.toString().padLeft(2, '0')} UTC';
}

class _ReadinessLine extends StatelessWidget {
  const _ReadinessLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 132,
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: Text(value, style: TextStyle(color: muted)),
          ),
        ],
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
        if (overview.personalBills.isEmpty &&
            overview.recurringForecast.isEmpty)
          _DashboardEmptySectionCard(
            icon: Icons.event_available_outlined,
            title: 'No upcoming due bills',
            message: 'Create a bill to start tracking upcoming payments',
            actionKey: const Key('server-shell-empty-bills'),
            actionLabel: 'Open bills',
            onTap: onOpenBills,
          )
        else ...[
          for (final bill in overview.personalBills.take(2))
            _DashboardBillRow(
              icon: Icons.receipt_long_outlined,
              title: bill.displayName,
              amount: _money(bill.totalAmount, bill.totalCurrency),
              metadata: '${bill.itemCount} item${_plural(bill.itemCount)}',
              timing: 'Bill date ${bill.billDate}',
              onTap: onOpenBills,
            ),
          for (final occurrence in overview.recurringForecast.take(2))
            _DashboardBillRow(
              icon: Icons.event_repeat_outlined,
              title: occurrence.merchantName ?? 'Recurring bill',
              amount: _money(
                occurrence.forecastAmount,
                occurrence.forecastCurrency,
              ),
              metadata: occurrence.isGroupScoped
                  ? 'Group recurring'
                  : 'Personal recurring',
              timing: occurrence.dueDate == null
                  ? 'Occurs ${occurrence.occurrenceDate}'
                  : 'Due ${occurrence.dueDate}',
              onTap: onOpenRecurringBills,
            ),
        ],
      ],
    );

    final groupActivity = Column(
      children: [
        if (overview.notificationSummary.unreadCount == 0 &&
            overview.notificationSummary.attentionCount == 0 &&
            overview.notificationSummary.urgentCount == 0)
          _DashboardEmptySectionCard(
            icon: Icons.groups_outlined,
            title: 'No recent group activity',
            message:
                'No loaded notification rows are visible here. Open Groups for the current group detail and group-bill workspace; this dashboard card is not group authorization or a complete group workspace.',
            actionKey: const Key('server-shell-groups'),
            actionLabel: 'Open groups',
            onTap: onOpenGroups,
          )
        else ...[
          if (overview.notificationSummary.urgentCount > 0)
            _DashboardActivityRow(
              initials: '!',
              title: 'Urgent activity',
              message:
                  '${overview.notificationSummary.urgentCount} notification${_plural(overview.notificationSummary.urgentCount)} need fast review',
              status: 'Urgent',
              onTap: onOpenNotifications,
            ),
          if (overview.notificationSummary.attentionCount > 0)
            _DashboardActivityRow(
              initials: 'A',
              title: 'Attention queue',
              message:
                  '${overview.notificationSummary.attentionCount} item${_plural(overview.notificationSummary.attentionCount)} flagged for review',
              status: 'Review',
              onTap: onOpenNotifications,
            ),
          if (overview.notificationSummary.unreadCount > 0)
            _DashboardActivityRow(
              initials: 'N',
              title: 'Notifications',
              message:
                  '${overview.notificationSummary.unreadCount} unread update${_plural(overview.notificationSummary.unreadCount)}',
              status: 'Unread',
              onTap: onOpenNotifications,
            ),
          _DashboardInlineActionRow(
            key: const Key('server-shell-notifications'),
            icon: Icons.notifications_outlined,
            label: 'Open notifications',
            onTap: onOpenNotifications,
          ),
          _DashboardInlineActionRow(
            key: const Key('server-shell-groups'),
            icon: Icons.groups_outlined,
            label: 'Open groups',
            onTap: onOpenGroups,
          ),
        ],
      ],
    );

    final thisMonth = Column(
      children: [
        _DashboardMonthRow(
          key: const Key('server-shell-bills'),
          icon: Icons.receipt_long_outlined,
          title: 'Active bills',
          value: '${overview.activePersonalBillCount}',
          detail: overview.personalBills.isEmpty
              ? 'No personal bills loaded'
              : 'Latest: ${overview.personalBills.first.displayName}',
          onTap: onOpenBills,
        ),
        _DashboardMonthRow(
          key: const Key('server-shell-recurring-bills'),
          icon: Icons.event_repeat_outlined,
          title: 'Recurring',
          value: '${overview.activeRecurringTemplateCount}',
          detail: overview.recurringForecast.isEmpty
              ? 'No forecast rows loaded'
              : '${overview.recurringForecast.length} forecast row${_plural(overview.recurringForecast.length)} loaded',
          onTap: onOpenRecurringBills,
        ),
        _DashboardMonthRow(
          key: const Key('server-shell-settlements'),
          icon: Icons.handshake_outlined,
          title: 'Settlement requests',
          value: '${overview.settlementActionCount}',
          detail: overview.openBalanceCount == 0
              ? 'No open settlement balances'
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

class _DashboardEmptySectionCard extends StatelessWidget {
  const _DashboardEmptySectionCard({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionKey,
    required this.actionLabel,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String message;
  final Key actionKey;
  final String actionLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 2),
                  Text(message),
                ],
              ),
            ),
            TextButton(
              key: actionKey,
              onPressed: onTap,
              child: Text(actionLabel),
            ),
          ],
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
                  const SizedBox(height: 4),
                  Text(
                    'Counts cover the current mobile bill sync queue only. They do not mean full offline cache hydration, import/export, backup/restore, broad conflict resolution, or server acceptance of all local data.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
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

class _DashboardBillRow extends StatelessWidget {
  const _DashboardBillRow({
    required this.icon,
    required this.title,
    required this.amount,
    required this.metadata,
    required this.timing,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String amount;
  final String metadata;
  final String timing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.secondaryContainer,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            icon,
            color: Theme.of(context).colorScheme.onSecondaryContainer,
          ),
        ),
        title: Text(title),
        subtitle: Text('$timing\n$metadata'),
        isThreeLine: true,
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(amount, style: Theme.of(context).textTheme.labelLarge),
            const Icon(Icons.chevron_right, size: 18),
          ],
        ),
        onTap: onTap,
      ),
    );
  }
}

class _DashboardActivityRow extends StatelessWidget {
  const _DashboardActivityRow({
    required this.initials,
    required this.title,
    required this.message,
    required this.status,
    required this.onTap,
  });

  final String initials;
  final String title;
  final String message;
  final String status;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.tertiaryContainer,
          foregroundColor: theme.colorScheme.onTertiaryContainer,
          child: Text(initials),
        ),
        title: Text(title),
        subtitle: Text(message),
        trailing: Text(status, style: theme.textTheme.labelMedium),
        onTap: onTap,
      ),
    );
  }
}

class _DashboardInlineActionRow extends StatelessWidget {
  const _DashboardInlineActionRow({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextButton.icon(
        style: TextButton.styleFrom(alignment: Alignment.centerLeft),
        onPressed: onTap,
        icon: Icon(icon, size: 18),
        label: Text(label),
      ),
    );
  }
}

class _DashboardMonthRow extends StatelessWidget {
  const _DashboardMonthRow({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.detail,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final String detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(detail),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(value, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right),
          ],
        ),
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

String _money(String amount, String currency) => '$currency $amount';

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
  bool _isConfirmingSignOutAll = false;
  bool _isSigningOutAll = false;
  String? _confirmingRevokeSessionId;
  String? _revokingSessionId;
  bool _requiresRefreshBeforeRevoke = false;
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
        _requiresRefreshBeforeRevoke = false;
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
    if (session.isCurrent ||
        _requiresRefreshBeforeRevoke ||
        _confirmingRevokeSessionId != null ||
        _revokingSessionId != null) {
      return;
    }

    setState(() {
      _confirmingRevokeSessionId = session.id;
    });

    final confirmed = await _confirm(
      title: 'Revoke other session?',
      message:
          'Ask the server to sign out this other session. This cannot sign out the current device; use the main sign-out flow for this session.',
      confirmLabel: 'Revoke Session',
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _confirmingRevokeSessionId = null;
    });
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
      await _reloadAfterRevoke();
    } on SettleoraAuthFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = failure;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = const SettleoraAuthFailure(
          kind: SettleoraAuthFailureKind.server,
          message: 'Session management is unavailable right now.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _revokingSessionId = null;
        });
      }
    }
  }

  Future<void> _reloadAfterRevoke() async {
    try {
      final accessToken = await _readAccessToken();
      if (accessToken == null) {
        await _endSession('Your session has expired. Sign in again.');
        return;
      }

      final refreshed = await widget.authRepository.listSessions(
        accessToken: accessToken,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _sessions = refreshed;
        _failure = null;
        _requiresRefreshBeforeRevoke = false;
      });
    } on SettleoraAuthFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = _postRevokeRefreshFailure(failure);
        _requiresRefreshBeforeRevoke = true;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = _postRevokeRefreshFailure(
          const SettleoraAuthFailure(
            kind: SettleoraAuthFailureKind.server,
            message: 'Session management is unavailable right now.',
          ),
        );
        _requiresRefreshBeforeRevoke = true;
      });
    }
  }

  Future<void> _signOutAll() async {
    if (_isSigningOutAll || _isConfirmingSignOutAll) {
      return;
    }

    setState(() {
      _isConfirmingSignOutAll = true;
    });

    final confirmed = await _confirm(
      title: 'Sign Out All Sessions?',
      message:
          'Ask the server to end every active session for this account. This signs out this device after the server confirms the account-wide action.',
      confirmLabel: 'Sign Out All',
    );
    if (!mounted) {
      return;
    }

    setState(() {
      _isConfirmingSignOutAll = false;
    });

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

      if (failure.kind == SettleoraAuthFailureKind.sessionExpired) {
        await _endSession(failure.message);
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
      barrierDismissible: false,
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
              else if (failure != null && _sessions.isEmpty)
                _SessionStatePanel(
                  failure: failure,
                  onRetry: _load,
                  onSessionEnded: _endSession,
                )
              else ...[
                const _SessionListAuthorityNotice(),
                const SizedBox(height: 12),
                if (failure != null) ...[
                  _SessionInlineFailure(failure: failure, onRetry: _load),
                  const SizedBox(height: 12),
                ],
                OutlinedButton.icon(
                  key: const Key('session-list-sign-out-all'),
                  onPressed: (_isSigningOutAll || _isConfirmingSignOutAll)
                      ? null
                      : _signOutAll,
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
                      revokeDisabled:
                          _requiresRefreshBeforeRevoke ||
                          _confirmingRevokeSessionId != null,
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
    required this.revokeDisabled,
    required this.onRevoke,
  });

  final Key revokeButtonKey;
  final SettleoraSessionSummary session;
  final bool isRevoking;
  final bool revokeDisabled;
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
            if (session.isCurrent)
              'Protected: use the main sign-out flow for this session.',
          ].join('\n'),
        ),
        trailing: session.isCurrent
            ? const Chip(label: Text('Current'))
            : IconButton(
                key: revokeButtonKey,
                tooltip: 'Revoke session',
                onPressed: isRevoking || revokeDisabled ? null : onRevoke,
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

class _SessionListAuthorityNotice extends StatelessWidget {
  const _SessionListAuthorityNotice();

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Text(
        'Session rows show API-returned display metadata only. The server decides session validity and revocation; this screen does not show raw session IDs, tokens, refresh credentials, or provider data.',
        style: TextStyle(color: colors.textMuted),
      ),
    );
  }
}

class _SessionInlineFailure extends StatelessWidget {
  const _SessionInlineFailure({required this.failure, required this.onRetry});

  final SettleoraAuthFailure failure;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(failure.title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(failure.message, style: TextStyle(color: colors.textMuted)),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            key: const Key('session-list-retry'),
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh Sessions'),
          ),
        ],
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
          Text('No other sessions shown'),
          SizedBox(height: 6),
          Text(
            'The API did not return another session to manage. Pull to refresh before retrying.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

SettleoraAuthFailure _postRevokeRefreshFailure(SettleoraAuthFailure failure) {
  return SettleoraAuthFailure(
    kind: failure.kind,
    statusCode: failure.statusCode,
    message:
        'The server accepted the revoke request, but the refreshed session list is unavailable. Refresh sessions before trying another revoke.',
  );
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}
