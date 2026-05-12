using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class ReceiptOcrReviewSchemaFoundationTests
{
    [Fact]
    public void ReceiptOcrReviewConstantsRepresentBoundedApprovedValues()
    {
        Assert.Equal(100, ReceiptOcrReviewConstraints.MaxLineCount);
        Assert.Equal(19, ReceiptOcrReviewConstraints.MoneyAmountPrecision);
        Assert.Equal(4, ReceiptOcrReviewConstraints.MoneyAmountScale);
        Assert.Equal(999999999999999.9999m, ReceiptOcrReviewConstraints.MoneyAmountMaxValue);
        Assert.Equal(240, ReceiptOcrReviewConstraints.LineTextMaxLength);

        Assert.True(ReceiptOcrReviewStatuses.IsSupported(ReceiptOcrReviewStatuses.Provisional));
        Assert.True(ReceiptOcrReviewStatuses.IsSupported(ReceiptOcrReviewStatuses.Reviewed));
        Assert.False(ReceiptOcrReviewStatuses.IsSupported("accepted_applied"));

        Assert.True(ReceiptOcrReviewSources.IsSupported(ReceiptOcrReviewSources.OnDevice));
        Assert.True(ReceiptOcrReviewSources.IsSupported(ReceiptOcrReviewSources.ManualEntry));
        Assert.True(ReceiptOcrReviewSources.IsSupported(ReceiptOcrReviewSources.ImportedReviewedData));
        Assert.False(ReceiptOcrReviewSources.IsSupported("server_ocr_worker"));
    }

    [Fact]
    public void ReceiptOcrReviewModelUsesBillAttachmentScopedReviewTablesWithoutStorageInternals()
    {
        using var dbContext = CreateDbContext();
        var reviewEntity = FindEntityType<ReceiptOcrReview>(dbContext);
        var reviewStoreObject = StoreObjectIdentifier.Table("receipt_ocr_reviews", null);

        Assert.Equal("receipt_ocr_reviews", reviewEntity.GetTableName());
        Assert.Equal(["Id"], reviewEntity.FindPrimaryKey()!.Properties.Select(property => property.Name));
        AssertColumn(reviewEntity, reviewStoreObject, "Id", "id", isNullable: false);
        AssertColumn(reviewEntity, reviewStoreObject, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(reviewEntity, reviewStoreObject, "FileObjectId", "file_object_id", isNullable: false);
        AssertColumn(reviewEntity, reviewStoreObject, "CreatedByUserProfileId", "created_by_user_profile_id", isNullable: false);
        AssertColumn(reviewEntity, reviewStoreObject, "GroupId", "group_id", isNullable: true);
        AssertColumn(reviewEntity, reviewStoreObject, "Status", "status", isNullable: false, maxLength: 24);
        AssertColumn(reviewEntity, reviewStoreObject, "Source", "source", isNullable: false, maxLength: 32);
        AssertColumn(reviewEntity, reviewStoreObject, "MerchantText", "merchant_text", isNullable: true, maxLength: 200);
        AssertColumn(reviewEntity, reviewStoreObject, "ReceiptIssuedAtUtc", "receipt_issued_at_utc", isNullable: true);
        AssertColumn(reviewEntity, reviewStoreObject, "Currency", "currency", isNullable: true, maxLength: 3);
        AssertMoneyColumn(reviewEntity, reviewStoreObject, "SubtotalAmount", "subtotal_amount");
        AssertMoneyColumn(reviewEntity, reviewStoreObject, "TaxAmount", "tax_amount");
        AssertMoneyColumn(reviewEntity, reviewStoreObject, "ServiceChargeAmount", "service_charge_amount");
        AssertMoneyColumn(reviewEntity, reviewStoreObject, "DiscountAmount", "discount_amount");
        AssertMoneyColumn(reviewEntity, reviewStoreObject, "GrandTotalAmount", "grand_total_amount");
        AssertColumn(reviewEntity, reviewStoreObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(reviewEntity, reviewStoreObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(reviewEntity, reviewStoreObject, "RemovedAtUtc", "removed_at_utc", isNullable: true);

        AssertIndex(reviewEntity, "ux_receipt_ocr_reviews_active_bill_file", ["ExpenseBillId", "FileObjectId"], isUnique: true);
        AssertIndex(reviewEntity, "ix_receipt_ocr_reviews_group_id", ["GroupId"], isUnique: false);
        AssertIndex(reviewEntity, "ix_receipt_ocr_reviews_status", ["Status"], isUnique: false);
        AssertForeignKey(reviewEntity, typeof(ExpenseBillAttachment), ["ExpenseBillId", "FileObjectId"], DeleteBehavior.Restrict);
        AssertForeignKey(reviewEntity, typeof(UserProfile), ["CreatedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(reviewEntity, typeof(UserGroup), ["GroupId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(reviewEntity, "ck_receipt_ocr_reviews_status", "status IN ('provisional', 'reviewed')");
        AssertCheckConstraint(reviewEntity, "ck_receipt_ocr_reviews_source", "source IN ('on_device', 'manual_entry', 'imported_reviewed_data')");
        AssertCheckConstraint(reviewEntity, "ck_receipt_ocr_reviews_currency_uppercase_iso", "currency IS NULL OR currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(reviewEntity, "ck_receipt_ocr_reviews_amounts_require_currency", "(currency IS NOT NULL OR (subtotal_amount IS NULL AND tax_amount IS NULL AND service_charge_amount IS NULL AND discount_amount IS NULL AND grand_total_amount IS NULL))");

        var reviewColumnNames = reviewEntity.GetProperties()
            .Select(property => property.GetColumnName(reviewStoreObject) ?? property.Name)
            .ToArray();
        Assert.DoesNotContain(reviewColumnNames, IsStorageOrRawOcrColumnName);

        var lineEntity = FindEntityType<ReceiptOcrReviewLine>(dbContext);
        var lineStoreObject = StoreObjectIdentifier.Table("receipt_ocr_review_lines", null);

        Assert.Equal("receipt_ocr_review_lines", lineEntity.GetTableName());
        Assert.Equal(["Id"], lineEntity.FindPrimaryKey()!.Properties.Select(property => property.Name));
        AssertColumn(lineEntity, lineStoreObject, "Id", "id", isNullable: false);
        AssertColumn(lineEntity, lineStoreObject, "ReceiptOcrReviewId", "receipt_ocr_review_id", isNullable: false);
        AssertColumn(lineEntity, lineStoreObject, "SortOrder", "sort_order", isNullable: false);
        AssertColumn(lineEntity, lineStoreObject, "Text", "text", isNullable: false, maxLength: 240);
        AssertColumn(lineEntity, lineStoreObject, "Quantity", "quantity", isNullable: true, precision: 18, scale: 4);
        AssertMoneyColumn(lineEntity, lineStoreObject, "UnitPriceAmount", "unit_price_amount");
        AssertMoneyColumn(lineEntity, lineStoreObject, "LineTotalAmount", "line_total_amount");
        AssertColumn(lineEntity, lineStoreObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(lineEntity, lineStoreObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(lineEntity, "ux_receipt_ocr_review_lines_review_sort_order", ["ReceiptOcrReviewId", "SortOrder"], isUnique: true);
        AssertForeignKey(lineEntity, typeof(ReceiptOcrReview), ["ReceiptOcrReviewId"], DeleteBehavior.Restrict);
        AssertCheckConstraint(lineEntity, "ck_receipt_ocr_review_lines_text_not_blank", "length(btrim(text)) > 0");
        AssertCheckConstraint(lineEntity, "ck_receipt_ocr_review_lines_quantity_positive", "quantity IS NULL OR quantity > 0");
    }

    [Fact]
    public void ReceiptOcrReviewMigrationIsAdditiveAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddReceiptOcrReviewIntakeFoundation", StringComparison.Ordinal));

        var migration = new AddReceiptOcrReviewIntakeFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTables = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        var createIndexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        Assert.Equal(["receipt_ocr_review_lines", "receipt_ocr_reviews"], createTables.Select(table => table.Name).Order());
        Assert.All(createIndexes, index => Assert.Contains(["receipt_ocr_review_lines", "receipt_ocr_reviews"], table => table == index.Table));

        var reviews = Assert.Single(createTables, table => table.Name == "receipt_ocr_reviews");
        Assert.Equal(["id"], reviews.PrimaryKey!.Columns);
        Assert.DoesNotContain(reviews.Columns, column => IsStorageOrRawOcrColumnName(column.Name));
        Assert.Contains(reviews.ForeignKeys, foreignKey => foreignKey.PrincipalTable == "expense_bill_attachments"
            && foreignKey.Columns.SequenceEqual(["expense_bill_id", "file_object_id"])
            && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(reviews.ForeignKeys, foreignKey => foreignKey.PrincipalTable == "user_profiles"
            && foreignKey.Columns.SequenceEqual(["created_by_user_profile_id"])
            && foreignKey.OnDelete == ReferentialAction.Restrict);

        var lines = Assert.Single(createTables, table => table.Name == "receipt_ocr_review_lines");
        Assert.Equal(["id"], lines.PrimaryKey!.Columns);
        Assert.DoesNotContain(lines.Columns, column => IsStorageOrRawOcrColumnName(column.Name));
        Assert.Contains(lines.ForeignKeys, foreignKey => foreignKey.PrincipalTable == "receipt_ocr_reviews"
            && foreignKey.Columns.SequenceEqual(["receipt_ocr_review_id"])
            && foreignKey.OnDelete == ReferentialAction.Restrict);

        Assert.Contains(createIndexes, index => index.Name == "ux_receipt_ocr_reviews_active_bill_file"
            && index.Table == "receipt_ocr_reviews"
            && index.Columns.SequenceEqual(["expense_bill_id", "file_object_id"])
            && index.IsUnique
            && index.Filter == "removed_at_utc IS NULL");
        Assert.Contains(createIndexes, index => index.Name == "ux_receipt_ocr_review_lines_review_sort_order"
            && index.Table == "receipt_ocr_review_lines"
            && index.Columns.SequenceEqual(["receipt_ocr_review_id", "sort_order"])
            && index.IsUnique);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseNpgsql("Host=localhost;Database=settleora_model_tests;Username=postgres;Password=postgres")
            .Options;

        return new SettleoraDbContext(options);
    }

    private static IEntityType FindEntityType<TEntity>(SettleoraDbContext dbContext)
    {
        return dbContext.GetService<IDesignTimeModel>()
            .Model
            .FindEntityType(typeof(TEntity))
            ?? throw new InvalidOperationException($"Entity type {typeof(TEntity).Name} was not found.");
    }

    private static void AssertMoneyColumn(
        IEntityType entity,
        StoreObjectIdentifier storeObject,
        string propertyName,
        string columnName)
    {
        AssertColumn(
            entity,
            storeObject,
            propertyName,
            columnName,
            isNullable: true,
            precision: ReceiptOcrReviewConstraints.MoneyAmountPrecision,
            scale: ReceiptOcrReviewConstraints.MoneyAmountScale);
    }

    private static void AssertColumn(
        IEntityType entity,
        StoreObjectIdentifier storeObject,
        string propertyName,
        string columnName,
        bool isNullable,
        int? maxLength = null,
        int? precision = null,
        int? scale = null)
    {
        var property = entity.FindProperty(propertyName);
        Assert.NotNull(property);
        Assert.Equal(columnName, property.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsNullable);
        Assert.Equal(maxLength, property.GetMaxLength());
        Assert.Equal(precision, property.GetPrecision());
        Assert.Equal(scale, property.GetScale());
    }

    private static void AssertIndex(
        IEntityType entity,
        string indexName,
        IReadOnlyList<string> propertyNames,
        bool isUnique)
    {
        var index = entity.GetIndexes().Single(candidate => candidate.GetDatabaseName() == indexName);
        Assert.Equal(propertyNames, index.Properties.Select(property => property.Name).ToArray());
        Assert.Equal(isUnique, index.IsUnique);
    }

    private static void AssertForeignKey(
        IEntityType entity,
        Type principalType,
        IReadOnlyList<string> propertyNames,
        DeleteBehavior deleteBehavior)
    {
        Assert.Contains(
            entity.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == principalType
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(propertyNames)
                && foreignKey.DeleteBehavior == deleteBehavior);
    }

    private static void AssertCheckConstraint(
        IEntityType entity,
        string constraintName,
        string sql)
    {
        Assert.Contains(
            entity.GetCheckConstraints(),
            constraint => constraint.Name == constraintName && constraint.Sql == sql);
    }

    private static bool IsStorageOrRawOcrColumnName(string columnName)
    {
        return columnName.Contains("storage", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("object_key", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("provider", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("path", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("filename", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("vault", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("raw", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("full_text", StringComparison.OrdinalIgnoreCase);
    }
}
