using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

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
    public void UserPaymentProfileModelUsesSeparateBoundedTableAndOneActiveProfilePerUser()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<UserPaymentProfile>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("user_payment_profiles", null);

        Assert.Equal("user_payment_profiles", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "PreferredMethodLabel", "preferred_method_label", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "PaymentHandle", "payment_handle", isNullable: true, maxLength: 320);
        AssertColumn(entity, storeObject, "PaymentNote", "payment_note", isNullable: true, maxLength: 1000);
        AssertColumn(entity, storeObject, "Visibility", "visibility", isNullable: false, maxLength: 40);
        AssertColumn(entity, storeObject, "QrFileObjectId", "qr_file_object_id", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DeletedAtUtc", "deleted_at_utc", isNullable: true);

        var activeProfileIndex = Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == "ux_user_payment_profiles_active_user_profile_id");
        Assert.True(activeProfileIndex.IsUnique);
        Assert.Equal(["UserProfileId"], activeProfileIndex.Properties.Select(property => property.Name));
        Assert.Equal("deleted_at_utc IS NULL", activeProfileIndex.GetFilter());

        Assert.Contains(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == "ix_user_payment_profiles_qr_file_object_id"
                && index.Properties.Select(property => property.Name).SequenceEqual(["QrFileObjectId"]));

        Assert.All(entity.GetForeignKeys(), foreignKey => Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior));
        Assert.Contains(
            entity.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == typeof(UserProfile)
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(["UserProfileId"]));
        Assert.Contains(
            entity.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == typeof(FileObject)
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(["QrFileObjectId"]));

        AssertCheckConstraint(
            entity,
            "ck_user_payment_profiles_visibility",
            "visibility IN ('private', 'settlement_counterparties_only', 'group_members_when_shared')");
        AssertCheckConstraint(
            entity,
            "ck_user_payment_profiles_preferred_method_label_not_blank",
            "preferred_method_label IS NULL OR length(btrim(preferred_method_label)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_user_payment_profiles_payment_handle_not_blank",
            "payment_handle IS NULL OR length(btrim(payment_handle)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_user_payment_profiles_payment_note_not_blank",
            "payment_note IS NULL OR length(btrim(payment_note)) > 0");
    }

    [Fact]
    public void UsersGroupsMigrationIsRegistered()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddUsersGroupsSchemaFoundation", StringComparison.Ordinal));
    }

    [Fact]
    public void UserPaymentProfilesMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddUserPaymentProfilesFoundation", StringComparison.Ordinal));

        var migration = new AddUserPaymentProfilesFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTable = Assert.Single(
            migration.UpOperations.OfType<CreateTableOperation>(),
            table => table.Name == "user_payment_profiles");
        Assert.Equal(["id"], createTable.PrimaryKey!.Columns);
        Assert.DoesNotContain(createTable.Columns, column => column.Name == "qr_file_id");
        Assert.All(
            createTable.Columns.Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.Columns.SequenceEqual(["user_profile_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            createTable.CheckConstraints,
            constraint => constraint.Name == "ck_user_payment_profiles_visibility"
                && constraint.Sql == "visibility IN ('private', 'settlement_counterparties_only', 'group_members_when_shared')");

        var activeIndex = Assert.Single(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            index => index.Table == "user_payment_profiles"
                && index.Name == "ux_user_payment_profiles_active_user_profile_id");
        Assert.True(activeIndex.IsUnique);
        Assert.Equal(["user_profile_id"], activeIndex.Columns);
        Assert.Equal("deleted_at_utc IS NULL", activeIndex.Filter);
    }

    [Fact]
    public void PaymentProfileQrFileReferenceMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddPaymentProfileQrFileReference", StringComparison.Ordinal));

        var migration = new AddPaymentProfileQrFileReference();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is CreateTableOperation
                or DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var addColumn = Assert.Single(
            migration.UpOperations.OfType<AddColumnOperation>(),
            column => column.Table == "user_payment_profiles"
                && column.Name == "qr_file_object_id");
        Assert.Equal(typeof(Guid), addColumn.ClrType);
        Assert.True(addColumn.IsNullable);
        Assert.Equal("uuid", addColumn.ColumnType);

        var index = Assert.Single(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            index => index.Table == "user_payment_profiles"
                && index.Name == "ix_user_payment_profiles_qr_file_object_id");
        Assert.False(index.IsUnique);
        Assert.Equal(["qr_file_object_id"], index.Columns);

        var foreignKey = Assert.Single(
            migration.UpOperations.OfType<AddForeignKeyOperation>(),
            foreignKey => foreignKey.Table == "user_payment_profiles"
                && foreignKey.Name == "fk_user_payment_profiles_file_objects_qr_file_object_id");
        Assert.Equal(["qr_file_object_id"], foreignKey.Columns);
        Assert.Equal("file_objects", foreignKey.PrincipalTable);
        Assert.Equal(["id"], foreignKey.PrincipalColumns!);
        Assert.Equal(ReferentialAction.Restrict, foreignKey.OnDelete);
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
