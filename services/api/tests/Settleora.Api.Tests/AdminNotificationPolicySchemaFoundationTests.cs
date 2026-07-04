using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class AdminNotificationPolicySchemaFoundationTests
{
    [Fact]
    public void NotificationPolicyConstantsRepresentBoundedReadoutValues()
    {
        Assert.Equal(64, NotificationPolicyConstraints.PolicyVersionMaxLength);
        Assert.Equal(16, NotificationPolicyConstraints.PolicyStatusMaxLength);
        Assert.Equal(32, NotificationPolicyConstraints.ChannelCapMaxLength);
        Assert.Equal(32, NotificationPolicyConstraints.ReadinessMaxLength);

        Assert.True(NotificationPolicyChannels.IsSupported(NotificationPolicyChannels.InApp));
        Assert.True(NotificationPolicyChannels.IsSupported(NotificationPolicyChannels.Email));
        Assert.True(NotificationPolicyChannels.IsSupported(NotificationPolicyChannels.MobilePush));
        Assert.False(NotificationPolicyChannels.IsSupported("sms"));

        Assert.True(NotificationPolicyReadinessStates.IsSupported(NotificationPolicyReadinessStates.Unconfigured));
        Assert.True(NotificationPolicyReadinessStates.IsSupported(NotificationPolicyReadinessStates.Configured));
        Assert.False(NotificationPolicyReadinessStates.IsSupported("delivered"));

        Assert.True(NotificationPolicyReadoutCategories.IsSupported(NotificationPolicyReadoutCategories.DisabledByAdmin));
        Assert.True(NotificationPolicyReadoutCategories.IsSupported(NotificationPolicyReadoutCategories.ProviderUnconfigured));
        Assert.True(NotificationPolicyReadoutCategories.IsSupported(NotificationPolicyReadoutCategories.Sent));
        Assert.False(NotificationPolicyReadoutCategories.IsSupported("smtp_password_invalid_raw"));
        Assert.False(NotificationPolicyReadoutCategories.IsSupported("delivered"));

        Assert.True(NotificationPolicyEventFamilies.IsSupported(NotificationPolicyEventFamilies.AuthSecurity));
        Assert.False(NotificationPolicyEventFamilies.IsSupported("provider_payload"));
    }

    [Fact]
    public void NotificationGlobalPolicyModelUsesSafeSchemaFoundation()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(NotificationGlobalPolicy));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("notification_global_policies", null);

        Assert.Equal("notification_global_policies", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "PolicyVersion", "policy_version", isNullable: false, NotificationPolicyConstraints.PolicyVersionMaxLength);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, NotificationPolicyConstraints.PolicyStatusMaxLength);
        AssertColumn(entity, storeObject, "InAppChannelCap", "in_app_channel_cap", isNullable: false, NotificationPolicyConstraints.ChannelCapMaxLength);
        AssertColumn(entity, storeObject, "EmailChannelCap", "email_channel_cap", isNullable: false, NotificationPolicyConstraints.ChannelCapMaxLength);
        AssertColumn(entity, storeObject, "MobilePushChannelCap", "mobile_push_channel_cap", isNullable: false, NotificationPolicyConstraints.ChannelCapMaxLength);
        AssertColumn(entity, storeObject, "EmailProviderReadiness", "email_provider_readiness", isNullable: false, NotificationPolicyConstraints.ReadinessMaxLength);
        AssertColumn(entity, storeObject, "MobilePushProviderReadiness", "mobile_push_provider_readiness", isNullable: false, NotificationPolicyConstraints.ReadinessMaxLength);
        AssertColumn(entity, storeObject, "RequiredInAppEnabled", "required_in_app_enabled", isNullable: false);
        AssertColumn(entity, storeObject, "ExternalSensitiveContentClass", "external_sensitive_content_class", isNullable: false, NotificationPolicyConstraints.ContentClassMaxLength);
        AssertColumn(entity, storeObject, "CreatedByAuthAccountId", "created_by_auth_account_id", isNullable: true);
        AssertColumn(entity, storeObject, "UpdatedByAuthAccountId", "updated_by_auth_account_id", isNullable: true);

        AssertIndex(entity, "ux_notification_global_policies_policy_version", ["PolicyVersion"], isUnique: true);
        AssertIndex(entity, "ix_notification_global_policies_status_effective_updated", ["Status", "EffectiveAtUtc", "UpdatedAtUtc"], isUnique: false);
        AssertForeignKey(entity, typeof(AuthAccount), ["CreatedByAuthAccountId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(AuthAccount), ["UpdatedByAuthAccountId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_notification_global_policies_status", "status IN ('active', 'draft', 'disabled', 'superseded')");
        AssertCheckConstraint(entity, "ck_notification_global_policies_required_in_app_enabled", "required_in_app_enabled = TRUE");

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.DoesNotContain(columnNames, name => name.Contains("token", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("secret", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payload", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("host", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("object_key", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("ocr_text", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("payment", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("private_note", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, name => name.Contains("hidden", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void NotificationEventPolicyOverrideModelUsesBoundedCategories()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(NotificationEventPolicyOverride));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("notification_event_policy_overrides", null);

        Assert.Equal("notification_event_policy_overrides", entity.GetTableName());
        AssertColumn(entity, storeObject, "EventFamily", "event_family", isNullable: false, NotificationPolicyConstraints.EventFamilyMaxLength);
        AssertColumn(entity, storeObject, "EmailChannelCap", "email_channel_cap", isNullable: false, NotificationPolicyConstraints.ChannelCapMaxLength);
        AssertColumn(entity, storeObject, "ExternalContentClass", "external_content_class", isNullable: false, NotificationPolicyConstraints.ContentClassMaxLength);
        AssertIndex(entity, "ux_notification_event_policy_overrides_policy_family", ["NotificationGlobalPolicyId", "EventFamily"], isUnique: true);
        AssertForeignKey(entity, typeof(NotificationGlobalPolicy), ["NotificationGlobalPolicyId"], DeleteBehavior.Restrict);
        AssertCheckConstraint(entity, "ck_notification_event_policy_overrides_event_family", "event_family IN ('bills', 'settlements', 'recurring', 'ocr', 'sync', 'auth_security')");
        AssertCheckConstraint(entity, "ck_notification_event_policy_overrides_required_in_app", "required_in_app = TRUE");
    }

    [Fact]
    public void NotificationGlobalPolicyMigrationAddsOnlyPolicyTables()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddNotificationGlobalPolicyReadoutFoundation", StringComparison.Ordinal));

        var migration = new AddNotificationGlobalPolicyReadoutFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation
                or AddColumnOperation);

        var createdTables = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        Assert.Equal(
            ["notification_global_policies", "notification_event_policy_overrides"],
            createdTables.Select(table => table.Name).ToArray());
        Assert.Contains(
            createdTables.Single(table => table.Name == "notification_global_policies").Columns,
            column => column.Name == "email_provider_readiness"
                && column.MaxLength == NotificationPolicyConstraints.ReadinessMaxLength);
        Assert.Contains(
            createdTables.Single(table => table.Name == "notification_global_policies").CheckConstraints,
            constraint => constraint.Sql == "required_in_app_enabled = TRUE");
        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            operation => operation.Name == "ux_notification_event_policy_overrides_policy_family"
                && operation.IsUnique);
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
        var property = entity!.FindProperty(propertyName);
        Assert.NotNull(property);
        Assert.Equal(columnName, property.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsColumnNullable(storeObject));
        if (maxLength is not null)
        {
            Assert.Equal(maxLength.Value, property.GetMaxLength());
        }
    }

    private static void AssertIndex(IEntityType? entity, string indexName, string[] properties, bool isUnique)
    {
        var index = entity!.GetIndexes().SingleOrDefault(candidate => candidate.GetDatabaseName() == indexName);
        Assert.NotNull(index);
        Assert.Equal(properties, index.Properties.Select(property => property.Name).ToArray());
        Assert.Equal(isUnique, index.IsUnique);
    }

    private static void AssertForeignKey(IEntityType? entity, Type principalType, string[] properties, DeleteBehavior deleteBehavior)
    {
        Assert.Contains(
            entity!.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == principalType
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(properties)
                && foreignKey.DeleteBehavior == deleteBehavior);
    }

    private static void AssertCheckConstraint(IEntityType? entity, string name, string sql)
    {
        Assert.Contains(
            entity!.GetCheckConstraints(),
            constraint => constraint.Name == name && constraint.Sql == sql);
    }
}
