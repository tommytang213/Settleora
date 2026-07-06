using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class AuthPasswordResetRequestSchemaFoundationTests
{
    [Fact]
    public void PasswordResetRequestModelUsesHashOnlyMaterialAndRestrictiveRelationships()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthPasswordResetRequest>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_password_reset_requests", null);

        Assert.Equal("auth_password_reset_requests", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "Purpose", "purpose", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: true);
        AssertColumn(
            entity,
            storeObject,
            "LocalPasswordCredentialId",
            "local_password_credential_id",
            isNullable: true);
        AssertColumn(entity, storeObject, "ResetMaterialHash", "reset_material_hash", isNullable: true, maxLength: 256);
        AssertColumn(
            entity,
            storeObject,
            "ResetMaterialHashVersion",
            "reset_material_hash_version",
            isNullable: true,
            maxLength: 32);
        AssertColumn(entity, storeObject, "ResetMaterialScope", "reset_material_scope", isNullable: true, maxLength: 32);
        AssertColumn(entity, storeObject, "IssuedAtUtc", "issued_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ExpiresAtUtc", "expires_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ConsumedAtUtc", "consumed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevokedAtUtc", "revoked_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ReplacedAtUtc", "replaced_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "SuspiciousReplayAtUtc", "suspicious_replay_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "LastCheckedAtUtc", "last_checked_at_utc", isNullable: true);
        AssertColumn(
            entity,
            storeObject,
            "ReplacedByResetRequestId",
            "replaced_by_reset_request_id",
            isNullable: true);
        AssertColumn(entity, storeObject, "RevocationReason", "revocation_reason", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "DeliveryCategory", "delivery_category", isNullable: false, maxLength: 32);
        AssertColumn(
            entity,
            storeObject,
            "ProviderSendCategory",
            "provider_send_category",
            isNullable: false,
            maxLength: 32);
        AssertColumn(
            entity,
            storeObject,
            "RequestSourceBucketRef",
            "request_source_bucket_ref",
            isNullable: true,
            maxLength: 160);
        AssertColumn(entity, storeObject, "IdentifierBucketRef", "identifier_bucket_ref", isNullable: true, maxLength: 160);
        AssertColumn(entity, storeObject, "CombinedBucketRef", "combined_bucket_ref", isNullable: true, maxLength: 160);
        AssertColumn(entity, storeObject, "GlobalBucketRef", "global_bucket_ref", isNullable: true, maxLength: 160);
        AssertColumn(
            entity,
            storeObject,
            "ProviderSendBucketRef",
            "provider_send_bucket_ref",
            isNullable: true,
            maxLength: 160);
        AssertColumn(entity, storeObject, "RequestCorrelationId", "request_correlation_id", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "AuditCorrelationId", "audit_correlation_id", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "CleanupEligibleAtUtc", "cleanup_eligible_at_utc", isNullable: true);

        var materialHashIndex = AssertIndex(
            entity,
            "ux_auth_password_reset_requests_material_hash",
            ["ResetMaterialHash"],
            isUnique: true);
        Assert.Equal("reset_material_hash IS NOT NULL", materialHashIndex.GetFilter());
        AssertIndex(
            entity,
            "ix_auth_password_reset_requests_account_purpose_status_expires",
            ["AuthAccountId", "Purpose", "Status", "ExpiresAtUtc"],
            isUnique: false);
        var pendingLookupIndex = AssertIndex(
            entity,
            "ix_auth_password_reset_requests_pending_account_purpose",
            ["AuthAccountId", "Purpose", "Status"],
            isUnique: false);
        Assert.Equal("status = 'pending' AND auth_account_id IS NOT NULL", pendingLookupIndex.GetFilter());
        AssertIndex(entity, "ix_auth_password_reset_requests_expires_at_utc", ["ExpiresAtUtc"], isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_password_reset_requests_cleanup_eligible_at_utc",
            ["CleanupEligibleAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_password_reset_requests_local_password_credential_id",
            ["LocalPasswordCredentialId"],
            isUnique: false);
        AssertIndex(entity, "ix_auth_password_reset_requests_replaced_by_id", ["ReplacedByResetRequestId"], isUnique: false);

        AssertForeignKey(entity, typeof(AuthAccount), ["AuthAccountId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(LocalPasswordCredential), ["LocalPasswordCredentialId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(AuthPasswordResetRequest), ["ReplacedByResetRequestId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_password_reset_requests_purpose",
            "purpose IN ('local_password_reset')");
        AssertCheckConstraint(
            entity,
            "ck_auth_password_reset_requests_status",
            "status IN ('pending', 'consumed', 'expired', 'revoked', 'suspicious_replay')");
        AssertCheckConstraint(
            entity,
            "ck_auth_password_reset_requests_material_scope",
            "reset_material_scope IS NULL OR reset_material_scope IN ('email_link', 'typed_code')");
        AssertCheckConstraint(
            entity,
            "ck_auth_password_reset_requests_delivery_category",
            "delivery_category IN ('email_link', 'admin_delivered_future_gate', 'provider_skipped', 'provider_unavailable')");
        AssertCheckConstraint(
            entity,
            "ck_auth_password_reset_requests_provider_send_category",
            "provider_send_category IN ('not_attempted', 'queued_or_sent', 'skipped_by_policy', 'throttled', 'failed_safe', 'provider_disabled')");
        AssertCheckConstraint(
            entity,
            "ck_auth_password_reset_requests_material_complete",
            "(reset_material_hash IS NULL AND reset_material_hash_version IS NULL AND reset_material_scope IS NULL AND issued_at_utc IS NULL AND expires_at_utc IS NULL) OR (reset_material_hash IS NOT NULL AND reset_material_hash_version IS NOT NULL AND reset_material_scope IS NOT NULL AND issued_at_utc IS NOT NULL AND expires_at_utc IS NOT NULL)");
        AssertCheckConstraint(
            entity,
            "ck_auth_password_reset_requests_material_hash_not_blank",
            "reset_material_hash IS NULL OR length(btrim(reset_material_hash)) > 0");
    }

    [Fact]
    public void PasswordResetRequestMigrationCreatesOnlyAdditiveHashBackedSchemaOperations()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddAuthPasswordResetRequestsFoundation", StringComparison.Ordinal));

        var migration = new AddAuthPasswordResetRequestsFoundation();

        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTable = Assert.Single(
            migration.UpOperations.OfType<CreateTableOperation>(),
            table => table.Name == "auth_password_reset_requests");

        Assert.Equal(["id"], createTable.PrimaryKey!.Columns);
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["auth_account_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "local_password_credentials"
                && foreignKey.Columns.SequenceEqual(["local_password_credential_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_password_reset_requests"
                && foreignKey.Columns.SequenceEqual(["replaced_by_reset_request_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        Assert.All(
            createTable.Columns.Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));

        Assert.DoesNotContain(
            createTable.Columns,
            column => IsForbiddenPasswordResetColumn(column.Name));

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        Assert.Contains(
            indexes,
            index => index.Table == "auth_password_reset_requests"
                && index.Name == "ux_auth_password_reset_requests_material_hash"
                && index.IsUnique
                && index.Filter == "reset_material_hash IS NOT NULL"
                && index.Columns.SequenceEqual(["reset_material_hash"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_password_reset_requests"
                && index.Name == "ix_auth_password_reset_requests_pending_account_purpose"
                && index.Filter == "status = 'pending' AND auth_account_id IS NOT NULL"
                && index.Columns.SequenceEqual(["auth_account_id", "purpose", "status"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_password_reset_requests"
                && index.Name == "ix_auth_password_reset_requests_account_purpose_status_expires"
                && index.Columns.SequenceEqual(["auth_account_id", "purpose", "status", "expires_at_utc"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_password_reset_requests"
                && index.Name == "ix_auth_password_reset_requests_cleanup_eligible_at_utc"
                && index.Columns.SequenceEqual(["cleanup_eligible_at_utc"]));
    }

    [Fact]
    public void PasswordResetRequestSchemaDoesNotPersistRawIdentifiersOrProviderPayloads()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthPasswordResetRequest>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_password_reset_requests", null);
        var modelColumnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();

        Assert.DoesNotContain(modelColumnNames, IsForbiddenPasswordResetColumn);
        Assert.Contains("reset_material_hash", modelColumnNames);
        Assert.DoesNotContain("reset_material_token", modelColumnNames);
        Assert.DoesNotContain("email", modelColumnNames);
        Assert.DoesNotContain("request_body", modelColumnNames);
        Assert.DoesNotContain("provider_payload", modelColumnNames);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseNpgsql("Host=localhost;Database=settleora_schema_test;Username=settleora;Password=settleora")
            .Options);
    }

    private static IEntityType FindEntityType<TEntity>(SettleoraDbContext dbContext)
    {
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(TEntity));
        Assert.NotNull(entity);
        return entity;
    }

    private static void AssertColumn(
        IEntityType entity,
        StoreObjectIdentifier storeObject,
        string propertyName,
        string columnName,
        bool isNullable,
        int? maxLength = null)
    {
        var property = entity.FindProperty(propertyName);
        Assert.NotNull(property);
        Assert.Equal(columnName, property.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsColumnNullable(storeObject));
        Assert.Equal(maxLength, property.GetMaxLength());
    }

    private static IIndex AssertIndex(
        IEntityType entity,
        string databaseName,
        IReadOnlyList<string> propertyNames,
        bool isUnique)
    {
        var index = Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == databaseName
                && index.Properties.Select(property => property.Name).SequenceEqual(propertyNames));
        Assert.Equal(isUnique, index.IsUnique);
        return index;
    }

    private static void AssertForeignKey(
        IEntityType entity,
        Type principalType,
        IReadOnlyList<string> propertyNames,
        DeleteBehavior deleteBehavior)
    {
        var foreignKey = Assert.Single(
            entity.GetForeignKeys(),
            key => key.PrincipalEntityType.ClrType == principalType
                && key.Properties.Select(property => property.Name).SequenceEqual(propertyNames));
        Assert.Equal(deleteBehavior, foreignKey.DeleteBehavior);
    }

    private static void AssertCheckConstraint(IEntityType entity, string name, string sql)
    {
        var checkConstraint = Assert.Single(entity.GetCheckConstraints(), constraint => constraint.Name == name);
        Assert.Equal(sql, checkConstraint.Sql);
    }

    private static bool IsForbiddenPasswordResetColumn(string columnName)
    {
        return columnName.Contains("raw", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("reset_token", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("reset_url", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("short_code", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("email", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("request_body", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("provider_payload", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("message_body", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("user_agent", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("ip_address", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("plaintext", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("password_hash", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("session_token", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("refresh_credential", StringComparison.OrdinalIgnoreCase);
    }
}
