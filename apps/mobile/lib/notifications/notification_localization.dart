import 'package:flutter/widgets.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';

import 'notification_repository.dart';

const settleoraNotificationTitleCatalogKeys = <String>{
  'notifications.bill.submitted.title',
  'notifications.bill.participant_accepted.title',
  'notifications.bill.participant_rejected.title',
  'notifications.bill.confirmed.title',
  'notifications.bill.revision_proposed.title',
  'notifications.bill.revision_resubmitted.title',
  'notifications.bill.revision_submitted.title',
  'notifications.bill.revision_withdrawn.title',
  'notifications.bill.revision_approved.title',
  'notifications.bill.revision_rejected.title',
  'notifications.bill.revision_payer_confirmed.title',
  'notifications.bill.revision_applied.title',
  'notifications.settlement.request_created.title',
  'notifications.settlement.payment_marked_paid.title',
  'notifications.settlement.payment_partially_paid.title',
  'notifications.settlement.payment_confirmed.title',
  'notifications.settlement.request_disputed.title',
  'notifications.settlement.payment_disputed.title',
  'notifications.settlement.request_cancelled.title',
  'notifications.settlement.payment_cancelled.title',
  'notifications.settlement.proof_attached.title',
  'notifications.settlement.residual_review_needed.title',
  'notifications.recurring_bill.due_soon.title',
  'notifications.recurring_bill.draft_generated.title',
  'notifications.sync.conflict_detected.title',
  'notifications.sync.operation_failed.title',
  'notifications.ocr.needs_review.title',
};

const settleoraNotificationMessageCatalogKeys = <String>{
  'notifications.bill.submitted.message',
  'notifications.bill.participant_accepted.message',
  'notifications.bill.participant_rejected.message',
  'notifications.bill.confirmed.message',
  'notifications.bill.revision_proposed.message',
  'notifications.bill.revision_resubmitted.message',
  'notifications.bill.revision_submitted.message',
  'notifications.bill.revision_withdrawn.message',
  'notifications.bill.revision_approved.message',
  'notifications.bill.revision_rejected.message',
  'notifications.bill.revision_payer_confirmed.message',
  'notifications.bill.revision_applied.message',
  'notifications.settlement.request_created.message',
  'notifications.settlement.payment_marked_paid.message',
  'notifications.settlement.payment_partially_paid.message',
  'notifications.settlement.payment_confirmed.message',
  'notifications.settlement.request_disputed.message',
  'notifications.settlement.payment_disputed.message',
  'notifications.settlement.request_cancelled.message',
  'notifications.settlement.payment_cancelled.message',
  'notifications.settlement.proof_attached.message',
  'notifications.settlement.residual_review_needed.message',
  'notifications.recurring_bill.due_soon.message',
  'notifications.recurring_bill.draft_generated.message',
  'notifications.sync.conflict_detected.message',
  'notifications.sync.operation_failed.message',
  'notifications.ocr.needs_review.message',
};

String settleoraLocalizedNotificationTitle(
  BuildContext context,
  SettleoraNotificationRow notification,
) {
  final localizations = Localizations.of<AppLocalizations>(
    context,
    AppLocalizations,
  );
  return localizations == null
      ? notification.displayTitle
      : settleoraNotificationCatalogTitle(
              localizations,
              notification.titleKey,
            ) ??
            notification.displayTitle;
}

String settleoraLocalizedNotificationSummary(
  BuildContext context,
  SettleoraNotificationRow notification,
) {
  final safeSummary = notification.boundedSafeSummary;
  if (safeSummary != null) {
    return safeSummary;
  }

  final localizations = Localizations.of<AppLocalizations>(
    context,
    AppLocalizations,
  );
  return localizations == null
      ? notification.displaySummary
      : settleoraNotificationCatalogMessage(
              localizations,
              notification.messageKey,
            ) ??
            notification.displaySummary;
}

