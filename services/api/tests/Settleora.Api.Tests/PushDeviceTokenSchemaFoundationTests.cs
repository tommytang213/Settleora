using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class PushDeviceTokenSchemaFoundationTests
{
    [Fact]
    public void PushDeviceTokenConstantsRepresentBoundedLifecycleVocabulary()
    {
        Assert.Equal(16, PushDeviceTokenConstraints.PlatformMaxLength);
        Assert.Equal(16, PushDeviceTokenConstraints.ProviderMaxLength);
        Assert.Equal(32, PushDeviceTokenConstraints.AppBuildEnvironmentMaxLength);
        Assert.Equal(32, PushDeviceTokenConstraints.PermissionStateMaxLength);
        Assert.Equal(32, PushDeviceTokenConstraints.StatusMaxLength);
        Assert.Equal(128, PushDeviceTokenConstraints.TokenFingerprintMaxLength);
        Assert.Equal(8192, PushDeviceTokenConstraints.ProtectedTokenBlobMaxLength);

        Assert.True(PushDeviceTokenPlatforms.IsSupported("ios"));
        Assert.True(PushDeviceTokenProviders.IsSupported("apns"));
        Assert.True(PushDeviceTokenStatuses.IsSupported(PushDeviceTokenStatuses.Active));
        Assert.True(PushDeviceTokenPermissionStates.IsSupported("authorized"));
        Assert.False(PushDeviceTokenStatuses.IsSupported("sent"));
        Assert.False(PushDeviceTokenStatuses.IsSupported("delivered"));
    }

    [Fact]
    public void PushDeviceTokenModelStoresOnlyProtectedTokenMaterialAndSafeLifecycleMetadata()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(PushDeviceToken));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("push_device_tokens", null);

        Assert.Equal("push_device_tokens", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "AuthSessionId", "auth_session_id", isNullable: false);
        AssertColumn(entity, storeObject, "DeviceInstallationHash", "device_installation_hash", isNullable: false, PushDeviceTokenConstraints.DeviceInstallationHashMaxLength);
        AssertColumn(entity, storeObject, "Platform", "platform", isNullable: false, PushDeviceTokenConstraints.PlatformMaxLength);
        AssertColumn(entity, storeObject, "Provider", "provider", isNullable: false, PushDeviceTokenConstraints.ProviderMaxLength);
        AssertColumn(entity, storeObject, "AppBuildEnvironment", "app_build_environment", isNullable: false, PushDeviceTokenConstraints.AppBuildEnvironmentMaxLength);
        AssertColumn(entity, storeObject, "TokenFingerprint", "token_fingerprint", isNullable: false, PushDeviceTokenConstraints.TokenFingerprintMaxLength);
        AssertColumn(entity, storeObject, "ProtectedTokenBlob", "protected_token_blob", isNullable: false, PushDeviceTokenConstraints.ProtectedTokenBlobMaxLength);
        AssertColumn(entity, storeObject, "ProtectionKeyId", "protection_key_id", isNullable: false, PushDeviceTokenConstraints.ProtectionKeyIdMaxLength);
        AssertColumn(entity, storeObject, "ProtectionPurpose", "protection_purpose", isNullable: false, PushDeviceTokenConstraints.ProtectionPurposeMaxLength);
        AssertColumn(entity, storeObject, "PermissionState", "permission_state", isNullable: false, PushDeviceTokenConstraints.PermissionStateMaxLength);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, PushDeviceTokenConstraints.StatusMaxLength);
        AssertColumn(entity, storeObject, "LastSeenAtUtc", "last_seen_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "RegisteredAtUtc", "registered_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "RevokedAtUtc", "revoked_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "StaleAtUtc", "stale_at_utc", isNullable: true);

        AssertIndex(entity, "ux_push_device_tokens_active_fingerprint_provider_env", ["TokenFingerprint", "Provider", "AppBuildEnvironment"], isUnique: true, "status = 'active'");
        AssertIndex(entity, "ux_push_device_tokens_active_user_device_provider_env", ["UserProfileId", "Platform", "Provider", "DeviceInstallationHash", "AppBuildEnvironment"], isUnique: true, "status = 'active'");
        AssertIndex(entity, "ix_push_device_tokens_auth_session_status", ["AuthSessionId", "Status"], isUnique: false);
        AssertIndex(entity, "ix_push_device_tokens_status_stale_at", ["Status", "StaleAtUtc"], isUnique: false);

        AssertForeignKey(entity, typeof(AuthAccount), ["AuthAccountId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(AuthSession), ["AuthSessionId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_push_device_tokens_platform", "platform IN ('ios', 'android')");
        AssertCheckConstraint(entity, "ck_push_device_tokens_provider", "provider IN ('apns', 'fcm')");
        AssertCheckConstraint(entity, "ck_push_device_tokens_status", "status IN ('active', 'revoked', 'superseded', 'stale', 'provider_invalid')");
        AssertCheckConstraint(entity, "ck_push_device_tokens_fingerprint_not_blank", "length(btrim(token_fingerprint)) > 0");
        AssertCheckConstraint(entity, "ck_push_device_tokens_protected_blob_not_blank", "length(btrim(protected_token_blob)) > 0");

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.DoesNotContain("raw_token", columnNames);
        Assert.DoesNotContain("token_plaintext", columnNames);
        Assert.DoesNotContain("provider_payload", columnNames);
        Assert.DoesNotContain("apns_credential", columnNames);
        Assert.DoesNotContain("fcm_credential", columnNames);
        Assert.DoesNotContain("sent_at_utc", columnNames);
        Assert.DoesNotContain("delivered_at_utc", columnNames);
    }

    [Fact]
    public void PushDeviceTokenMigrationAddsOnlyPushDeviceTokenTable()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddPushDeviceTokensFoundation", StringComparison.Ordinal));

        var migration = new AddPushDeviceTokensFoundation();
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
        Assert.Equal("push_device_tokens", createTable.Name);
        Assert.Contains(
            createTable.Columns,
            column => column.Name == "protected_token_blob"
                && column.MaxLength == PushDeviceTokenConstraints.ProtectedTokenBlobMaxLength);
        Assert.Contains(
            createTable.Columns,
            column => column.Name == "token_fingerprint"
                && column.MaxLength == PushDeviceTokenConstraints.TokenFingerprintMaxLength);
        Assert.DoesNotContain(
            createTable.Columns,
            column => column.Name.Contains("raw", StringComparison.OrdinalIgnoreCase)
                || column.Name.Contains("plaintext", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.Name == "fk_push_device_tokens_auth_sessions"
                && foreignKey.PrincipalTable == "auth_sessions"
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            operation => operation.Name == "ux_push_device_tokens_active_fingerprint_provider_env"
                && operation.IsUnique
                && operation.Filter == "status = 'active'");
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
            Assert.Equal(maxLength, property.GetMaxLength());
        }
    }

    private static void AssertIndex(
        IEntityType? entity,
        string databaseName,
        IReadOnlyList<string> propertyNames,
        bool isUnique,
        string? filter = null)
    {
        var index = entity!.GetIndexes()
            .SingleOrDefault(candidate => candidate.GetDatabaseName() == databaseName);
        Assert.NotNull(index);
        Assert.Equal(propertyNames, index.Properties.Select(property => property.Name).ToArray());
        Assert.Equal(isUnique, index.IsUnique);
        if (filter is not null)
        {
            Assert.Equal(filter, index.GetFilter());
        }
    }

    private static void AssertForeignKey(
        IEntityType? entity,
        Type principalType,
        IReadOnlyList<string> propertyNames,
        DeleteBehavior deleteBehavior)
    {
        Assert.Contains(
            entity!.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == principalType
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(propertyNames)
                && foreignKey.DeleteBehavior == deleteBehavior);
    }

    private static void AssertCheckConstraint(
        IEntityType? entity,
        string name,
        string sql)
    {
        Assert.Contains(
            entity!.GetCheckConstraints(),
            constraint => constraint.Name == name && constraint.Sql == sql);
    }
}
