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

public sealed class NotificationDeliveryAttemptSchemaFoundationTests
{
    [Fact]
    public void NotificationDeliveryAttemptConstantsRepresentPreProviderVocabulary()
    {
        Assert.Equal(32, NotificationDeliveryAttemptConstraints.ChannelMaxLength);
        Assert.Equal(32, NotificationDeliveryAttemptConstraints.StatusMaxLength);
        Assert.Equal(120, NotificationDeliveryAttemptConstraints.StatusReasonMaxLength);
        Assert.Equal(160, NotificationDeliveryAttemptConstraints.IdempotencyKeyMaxLength);
        Assert.Equal(120, NotificationDeliveryAttemptConstraints.SourceCorrelationIdMaxLength);
        Assert.Equal(120, NotificationDeliveryAttemptConstraints.LeaseOwnerMaxLength);
        Assert.Equal(120, NotificationDeliveryAttemptConstraints.RedactedProviderResultCategoryMaxLength);

        Assert.True(NotificationDeliveryAttemptStatuses.IsSupported(NotificationDeliveryAttemptStatuses.Queued));
        Assert.True(NotificationDeliveryAttemptStatuses.IsSupported(NotificationDeliveryAttemptStatuses.Deferred));
        Assert.True(NotificationDeliveryAttemptStatuses.IsSupported(NotificationDeliveryAttemptStatuses.Suppressed));
        Assert.False(NotificationDeliveryAttemptStatuses.IsSupported("sent"));
        Assert.True(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus("sent"));
        Assert.True(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus("failed_transient"));
        Assert.True(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus("delivered"));
    }

