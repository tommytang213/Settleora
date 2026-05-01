using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class UsersGroupsModelTests
{
    [Fact]
    public void UserProfileModelUsesReviewableTableColumnsAndConstraints()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<UserProfile>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("user_profiles", null);

        Assert.Equal("user_profiles", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "DisplayName", "display_name", isNullable: false, maxLength: 160);
        AssertColumn(entity, storeObject, "DefaultCurrency", "default_currency", isNullable: true, maxLength: 3);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DeletedAtUtc", "deleted_at_utc", isNullable: true);

        AssertCheckConstraint(
            entity,
            "ck_user_profiles_display_name_not_blank",
            "length(btrim(display_name)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_user_profiles_default_currency_uppercase_iso",
            "default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'");
    }

    [Fact]
    public void UserGroupModelUsesCreatorForeignKeyAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<UserGroup>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("user_groups", null);

        Assert.Equal("user_groups", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "Name", "name", isNullable: false, maxLength: 160);
        AssertColumn(entity, storeObject, "CreatedByUserProfileId", "created_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DeletedAtUtc", "deleted_at_utc", isNullable: true);

        Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == "ix_user_groups_created_by_user_profile_id"
                && index.Properties.Select(property => property.Name).SequenceEqual(["CreatedByUserProfileId"]));

        var foreignKey = Assert.Single(entity.GetForeignKeys());
        Assert.Equal(typeof(UserProfile), foreignKey.PrincipalEntityType.ClrType);
        Assert.Equal(["CreatedByUserProfileId"], foreignKey.Properties.Select(property => property.Name));
        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);

        AssertCheckConstraint(
            entity,
            "ck_user_groups_name_not_blank",
            "length(btrim(name)) > 0");
    }

    [Fact]
    public void GroupMembershipModelUsesCompositeKeyRestrictedValuesAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<GroupMembership>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("group_memberships", null);

        Assert.Equal("group_memberships", entity.GetTableName());
        Assert.Equal(
            ["GroupId", "UserProfileId"],
            entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "GroupId", "group_id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "Role", "role", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == "ix_group_memberships_user_profile_id"
                && index.Properties.Select(property => property.Name).SequenceEqual(["UserProfileId"]));

        Assert.All(entity.GetForeignKeys(), foreignKey => Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior));
        Assert.Contains(entity.GetForeignKeys(), foreignKey => foreignKey.PrincipalEntityType.ClrType == typeof(UserGroup));
        Assert.Contains(entity.GetForeignKeys(), foreignKey => foreignKey.PrincipalEntityType.ClrType == typeof(UserProfile));

        AssertCheckConstraint(
            entity,
            "ck_group_memberships_role",
            "role IN ('owner', 'member')");
        AssertCheckConstraint(
            entity,
            "ck_group_memberships_status",
            "status IN ('active', 'removed')");
    }

    [Fact]
    public void UsersGroupsMigrationIsRegistered()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddUsersGroupsSchemaFoundation", StringComparison.Ordinal));
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
        var entity = dbContext.GetService<IDesignTimeModel>()
            .Model
            .FindEntityType(typeof(TEntity));

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
}