String? settleoraNotificationCatalogTitle(
  AppLocalizations localizations,
  String? titleKey,
) => switch (titleKey) {
  'notifications.bill.submitted.title' =>
    localizations.notificationBillSubmittedTitle,
  'notifications.bill.participant_accepted.title' =>
    localizations.notificationBillParticipantAcceptedTitle,
  'notifications.bill.participant_rejected.title' =>
    localizations.notificationBillParticipantRejectedTitle,
  'notifications.bill.confirmed.title' =>
    localizations.notificationBillConfirmedTitle,
  'notifications.bill.revision_proposed.title' =>
    localizations.notificationBillRevisionProposedTitle,
  'notifications.bill.revision_resubmitted.title' =>
    localizations.notificationBillRevisionResubmittedTitle,
  'notifications.bill.revision_submitted.title' =>
    localizations.notificationBillRevisionSubmittedTitle,
  'notifications.bill.revision_withdrawn.title' =>
    localizations.notificationBillRevisionWithdrawnTitle,
  'notifications.bill.revision_approved.title' =>
    localizations.notificationBillRevisionApprovedTitle,
  'notifications.bill.revision_rejected.title' =>
    localizations.notificationBillRevisionRejectedTitle,
  'notifications.bill.revision_payer_confirmed.title' =>
    localizations.notificationBillRevisionPayerConfirmedTitle,
  'notifications.bill.revision_applied.title' =>
    localizations.notificationBillRevisionAppliedTitle,
  'notifications.settlement.request_created.title' =>
    localizations.notificationSettlementRequestCreatedTitle,
  'notifications.settlement.payment_marked_paid.title' =>
    localizations.notificationSettlementPaymentMarkedPaidTitle,
  'notifications.settlement.payment_partially_paid.title' =>
    localizations.notificationSettlementPaymentPartiallyPaidTitle,
  'notifications.settlement.payment_confirmed.title' =>
    localizations.notificationSettlementPaymentConfirmedTitle,
  'notifications.settlement.request_disputed.title' =>
    localizations.notificationSettlementRequestDisputedTitle,
  'notifications.settlement.payment_disputed.title' =>
    localizations.notificationSettlementPaymentDisputedTitle,
  'notifications.settlement.request_cancelled.title' =>
    localizations.notificationSettlementRequestCancelledTitle,
  'notifications.settlement.payment_cancelled.title' =>
    localizations.notificationSettlementPaymentCancelledTitle,
  'notifications.settlement.proof_attached.title' =>
    localizations.notificationSettlementProofAttachedTitle,
  'notifications.settlement.residual_review_needed.title' =>
    localizations.notificationSettlementResidualReviewNeededTitle,
  'notifications.recurring_bill.due_soon.title' =>
    localizations.notificationRecurringBillDueSoonTitle,
  'notifications.recurring_bill.draft_generated.title' =>
    localizations.notificationRecurringBillDraftGeneratedTitle,
  'notifications.sync.conflict_detected.title' =>
    localizations.notificationSyncConflictDetectedTitle,
  'notifications.sync.operation_failed.title' =>
    localizations.notificationSyncOperationFailedTitle,
  'notifications.ocr.needs_review.title' =>
    localizations.notificationOcrNeedsReviewTitle,
  _ => null,
};

String? settleoraNotificationCatalogMessage(
  AppLocalizations localizations,
  String? messageKey,
) => switch (messageKey) {
  'notifications.bill.submitted.message' =>
    localizations.notificationBillSubmittedMessage,
  'notifications.bill.participant_accepted.message' =>
    localizations.notificationBillParticipantAcceptedMessage,
  'notifications.bill.participant_rejected.message' =>
    localizations.notificationBillParticipantRejectedMessage,
  'notifications.bill.confirmed.message' =>
    localizations.notificationBillConfirmedMessage,
  'notifications.bill.revision_proposed.message' =>
    localizations.notificationBillRevisionProposedMessage,
  'notifications.bill.revision_resubmitted.message' =>
    localizations.notificationBillRevisionResubmittedMessage,
  'notifications.bill.revision_submitted.message' =>
    localizations.notificationBillRevisionSubmittedMessage,
  'notifications.bill.revision_withdrawn.message' =>
    localizations.notificationBillRevisionWithdrawnMessage,
  'notifications.bill.revision_approved.message' =>
    localizations.notificationBillRevisionApprovedMessage,
  'notifications.bill.revision_rejected.message' =>
    localizations.notificationBillRevisionRejectedMessage,
  'notifications.bill.revision_payer_confirmed.message' =>
    localizations.notificationBillRevisionPayerConfirmedMessage,
  'notifications.bill.revision_applied.message' =>
    localizations.notificationBillRevisionAppliedMessage,
  'notifications.settlement.request_created.message' =>
    localizations.notificationSettlementRequestCreatedMessage,
  'notifications.settlement.payment_marked_paid.message' =>
    localizations.notificationSettlementPaymentMarkedPaidMessage,
  'notifications.settlement.payment_partially_paid.message' =>
    localizations.notificationSettlementPaymentPartiallyPaidMessage,
  'notifications.settlement.payment_confirmed.message' =>
    localizations.notificationSettlementPaymentConfirmedMessage,
  'notifications.settlement.request_disputed.message' =>
    localizations.notificationSettlementRequestDisputedMessage,
  'notifications.settlement.payment_disputed.message' =>
    localizations.notificationSettlementPaymentDisputedMessage,
  'notifications.settlement.request_cancelled.message' =>
    localizations.notificationSettlementRequestCancelledMessage,
  'notifications.settlement.payment_cancelled.message' =>
    localizations.notificationSettlementPaymentCancelledMessage,
  'notifications.settlement.proof_attached.message' =>
    localizations.notificationSettlementProofAttachedMessage,
  'notifications.settlement.residual_review_needed.message' =>
    localizations.notificationSettlementResidualReviewNeededMessage,
  'notifications.recurring_bill.due_soon.message' =>
    localizations.notificationRecurringBillDueSoonMessage,
  'notifications.recurring_bill.draft_generated.message' =>
    localizations.notificationRecurringBillDraftGeneratedMessage,
  'notifications.sync.conflict_detected.message' =>
    localizations.notificationSyncConflictDetectedMessage,
  'notifications.sync.operation_failed.message' =>
    localizations.notificationSyncOperationFailedMessage,
  'notifications.ocr.needs_review.message' =>
    localizations.notificationOcrNeedsReviewMessage,
  _ => null,
};
