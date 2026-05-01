using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class AuthIdentityModelTests
{
    private static readonly string[] ForbiddenSecurityColumnFragments =
    [
        "credential",
        "hash",
        "mfa",
        "passkey",
        "password",
        "secret",
        "session",
        "token"
    ];

    [Fact]
    public void AuthAccountModelUsesUserProfileLinkAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthAccount>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_accounts", null);

        Assert.Equal("auth_accounts", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DisabledAtUtc", "disabled_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "DeletedAtUtc", "deleted_at_utc", isNullable: true);

        AssertIndex(
            entity,
            "ux_auth_accounts_user_profile_id",
            ["UserProfileId"],
            isUnique: true);

        AssertForeignKey(
            entity,
            typeof(UserProfile),
            ["UserProfileId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_accounts_status",
            "status IN ('active', 'disabled')");
    }

    [Fact]
    public void AuthIdentityModelUsesProviderLookupAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthIdentity>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_identities", null);

        Assert.Equal("auth_identities", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "ProviderType", "provider_type", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "ProviderName", "provider_name", isNullable: false, maxLength: 120);
        AssertColumn(entity, storeObject, "ProviderSubject", "provider_subject", isNullable: false, maxLength: 320);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DisabledAtUtc", "disabled_at_utc", isNullable: true);

        AssertIndex(
            entity,
            "ix_auth_identities_auth_account_id",
            ["AuthAccountId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ux_auth_identities_provider_lookup",
            ["ProviderType", "ProviderName", "ProviderSubject"],
            isUnique: true);

        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["AuthAccountId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_identities_provider_type",
            "provider_type IN ('local', 'oidc')");
        AssertCheckConstraint(
            entity,
            "ck_auth_identities_provider_name_not_blank",
            "length(btrim(provider_name)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_auth_identities_provider_subject_not_blank",
            "length(btrim(provider_subject)) > 0");
    }

    [Fact]
    public void SystemRoleAssignmentModelUsesCompositeKeyAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<SystemRoleAssignment>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("system_role_assignments", null);

        Assert.Equal("system_role_assignments", entity.GetTableName());
        Assert.Equal(
            ["AuthAccountId", "Role"],
            entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "Role", "role", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "AssignedAtUtc", "assigned_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "AssignedByAuthAccountId", "assigned_by_auth_account_id", isNullable: true);

        AssertIndex(
            entity,
            "ix_system_role_assignments_assigned_by_auth_account_id",
            ["AssignedByAuthAccountId"],
            isUnique: false);

        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["AuthAccountId"],
            DeleteBehavior.Restrict);
        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["AssignedByAuthAccountId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_system_role_assignments_role",
            "role IN ('owner', 'admin', 'user')");
    }

    [Fact]
    public void AuthIdentityMigrationCreatesReviewableSchemaOperations()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddAuthIdentitySchemaFoundation", StringComparison.Ordinal));

        var migration = new AddAuthIdentitySchemaFoundation();
        var createTables = migration.UpOperations
            .OfType<CreateTableOperation>()
            .Where(operation => operation.Name.StartsWith("auth_", StringComparison.Ordinal)
                || operation.Name == "system_role_assignments")
            .ToList();

        Assert.Equal(
            ["auth_accounts", "auth_identities", "system_role_assignments"],
            createTables.Select(operation => operation.Name).Order());

        var authAccounts = Assert.Single(createTables, table => table.Name == "auth_accounts");
        Assert.Equal(["id"], authAccounts.PrimaryKey!.Columns);
        Assert.Contains(
            authAccounts.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.Columns.SequenceEqual(["user_profile_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        var authIdentities = Assert.Single(createTables, table => table.Name == "auth_identities");
        Assert.Equal(["id"], authIdentities.PrimaryKey!.Columns);
        Assert.Contains(
            authIdentities.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["auth_account_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        var systemRoles = Assert.Single(createTables, table => table.Name == "system_role_assignments");
        Assert.Equal(["auth_account_id", "role"], systemRoles.PrimaryKey!.Columns);
        Assert.All(
            systemRoles.ForeignKeys,
            foreignKey => Assert.Equal(ReferentialAction.Restrict, foreignKey.OnDelete));

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>();
        Assert.Contains(
            indexes,
            index => index.Table == "auth_accounts"
                && index.Name == "ux_auth_accounts_user_profile_id"
                && index.IsUnique
                && index.Columns.SequenceEqual(["user_profile_id"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_identities"
                && index.Name == "ix_auth_identities_auth_account_id"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["auth_account_id"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_identities"
                && index.Name == "ux_auth_identities_provider_lookup"
                && index.IsUnique
                && index.Columns.SequenceEqual(["provider_type", "provider_name", "provider_subject"]));
        Assert.Contains(
            indexes,
            index => index.Table == "system_role_assignments"
                && index.Name == "ix_system_role_assignments_assigned_by_auth_account_id"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["assigned_by_auth_account_id"]));
    }

    [Fact]
    public void AuthIdentitySchemaDoesNotAddSecretTokenSessionPasskeyOrMfaColumns()
    {
        using var dbContext = CreateDbContext();
        var entityTypes = new[]
        {
            typeof(AuthAccount),
            typeof(AuthIdentity),
            typeof(SystemRoleAssignment)
        };

        var modelColumnNames = entityTypes.SelectMany(entityType =>
        {
            var entity = FindEntityType(dbContext, entityType);
            var storeObject = StoreObjectIdentifier.Table(entity.GetTableName()!, entity.GetSchema());

            return entity.GetProperties()
                .Select(property => property.GetColumnName(storeObject) ?? property.Name);
        });

        AssertNoForbiddenSecurityColumnFragments(modelColumnNames);

        var migration = new AddAuthIdentitySchemaFoundation();
        var migrationColumnNames = migration.UpOperations
            .OfType<CreateTableOperation>()
            .Where(operation => operation.Name.StartsWith("auth_", StringComparison.Ordinal)
                || operation.Name == "system_role_assignments")
            .SelectMany(operation => operation.Columns.Select(column => column.Name));

        AssertNoForbiddenSecurityColumnFragments(migrationColumnNames);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        Dictionary<string, string?> values = new()
        {
            ["Settleora:Database:ConnectionString"] =
                "Host=localhost;Port=5432;Database=settleora;Username=settleora;Password=settleora_dev_password"
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        return SettleoraDbContextDesignTimeFactory.CreateDbContext(configuration);
    }

    private static IEntityType FindEntityType<TEntity>(SettleoraDbContext dbContext)
    {
        return FindEntityType(dbContext, typeof(TEntity));
    }

    private static IEntityType FindEntityType(SettleoraDbContext dbContext, Type entityType)
    {
        var entity = dbContext.GetService<IDesignTimeModel>()
            .Model
            .FindEntityType(entityType);

        Assert.NotNull(entity);
        return entity!;
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
        Assert.Equal(columnName, property!.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsNullable);
        Assert.Equal(maxLength, property.GetMaxLength());
    }

    private static void AssertIndex(
        IEntityType entity,
        string indexName,
        string[] propertyNames,
        bool isUnique)
    {
        var index = Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == indexName);

        Assert.Equal(propertyNames, index.Properties.Select(property => property.Name));
        Assert.Equal(isUnique, index.IsUnique);
    }

    private static void AssertForeignKey(
        IEntityType entity,
        Type principalType,
        string[] propertyNames,
        DeleteBehavior deleteBehavior)
    {
        var foreignKey = Assert.Single(
            entity.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == principalType
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(propertyNames));

        Assert.Equal(deleteBehavior, foreignKey.DeleteBehavior);
    }

    private static void AssertCheckConstraint(
        IEntityType entity,
        string constraintName,
        string sql)
    {
        var constraint = Assert.Single(
            entity.GetCheckConstraints(),
            checkConstraint => checkConstraint.Name == constraintName);

        Assert.Equal(sql, constraint.Sql);
    }

    private static void AssertNoForbiddenSecurityColumnFragments(IEnumerable<string> columnNames)
    {
        var forbiddenColumn = columnNames.FirstOrDefault(columnName =>
            ForbiddenSecurityColumnFragments.Any(fragment =>
                columnName.Contains(fragment, StringComparison.OrdinalIgnoreCase)));

        Assert.Null(forbiddenColumn);
    }
}
