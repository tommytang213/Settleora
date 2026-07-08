using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class AuthInvitationSchemaFoundationTests
{
    [Fact]
    public void InvitationModelUsesHashOnlySecretAndUserOnlyTargetRole()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthInvitation>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_invitations", null);

        Assert.Equal("auth_invitations", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "ContactIdentifierKind", "contact_identifier_kind", isNullable: false, maxLength: 32);
        AssertColumn(
            entity,
            storeObject,
            "ContactIdentifierNormalized",
            "contact_identifier_normalized",
            isNullable: false,
            maxLength: 320);
        AssertColumn(
            entity,
            storeObject,
            "InvitationSecretHash",
            "invitation_secret_hash",
            isNullable: false,
            maxLength: 256);
        AssertColumn(
            entity,
            storeObject,
            "InvitationSecretHashVersion",
            "invitation_secret_hash_version",
            isNullable: false,
            maxLength: 32);
        AssertColumn(entity, storeObject, "TargetSystemRole", "target_system_role", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "InvitedByAuthAccountId", "invited_by_auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "InvitedByUserProfileId", "invited_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "RevokedByAuthAccountId", "revoked_by_auth_account_id", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ExpiresAtUtc", "expires_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "AcceptedAtUtc", "accepted_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevokedAtUtc", "revoked_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ExpiredAtUtc", "expired_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CleanupEligibleAtUtc", "cleanup_eligible_at_utc", isNullable: true);

        AssertIndex(entity, "ux_auth_invitations_secret_hash", ["InvitationSecretHash"], isUnique: true);
        var pendingContactIndex = AssertIndex(
            entity,
            "ux_auth_invitations_pending_contact_identifier",
            ["ContactIdentifierKind", "ContactIdentifierNormalized"],
            isUnique: true);
        Assert.Equal("status = 'pending'", pendingContactIndex.GetFilter());
        AssertIndex(entity, "ix_auth_invitations_status_expires_at_utc", ["Status", "ExpiresAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_auth_invitations_cleanup_eligible_at_utc", ["CleanupEligibleAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_auth_invitations_invited_by_auth_account_id", ["InvitedByAuthAccountId"], isUnique: false);
        AssertIndex(entity, "ix_auth_invitations_invited_by_user_profile_id", ["InvitedByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_auth_invitations_revoked_by_auth_account_id", ["RevokedByAuthAccountId"], isUnique: false);

        AssertForeignKey(entity, typeof(AuthAccount), ["InvitedByAuthAccountId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["InvitedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(AuthAccount), ["RevokedByAuthAccountId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_invitations_status",
            "status IN ('pending', 'accepted', 'revoked', 'expired')");
        AssertCheckConstraint(
            entity,
            "ck_auth_invitations_contact_identifier_kind",
            "contact_identifier_kind IN ('email')");
        AssertCheckConstraint(
            entity,
            "ck_auth_invitations_target_system_role_user_only",
            "target_system_role = 'user'");
        AssertCheckConstraint(
            entity,
            "ck_auth_invitations_expiry_after_created",
            "expires_at_utc > created_at_utc");
        AssertCheckConstraint(
            entity,
            "ck_auth_invitations_secret_hash_not_blank",
            "length(btrim(invitation_secret_hash)) > 0");
    }

    [Fact]
    public void InvitationSchemaDoesNotPersistRawTokenMaterialOrPrivilegedRoleAssignment()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthInvitation>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_invitations", null);
        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();

        Assert.Contains("invitation_secret_hash", columnNames);
        Assert.Contains("target_system_role", columnNames);
        Assert.DoesNotContain(columnNames, IsForbiddenInvitationColumn);

        var targetRole = Assert.Single(entity.GetCheckConstraints(), constraint => constraint.Name == "ck_auth_invitations_target_system_role_user_only");
        Assert.Equal("target_system_role = 'user'", targetRole.Sql);
        Assert.DoesNotContain("owner", targetRole.Sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("admin", targetRole.Sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void InvitationMigrationCreatesOnlyAdditiveAuthInvitationSchema()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddAuthInvitationsFoundation", StringComparison.Ordinal));

        var migration = new AddAuthInvitationsFoundation();

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
            table => table.Name == "auth_invitations");

        Assert.Equal(["id"], createTable.PrimaryKey!.Columns);
        Assert.All(
            createTable.Columns.Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));
        Assert.DoesNotContain(createTable.Columns, column => IsForbiddenInvitationColumn(column.Name));
        Assert.Contains(createTable.Columns, column => column.Name == "invitation_secret_hash");
        Assert.Contains(createTable.Columns, column => column.Name == "target_system_role");
        Assert.DoesNotContain(createTable.Columns, column => column.Name.Contains("owner", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(createTable.Columns, column => column.Name.Contains("admin", StringComparison.OrdinalIgnoreCase));

        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["invited_by_auth_account_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.Columns.SequenceEqual(["invited_by_user_profile_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.DoesNotContain(
            createTable.ForeignKeys,
            foreignKey => IsForbiddenSideEffectTable(foreignKey.PrincipalTable));

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        Assert.Contains(
            indexes,
            index => index.Table == "auth_invitations"
                && index.Name == "ux_auth_invitations_secret_hash"
                && index.IsUnique
                && index.Columns.SequenceEqual(["invitation_secret_hash"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_invitations"
                && index.Name == "ux_auth_invitations_pending_contact_identifier"
                && index.IsUnique
                && index.Filter == "status = 'pending'"
                && index.Columns.SequenceEqual(["contact_identifier_kind", "contact_identifier_normalized"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_invitations"
                && index.Name == "ix_auth_invitations_status_expires_at_utc"
                && index.Columns.SequenceEqual(["status", "expires_at_utc"]));
    }

    [Fact]
    public void InvitationMigrationDoesNotCreateStorageMoneySyncOrSecurityCenterSideEffects()
    {
        var migration = new AddAuthInvitationsFoundation();
        var affectedTables = migration.UpOperations
            .SelectMany(operation => operation switch
            {
                CreateTableOperation createTable => new[] { createTable.Name },
                CreateIndexOperation createIndex => new[] { createIndex.Table },
                _ => Array.Empty<string>()
            })
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(["auth_invitations"], affectedTables);
        Assert.DoesNotContain(affectedTables, IsForbiddenSideEffectTable);
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

    private static bool IsForbiddenInvitationColumn(string columnName)
    {
        return columnName.Contains("raw", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("token", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("code", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("plaintext", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("secret_material", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("invite_material", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("invitation_material", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("request_body", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("provider_payload", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("message_body", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("password", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("session", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("refresh", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("amount", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("currency", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsForbiddenSideEffectTable(string tableName)
    {
        if (tableName.Equals("user_profiles", StringComparison.Ordinal))
        {
            return false;
        }

        return tableName.Contains("file", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("storage", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("settlement", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("payment", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("bill", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("expense", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("money", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("sync", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("notification", StringComparison.OrdinalIgnoreCase)
            || tableName.Contains("security_center", StringComparison.OrdinalIgnoreCase);
    }
}
