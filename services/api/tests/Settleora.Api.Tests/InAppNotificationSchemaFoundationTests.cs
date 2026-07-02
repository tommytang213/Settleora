using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Sync;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class InAppNotificationSchemaFoundationTests
{
    private const string UserNotificationEventTypeConstraintSql =
        "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'settlement.residual_review_needed', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'sync.operation_failed', 'ocr.needs_review')";

    private const string SyncOperationFailedNotificationEventTypeConstraintSql =
        "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'sync.operation_failed', 'ocr.needs_review')";

    private const string UserNotificationSubjectTypeConstraintSql =
        "subject_type IN ('expense_bill', 'settlement_request', 'settlement_payment', 'recurring_bill_occurrence', 'sync_operation', 'receipt_ocr_review')";

    private const string BillRevisionNotificationEventTypeConstraintSql =
        "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.draft_generated')";

    private const string RecurringDueSoonNotificationEventTypeConstraintSql =
        "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated')";

    private const string SyncConflictNotificationEventTypeConstraintSql =
        "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected')";

    private const string SyncConflictNotificationSubjectTypeConstraintSql =
        "subject_type IN ('expense_bill', 'settlement_request', 'settlement_payment', 'recurring_bill_occurrence', 'sync_operation')";

    private const string OcrNeedsReviewNotificationEventTypeConstraintSql =
        "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'ocr.needs_review')";

    private static readonly string[] RequiredBillRevisionNotificationEventTypes =
    [
        InAppNotificationEventTypes.BillRevisionProposed,
        InAppNotificationEventTypes.BillRevisionResubmitted,
        InAppNotificationEventTypes.BillRevisionSubmitted,
        InAppNotificationEventTypes.BillRevisionWithdrawn,
        InAppNotificationEventTypes.BillRevisionApproved,
        InAppNotificationEventTypes.BillRevisionRejected,
        InAppNotificationEventTypes.BillRevisionPayerConfirmed,
        InAppNotificationEventTypes.BillRevisionApplied
    ];

    [Fact]
    public void InAppNotificationConstantsRepresentBoundedFoundationValues()
    {
        Assert.Equal(80, InAppNotificationConstraints.EventTypeMaxLength);
        Assert.Equal(16, InAppNotificationConstraints.StatusMaxLength);
        Assert.Equal(16, InAppNotificationConstraints.PriorityMaxLength);
        Assert.Equal(40, InAppNotificationConstraints.SubjectTypeMaxLength);
        Assert.Equal(120, InAppNotificationConstraints.TemplateKeyMaxLength);
        Assert.Equal(240, InAppNotificationConstraints.SafeSummaryMaxLength);
        Assert.Equal(240, InAppNotificationConstraints.ActionUrlMaxLength);
        Assert.Equal(32, NotificationPreferenceConstraints.DeliveryTimingMaxLength);

        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.BillSubmitted));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.SettlementProofAttached));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.SettlementResidualReviewNeeded));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.RecurringBillDueSoon));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.RecurringBillDraftGenerated));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.SyncConflictDetected));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.SyncOperationFailed));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.OcrNeedsReview));
        Assert.All(
            RequiredBillRevisionNotificationEventTypes,
            eventType => Assert.True(InAppNotificationEventTypes.IsSupported(eventType), eventType));
        Assert.False(InAppNotificationEventTypes.IsSupported("email.delivery_requested"));
        Assert.False(InAppNotificationEventTypes.IsSupported("raw_ocr_text"));
        Assert.False(InAppNotificationEventTypes.IsSupported("receipt_ocr_review.needs_review"));
        Assert.False(InAppNotificationEventTypes.IsSupported("sync.operation_conflict"));
        Assert.False(InAppNotificationEventTypes.IsSupported("sync.operation_queued"));
        Assert.False(InAppNotificationEventTypes.IsSupported("sync.conflict_resolved"));
        Assert.False(InAppNotificationEventTypes.IsSupported("ocr.completed"));
        Assert.False(InAppNotificationEventTypes.IsSupported("ocr.failed"));

        Assert.True(InAppNotificationSubjectTypes.IsSupported(InAppNotificationSubjectTypes.SyncOperation));
        Assert.True(InAppNotificationSubjectTypes.IsSupported(InAppNotificationSubjectTypes.ReceiptOcrReview));

        Assert.True(InAppNotificationStatuses.IsSupported(InAppNotificationStatuses.Unread));
        Assert.True(InAppNotificationStatuses.IsSupported(InAppNotificationStatuses.Read));
        Assert.True(InAppNotificationStatuses.IsSupported(InAppNotificationStatuses.Archived));
        Assert.False(InAppNotificationStatuses.IsSupported("delivered"));

        Assert.True(InAppNotificationPriorities.IsSupported(InAppNotificationPriorities.Normal));
        Assert.True(InAppNotificationPriorities.IsSupported(InAppNotificationPriorities.Attention));
        Assert.True(InAppNotificationPriorities.IsSupported(InAppNotificationPriorities.Urgent));
        Assert.False(InAppNotificationPriorities.IsSupported("push"));

        Assert.True(NotificationPreferenceDeliveryTimings.IsSupported(NotificationPreferenceDeliveryTimings.Immediate));
        Assert.True(NotificationPreferenceDeliveryTimings.IsSupported(NotificationPreferenceDeliveryTimings.DigestReadout));
        Assert.False(NotificationPreferenceDeliveryTimings.IsSupported("provider_scheduled"));
    }

    [Fact]
    public void InAppNotificationModelUsesSafeMetadataAndRestrictiveRelationships()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(InAppNotification));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("user_notifications", null);

        Assert.Equal("user_notifications", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "RecipientUserProfileId", "recipient_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "ActorUserProfileId", "actor_user_profile_id", isNullable: true);
        AssertColumn(entity, storeObject, "EventType", "event_type", isNullable: false, InAppNotificationConstraints.EventTypeMaxLength);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, InAppNotificationConstraints.StatusMaxLength);
        AssertColumn(entity, storeObject, "Priority", "priority", isNullable: false, InAppNotificationConstraints.PriorityMaxLength);
        AssertColumn(entity, storeObject, "SubjectType", "subject_type", isNullable: false, InAppNotificationConstraints.SubjectTypeMaxLength);
        AssertColumn(entity, storeObject, "TitleKey", "title_key", isNullable: false, InAppNotificationConstraints.TemplateKeyMaxLength);
        AssertColumn(entity, storeObject, "MessageKey", "message_key", isNullable: false, InAppNotificationConstraints.TemplateKeyMaxLength);
        AssertColumn(entity, storeObject, "SafeSummary", "safe_summary", isNullable: true, InAppNotificationConstraints.SafeSummaryMaxLength);
        AssertColumn(entity, storeObject, "ActionUrl", "action_url", isNullable: true, InAppNotificationConstraints.ActionUrlMaxLength);
        AssertColumn(entity, storeObject, "ReceiptOcrReviewId", "receipt_ocr_review_id", isNullable: true);
        AssertColumn(entity, storeObject, "ReceiptAttachmentFileId", "receipt_attachment_file_id", isNullable: true);
        AssertColumn(entity, storeObject, "SyncOperationId", "sync_operation_id", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ReadAtUtc", "read_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ArchivedAtUtc", "archived_at_utc", isNullable: true);

        AssertIndex(entity, "ix_user_notifications_recipient_status_created", ["RecipientUserProfileId", "Status", "CreatedAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_user_notifications_settlement_request_id", ["SettlementRequestId"], isUnique: false);
        AssertIndex(entity, "ix_user_notifications_recurring_bill_occurrence_id", ["RecurringBillOccurrenceId"], isUnique: false);
        AssertIndex(entity, "ix_user_notifications_receipt_ocr_review_id", ["ReceiptOcrReviewId"], isUnique: false);
        AssertIndex(entity, "ix_user_notifications_receipt_attachment_file_id", ["ReceiptAttachmentFileId"], isUnique: false);
        AssertIndex(entity, "ix_user_notifications_sync_operation_id", ["SyncOperationId"], isUnique: false);

        AssertForeignKey(entity, typeof(UserProfile), ["RecipientUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["ActorUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserGroup), ["GroupId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBillRevision), ["ExpenseBillRevisionId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(SettlementRequest), ["SettlementRequestId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(SettlementPayment), ["SettlementPaymentId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(RecurringBillTemplate), ["RecurringBillTemplateId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(RecurringBillOccurrence), ["RecurringBillOccurrenceId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ReceiptOcrReview), ["ReceiptOcrReviewId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(FileObject), ["ReceiptAttachmentFileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(SyncOperation), ["SyncOperationId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_user_notifications_event_type", UserNotificationEventTypeConstraintSql);
        AssertCheckConstraint(entity, "ck_user_notifications_status", "status IN ('unread', 'read', 'archived')");
        AssertCheckConstraint(entity, "ck_user_notifications_priority", "priority IN ('normal', 'attention', 'urgent')");
        AssertCheckConstraint(entity, "ck_user_notifications_subject_type", UserNotificationSubjectTypeConstraintSql);
        AssertCheckConstraint(entity, "ck_user_notifications_action_url_route_like", "action_url IS NULL OR (action_url LIKE '/api/v1/%' AND action_url NOT LIKE '%://%' AND action_url NOT LIKE '%\\\\%')");

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.DoesNotContain(columnNames, name => name.Contains("token", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("object_key", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("path", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("filename", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payload", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payment_handle", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("receipt_ocr_review_id", columnNames);
        Assert.DoesNotContain(columnNames, name => name.Contains("ocr_text", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void UserNotificationPreferenceModelUsesCurrentUserOnlySafeState()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(UserNotificationPreference));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("user_notification_preferences", null);

        Assert.Equal("user_notification_preferences", entity.GetTableName());
        Assert.Equal(["UserProfileId"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "InAppEnabled", "in_app_enabled", isNullable: false);
        AssertColumn(entity, storeObject, "BillsEnabled", "bills_enabled", isNullable: false);
        AssertColumn(entity, storeObject, "SettlementsEnabled", "settlements_enabled", isNullable: false);
        AssertColumn(entity, storeObject, "RecurringEnabled", "recurring_enabled", isNullable: false);
        AssertColumn(entity, storeObject, "SyncSecurityEnabled", "sync_security_enabled", isNullable: false);
        AssertColumn(entity, storeObject, "QuietHoursEnabled", "quiet_hours_enabled", isNullable: false);
        AssertColumn(entity, storeObject, "QuietHoursStartHour", "quiet_hours_start_hour", isNullable: false);
        AssertColumn(entity, storeObject, "QuietHoursEndHour", "quiet_hours_end_hour", isNullable: false);
        AssertColumn(entity, storeObject, "DeliveryTiming", "delivery_timing", isNullable: false, NotificationPreferenceConstraints.DeliveryTimingMaxLength);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertForeignKey(entity, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);
        AssertCheckConstraint(entity, "ck_user_notification_preferences_delivery_timing", "delivery_timing IN ('immediate', 'digest_readout')");
        AssertCheckConstraint(entity, "ck_user_notification_preferences_quiet_start_hour", "quiet_hours_start_hour >= 0 AND quiet_hours_start_hour <= 23");
        AssertCheckConstraint(entity, "ck_user_notification_preferences_quiet_end_hour", "quiet_hours_end_hour >= 0 AND quiet_hours_end_hour <= 23");
        AssertCheckConstraint(entity, "ck_user_notification_preferences_sync_security_required", "sync_security_enabled = TRUE");

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.DoesNotContain(columnNames, name => name.Contains("token", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("provider", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("device", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payment", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("ocr", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void InAppNotificationMigrationIsAdditiveAndReviewable()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddInAppNotificationsFoundation", StringComparison.Ordinal));

        var migration = new AddInAppNotificationsFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTable = Assert.Single(migration.UpOperations.OfType<CreateTableOperation>());
        Assert.Equal("user_notifications", createTable.Name);
        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            operation => operation.Name == "ix_user_notifications_recipient_status_created"
                && operation.Columns.SequenceEqual(["recipient_user_profile_id", "status", "created_at_utc"]));
    }

    [Fact]
    public void BillRevisionNotificationEventTypeMigrationOnlyWidensNotificationConstraint()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddBillRevisionNotificationEventTypes", StringComparison.Ordinal));

        var migration = new AddBillRevisionNotificationEventTypes();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        Assert.Single(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        var addConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        Assert.Equal(BillRevisionNotificationEventTypeConstraintSql, addConstraint.Sql);
        Assert.All(
            RequiredBillRevisionNotificationEventTypes,
            eventType => Assert.Contains($"'{eventType}'", addConstraint.Sql, StringComparison.Ordinal));
    }

    [Fact]
    public void RecurringDueSoonNotificationEventTypeMigrationOnlyWidensNotificationConstraint()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddRecurringDueSoonNotificationEventType", StringComparison.Ordinal));

        var migration = new AddRecurringDueSoonNotificationEventType();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        Assert.Single(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        var addConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        Assert.Equal(RecurringDueSoonNotificationEventTypeConstraintSql, addConstraint.Sql);
        Assert.Contains(
            $"'{InAppNotificationEventTypes.RecurringBillDueSoon}'",
            addConstraint.Sql,
            StringComparison.Ordinal);
    }

    [Fact]
    public void SyncConflictNotificationRuntimeMigrationOnlyWidensNotificationConstraints()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddSyncConflictNotificationRuntime", StringComparison.Ordinal));

        var migration = new AddSyncConflictNotificationRuntime();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_subject_type"
                && operation.Table == "user_notifications");

        var eventConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        var subjectConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_subject_type"
                && operation.Table == "user_notifications");

        Assert.Equal(SyncConflictNotificationEventTypeConstraintSql, eventConstraint.Sql);
        Assert.Equal(SyncConflictNotificationSubjectTypeConstraintSql, subjectConstraint.Sql);
        Assert.Contains($"'{InAppNotificationEventTypes.SyncConflictDetected}'", eventConstraint.Sql, StringComparison.Ordinal);
        Assert.Contains($"'{InAppNotificationSubjectTypes.SyncOperation}'", subjectConstraint.Sql, StringComparison.Ordinal);
    }

    [Fact]
    public void OcrNeedsReviewNotificationRuntimeMigrationOnlyWidensNotificationConstraints()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddOcrNeedsReviewNotificationRuntime", StringComparison.Ordinal));

        var migration = new AddOcrNeedsReviewNotificationRuntime();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is CreateTableOperation
                or DropTableOperation
                or AddColumnOperation
                or DropColumnOperation
                or CreateIndexOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_subject_type"
                && operation.Table == "user_notifications");

        var eventConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        var subjectConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_subject_type"
                && operation.Table == "user_notifications");

        Assert.Equal(OcrNeedsReviewNotificationEventTypeConstraintSql, eventConstraint.Sql);
        Assert.Equal(UserNotificationSubjectTypeConstraintSql, subjectConstraint.Sql);
        Assert.Contains($"'{InAppNotificationEventTypes.OcrNeedsReview}'", eventConstraint.Sql, StringComparison.Ordinal);
        Assert.Contains($"'{InAppNotificationSubjectTypes.ReceiptOcrReview}'", subjectConstraint.Sql, StringComparison.Ordinal);
    }

    [Fact]
    public void SyncOperationFailedNotificationRuntimeMigrationOnlyWidensNotificationEventConstraints()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddSyncOperationFailedNotificationRuntime", StringComparison.Ordinal));

        var migration = new AddSyncOperationFailedNotificationRuntime();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is CreateTableOperation
                or DropTableOperation
                or AddColumnOperation
                or DropColumnOperation
                or CreateIndexOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_notification_delivery_attempts_event_type"
                && operation.Table == "notification_delivery_attempts");

        var userNotificationEventConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        var deliveryAttemptEventConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_notification_delivery_attempts_event_type"
                && operation.Table == "notification_delivery_attempts");

        Assert.Equal(SyncOperationFailedNotificationEventTypeConstraintSql, userNotificationEventConstraint.Sql);
        Assert.Equal(SyncOperationFailedNotificationEventTypeConstraintSql, deliveryAttemptEventConstraint.Sql);
        Assert.Contains($"'{InAppNotificationEventTypes.SyncOperationFailed}'", userNotificationEventConstraint.Sql, StringComparison.Ordinal);
        Assert.Contains($"'{InAppNotificationEventTypes.SyncOperationFailed}'", deliveryAttemptEventConstraint.Sql, StringComparison.Ordinal);
    }

    [Fact]
    public void SettlementResidualReviewNeededNotificationRuntimeMigrationOnlyWidensNotificationEventConstraints()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddSettlementResidualReviewNeededNotificationRuntime", StringComparison.Ordinal));

        var migration = new AddSettlementResidualReviewNeededNotificationRuntime();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is CreateTableOperation
                or DropTableOperation
                or AddColumnOperation
                or DropColumnOperation
                or CreateIndexOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        Assert.Contains(
            migration.UpOperations.OfType<DropCheckConstraintOperation>(),
            operation => operation.Name == "ck_notification_delivery_attempts_event_type"
                && operation.Table == "notification_delivery_attempts");

        var userNotificationEventConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_user_notifications_event_type"
                && operation.Table == "user_notifications");
        var deliveryAttemptEventConstraint = Assert.Single(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Name == "ck_notification_delivery_attempts_event_type"
                && operation.Table == "notification_delivery_attempts");

        Assert.Equal(UserNotificationEventTypeConstraintSql, userNotificationEventConstraint.Sql);
        Assert.Equal(UserNotificationEventTypeConstraintSql, deliveryAttemptEventConstraint.Sql);
        Assert.Contains($"'{InAppNotificationEventTypes.SettlementResidualReviewNeeded}'", userNotificationEventConstraint.Sql, StringComparison.Ordinal);
        Assert.Contains($"'{InAppNotificationEventTypes.SettlementResidualReviewNeeded}'", deliveryAttemptEventConstraint.Sql, StringComparison.Ordinal);
    }

    [Fact]
    public void UserNotificationPreferenceMigrationAddsOnlyPreferenceTable()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddUserNotificationPreferences", StringComparison.Ordinal));

        var migration = new AddUserNotificationPreferences();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTable = Assert.Single(migration.UpOperations.OfType<CreateTableOperation>());
        Assert.Equal("user_notification_preferences", createTable.Name);
        Assert.Contains(
            createTable.Columns,
            column => column.Name == "delivery_timing" && column.MaxLength == NotificationPreferenceConstraints.DeliveryTimingMaxLength);
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.Name == "fk_user_notification_preferences_user_profiles"
                && foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            createTable.CheckConstraints,
            constraint => constraint.Name == "ck_user_notification_preferences_sync_security_required"
                && constraint.Sql == "sync_security_enabled = TRUE");
    }

    [Fact]
    public void NotificationOcrSyncTargetReferenceMigrationAddsOnlyNullableTargetColumnsIndexesAndForeignKeys()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddNotificationOcrSyncTargetReferences", StringComparison.Ordinal));

        var migration = new AddNotificationOcrSyncTargetReferences();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation
                or AddCheckConstraintOperation
                or DropCheckConstraintOperation);

        Assert.Equal(
            [
                "receipt_attachment_file_id",
                "receipt_ocr_review_id",
                "sync_operation_id"
            ],
            migration.UpOperations
                .OfType<AddColumnOperation>()
                .Select(operation =>
                {
                    Assert.Equal("user_notifications", operation.Table);
                    Assert.True(operation.IsNullable);
                    Assert.Equal("uuid", operation.ColumnType);
                    return operation.Name;
                })
                .Order(StringComparer.Ordinal)
                .ToArray());

        Assert.Equal(
            [
                "ix_user_notifications_receipt_attachment_file_id",
                "ix_user_notifications_receipt_ocr_review_id",
                "ix_user_notifications_sync_operation_id"
            ],
            migration.UpOperations
                .OfType<CreateIndexOperation>()
                .Select(operation =>
                {
                    Assert.Equal("user_notifications", operation.Table);
                    Assert.False(operation.IsUnique);
                    return operation.Name;
                })
                .Order(StringComparer.Ordinal)
                .ToArray());

        Assert.Contains(
            migration.UpOperations.OfType<AddForeignKeyOperation>(),
            operation => operation.Name == "fk_user_notifications_receipt_ocr_reviews_review_id"
                && operation.Table == "user_notifications"
                && operation.PrincipalTable == "receipt_ocr_reviews"
                && operation.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            migration.UpOperations.OfType<AddForeignKeyOperation>(),
            operation => operation.Name == "fk_user_notifications_file_objects_receipt_attachment_file_id"
                && operation.Table == "user_notifications"
                && operation.PrincipalTable == "file_objects"
                && operation.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            migration.UpOperations.OfType<AddForeignKeyOperation>(),
            operation => operation.Name == "fk_user_notifications_sync_operations_operation_id"
                && operation.Table == "user_notifications"
                && operation.PrincipalTable == "sync_operations"
                && operation.OnDelete == ReferentialAction.Restrict);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseNpgsql("Host=localhost;Database=settleora_schema_test;Username=settleora;Password=settleora")
            .Options);
    }

    private static void AssertColumn(
        IEntityType? entity,
        StoreObjectIdentifier storeObject,
        string propertyName,
        string columnName,
        bool isNullable,
        int? maxLength = null)
    {
        Assert.NotNull(entity);
        var property = entity.FindProperty(propertyName);
        Assert.NotNull(property);
        Assert.Equal(columnName, property.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsColumnNullable(storeObject));
        Assert.Equal(maxLength, property.GetMaxLength());
    }

    private static void AssertIndex(
        IEntityType? entity,
        string databaseName,
        IReadOnlyList<string> propertyNames,
        bool isUnique)
    {
        Assert.NotNull(entity);
        Assert.Contains(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == databaseName
                && index.IsUnique == isUnique
                && index.Properties.Select(property => property.Name).SequenceEqual(propertyNames));
    }

    private static void AssertForeignKey(
        IEntityType? entity,
        Type principalType,
        IReadOnlyList<string> propertyNames,
        DeleteBehavior deleteBehavior)
    {
        Assert.NotNull(entity);
        var foreignKey = Assert.Single(
            entity.GetForeignKeys(),
            key => key.PrincipalEntityType.ClrType == principalType
                && key.Properties.Select(property => property.Name).SequenceEqual(propertyNames));
        Assert.Equal(deleteBehavior, foreignKey.DeleteBehavior);
    }

    private static void AssertCheckConstraint(
        IEntityType? entity,
        string name,
        string sql)
    {
        Assert.NotNull(entity);
        var checkConstraint = Assert.Single(
            entity.GetCheckConstraints(),
            constraint => constraint.Name == name);
        Assert.Equal(sql, checkConstraint.Sql);
    }
}
