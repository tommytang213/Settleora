using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class InAppNotificationSchemaFoundationTests
{
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

        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.BillSubmitted));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.SettlementProofAttached));
        Assert.True(InAppNotificationEventTypes.IsSupported(InAppNotificationEventTypes.RecurringBillDraftGenerated));
        Assert.False(InAppNotificationEventTypes.IsSupported("email.delivery_requested"));
        Assert.False(InAppNotificationEventTypes.IsSupported("raw_ocr_text"));

        Assert.True(InAppNotificationStatuses.IsSupported(InAppNotificationStatuses.Unread));
        Assert.True(InAppNotificationStatuses.IsSupported(InAppNotificationStatuses.Read));
        Assert.True(InAppNotificationStatuses.IsSupported(InAppNotificationStatuses.Archived));
        Assert.False(InAppNotificationStatuses.IsSupported("delivered"));

        Assert.True(InAppNotificationPriorities.IsSupported(InAppNotificationPriorities.Normal));
        Assert.True(InAppNotificationPriorities.IsSupported(InAppNotificationPriorities.Attention));
        Assert.True(InAppNotificationPriorities.IsSupported(InAppNotificationPriorities.Urgent));
        Assert.False(InAppNotificationPriorities.IsSupported("push"));
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
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ReadAtUtc", "read_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ArchivedAtUtc", "archived_at_utc", isNullable: true);

        AssertIndex(entity, "ix_user_notifications_recipient_status_created", ["RecipientUserProfileId", "Status", "CreatedAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_user_notifications_settlement_request_id", ["SettlementRequestId"], isUnique: false);
        AssertIndex(entity, "ix_user_notifications_recurring_bill_occurrence_id", ["RecurringBillOccurrenceId"], isUnique: false);

        AssertForeignKey(entity, typeof(UserProfile), ["RecipientUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["ActorUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserGroup), ["GroupId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBillRevision), ["ExpenseBillRevisionId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(SettlementRequest), ["SettlementRequestId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(SettlementPayment), ["SettlementPaymentId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(RecurringBillTemplate), ["RecurringBillTemplateId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(RecurringBillOccurrence), ["RecurringBillOccurrenceId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_user_notifications_status", "status IN ('unread', 'read', 'archived')");
        AssertCheckConstraint(entity, "ck_user_notifications_priority", "priority IN ('normal', 'attention', 'urgent')");
        AssertCheckConstraint(entity, "ck_user_notifications_action_url_route_like", "action_url IS NULL OR (action_url LIKE '/api/v1/%' AND action_url NOT LIKE '%://%' AND action_url NOT LIKE '%\\\\%')");

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.DoesNotContain(columnNames, name => name.Contains("token", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("object_key", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payment_handle", StringComparison.OrdinalIgnoreCase));
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
