import 'package:flutter/material.dart';

import '../bills/bill_attachment_file_input.dart';
import '../bills/bill_attachment_repository.dart';
import '../bills/bill_list_screen.dart';
import '../bills/bill_repository.dart';
import '../bills/bill_revision_repository.dart';
import '../bills/bill_revision_review_screen.dart';
import '../groups/group_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_screen.dart';
import '../recurring_bills/recurring_bill_repository.dart';
import '../recurring_bills/recurring_bill_screen.dart';
import '../settlements/settlement_list_screen.dart';
import '../settlements/settlement_repository.dart';
import '../sync/sync_repository.dart';
import '../ui/settleora_components.dart';
import 'notification_preferences.dart';
import 'notification_repository.dart';

class SettleoraNotificationScreen extends StatefulWidget {
  const SettleoraNotificationScreen({
    super.key,
    required this.repository,
    this.currentUserProfileId,
    this.billRepository,
    this.groupRepository,
    this.settlementRepository,
    this.recurringBillRepository,
    this.billAttachmentRepository,
    this.billAttachmentFileInput,
    this.receiptOcrReviewRepository,
    this.billRevisionRepository,
    this.syncRepository,
    this.preferences,
    this.onSessionEnded,
  });

  final SettleoraNotificationRepository repository;
  final String? currentUserProfileId;
  final SettleoraBillRepository? billRepository;
  final SettleoraGroupRepository? groupRepository;
  final SettleoraSettlementRepository? settlementRepository;
  final SettleoraRecurringBillRepository? recurringBillRepository;
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? billRevisionRepository;
  final SettleoraSyncRepository? syncRepository;
  final SettleoraNotificationPreferenceSettings? preferences;
  final Future<void> Function(String? noticeMessage)? onSessionEnded;

  @override
  State<SettleoraNotificationScreen> createState() =>
      _SettleoraNotificationScreenState();
}

