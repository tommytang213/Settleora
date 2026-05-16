using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class RecurringBillSchemaFoundationTests
{
    [Fact]
    public void RecurringBillTemplateModelUsesBoundedPayloadMoneyAndRestrictiveRelationships()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.Model.FindEntityType(typeof(RecurringBillTemplate));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("recurring_bill_templates", null);

        AssertColumn(entity, storeObject, "PayloadJson", "payload_json", isNullable: false, maxLength: RecurringBillConstraints.PayloadJsonMaxLength);
        AssertColumn(entity, storeObject, "ForecastCurrency", "forecast_currency", isNullable: false, maxLength: 3);
        AssertDecimal(entity, "ForecastAmount", 19, 4);
        AssertForeignKey(entity, typeof(UserProfile), ["OwnerUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["CreatedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserGroup), ["GroupId"], DeleteBehavior.Restrict);
        Assert.Contains(entity.GetIndexes(), index =>
            index.GetDatabaseName() == "ix_recurring_bill_templates_owner_status_next");
    }

    [Fact]
    public void RecurringBillOccurrenceModelHasUniqueTemplateDateAndGeneratedBillLink()
    {
        using var dbContext = CreateDbContext();
        var entity = dbContext.Model.FindEntityType(typeof(RecurringBillOccurrence));
        Assert.NotNull(entity);
        var storeObject = StoreObjectIdentifier.Table("recurring_bill_occurrences", null);

        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: RecurringBillConstraints.OccurrenceStatusMaxLength);
        AssertForeignKey(entity, typeof(RecurringBillTemplate), ["RecurringBillTemplateId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBill), ["GeneratedExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["GeneratedByUserProfileId"], DeleteBehavior.Restrict);
        Assert.Contains(entity.GetIndexes(), index =>
            index.IsUnique
            && index.GetDatabaseName() == "ux_recurring_bill_occurrences_template_date"
            && index.Properties.Select(property => property.Name).SequenceEqual(["RecurringBillTemplateId", "OccurrenceDate"]));
    }

    [Fact]
    public void RecurringBillMigrationIsAdditiveAndReviewable()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddRecurringBillsForecastingFoundation", StringComparison.Ordinal));

        var migration = new AddRecurringBillsForecastingFoundation();

        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation);

        var createTables = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        Assert.Equal(["recurring_bill_occurrences", "recurring_bill_templates"], createTables.Select(table => table.Name).Order().ToArray());
        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            operation => operation.Name == "ux_recurring_bill_occurrences_template_date" && operation.IsUnique);
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
