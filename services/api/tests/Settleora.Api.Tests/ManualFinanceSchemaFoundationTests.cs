using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Finance;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class ManualFinanceSchemaFoundationTests
{
    [Fact]
    public void ManualFinancialAccountModelUsesOwnerScopeMoneyAndRestrictiveRelationship()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.Model.FindEntityType(typeof(ManualFinancialAccount));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("manual_financial_accounts", null);

        AssertColumn(entity, storeObject, "DisplayName", "display_name", isNullable: false, ManualFinanceConstraints.DisplayNameMaxLength);
        AssertColumn(entity, storeObject, "CurrentBalanceCurrency", "current_balance_currency", isNullable: false, ManualFinanceConstraints.CurrencyMaxLength);
        AssertDecimal(entity, "CurrentBalanceAmount", 19, 4);
        AssertForeignKey(entity, typeof(UserProfile), ["OwnerUserProfileId"], DeleteBehavior.Restrict);
        Assert.Contains(entity.GetIndexes(), index => index.GetDatabaseName() == "ix_manual_financial_accounts_owner_status_name");
    }

    [Fact]
    public void ManualIncomeSourceModelUsesOwnerScopeLinkedAccountAndRestrictiveRelationships()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.Model.FindEntityType(typeof(ManualIncomeSource));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("manual_income_sources", null);

        AssertColumn(entity, storeObject, "DisplayName", "display_name", isNullable: false, ManualFinanceConstraints.DisplayNameMaxLength);
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, ManualFinanceConstraints.CurrencyMaxLength);
        AssertDecimal(entity, "Amount", 19, 4);
        AssertForeignKey(entity, typeof(UserProfile), ["OwnerUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ManualFinancialAccount), ["ManualFinancialAccountId"], DeleteBehavior.Restrict);
        Assert.Contains(entity.GetIndexes(), index => index.GetDatabaseName() == "ix_manual_income_sources_owner_status_next");
    }

    [Fact]
    public void ManualFinanceMigrationIsAdditiveAndReviewable()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddManualFinanceAccountIncomeFoundation", StringComparison.Ordinal));

        var migration = new AddManualFinanceAccountIncomeFoundation();

        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation);

        var createTables = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        Assert.Equal(["manual_financial_accounts", "manual_income_sources"], createTables.Select(table => table.Name).Order().ToArray());
        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            operation => operation.Name == "ix_manual_income_sources_owner_status_next");
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

    private static void AssertDecimal(
        IEntityType? entity,
        string propertyName,
        int precision,
        int scale)
    {
        Assert.NotNull(entity);
        var property = entity.FindProperty(propertyName);
        Assert.NotNull(property);
        Assert.Equal(precision, property.GetPrecision());
        Assert.Equal(scale, property.GetScale());
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
}