class _SettleoraNotificationScreenState
    extends State<SettleoraNotificationScreen> {
  bool _isLoading = true;
  bool _isMarkingAllRead = false;
  bool _isBulkMarkingVisibleRead = false;
  String? _actingNotificationId;
  SettleoraNotificationSummary? _summary;
  List<SettleoraNotificationRow> _notifications = const [];
  _NotificationFilter _selectedFilter = _NotificationFilter.all;
  SettleoraNotificationFailure? _loadFailure;
  SettleoraNotificationFailure? _actionFailure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load({bool showBlockingLoading = true}) async {
    setState(() {
      if (showBlockingLoading) {
        _isLoading = true;
      }
      _loadFailure = null;
      _actionFailure = null;
    });

    try {
      final summary = await widget.repository.getNotificationSummary();
      final notifications = await widget.repository.listNotifications(
        limit: 50,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _summary = summary;
        _notifications = notifications;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadFailure = SettleoraNotificationFailure.from(error);
        _summary = null;
        _notifications = const [];
        _isLoading = false;
      });
    }
  }

  Future<void> _markNotificationRead(
    SettleoraNotificationRow notification,
  ) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !notification.isUnread) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final updated = await widget.repository.markNotificationRead(
        notification.id,
      );
      if (!mounted) {
        return;
      }

      _replaceNotification(updated);
      _showSnackBar('Notification marked read through the API.');
      await _refreshAfterMutation(
        refreshFailureMessage:
            'Notification was marked read through the API, but the inbox could not refresh. Use Refresh to reload server state before repeating actions.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notification could not be marked read.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _markAllRead() async {
    final summary = _summary;
    if (_isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        _actingNotificationId != null ||
        summary == null ||
        summary.unreadCount <= 0) {
      return;
    }

    setState(() {
      _isMarkingAllRead = true;
      _actionFailure = null;
    });

    try {
      final updatedSummary = await widget.repository.markAllNotificationsRead();
      if (!mounted) {
        return;
      }

      _markLoadedNotificationsRead(updatedSummary);
      _showSnackBar('Mark-all-read request sent to the API.');
      await _refreshAfterMutation(
        refreshFailureMessage:
            'Mark all read was sent to the API, but the inbox could not refresh. Use Refresh to reload server state before repeating actions.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notifications could not be marked read.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _isMarkingAllRead = false;
        });
      }
    }
  }

  Future<void> _markVisibleNotificationsRead(
    List<SettleoraNotificationRow> visibleUnreadNotifications,
  ) async {
    if (_isBulkMarkingVisibleRead ||
        _isMarkingAllRead ||
        _actingNotificationId != null ||
        visibleUnreadNotifications.isEmpty) {
      return;
    }

    final notificationIds = visibleUnreadNotifications
        .where(
          (notification) =>
              notification.status != SettleoraNotificationStatusValues.archived,
        )
        .map((notification) => notification.id)
        .where((id) => id.trim().isNotEmpty)
        .toList(growable: false);
    if (notificationIds.isEmpty) {
      return;
    }

    setState(() {
      _isBulkMarkingVisibleRead = true;
      _actionFailure = null;
    });

    try {
      final updatedRows = <SettleoraNotificationRow>[];
      for (final notificationId in notificationIds) {
        updatedRows.add(
          await widget.repository.markNotificationRead(notificationId),
        );
      }
      if (!mounted) {
        return;
      }

      _replaceNotifications(updatedRows);
      _showSnackBar(
        'Visible loaded notifications marked read through the API.',
      );
      await _refreshAfterMutation(
        refreshFailureMessage:
            'Visible loaded notifications were marked read through the API, but the inbox could not refresh. Use Refresh to reload server state before repeating actions.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Visible notifications could not be marked read.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _isBulkMarkingVisibleRead = false;
        });
      }
    }
  }

  Future<void> _archiveNotification(
    SettleoraNotificationRow notification,
  ) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final updated = await widget.repository.archiveNotification(
        notification.id,
      );
      if (!mounted) {
        return;
      }

      _replaceNotification(updated);
      _showSnackBar('Notification archived through the API.');
      await _refreshAfterMutation(
        refreshFailureMessage:
            'Notification was archived through the API, but the inbox could not refresh. Use Refresh to reload server state before repeating actions.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notification could not be archived.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _restoreNotification(
    SettleoraNotificationRow notification,
  ) async {
    final restoreRepository =
        widget.repository is SettleoraNotificationRestoreRepository
        ? widget.repository as SettleoraNotificationRestoreRepository
        : null;
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        restoreRepository == null ||
        notification.status != SettleoraNotificationStatusValues.archived) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final updated = await restoreRepository.restoreNotification(
        notification.id,
      );
      if (!mounted) {
        return;
      }

      _replaceNotification(updated);
      _showSnackBar('Notification restore request sent to the API.');
      await _refreshAfterMutation(
        refreshFailureMessage:
            'Notification restore was sent to the API, but the inbox could not refresh. Use Refresh to reload server state before repeating actions.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notification could not be restored.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _markOpenedNotificationRead(
    SettleoraNotificationRow notification,
  ) async {
    if (!notification.isUnread ||
        notification.status == SettleoraNotificationStatusValues.archived) {
      return;
    }

    try {
      await widget.repository.markNotificationRead(notification.id);
      if (!mounted) {
        return;
      }

      await _refreshAfterMutation(
        refreshFailureMessage:
            'Notification was opened and its read update was sent, but the inbox could not refresh. Use Refresh to reload server state.',
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeOpenReadFailure(error);
      });
    }
  }

  Future<void> _openBillRevision(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived) {
      return;
    }

    final billRevisionRepository = widget.billRevisionRepository;
    final billId = settleoraNotificationMetadataId(notification.expenseBillId);
    final revisionId = settleoraNotificationMetadataId(
      notification.expenseBillRevisionId,
    );

    if (billRevisionRepository == null ||
        !notification.hasBillRevisionReviewTarget ||
        billId == null ||
        revisionId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final refreshedNotification = await _refreshNotificationForOpen(
        notification,
      );
      final refreshedBillId = settleoraNotificationMetadataId(
        refreshedNotification.expenseBillId,
      );
      final refreshedRevisionId = settleoraNotificationMetadataId(
        refreshedNotification.expenseBillRevisionId,
      );
      if (!mounted) {
        return;
      }
      if (!refreshedNotification.hasBillRevisionReviewTarget ||
          refreshedBillId == null ||
          refreshedRevisionId == null) {
        setState(() {
          _actionFailure = _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.unsupported,
          );
        });
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraBillRevisionReviewScreen(
            repository: billRevisionRepository,
            billId: refreshedBillId,
            revisionId: refreshedRevisionId,
            billLabel: refreshedNotification.displayTitle,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(refreshedNotification);
    } on SettleoraNotificationFailure catch (failure) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  bool _canOpenGroupBill(SettleoraNotificationRow notification) {
    return notification.hasGroupBillTarget &&
        widget.billRepository != null &&
        widget.groupRepository != null &&
        settleoraNotificationMetadataId(widget.currentUserProfileId) != null;
  }

  bool _canOpenPersonalBill(SettleoraNotificationRow notification) {
    return notification.hasPersonalBillTarget && widget.billRepository != null;
  }

  bool _canOpenSettlement(SettleoraNotificationRow notification) {
    return notification.hasSettlementTarget &&
        widget.settlementRepository != null &&
        settleoraNotificationMetadataId(widget.currentUserProfileId) != null;
  }

  bool _canOpenRecurringBill(SettleoraNotificationRow notification) {
    return notification.hasRecurringBillTarget &&
        widget.recurringBillRepository != null;
  }

  bool _canOpenReceiptOcrReview(SettleoraNotificationRow notification) {
    return notification.hasReceiptOcrReviewTarget &&
        widget.receiptOcrReviewRepository != null;
  }

  bool _canOpenSyncOperation(SettleoraNotificationRow notification) {
    return notification.hasSyncOperationTarget && widget.syncRepository != null;
  }

  bool _canOpenAnyTypedTarget(SettleoraNotificationRow notification) {
    return (widget.billRevisionRepository != null &&
            notification.hasBillRevisionReviewTarget) ||
        _canOpenGroupBill(notification) ||
        _canOpenPersonalBill(notification) ||
        _canOpenSettlement(notification) ||
        _canOpenRecurringBill(notification) ||
        _canOpenReceiptOcrReview(notification) ||
        _canOpenSyncOperation(notification);
  }

  Future<void> _openGroupBill(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenGroupBill(notification)) {
      return;
    }

    final billRepository = widget.billRepository;
    final groupRepository = widget.groupRepository;
    final currentUserProfileId = settleoraNotificationMetadataId(
      widget.currentUserProfileId,
    );
    final groupId = settleoraNotificationMetadataId(notification.groupId);
    final billId = settleoraNotificationMetadataId(notification.expenseBillId);
    if (billRepository == null ||
        groupRepository == null ||
        currentUserProfileId == null ||
        groupId == null ||
        billId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final refreshedNotification = await _refreshNotificationForOpen(
        notification,
      );
      final refreshedGroupId = settleoraNotificationMetadataId(
        refreshedNotification.groupId,
      );
      final refreshedBillId = settleoraNotificationMetadataId(
        refreshedNotification.expenseBillId,
      );
      if (!mounted) {
        return;
      }
      if (!refreshedNotification.hasGroupBillTarget ||
          refreshedGroupId == null ||
          refreshedBillId == null) {
        setState(() {
          _actionFailure = _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.unsupported,
          );
        });
        return;
      }

      final group = await groupRepository.getGroup(refreshedGroupId);
      var participantDisplayNames = const <String, String>{};
      try {
        final members = await groupRepository.listGroupMembers(
          refreshedGroupId,
        );
        participantDisplayNames = _participantDisplayNamesFromMembers(members);
      } catch (_) {
        participantDisplayNames = const {};
      }

      if (!mounted) {
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraGroupBillDetailScreen(
            repository: _NotificationHandoffBillRepository(billRepository),
            attachmentRepository: widget.billAttachmentRepository,
            attachmentFileInput: widget.billAttachmentFileInput,
            receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
            revisionRepository: widget.billRevisionRepository,
            groupId: refreshedGroupId,
            groupName: group.displayName,
            billId: refreshedBillId,
            currentUserProfileId: currentUserProfileId,
            participantDisplayNames: participantDisplayNames,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(refreshedNotification);
    } catch (error) {
      if (!mounted) {
        return;
      }

      final failure = _notificationFailureFromGroupOpen(error);
      if (failure.kind == SettleoraNotificationFailureKind.sessionRequired ||
          failure.kind == SettleoraNotificationFailureKind.sessionExpired) {
        await _endSession(failure);
        return;
      }

      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openPersonalBill(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenPersonalBill(notification)) {
      return;
    }

    final billRepository = widget.billRepository;
    final billId = settleoraNotificationMetadataId(notification.expenseBillId);
    if (billRepository == null || billId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final refreshedNotification = await _refreshNotificationForOpen(
        notification,
      );
      final refreshedBillId = settleoraNotificationMetadataId(
        refreshedNotification.expenseBillId,
      );
      if (!mounted) {
        return;
      }
      if (!refreshedNotification.hasPersonalBillTarget ||
          refreshedBillId == null) {
        setState(() {
          _actionFailure = _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.unsupported,
          );
        });
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraBillDetailScreen(
            repository: _NotificationHandoffBillRepository(billRepository),
            billId: refreshedBillId,
            attachmentRepository: widget.billAttachmentRepository,
            attachmentFileInput: widget.billAttachmentFileInput,
            receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
            revisionRepository: widget.billRevisionRepository,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(refreshedNotification);
    } catch (error) {
      if (!mounted) {
        return;
      }

      final failure = _notificationFailureFromBillOpen(error);
      if (failure.kind == SettleoraNotificationFailureKind.sessionRequired ||
          failure.kind == SettleoraNotificationFailureKind.sessionExpired) {
        await _endSession(failure);
        return;
      }

      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openSettlement(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenSettlement(notification)) {
      return;
    }

    final settlementRepository = widget.settlementRepository;
    final currentUserProfileId = settleoraNotificationMetadataId(
      widget.currentUserProfileId,
    );
    final settlementRequestId = settleoraNotificationMetadataId(
      notification.settlementRequestId,
    );
    if (settlementRepository == null ||
        currentUserProfileId == null ||
        settlementRequestId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final refreshedNotification = await _refreshNotificationForOpen(
        notification,
      );
      final refreshedSettlementRequestId = settleoraNotificationMetadataId(
        refreshedNotification.settlementRequestId,
      );
      if (!mounted) {
        return;
      }
      if (!refreshedNotification.hasSettlementTarget ||
          refreshedSettlementRequestId == null) {
        setState(() {
          _actionFailure = _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.unsupported,
          );
        });
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraSettlementDetailScreen(
            repository: settlementRepository,
            settlementId: refreshedSettlementRequestId,
            currentUserProfileId: currentUserProfileId,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(refreshedNotification);
    } on SettleoraNotificationFailure catch (failure) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openRecurringBill(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenRecurringBill(notification)) {
      return;
    }

    final recurringBillRepository = widget.recurringBillRepository;
    final templateId = settleoraNotificationMetadataId(
      notification.recurringBillTemplateId,
    );
    if (recurringBillRepository == null || templateId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final refreshedNotification = await _refreshNotificationForOpen(
        notification,
      );
      final refreshedTemplateId = settleoraNotificationMetadataId(
        refreshedNotification.recurringBillTemplateId,
      );
      if (!mounted) {
        return;
      }
      if (!refreshedNotification.hasRecurringBillTarget ||
          refreshedTemplateId == null) {
        setState(() {
          _actionFailure = _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.unsupported,
          );
        });
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraRecurringBillDetailScreen(
            repository: recurringBillRepository,
            templateId: refreshedTemplateId,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(refreshedNotification);
    } on SettleoraNotificationFailure catch (failure) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openReceiptOcrReview(
    SettleoraNotificationRow notification,
  ) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenReceiptOcrReview(notification)) {
      return;
    }

    final receiptOcrReviewRepository = widget.receiptOcrReviewRepository;
    if (receiptOcrReviewRepository == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final refreshedNotification = await _refreshNotificationForOpen(
        notification,
      );
      final billId = settleoraNotificationMetadataId(
        refreshedNotification.expenseBillId,
      );
      final fileId = settleoraNotificationMetadataId(
        refreshedNotification.receiptAttachmentFileId,
      );
      if (!mounted) {
        return;
      }
      if (!refreshedNotification.hasReceiptOcrReviewTarget ||
          billId == null ||
          fileId == null) {
        setState(() {
          _actionFailure = _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.unsupported,
          );
        });
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ReceiptOcrReviewDetailScreen.forRoute(
            repository: receiptOcrReviewRepository,
            route: ReceiptOcrReviewRoute(
              billId: billId,
              fileId: fileId,
              groupId: settleoraNotificationMetadataId(
                refreshedNotification.groupId,
              ),
            ),
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(refreshedNotification);
    } on SettleoraNotificationFailure catch (failure) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openSyncOperation(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenSyncOperation(notification)) {
      return;
    }

    final syncRepository = widget.syncRepository;
    if (syncRepository == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final refreshedNotification = await _refreshNotificationForOpen(
        notification,
      );
      final syncOperationId = settleoraNotificationMetadataId(
        refreshedNotification.syncOperationId,
      );
      if (!mounted) {
        return;
      }
      if (!refreshedNotification.hasSyncOperationTarget ||
          syncOperationId == null) {
        setState(() {
          _actionFailure = _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.unsupported,
          );
        });
        return;
      }

      final result = await syncRepository.getOperation(syncOperationId);
      if (!mounted) {
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => _NotificationSyncOperationScreen(result: result),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(refreshedNotification);
    } on SettleoraNotificationFailure catch (failure) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = failure;
      });
    } on SettleoraSyncFailure catch (failure) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = _notificationFailureFromSyncOpen(failure);
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<SettleoraNotificationRow> _refreshNotificationForOpen(
    SettleoraNotificationRow notification,
  ) async {
    final notifications = await widget.repository.listNotifications(limit: 50);
    if (!mounted) {
      return notification;
    }

    setState(() {
      _notifications = notifications;
    });

    for (final refreshed in notifications) {
      if (refreshed.id == notification.id) {
        if (refreshed.status == SettleoraNotificationStatusValues.archived) {
          throw _safeOpenFallbackFailure(
            SettleoraNotificationOpenFallbackState.archived,
          );
        }

        return refreshed;
      }
    }

    throw _safeOpenFallbackFailure(
      SettleoraNotificationOpenFallbackState.missing,
    );
  }

  Future<void> _endSession(SettleoraNotificationFailure failure) async {
    final onSessionEnded = widget.onSessionEnded;
    if (onSessionEnded == null) {
      return;
    }

    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }

    await onSessionEnded(failure.message);
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _refreshAfterMutation({
    required String refreshFailureMessage,
  }) async {
    try {
      final summary = await widget.repository.getNotificationSummary();
      final notifications = await widget.repository.listNotifications(
        limit: 50,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _summary = summary;
        _notifications = notifications;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      final failure = SettleoraNotificationFailure.from(error);
      setState(() {
        _actionFailure = SettleoraNotificationFailure(
          kind: failure.kind,
          message: refreshFailureMessage,
          statusCode: failure.statusCode,
        );
      });
    }
  }

  void _replaceNotification(SettleoraNotificationRow updated) {
    setState(() {
      _notifications = [
        for (final notification in _notifications)
          notification.id == updated.id ? updated : notification,
      ];
    });
  }

  void _replaceNotifications(List<SettleoraNotificationRow> updatedRows) {
    final updatedById = {
      for (final notification in updatedRows) notification.id: notification,
    };
    setState(() {
      _notifications = [
        for (final notification in _notifications)
          updatedById[notification.id] ?? notification,
      ];
    });
  }

  void _markLoadedNotificationsRead(SettleoraNotificationSummary summary) {
    setState(() {
      _summary = summary;
      _notifications = [
        for (final notification in _notifications)
          notification.status == SettleoraNotificationStatusValues.archived
              ? notification
              : _copyNotificationRead(notification),
      ];
    });
  }

  @override
  Widget build(BuildContext context) {
    final loadFailure = _loadFailure;
    final actionFailure = _actionFailure;
    final summary = _summary;
    final canRestoreArchived =
        widget.repository is SettleoraNotificationRestoreRepository;
    final preferences =
        widget.preferences ??
        SettleoraNotificationPreferenceSettings.defaults();
    final preferenceVisibleNotifications = _notifications
        .where(
          (notification) => preferences.shouldShowNotification(notification),
        )
        .toList(growable: false);
    final suppressedCount = preferences.suppressedCount(_notifications);
    final counts = _NotificationFilterCounts.fromRows(
      preferenceVisibleNotifications,
      isActionable: _canOpenAnyTypedTarget,
    );
    final visibleNotifications = preferenceVisibleNotifications
        .where(
          (notification) => _matchesFilter(
            notification,
            _selectedFilter,
            isActionable: _canOpenAnyTypedTarget,
          ),
        )
        .toList(growable: false);
    final visibleUnreadNotifications = visibleNotifications
        .where(
          (notification) =>
              notification.isUnread &&
              notification.status != SettleoraNotificationStatusValues.archived,
        )
        .toList(growable: false);
    final isBulkBusy = _isMarkingAllRead || _isBulkMarkingVisibleRead;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            key: const Key('notification-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading || isBulkBusy ? null : () => _load(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const SettleoraLoadingPanel(
                label: 'Loading notifications',
              );
            }

            if (loadFailure != null) {
              return _FailurePanel(
                failure: loadFailure,
                onRetry: _load,
                onSessionEnded: widget.onSessionEnded == null
                    ? null
                    : () => _endSession(loadFailure),
              );
            }

            return RefreshIndicator(
              onRefresh: () => _load(showBlockingLoading: false),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  _SummaryPanel(
                    summary:
                        summary ??
                        const SettleoraNotificationSummary(
                          unreadCount: 0,
                          attentionCount: 0,
                          urgentCount: 0,
                        ),
                    isMarkingAllRead: isBulkBusy,
                    onMarkAllRead: _markAllRead,
                  ),
                  const SizedBox(height: 12),
                  _NotificationFilterBar(
                    counts: counts,
                    selectedFilter: _selectedFilter,
                    onSelected: (filter) {
                      setState(() {
                        _selectedFilter = filter;
                      });
                    },
                  ),
                  const SizedBox(height: 8),
                  _LoadedFilterScopeNote(
                    loadedCount: preferenceVisibleNotifications.length,
                    suppressedCount: suppressedCount,
                    visibleCount: visibleNotifications.length,
                    selectedFilterLabel: _selectedFilter.label,
                    selectedFilter: _selectedFilter,
                  ),
                  const SizedBox(height: 12),
                  _VisibleBulkActionsPanel(
                    selectedFilterLabel: _selectedFilter.label,
                    visibleUnreadCount: visibleUnreadNotifications.length,
                    isMarkingVisibleRead: _isBulkMarkingVisibleRead,
                    isBusy: isBulkBusy || _actingNotificationId != null,
                    onMarkVisibleRead: () => _markVisibleNotificationsRead(
                      visibleUnreadNotifications,
                    ),
                  ),
                  if (actionFailure != null) ...[
                    const SizedBox(height: 12),
                    _InlineFailure(failure: actionFailure),
                  ],
                  const SizedBox(height: 16),
                  if (_notifications.isEmpty)
                    const _EmptyNotifications()
                  else if (preferenceVisibleNotifications.isEmpty)
                    const _EmptyNotifications(
                      title: 'No visible notifications',
                      message:
                          'Notification preferences are suppressing loaded non-critical rows. Hidden rows stay in the inbox and can reappear when preferences change.',
                    )
                  else if (visibleNotifications.isEmpty)
                    _EmptyNotifications(
                      title: _emptyTitleForFilter(_selectedFilter),
                      message: _emptyMessageForFilter(_selectedFilter),
                    )
                  else
                    for (
                      var index = 0;
                      index < visibleNotifications.length;
                      index += 1
                    )
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _NotificationTile(
                          notification: visibleNotifications[index],
                          canOpenBillRevision:
                              widget.billRevisionRepository != null &&
                              visibleNotifications[index]
                                  .hasBillRevisionReviewTarget,
                          canOpenGroupBill: _canOpenGroupBill(
                            visibleNotifications[index],
                          ),
                          canOpenPersonalBill: _canOpenPersonalBill(
                            visibleNotifications[index],
                          ),
                          canOpenSettlement: _canOpenSettlement(
                            visibleNotifications[index],
                          ),
                          canOpenRecurringBill: _canOpenRecurringBill(
                            visibleNotifications[index],
                          ),
                          canOpenReceiptOcrReview: _canOpenReceiptOcrReview(
                            visibleNotifications[index],
                          ),
                          canOpenSyncOperation: _canOpenSyncOperation(
                            visibleNotifications[index],
                          ),
                          canRestore: canRestoreArchived,
                          hasOpenTarget: _hasAnyOpenTargetMetadata(
                            visibleNotifications[index],
                          ),
                          isDisabled:
                              isBulkBusy || _actingNotificationId != null,
                          isActing:
                              _isBulkMarkingVisibleRead ||
                              _actingNotificationId ==
                                  visibleNotifications[index].id,
                          revisionOpenButtonKey: ValueKey(
                            'notification-open-revision-$index',
                          ),
                          groupBillOpenButtonKey: ValueKey(
                            'notification-open-group-bill-$index',
                          ),
                          personalBillOpenButtonKey: ValueKey(
                            'notification-open-personal-bill-$index',
                          ),
                          settlementOpenButtonKey: ValueKey(
                            'notification-open-settlement-$index',
                          ),
                          recurringOpenButtonKey: ValueKey(
                            'notification-open-recurring-$index',
                          ),
                          receiptReviewOpenButtonKey: ValueKey(
                            'notification-open-receipt-review-$index',
                          ),
                          syncOpenButtonKey: ValueKey(
                            'notification-open-sync-$index',
                          ),
                          detailsButtonKey: ValueKey(
                            'notification-details-$index',
                          ),
                          markReadButtonKey: ValueKey(
                            'notification-mark-read-$index',
                          ),
                          archiveButtonKey: ValueKey(
                            'notification-archive-$index',
                          ),
                          restoreButtonKey: ValueKey(
                            'notification-restore-$index',
                          ),
                          onOpenBillRevision: () =>
                              _openBillRevision(visibleNotifications[index]),
                          onOpenGroupBill: () =>
                              _openGroupBill(visibleNotifications[index]),
                          onOpenPersonalBill: () =>
                              _openPersonalBill(visibleNotifications[index]),
                          onOpenSettlement: () =>
                              _openSettlement(visibleNotifications[index]),
                          onOpenRecurringBill: () =>
                              _openRecurringBill(visibleNotifications[index]),
                          onOpenReceiptOcrReview: () => _openReceiptOcrReview(
                            visibleNotifications[index],
                          ),
                          onOpenSyncOperation: () =>
                              _openSyncOperation(visibleNotifications[index]),
                          onShowDetails: () => _showNotificationDetails(
                            visibleNotifications[index],
                            selectedFilter: _selectedFilter,
                          ),
                          onMarkRead: () => _markNotificationRead(
                            visibleNotifications[index],
                          ),
                          onArchive: () =>
                              _archiveNotification(visibleNotifications[index]),
                          onRestore: () =>
                              _restoreNotification(visibleNotifications[index]),
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

  Future<void> _showNotificationDetails(
    SettleoraNotificationRow notification, {
    required _NotificationFilter selectedFilter,
  }) async {
    final canOpenTypedTarget =
        notification.status != SettleoraNotificationStatusValues.archived &&
        _canOpenAnyTypedTarget(notification);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _NotificationDetailSheet(
        notification: notification,
        selectedFilterLabel: selectedFilter.label,
        canOpenTypedTarget: canOpenTypedTarget,
        hasOpenTargetMetadata: _hasAnyOpenTargetMetadata(notification),
      ),
    );
  }
}

class _SummaryPanel extends StatelessWidget {
  const _SummaryPanel({
    required this.summary,
    required this.isMarkingAllRead,
    required this.onMarkAllRead,
  });

  final SettleoraNotificationSummary summary;
  final bool isMarkingAllRead;
  final VoidCallback onMarkAllRead;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const Key('notification-summary'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(child: Icon(Icons.inbox_outlined)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Inbox',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                OutlinedButton.icon(
                  key: const Key('notification-mark-all-read'),
                  onPressed: summary.unreadCount > 0 && !isMarkingAllRead
                      ? onMarkAllRead
                      : null,
                  icon: isMarkingAllRead
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.done_all_outlined),
                  label: const Text('Mark All Read'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'API summary counts are server-authoritative; Mark All Read asks the API and this button is only UI guidance.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                SettleoraCountChip(
                  label: 'Unread',
                  count: summary.unreadCount,
                  icon: Icons.mark_email_unread_outlined,
                ),
                SettleoraCountChip(
                  label: 'Attention',
                  count: summary.attentionCount,
                  icon: Icons.priority_high_outlined,
                ),
                SettleoraCountChip(
                  label: 'Urgent',
                  count: summary.urgentCount,
                  icon: Icons.notification_important_outlined,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _NotificationFilter {
  all('All'),
  unread('Unread'),
  read('Read'),
  attention('Attention'),
  urgent('Urgent'),
  bills('Bills'),
  settlements('Settlements'),
  recurring('Recurring'),
  actionable('Actionable'),
  archived('Archived');

  const _NotificationFilter(this.label);

  final String label;
}

class _NotificationFilterCounts {
  const _NotificationFilterCounts({
    required this.all,
    required this.unread,
    required this.read,
    required this.attention,
    required this.urgent,
    required this.bills,
    required this.settlements,
    required this.recurring,
    required this.actionable,
    required this.archived,
  });

  factory _NotificationFilterCounts.fromRows(
    List<SettleoraNotificationRow> rows, {
    required bool Function(SettleoraNotificationRow notification) isActionable,
  }) {
    var unread = 0;
    var read = 0;
    var attention = 0;
    var urgent = 0;
    var bills = 0;
    var settlements = 0;
    var recurring = 0;
    var actionable = 0;
    var archived = 0;

    for (final row in rows) {
      if (row.status == SettleoraNotificationStatusValues.archived) {
        archived += 1;
        continue;
      }
      if (row.status == SettleoraNotificationStatusValues.unread) {
        unread += 1;
      }
      if (row.status == SettleoraNotificationStatusValues.read) {
        read += 1;
      }
      if (row.priority == SettleoraNotificationPriorityValues.attention) {
        attention += 1;
      }
      if (row.priority == SettleoraNotificationPriorityValues.urgent) {
        urgent += 1;
      }
      if (row.subjectType ==
          SettleoraNotificationSubjectTypeValues.expenseBill) {
        bills += 1;
      }
      if (row.subjectType ==
              SettleoraNotificationSubjectTypeValues.settlementRequest ||
          row.subjectType ==
              SettleoraNotificationSubjectTypeValues.settlementPayment) {
        settlements += 1;
      }
      if (row.subjectType ==
          SettleoraNotificationSubjectTypeValues.recurringBillOccurrence) {
        recurring += 1;
      }
      if (row.status == SettleoraNotificationStatusValues.unread &&
          isActionable(row)) {
        actionable += 1;
      }
    }

    return _NotificationFilterCounts(
      all: rows.length,
      unread: unread,
      read: read,
      attention: attention,
      urgent: urgent,
      bills: bills,
      settlements: settlements,
      recurring: recurring,
      actionable: actionable,
      archived: archived,
    );
  }

  final int all;
  final int unread;
  final int read;
  final int attention;
  final int urgent;
  final int bills;
  final int settlements;
  final int recurring;
  final int actionable;
  final int archived;

  int countFor(_NotificationFilter filter) {
    return switch (filter) {
      _NotificationFilter.all => all - archived,
      _NotificationFilter.unread => unread,
      _NotificationFilter.read => read,
      _NotificationFilter.attention => attention,
      _NotificationFilter.urgent => urgent,
      _NotificationFilter.bills => bills,
      _NotificationFilter.settlements => settlements,
      _NotificationFilter.recurring => recurring,
      _NotificationFilter.actionable => actionable,
      _NotificationFilter.archived => archived,
    };
  }
}

class _NotificationFilterBar extends StatelessWidget {
  const _NotificationFilterBar({
    required this.counts,
    required this.selectedFilter,
    required this.onSelected,
  });

  final _NotificationFilterCounts counts;
  final _NotificationFilter selectedFilter;
  final ValueChanged<_NotificationFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: const Key('notification-filters'),
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final filter in _NotificationFilter.values) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                key: ValueKey('notification-filter-${filter.name}'),
                label: Text('${filter.label} (${counts.countFor(filter)})'),
                selected: selectedFilter == filter,
                onSelected: (_) => onSelected(filter),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LoadedFilterScopeNote extends StatelessWidget {
  const _LoadedFilterScopeNote({
    required this.loadedCount,
    required this.suppressedCount,
    required this.visibleCount,
    required this.selectedFilterLabel,
    required this.selectedFilter,
  });

  final int loadedCount;
  final int suppressedCount;
  final int visibleCount;
  final String selectedFilterLabel;
  final _NotificationFilter selectedFilter;

  @override
  Widget build(BuildContext context) {
    final archivedCopy = selectedFilter == _NotificationFilter.archived
        ? 'The Archived filter is the only filter that shows archived loaded rows.'
        : 'Active filters exclude archived rows unless Archived is selected.';
    return Column(
      key: const Key('notification-preference-suppression-note'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Showing $visibleCount of $loadedCount preference-visible loaded rows for $selectedFilterLabel. Local filters only hide loaded rows; clearing filters restores loaded rows, not new server truth. $archivedCopy',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        if (suppressedCount > 0) ...[
          const SizedBox(height: 4),
          Text(
            '$suppressedCount loaded non-critical row${_plural(suppressedCount)} hidden by notification preferences; hidden rows are not deleted or archived.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _VisibleBulkActionsPanel extends StatelessWidget {
  const _VisibleBulkActionsPanel({
    required this.selectedFilterLabel,
    required this.visibleUnreadCount,
    required this.isMarkingVisibleRead,
    required this.isBusy,
    required this.onMarkVisibleRead,
  });

  final String selectedFilterLabel;
  final int visibleUnreadCount;
  final bool isMarkingVisibleRead;
  final bool isBusy;
  final VoidCallback onMarkVisibleRead;

  @override
  Widget build(BuildContext context) {
    final description = visibleUnreadCount == 1
        ? '1 currently visible loaded unread notification in $selectedFilterLabel'
        : '$visibleUnreadCount currently visible loaded unread notifications in $selectedFilterLabel';

    return DecoratedBox(
      key: const Key('notification-visible-bulk-actions'),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          children: [
            Expanded(
              child: Text(
                '$description; status is checked before changes are shown.',
              ),
            ),
            const SizedBox(width: 12),
            OutlinedButton.icon(
              key: const Key('notification-mark-visible-read'),
              onPressed: visibleUnreadCount > 0 && !isBusy
                  ? onMarkVisibleRead
                  : null,
              icon: isMarkingVisibleRead
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.mark_email_read_outlined),
              label: const Text('Mark Visible Read'),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.canOpenBillRevision,
    required this.canOpenGroupBill,
    required this.canOpenPersonalBill,
    required this.canOpenSettlement,
    required this.canOpenRecurringBill,
    required this.canOpenReceiptOcrReview,
    required this.canOpenSyncOperation,
    required this.canRestore,
    required this.hasOpenTarget,
    required this.isDisabled,
    required this.isActing,
    required this.revisionOpenButtonKey,
    required this.groupBillOpenButtonKey,
    required this.personalBillOpenButtonKey,
    required this.settlementOpenButtonKey,
    required this.recurringOpenButtonKey,
    required this.receiptReviewOpenButtonKey,
    required this.syncOpenButtonKey,
    required this.detailsButtonKey,
    required this.markReadButtonKey,
    required this.archiveButtonKey,
    required this.restoreButtonKey,
    required this.onOpenBillRevision,
    required this.onOpenGroupBill,
    required this.onOpenPersonalBill,
    required this.onOpenSettlement,
    required this.onOpenRecurringBill,
    required this.onOpenReceiptOcrReview,
    required this.onOpenSyncOperation,
    required this.onShowDetails,
    required this.onMarkRead,
    required this.onArchive,
    required this.onRestore,
  });

  final SettleoraNotificationRow notification;
  final bool canOpenBillRevision;
  final bool canOpenGroupBill;
  final bool canOpenPersonalBill;
  final bool canOpenSettlement;
  final bool canOpenRecurringBill;
  final bool canOpenReceiptOcrReview;
  final bool canOpenSyncOperation;
  final bool canRestore;
  final bool hasOpenTarget;
  final bool isDisabled;
  final bool isActing;
  final Key revisionOpenButtonKey;
  final Key groupBillOpenButtonKey;
  final Key personalBillOpenButtonKey;
  final Key settlementOpenButtonKey;
  final Key recurringOpenButtonKey;
  final Key receiptReviewOpenButtonKey;
  final Key syncOpenButtonKey;
  final Key detailsButtonKey;
  final Key markReadButtonKey;
  final Key archiveButtonKey;
  final Key restoreButtonKey;
  final VoidCallback onOpenBillRevision;
  final VoidCallback onOpenGroupBill;
  final VoidCallback onOpenPersonalBill;
  final VoidCallback onOpenSettlement;
  final VoidCallback onOpenRecurringBill;
  final VoidCallback onOpenReceiptOcrReview;
  final VoidCallback onOpenSyncOperation;
  final VoidCallback onShowDetails;
  final VoidCallback onMarkRead;
  final VoidCallback onArchive;
  final VoidCallback onRestore;

  @override
  Widget build(BuildContext context) {
    final isArchived =
        notification.status == SettleoraNotificationStatusValues.archived;

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        leading: CircleAvatar(
          child: Icon(_priorityIcon(notification.priority)),
        ),
        title: Text(
          notification.displayTitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(notification.displaySummary),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  SettleoraStatusChip(
                    label: settleoraNotificationStatusLabel(
                      notification.status,
                    ),
                    icon: Icons.mark_email_read_outlined,
                  ),
                  SettleoraStatusChip(
                    label: settleoraNotificationPriorityLabel(
                      notification.priority,
                    ),
                    icon: Icons.flag_outlined,
                  ),
                  SettleoraStatusChip(
                    label: settleoraNotificationSubjectTypeLabel(
                      notification.subjectType,
                    ),
                    icon: Icons.link_outlined,
                  ),
                  if (!isArchived && _canOpenFromTile)
                    const SettleoraStatusChip(
                      label: 'Openable',
                      icon: Icons.open_in_new_outlined,
                    )
                  else if (hasOpenTarget)
                    const SettleoraStatusChip(
                      label: 'Not safely openable',
                      icon: Icons.block_outlined,
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text('Received ${_formatTimestamp(notification.createdAtUtc)}'),
              if (!isArchived && canOpenBillRevision) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: revisionOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenBillRevision,
                  icon: const Icon(Icons.open_in_new_outlined),
                  label: const Text('Review bill'),
                ),
              ] else if (!isArchived && canOpenGroupBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: groupBillOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenGroupBill,
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('Open bill'),
                ),
              ] else if (!isArchived && canOpenPersonalBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: personalBillOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenPersonalBill,
                  icon: const Icon(Icons.receipt_outlined),
                  label: const Text('Open bill'),
                ),
              ] else if (!isArchived && canOpenSettlement) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: settlementOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenSettlement,
                  icon: const Icon(Icons.account_balance_wallet_outlined),
                  label: const Text('Review settlement'),
                ),
              ] else if (!isArchived && canOpenRecurringBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: recurringOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenRecurringBill,
                  icon: const Icon(Icons.event_repeat_outlined),
                  label: const Text('Review bill'),
                ),
              ] else if (!isArchived && canOpenReceiptOcrReview) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: receiptReviewOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenReceiptOcrReview,
                  icon: const Icon(Icons.document_scanner_outlined),
                  label: const Text('Review receipt'),
                ),
              ] else if (!isArchived && canOpenSyncOperation) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: syncOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenSyncOperation,
                  icon: const Icon(Icons.sync_problem_outlined),
                  label: const Text('Review sync issue'),
                ),
              ] else if (!isArchived && hasOpenTarget) ...[
                const SizedBox(height: 8),
                const Text(
                  'This notification cannot be opened safely here yet. Refresh notifications or use the related section if it is available to this account.',
                ),
              ],
            ],
          ),
        ),
        trailing: SizedBox(
          width: 152,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              IconButton(
                key: detailsButtonKey,
                tooltip: 'Notification details',
                onPressed: isDisabled ? null : onShowDetails,
                icon: const Icon(Icons.info_outline),
              ),
              if (isArchived)
                IconButton(
                  key: restoreButtonKey,
                  tooltip: 'Restore',
                  onPressed: !isDisabled && canRestore ? onRestore : null,
                  icon: isActing
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.unarchive_outlined),
                )
              else ...[
                IconButton(
                  key: markReadButtonKey,
                  tooltip: 'Mark read',
                  onPressed: notification.isUnread && !isDisabled
                      ? onMarkRead
                      : null,
                  icon: isActing
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.mark_email_read_outlined),
                ),
                IconButton(
                  key: archiveButtonKey,
                  tooltip: 'Archive',
                  onPressed: isDisabled ? null : onArchive,
                  icon: const Icon(Icons.archive_outlined),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  bool get _canOpenFromTile {
    return canOpenBillRevision ||
        canOpenGroupBill ||
        canOpenPersonalBill ||
        canOpenSettlement ||
        canOpenRecurringBill ||
        canOpenReceiptOcrReview ||
        canOpenSyncOperation;
  }
}

class _NotificationDetailSheet extends StatelessWidget {
  const _NotificationDetailSheet({
    required this.notification,
    required this.selectedFilterLabel,
    required this.canOpenTypedTarget,
    required this.hasOpenTargetMetadata,
  });

  final SettleoraNotificationRow notification;
  final String selectedFilterLabel;
  final bool canOpenTypedTarget;
  final bool hasOpenTargetMetadata;

  @override
  Widget build(BuildContext context) {
    final updatedAt = _latestNotificationUpdate(notification);
    final isArchived =
        notification.status == SettleoraNotificationStatusValues.archived;
    final destinationLabel = _safeDestinationLabel(notification);
    final destinationStatus = _safeDestinationStatus(
      notification,
      canOpenTypedTarget: canOpenTypedTarget,
      hasOpenTargetMetadata: hasOpenTargetMetadata,
    );
    final detailLabelStyle = Theme.of(context).textTheme.labelLarge;

    return SafeArea(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            key: const Key('notification-detail-sheet'),
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    child: Icon(_priorityIcon(notification.priority)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      notification.displayTitle,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SettleoraKeyValueText(
                label: 'Summary',
                value: notification.displaySummary,
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Event',
                value: settleoraNotificationEventLabel(notification.eventType),
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Priority',
                value: settleoraNotificationPriorityLabel(
                  notification.priority,
                ),
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Status',
                value: settleoraNotificationStatusLabel(notification.status),
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Type',
                value: settleoraNotificationSubjectTypeLabel(
                  notification.subjectType,
                ),
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Received',
                value: _formatTimestamp(notification.createdAtUtc),
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              if (updatedAt != null)
                SettleoraKeyValueText(
                  label: 'Updated',
                  value: _formatTimestamp(updatedAt),
                  labelWidth: 120,
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  labelStyle: detailLabelStyle,
                  valueAlignment: Alignment.centerLeft,
                  valueTextAlign: TextAlign.start,
                ),
              SettleoraKeyValueText(
                label: 'Destination',
                value: destinationLabel,
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Destination status',
                value: destinationStatus,
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Navigation safety',
                value:
                    'Raw links, notification IDs, and linked-resource IDs are routing hints only. Settleora opens only supported typed destinations.',
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Current filter',
                value: selectedFilterLabel,
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              SettleoraKeyValueText(
                label: 'Authority',
                value:
                    'The destination API re-checks access and current state before linked details or actions are shown.',
                labelWidth: 120,
                padding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: detailLabelStyle,
                valueAlignment: Alignment.centerLeft,
                valueTextAlign: TextAlign.start,
              ),
              if (isArchived)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Archived notifications do not open automatically.',
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationSyncOperationScreen extends StatelessWidget {
  const _NotificationSyncOperationScreen({required this.result});

  final SettleoraSyncOperationResult result;

  @override
  Widget build(BuildContext context) {
    final statusLabel = _syncStatusLabel(result.status);
    final safeMessage = _safeSyncMessage(result.safeMessage);
    return Scaffold(
      appBar: AppBar(title: const Text('Sync issue')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
          children: [
            SettleoraStatePanel(
              icon: result.isConflict
                  ? Icons.sync_problem_outlined
                  : Icons.cloud_sync_outlined,
              title: result.isSynced ? 'This item is up to date' : 'Sync issue',
              message:
                  'Settleora refreshed this sync issue through the current account before showing this readout.',
              compact: true,
            ),
            const SizedBox(height: 12),
            DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SettleoraStatusChip(
                      label: statusLabel,
                      icon: result.isConflict
                          ? Icons.report_problem_outlined
                          : Icons.sync_outlined,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      safeMessage ??
                          'No additional action is available from this notification.',
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Retry, conflict resolution, and source changes stay with the authorized sync and bill flows. Opening or archiving this notification does not change source records.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back_outlined),
              label: const Text('Back to notifications'),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotificationHandoffBillRepository implements SettleoraBillRepository {
  const _NotificationHandoffBillRepository(this._delegate);

  final SettleoraBillRepository _delegate;

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) {
    return _delegate.listPersonalBills(limit: limit);
  }

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
    return _delegate.createPersonalBill(draft);
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) async {
    try {
      return await _delegate.getPersonalBill(billId);
    } catch (error) {
      throw _safeBillDestinationFailure(error);
    }
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) {
    return _delegate.listGroupBills(groupId, limit: limit);
  }

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) {
    return _delegate.createGroupBill(groupId, draft);
  }

  @override
  Future<void> submitGroupBill(String groupId, String billId) {
    return _delegate.submitGroupBill(groupId, billId);
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) {
    return _delegate.acceptGroupBillParticipant(groupId, billId, userProfileId);
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) {
    return _delegate.rejectGroupBillParticipant(
      groupId,
      billId,
      userProfileId,
      reasonCode,
    );
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    try {
      return await _delegate.getGroupBill(groupId, billId);
    } catch (error) {
      throw _safeBillDestinationFailure(error);
    }
  }
}

Object _safeBillDestinationFailure(Object error) {
  if (error is SettleoraBillFailure) {
    return SettleoraBillFailure(
      kind: error.kind,
      message: _safeDestinationFailureMessage(
        error.message,
        fallbackMessage:
            'The bill destination is unavailable. Refresh notifications or open the related list to retry.',
      ),
      statusCode: error.statusCode,
    );
  }

  return error;
}

SettleoraNotificationFailure _notificationFailureFromGroupOpen(Object error) {
  if (error is SettleoraGroupFailure) {
    return SettleoraNotificationFailure(
      kind: switch (error.kind) {
        SettleoraGroupFailureKind.sessionRequired =>
          SettleoraNotificationFailureKind.sessionRequired,
        SettleoraGroupFailureKind.sessionExpired =>
          SettleoraNotificationFailureKind.sessionExpired,
        SettleoraGroupFailureKind.denied =>
          SettleoraNotificationFailureKind.denied,
        SettleoraGroupFailureKind.unavailable =>
          SettleoraNotificationFailureKind.unavailable,
        SettleoraGroupFailureKind.conflict =>
          SettleoraNotificationFailureKind.conflict,
        SettleoraGroupFailureKind.validation =>
          SettleoraNotificationFailureKind.validation,
        SettleoraGroupFailureKind.network =>
          SettleoraNotificationFailureKind.network,
        SettleoraGroupFailureKind.server =>
          SettleoraNotificationFailureKind.server,
      },
      message: _safeDestinationFailureMessage(
        error.message,
        fallbackMessage:
            'The bill destination is unavailable. Refresh notifications or open the related list to retry.',
      ),
      statusCode: error.statusCode,
    );
  }

  return const SettleoraNotificationFailure(
    kind: SettleoraNotificationFailureKind.network,
    message:
        'The bill could not be opened. Try again when the connection is back.',
  );
}

SettleoraNotificationFailure _notificationFailureFromBillOpen(Object error) {
  if (error is SettleoraBillFailure) {
    return SettleoraNotificationFailure(
      kind: switch (error.kind) {
        SettleoraBillFailureKind.sessionRequired =>
          SettleoraNotificationFailureKind.sessionRequired,
        SettleoraBillFailureKind.sessionExpired =>
          SettleoraNotificationFailureKind.sessionExpired,
        SettleoraBillFailureKind.denied =>
          SettleoraNotificationFailureKind.denied,
        SettleoraBillFailureKind.unavailable =>
          SettleoraNotificationFailureKind.unavailable,
        SettleoraBillFailureKind.conflict =>
          SettleoraNotificationFailureKind.conflict,
        SettleoraBillFailureKind.validation =>
          SettleoraNotificationFailureKind.validation,
        SettleoraBillFailureKind.network =>
          SettleoraNotificationFailureKind.network,
        SettleoraBillFailureKind.server =>
          SettleoraNotificationFailureKind.server,
      },
      message: _safeDestinationFailureMessage(
        error.message,
        fallbackMessage:
            'The bill destination is unavailable. Refresh notifications or open the related list to retry.',
      ),
      statusCode: error.statusCode,
    );
  }

  return const SettleoraNotificationFailure(
    kind: SettleoraNotificationFailureKind.network,
    message:
        'The bill could not be opened. Try again when the connection is back.',
  );
}

SettleoraNotificationFailure _notificationFailureFromSyncOpen(
  SettleoraSyncFailure failure,
) {
  return SettleoraNotificationFailure(
    kind: switch (failure.kind) {
      SettleoraSyncFailureKind.sessionRequired =>
        SettleoraNotificationFailureKind.sessionRequired,
      SettleoraSyncFailureKind.sessionExpired =>
        SettleoraNotificationFailureKind.sessionExpired,
      SettleoraSyncFailureKind.denied =>
        SettleoraNotificationFailureKind.denied,
      SettleoraSyncFailureKind.unavailable =>
        SettleoraNotificationFailureKind.unavailable,
      SettleoraSyncFailureKind.conflict =>
        SettleoraNotificationFailureKind.conflict,
      SettleoraSyncFailureKind.validation =>
        SettleoraNotificationFailureKind.validation,
      SettleoraSyncFailureKind.retryable =>
        SettleoraNotificationFailureKind.network,
      SettleoraSyncFailureKind.server =>
        SettleoraNotificationFailureKind.server,
    },
    message: _safeDestinationFailureMessage(
      failure.message,
      fallbackMessage:
          'The sync issue is not available right now. Retry from Notifications after refreshing.',
    ),
    statusCode: failure.statusCode,
  );
}

SettleoraNotificationFailure _safeOpenFallbackFailure(
  SettleoraNotificationOpenFallbackState state,
) {
  return switch (state) {
    SettleoraNotificationOpenFallbackState.missing =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.unavailable,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.archived =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.unavailable,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.unsupported =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.validation,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.signInRequired =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.sessionRequired,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.wrongAccount =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.denied,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.localOnly =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.unavailable,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.offline =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.network,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.stale =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.unavailable,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.unauthorized =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.denied,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.resolved =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.conflict,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
    SettleoraNotificationOpenFallbackState.providerUnconfigured =>
      SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.unavailable,
        message: settleoraNotificationOpenFallbackMessage(state),
      ),
  };
}

SettleoraNotificationFailure _safeOpenReadFailure(Object error) {
  final failure = SettleoraNotificationFailure.from(error);
  return SettleoraNotificationFailure(
    kind: failure.kind,
    message: 'Notification status could not be refreshed. Try again later.',
    statusCode: failure.statusCode,
  );
}

SettleoraNotificationFailure _safeNotificationActionFailure(
  Object error, {
  required String fallbackMessage,
}) {
  final failure = SettleoraNotificationFailure.from(error);
  return SettleoraNotificationFailure(
    kind: failure.kind,
    message: _isUnsafeNotificationUiText(failure.message)
        ? fallbackMessage
        : failure.message,
    statusCode: failure.statusCode,
  );
}

String _safeDestinationFailureMessage(
  String message, {
  required String fallbackMessage,
}) {
  return _isUnsafeNotificationUiText(message) ? fallbackMessage : message;
}

bool _isUnsafeNotificationUiText(String value) {
  final lower = value.toLowerCase();
  return _notificationUuidPattern.hasMatch(value) ||
      lower.contains('token=') ||
      lower.contains('secret') ||
      lower.contains('bearer ') ||
      lower.contains('stack trace') ||
      lower.contains('generated') ||
      lower.contains('storage') ||
      lower.contains('provider') ||
      lower.contains('receipt') ||
      lower.contains('ocr') ||
      lower.contains('proof') ||
      lower.contains('payment details') ||
      lower.contains('filesystem') ||
      lower.contains('/tmp/') ||
      lower.contains('/var/') ||
      lower.contains('/home/') ||
      lower.contains('http://') ||
      lower.contains('https://') ||
      value.contains('/api/') ||
      value.contains('?');
}

final _notificationUuidPattern = RegExp(
  r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
);

Map<String, String> _participantDisplayNamesFromMembers(
  Iterable<SettleoraGroupMember> members,
) {
  return {
    for (final member in members)
      if (member.userProfileId.trim().isNotEmpty &&
          member.safeDisplayName.trim().isNotEmpty)
        member.userProfileId.trim(): member.safeDisplayName.trim(),
  };
}

bool _matchesFilter(
  SettleoraNotificationRow notification,
  _NotificationFilter filter, {
  required bool Function(SettleoraNotificationRow notification) isActionable,
}) {
  return switch (filter) {
    _NotificationFilter.all =>
      notification.status != SettleoraNotificationStatusValues.archived,
    _NotificationFilter.unread =>
      notification.status == SettleoraNotificationStatusValues.unread,
    _NotificationFilter.read =>
      notification.status == SettleoraNotificationStatusValues.read,
    _NotificationFilter.attention =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.priority ==
              SettleoraNotificationPriorityValues.attention,
    _NotificationFilter.urgent =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.priority == SettleoraNotificationPriorityValues.urgent,
    _NotificationFilter.bills =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.subjectType ==
              SettleoraNotificationSubjectTypeValues.expenseBill,
    _NotificationFilter.settlements =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          (notification.subjectType ==
                  SettleoraNotificationSubjectTypeValues.settlementRequest ||
              notification.subjectType ==
                  SettleoraNotificationSubjectTypeValues.settlementPayment),
    _NotificationFilter.recurring =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.subjectType ==
              SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
    _NotificationFilter.actionable =>
      notification.status == SettleoraNotificationStatusValues.unread &&
          isActionable(notification),
    _NotificationFilter.archived =>
      notification.status == SettleoraNotificationStatusValues.archived,
  };
}

bool _hasAnyOpenTargetMetadata(SettleoraNotificationRow notification) {
  return notification.hasTypedOpenTarget ||
      settleoraNotificationMetadataId(notification.actionUrl) != null;
}

String _safeDestinationLabel(SettleoraNotificationRow notification) {
  if (notification.hasBillRevisionReviewTarget) {
    return 'Bill revision review';
  }
  if (notification.hasGroupBillTarget) {
    return 'Group bill';
  }
  if (notification.hasPersonalBillTarget) {
    return 'Personal bill';
  }
  if (notification.hasSettlementTarget) {
    return 'Settlement';
  }
  if (notification.hasRecurringBillTarget) {
    return 'Recurring bill';
  }
  if (notification.hasReceiptOcrReviewTarget) {
    return 'Receipt review';
  }
  if (notification.hasSyncOperationTarget) {
    return 'Sync issue';
  }
  if (settleoraNotificationMetadataId(notification.actionUrl) != null) {
    return 'Unsupported link';
  }

  return 'None';
}

String _safeDestinationStatus(
  SettleoraNotificationRow notification, {
  required bool canOpenTypedTarget,
  required bool hasOpenTargetMetadata,
}) {
  if (notification.status == SettleoraNotificationStatusValues.archived) {
    return 'Archived; restore before opening from Notifications.';
  }
  if (canOpenTypedTarget) {
    return 'Ready to open from this device.';
  }
  if (notification.hasTypedOpenTarget) {
    return 'Supported destination, but the current app context cannot open it.';
  }
  if (hasOpenTargetMetadata) {
    return 'Related destination metadata is present, but it is not safe to open here.';
  }

  return 'No supported destination metadata is available.';
}

String _emptyTitleForFilter(_NotificationFilter filter) {
  return switch (filter) {
    _NotificationFilter.unread => 'No unread notifications',
    _NotificationFilter.read => 'No read notifications',
    _NotificationFilter.archived => 'No archived notifications',
    _ => 'No matching notifications',
  };
}

String _emptyMessageForFilter(_NotificationFilter filter) {
  return switch (filter) {
    _NotificationFilter.unread =>
      'No loaded unread rows match. Refresh to ask the API for current notification state.',
    _NotificationFilter.read =>
      'No loaded read rows match. Clearing filters restores already-loaded rows only.',
    _NotificationFilter.archived =>
      'Archived loaded rows appear only in this filter. Refresh to ask the API for current notification state.',
    _NotificationFilter.actionable =>
      'No currently loaded unread rows have a supported action. Notification metadata is not permission.',
    _ =>
      'No loaded rows match this local filter. Clearing filters restores already-loaded rows only.',
  };
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({
    required this.failure,
    required this.onRetry,
    this.onSessionEnded,
  });

  final SettleoraNotificationFailure failure;
  final VoidCallback onRetry;
  final VoidCallback? onSessionEnded;

  @override
  Widget build(BuildContext context) {
    final requiresSignIn =
        failure.kind == SettleoraNotificationFailureKind.sessionRequired ||
        failure.kind == SettleoraNotificationFailureKind.sessionExpired;

    return SettleoraStatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      action: requiresSignIn && onSessionEnded != null
          ? FilledButton.icon(
              key: const Key('notification-sign-in-required'),
              onPressed: onSessionEnded,
              icon: const Icon(Icons.login_outlined),
              label: const Text('Sign In'),
            )
          : OutlinedButton.icon(
              key: const Key('notification-retry'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
    );
  }
}

class _InlineFailure extends StatelessWidget {
  const _InlineFailure({required this.failure});

  final SettleoraNotificationFailure failure;

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

class _EmptyNotifications extends StatelessWidget {
  const _EmptyNotifications({
    this.title = 'No notifications',
    this.message = 'Visible in-app notifications will appear here.',
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return SettleoraStatePanel(
      icon: Icons.notifications_none_outlined,
      title: title,
      message: message,
      compact: true,
      compactPadding: const EdgeInsets.symmetric(vertical: 24),
    );
  }
}

IconData _priorityIcon(SettleoraNotificationPriority priority) {
  return switch (priority) {
    SettleoraNotificationPriorityValues.urgent =>
      Icons.notification_important_outlined,
    SettleoraNotificationPriorityValues.attention =>
      Icons.priority_high_outlined,
    _ => Icons.inbox_outlined,
  };
}

IconData _failureIcon(SettleoraNotificationFailureKind kind) {
  return switch (kind) {
    SettleoraNotificationFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraNotificationFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraNotificationFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraNotificationFailureKind.unavailable =>
      Icons.visibility_off_outlined,
    SettleoraNotificationFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraNotificationFailureKind.validation =>
      Icons.report_problem_outlined,
    SettleoraNotificationFailureKind.network => Icons.cloud_off_outlined,
    SettleoraNotificationFailureKind.server => Icons.error_outline,
  };
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}

String _plural(int count) => count == 1 ? '' : 's';

DateTime? _latestNotificationUpdate(SettleoraNotificationRow notification) {
  final readAt = notification.readAtUtc;
  final archivedAt = notification.archivedAtUtc;
  if (readAt == null) {
    return archivedAt;
  }
  if (archivedAt == null) {
    return readAt;
  }

  return readAt.isAfter(archivedAt) ? readAt : archivedAt;
}

String _syncStatusLabel(SettleoraSyncOperationResultStatus status) {
  return switch (status) {
    SettleoraSyncOperationResultStatusValues.accepted => 'Synced',
    SettleoraSyncOperationResultStatusValues.replayed => 'Already synced',
    SettleoraSyncOperationResultStatusValues.rejected => 'Needs review',
    SettleoraSyncOperationResultStatusValues.conflict => 'Needs review',
    _ => 'Sync issue',
  };
}

String? _safeSyncMessage(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }
  if (_isUnsafeNotificationUiText(trimmed)) {
    return null;
  }
  if (trimmed.length > 180) {
    return '${trimmed.substring(0, 177)}...';
  }

  return trimmed;
}

SettleoraNotificationRow _copyNotificationRead(
  SettleoraNotificationRow notification,
) {
  if (notification.status == SettleoraNotificationStatusValues.archived ||
      notification.status == SettleoraNotificationStatusValues.read) {
    return notification;
  }

  return SettleoraNotificationRow(
    id: notification.id,
    eventType: notification.eventType,
    status: SettleoraNotificationStatusValues.read,
    priority: notification.priority,
    subjectType: notification.subjectType,
    safeSummary: notification.safeSummary,
    actionUrl: notification.actionUrl,
    groupId: notification.groupId,
    expenseBillId: notification.expenseBillId,
    expenseBillRevisionId: notification.expenseBillRevisionId,
    settlementRequestId: notification.settlementRequestId,
    settlementPaymentId: notification.settlementPaymentId,
    recurringBillTemplateId: notification.recurringBillTemplateId,
    recurringBillOccurrenceId: notification.recurringBillOccurrenceId,
    receiptOcrReviewId: notification.receiptOcrReviewId,
    receiptAttachmentFileId: notification.receiptAttachmentFileId,
    syncOperationId: notification.syncOperationId,
    createdAtUtc: notification.createdAtUtc,
    readAtUtc: notification.readAtUtc ?? notification.createdAtUtc,
    archivedAtUtc: notification.archivedAtUtc,
  );
}
