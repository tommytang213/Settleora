using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class ExpenseBillSchemaFoundationTests
{
    private static readonly string[] ExpenseBillSchemaTables =
    [
        "expense_bills",
        "expense_bill_items",
        "expense_bill_participants",
        "expense_bill_payers",
        "expense_bill_adjustments",
        "expense_bill_attachments"
    ];

    [Fact]
    public void ExpenseBillConstantsRepresentApprovedFoundationValues()
    {
        Assert.Equal(19, ExpenseBillConstraints.MoneyAmountPrecision);
        Assert.Equal(4, ExpenseBillConstraints.MoneyAmountScale);
        Assert.Equal(3, ExpenseBillConstraints.CurrencyMaxLength);
        Assert.Equal(999999999999999.9999m, ExpenseBillConstraints.MoneyAmountMaxValue);

        Assert.True(ExpenseBillStatuses.IsSupported(ExpenseBillStatuses.Draft));
        Assert.True(ExpenseBillStatuses.IsSupported(ExpenseBillStatuses.PendingConfirmation));
        Assert.True(ExpenseBillStatuses.IsSupported(ExpenseBillStatuses.Confirmed));
        Assert.True(ExpenseBillStatuses.IsSupported(ExpenseBillStatuses.Rejected));
        Assert.True(ExpenseBillStatuses.IsSupported(ExpenseBillStatuses.Cancelled));
        Assert.True(ExpenseBillStatuses.IsSupported(ExpenseBillStatuses.Finalized));
        Assert.True(ExpenseBillStatuses.IsSupported(ExpenseBillStatuses.Archived));
        Assert.False(ExpenseBillStatuses.IsSupported("settled"));

        Assert.True(ExpenseBillParticipantStatuses.IsSupported(ExpenseBillParticipantStatuses.PendingAcceptance));
        Assert.True(ExpenseBillParticipantStatuses.IsSupported(ExpenseBillParticipantStatuses.ConfirmedPaid));
        Assert.False(ExpenseBillParticipantStatuses.IsSupported("invited"));

        Assert.True(ExpenseBillAdjustmentTypes.IsSupported(ExpenseBillAdjustmentTypes.Tax));
        Assert.True(ExpenseBillAdjustmentTypes.IsSupported(ExpenseBillAdjustmentTypes.Credit));
        Assert.False(ExpenseBillAdjustmentTypes.IsSupported("refund"));

        Assert.True(ExpenseBillAdjustmentDirections.IsSupported(ExpenseBillAdjustmentDirections.Charge));
        Assert.True(ExpenseBillAdjustmentDirections.IsSupported(ExpenseBillAdjustmentDirections.Credit));
        Assert.False(ExpenseBillAdjustmentDirections.IsSupported("negative"));

        Assert.True(ExpenseBillAdjustmentAllocationMethods.IsSupported(
            ExpenseBillAdjustmentAllocationMethods.ProportionalByItemSubtotal));
        Assert.False(ExpenseBillAdjustmentAllocationMethods.IsSupported("settlement_balance"));

        Assert.True(ExpenseBillAttachmentPurposes.IsSupported(ExpenseBillAttachmentPurposes.Receipt));
        Assert.True(ExpenseBillAttachmentPurposes.IsSupported(ExpenseBillAttachmentPurposes.SupportingAttachment));
        Assert.False(ExpenseBillAttachmentPurposes.IsSupported("storage_path"));
    }

    [Fact]
    public void ExpenseBillModelUsesRootBillTableConstraintsAndIndexes()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBill>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bills", null);

        Assert.Equal("expense_bills", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedByUserProfileId", "created_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "GroupId", "group_id", isNullable: true);
        AssertColumn(entity, storeObject, "MerchantName", "merchant_name", isNullable: true, maxLength: 200);
        AssertColumn(entity, storeObject, "BillDate", "bill_date", isNullable: false, columnType: "date");
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertMoneyColumn(entity, storeObject, "TotalAmount", "total_amount");
        AssertColumn(entity, storeObject, "TotalCurrency", "total_currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ArchivedAtUtc", "archived_at_utc", isNullable: true);

        AssertIndex(entity, "ix_expense_bills_created_by_user_profile_id", ["CreatedByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_group_id", ["GroupId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_status", ["Status"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_bill_date", ["BillDate"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_archived_at_utc", ["ArchivedAtUtc"], isUnique: false);

        AssertForeignKey(entity, typeof(UserProfile), ["CreatedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserGroup), ["GroupId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_expense_bills_merchant_name_not_blank",
            "merchant_name IS NULL OR length(btrim(merchant_name)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_expense_bills_status",
            "status IN ('draft', 'pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'finalized', 'archived')");
        AssertCheckConstraint(entity, "ck_expense_bills_total_amount_non_negative", "total_amount >= 0");
        AssertCheckConstraint(entity, "ck_expense_bills_total_amount_upper_bound", "total_amount <= 999999999999999.9999");
        AssertCheckConstraint(
            entity,
            "ck_expense_bills_total_currency_uppercase_iso",
            "total_currency ~ '^[A-Z]{3}$'");
    }

    [Fact]
    public void ExpenseBillItemModelUsesMoneyAndOrderConstraints()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBillItem>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bill_items", null);

        Assert.Equal("expense_bill_items", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(entity, storeObject, "Name", "name", isNullable: false, maxLength: 240);
        AssertColumn(entity, storeObject, "Note", "note", isNullable: true, maxLength: 1000);
        AssertColumn(entity, storeObject, "Quantity", "quantity", isNullable: true, precision: 18, scale: 4);
        AssertMoneyColumn(entity, storeObject, "Amount", "amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "SortOrder", "sort_order", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DeletedAtUtc", "deleted_at_utc", isNullable: true);

        AssertIndex(entity, "ix_expense_bill_items_expense_bill_id", ["ExpenseBillId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_items_bill_sort_order", ["ExpenseBillId", "SortOrder"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_items_deleted_at_utc", ["DeletedAtUtc"], isUnique: false);

        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_expense_bill_items_name_not_blank", "length(btrim(name)) > 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_note_not_blank", "note IS NULL OR length(btrim(note)) > 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_quantity_positive", "quantity IS NULL OR quantity > 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_amount_non_negative", "amount >= 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_expense_bill_items_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
    }

    [Fact]
    public void ExpenseBillParticipantModelUsesCompositeKeyResolvedShareAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBillParticipant>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bill_participants", null);

        Assert.Equal("expense_bill_participants", entity.GetTableName());
        Assert.Equal(["ExpenseBillId", "UserProfileId"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertMoneyColumn(entity, storeObject, "ResolvedShareAmount", "resolved_share_amount");
        AssertColumn(entity, storeObject, "ResolvedShareCurrency", "resolved_share_currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "AcceptedAtUtc", "accepted_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RejectedAtUtc", "rejected_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "SettledAtUtc", "settled_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(entity, "ix_expense_bill_participants_user_profile_id", ["UserProfileId"], isUnique: false);
        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_expense_bill_participants_status",
            "status IN ('pending_acceptance', 'accepted', 'rejected', 'partially_settled', 'settled', 'waived', 'claimed_paid', 'confirmed_paid')");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_participants_share_amount_non_negative",
            "resolved_share_amount >= 0");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_participants_share_amount_upper_bound",
            "resolved_share_amount <= 999999999999999.9999");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_participants_share_currency_iso",
            "resolved_share_currency ~ '^[A-Z]{3}$'");
    }

    [Fact]
    public void ExpenseBillPayerModelUsesOriginalPayerContributionShape()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBillPayer>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bill_payers", null);

        Assert.Equal("expense_bill_payers", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertMoneyColumn(entity, storeObject, "Amount", "amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(
            entity,
            storeObject,
            "PaymentMethodLabelSnapshot",
            "payment_method_label_snapshot",
            isNullable: true,
            maxLength: 120);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(entity, "ix_expense_bill_payers_expense_bill_id", ["ExpenseBillId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_payers_user_profile_id", ["UserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_payers_bill_user_profile_id", ["ExpenseBillId", "UserProfileId"], isUnique: false);
        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_expense_bill_payers_amount_non_negative", "amount >= 0");
        AssertCheckConstraint(entity, "ck_expense_bill_payers_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_expense_bill_payers_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_payers_method_label_not_blank",
            "payment_method_label_snapshot IS NULL OR length(btrim(payment_method_label_snapshot)) > 0");
    }

    [Fact]
    public void ExpenseBillAdjustmentModelUsesExplicitTypeDirectionAndAllocationPolicy()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBillAdjustment>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bill_adjustments", null);

        Assert.Equal("expense_bill_adjustments", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(entity, storeObject, "Type", "type", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "Direction", "direction", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "AllocationMethod", "allocation_method", isNullable: false, maxLength: 40);
        AssertMoneyColumn(entity, storeObject, "Amount", "amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "ReasonNote", "reason_note", isNullable: true, maxLength: 1000);
        AssertColumn(entity, storeObject, "SortOrder", "sort_order", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(entity, "ix_expense_bill_adjustments_expense_bill_id", ["ExpenseBillId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_adjustments_bill_sort_order", ["ExpenseBillId", "SortOrder"], isUnique: false);
        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_expense_bill_adjustments_type",
            "type IN ('tax', 'service_charge', 'discount', 'manual_adjustment', 'credit')");
        AssertCheckConstraint(entity, "ck_expense_bill_adjustments_direction", "direction IN ('charge', 'credit')");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_adjustments_allocation_method",
            "allocation_method IN ('equal', 'proportional_by_item_subtotal', 'manual')");
        AssertCheckConstraint(entity, "ck_expense_bill_adjustments_amount_non_negative", "amount >= 0");
        AssertCheckConstraint(entity, "ck_expense_bill_adjustments_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_expense_bill_adjustments_currency_iso", "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_adjustments_reason_note_not_blank",
            "reason_note IS NULL OR length(btrim(reason_note)) > 0");
    }

    [Fact]
    public void ExpenseBillAttachmentModelReferencesFileObjectsWithoutStorageInternals()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBillAttachment>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bill_attachments", null);

        Assert.Equal("expense_bill_attachments", entity.GetTableName());
        Assert.Equal(["ExpenseBillId", "FileObjectId"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(entity, storeObject, "FileObjectId", "file_object_id", isNullable: false);
        AssertColumn(entity, storeObject, "Purpose", "purpose", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "CreatedByUserProfileId", "created_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "RemovedAtUtc", "removed_at_utc", isNullable: true);

        AssertIndex(entity, "ix_expense_bill_attachments_file_object_id", ["FileObjectId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_attachments_created_by_profile_id", ["CreatedByUserProfileId"], isUnique: false);

        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(FileObject), ["FileObjectId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["CreatedByUserProfileId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_expense_bill_attachments_purpose",
            "purpose IN ('receipt', 'supporting_attachment')");

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.Contains("file_object_id", columnNames);
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("storage", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("object_key", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("provider", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("path", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("filename", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("vault", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ExpenseBillSchemaFoundationMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddExpenseBillSchemaFoundation", StringComparison.Ordinal));

        var migration = new AddExpenseBillSchemaFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTables = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        Assert.Equal(ExpenseBillSchemaTables.Order(), createTables.Select(table => table.Name).Order());

        Assert.All(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            index => Assert.Contains(ExpenseBillSchemaTables, table => table == index.Table));

        var forbiddenNames = migration.UpOperations
            .OfType<CreateTableOperation>()
            .Select(table => table.Name)
            .Concat(migration.UpOperations.OfType<CreateIndexOperation>().Select(index => index.Table))
            .ToArray();
        Assert.DoesNotContain(forbiddenNames, name => name.Contains("settlement", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(forbiddenNames, name => name.Contains("split", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(forbiddenNames, name => name.Contains("recurring", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(forbiddenNames, name => name.Contains("balance", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(forbiddenNames, name => name.Contains("reconciliation", StringComparison.OrdinalIgnoreCase));

        var expenseBills = Assert.Single(createTables, table => table.Name == "expense_bills");
        Assert.Equal(["id"], expenseBills.PrimaryKey!.Columns);
        Assert.Contains(
            expenseBills.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.Columns.SequenceEqual(["created_by_user_profile_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            expenseBills.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "user_groups"
                && foreignKey.Columns.SequenceEqual(["group_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        var participants = Assert.Single(createTables, table => table.Name == "expense_bill_participants");
        Assert.Equal(["expense_bill_id", "user_profile_id"], participants.PrimaryKey!.Columns);

        var attachments = Assert.Single(createTables, table => table.Name == "expense_bill_attachments");
        Assert.Equal(["expense_bill_id", "file_object_id"], attachments.PrimaryKey!.Columns);
        Assert.Contains(
            attachments.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "file_objects"
                && foreignKey.Columns.SequenceEqual(["file_object_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.DoesNotContain(
            attachments.Columns,
            column => column.Name.Contains("storage", StringComparison.OrdinalIgnoreCase)
                || column.Name.Contains("object_key", StringComparison.OrdinalIgnoreCase)
                || column.Name.Contains("provider", StringComparison.OrdinalIgnoreCase)
                || column.Name.Contains("path", StringComparison.OrdinalIgnoreCase)
                || column.Name.Contains("filename", StringComparison.OrdinalIgnoreCase)
                || column.Name.Contains("vault", StringComparison.OrdinalIgnoreCase));

        Assert.All(
            createTables.SelectMany(table => table.Columns).Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));
        Assert.All(
            createTables.SelectMany(table => table.ForeignKeys),
            foreignKey => Assert.Equal(ReferentialAction.Restrict, foreignKey.OnDelete));
        Assert.All(
            createTables.SelectMany(table => table.ForeignKeys),
            foreignKey => Assert.Contains(
                ["expense_bills", "user_profiles", "user_groups", "file_objects"],
                table => table == foreignKey.PrincipalTable));

        Assert.Contains(
            createTables.SelectMany(table => table.CheckConstraints),
            constraint => constraint.Name == "ck_expense_bills_total_amount_upper_bound"
                && constraint.Sql == "total_amount <= 999999999999999.9999");
        Assert.Contains(
            createTables.SelectMany(table => table.CheckConstraints),
            constraint => constraint.Name == "ck_expense_bill_adjustments_direction"
                && constraint.Sql == "direction IN ('charge', 'credit')");
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
            isNullable: false,
            precision: ExpenseBillConstraints.MoneyAmountPrecision,
            scale: ExpenseBillConstraints.MoneyAmountScale);
    }

    private static void AssertColumn(
        IEntityType entity,
        StoreObjectIdentifier storeObject,
        string propertyName,
        string columnName,
        bool isNullable,
        int? maxLength = null,
        int? precision = null,
        int? scale = null,
        string? columnType = null)
    {
        var property = entity.FindProperty(propertyName);

        Assert.NotNull(property);
        Assert.Equal(columnName, property!.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsNullable);
        Assert.Equal(maxLength, property.GetMaxLength());
        Assert.Equal(precision, property.GetPrecision());
        Assert.Equal(scale, property.GetScale());
        if (columnType is not null)
        {
            Assert.Equal(columnType, property.GetColumnType());
        }
    }

    private static IIndex AssertIndex(
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
        return index;
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
}