    [Fact]
    public void NotificationDeliveryAttemptModelUsesSafeProviderNeutralMetadata()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(NotificationDeliveryAttempt));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("notification_delivery_attempts", null);

        Assert.Equal("notification_delivery_attempts", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "InAppNotificationId", "in_app_notification_id", isNullable: true);
        AssertColumn(entity, storeObject, "RecipientUserProfileId", "recipient_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "ActorUserProfileId", "actor_user_profile_id", isNullable: true);
        AssertColumn(entity, storeObject, "EventType", "event_type", isNullable: false, InAppNotificationConstraints.EventTypeMaxLength);
        AssertColumn(entity, storeObject, "SubjectType", "subject_type", isNullable: false, InAppNotificationConstraints.SubjectTypeMaxLength);
        AssertColumn(entity, storeObject, "Channel", "channel", isNullable: false, NotificationDeliveryAttemptConstraints.ChannelMaxLength);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, NotificationDeliveryAttemptConstraints.StatusMaxLength);
        AssertColumn(entity, storeObject, "StatusReason", "status_reason", isNullable: false, NotificationDeliveryAttemptConstraints.StatusReasonMaxLength);
        AssertColumn(entity, storeObject, "IdempotencyKey", "idempotency_key", isNullable: false, NotificationDeliveryAttemptConstraints.IdempotencyKeyMaxLength);
        AssertColumn(entity, storeObject, "SourceCorrelationId", "source_correlation_id", isNullable: true, NotificationDeliveryAttemptConstraints.SourceCorrelationIdMaxLength);
        AssertColumn(entity, storeObject, "AttemptCount", "attempt_count", isNullable: false);
        AssertColumn(entity, storeObject, "LeaseOwner", "lease_owner", isNullable: true, NotificationDeliveryAttemptConstraints.LeaseOwnerMaxLength);
        AssertColumn(entity, storeObject, "LeaseExpiresAtUtc", "lease_expires_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "LastAttemptedAtUtc", "last_attempted_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "NextAttemptAtUtc", "next_attempt_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ExpiresAtUtc", "expires_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "CompletedAtUtc", "completed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RedactedProviderResultCategory", "redacted_provider_result_category", isNullable: true, NotificationDeliveryAttemptConstraints.RedactedProviderResultCategoryMaxLength);
        AssertColumn(entity, storeObject, "ReceiptOcrReviewId", "receipt_ocr_review_id", isNullable: true);
        AssertColumn(entity, storeObject, "ReceiptAttachmentFileId", "receipt_attachment_file_id", isNullable: true);
        AssertColumn(entity, storeObject, "SyncOperationId", "sync_operation_id", isNullable: true);

        AssertIndex(entity, "ux_notification_delivery_attempts_idempotency_key", ["IdempotencyKey"], isUnique: true);
        AssertIndex(entity, "ix_notification_delivery_attempts_recipient_channel_status", ["RecipientUserProfileId", "Channel", "Status", "CreatedAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_notification_delivery_attempts_channel_status_next_attempt", ["Channel", "Status", "NextAttemptAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_notification_delivery_attempts_channel_status_lease_expires", ["Channel", "Status", "LeaseExpiresAtUtc"], isUnique: false);

        AssertForeignKey(entity, typeof(InAppNotification), ["InAppNotificationId"], DeleteBehavior.Restrict);
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

        AssertCheckConstraint(entity, "ck_notification_delivery_attempts_channel", "channel IN ('email', 'mobile_push')");
        AssertCheckConstraint(entity, "ck_notification_delivery_attempts_status", "status IN ('not_applicable', 'disabled', 'unconfigured', 'deferred', 'queued', 'suppressed', 'cancelled', 'expired')");
        AssertCheckConstraint(entity, "ck_notification_delivery_attempts_no_provider_runtime_status", "status NOT IN ('attempting', 'sent', 'failed_transient', 'failed_permanent', 'delivered')");
        AssertCheckConstraint(entity, "ck_notification_delivery_attempts_attempt_count_non_negative", "attempt_count >= 0");
        AssertCheckConstraint(entity, "ck_notification_delivery_attempts_lease_owner_not_blank", "lease_owner IS NULL OR length(btrim(lease_owner)) > 0");
        AssertCheckConstraint(entity, "ck_notification_delivery_attempts_lease_pair", "(lease_owner IS NULL) = (lease_expires_at_utc IS NULL)");

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.DoesNotContain(columnNames, name => name.Contains("token", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payload", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("object_key", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("signed_url", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("local_path", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("ocr_text", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payment_detail", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("private_note", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("hidden", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("redacted_provider_result_category", columnNames);
    }

    [Fact]
    public void NotificationDeliveryAttemptMigrationAddsOnlyAttemptTable()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddNotificationDeliveryAttemptsFoundation", StringComparison.Ordinal));

        var migration = new AddNotificationDeliveryAttemptsFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation
                or AddColumnOperation);

        var createTable = Assert.Single(migration.UpOperations.OfType<CreateTableOperation>());
        Assert.Equal("notification_delivery_attempts", createTable.Name);
        Assert.Contains(
            createTable.Columns,
            column => column.Name == "redacted_provider_result_category"
                && column.MaxLength == NotificationDeliveryAttemptConstraints.RedactedProviderResultCategoryMaxLength);
        Assert.Contains(
            createTable.CheckConstraints,
            constraint => constraint.Name == "ck_notification_delivery_attempts_no_provider_runtime_status"
                && constraint.Sql == "status NOT IN ('attempting', 'sent', 'failed_transient', 'failed_permanent', 'delivered')");
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.Name == "fk_notification_delivery_attempts_recipient_user_profiles"
                && foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            operation => operation.Name == "ux_notification_delivery_attempts_idempotency_key"
                && operation.IsUnique
                && operation.Columns.SequenceEqual(["idempotency_key"]));
    }

    [Fact]
    public void NotificationDeliveryOutboxLeaseMigrationIsAdditiveOnly()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddNotificationDeliveryOutboxLeaseFoundation", StringComparison.Ordinal));

        var migration = new AddNotificationDeliveryOutboxLeaseFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation
                or CreateTableOperation);

        var addedColumns = migration.UpOperations.OfType<AddColumnOperation>().ToArray();
        Assert.Equal(3, addedColumns.Length);
        Assert.Contains(
            addedColumns,
            column => column.Table == "notification_delivery_attempts"
                && column.Name == "lease_owner"
                && column.IsNullable
                && column.MaxLength == NotificationDeliveryAttemptConstraints.LeaseOwnerMaxLength);
        Assert.Contains(
            addedColumns,
            column => column.Table == "notification_delivery_attempts"
                && column.Name == "lease_expires_at_utc"
                && column.IsNullable);
        Assert.Contains(
            addedColumns,
            column => column.Table == "notification_delivery_attempts"
                && column.Name == "last_attempted_at_utc"
                && column.IsNullable);
        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            operation => operation.Table == "notification_delivery_attempts"
                && operation.Name == "ix_notification_delivery_attempts_channel_status_lease_expires"
                && operation.Columns.SequenceEqual(["channel", "status", "lease_expires_at_utc"]));
        Assert.Contains(
            migration.UpOperations.OfType<AddCheckConstraintOperation>(),
            operation => operation.Table == "notification_delivery_attempts"
                && operation.Name == "ck_notification_delivery_attempts_lease_pair"
                && operation.Sql == "(lease_owner IS NULL) = (lease_expires_at_utc IS NULL)");
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
        string[] propertyNames,
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
        string[] propertyNames,
        DeleteBehavior deleteBehavior)
    {
        Assert.NotNull(entity);
        Assert.Contains(
            entity.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == principalType
                && foreignKey.DeleteBehavior == deleteBehavior
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(propertyNames));
    }

    private static void AssertCheckConstraint(IEntityType? entity, string name, string sql)
    {
        Assert.NotNull(entity);
        Assert.Contains(
            entity.GetCheckConstraints(),
            constraint => constraint.Name == name && constraint.Sql == sql);
    }
}
