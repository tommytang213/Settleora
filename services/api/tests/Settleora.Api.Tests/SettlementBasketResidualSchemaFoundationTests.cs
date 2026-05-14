using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class SettlementBasketResidualSchemaFoundationTests
{
    private static readonly string[] SettlementBasketResidualTables =
    [
        "settlement_request_lines",
        "settlement_payment_allocations",
        "settlement_residuals"
    ];

    [Fact]
    public void SettlementBasketResidualConstantsRepresentApprovedFoundationValues()
    {
        Assert.Equal(32, SettlementConstraints.RequestLineStatusMaxLength);
        Assert.Equal(32, SettlementConstraints.ResidualDirectionMaxLength);
        Assert.Equal(32, SettlementConstraints.ResidualPolicyMaxLength);
        Assert.Equal(32, SettlementConstraints.ResidualStatusMaxLength);
        Assert.Equal(240, SettlementConstraints.SourceCandidateKeyMaxLength);
        Assert.Equal(1000, SettlementConstraints.ResidualReasonMaxLength);

        Assert.True(SettlementRequestLineStatuses.IsSupported(SettlementRequestLineStatuses.Open));
        Assert.True(SettlementRequestLineStatuses.IsSupported(SettlementRequestLineStatuses.PartiallyCleared));
        Assert.True(SettlementRequestLineStatuses.IsSupported(SettlementRequestLineStatuses.Cleared));
        Assert.True(SettlementRequestLineStatuses.IsSupported(SettlementRequestLineStatuses.Waived));
        Assert.True(SettlementRequestLineStatuses.IsSupported(SettlementRequestLineStatuses.Disputed));
        Assert.True(SettlementRequestLineStatuses.IsSupported(SettlementRequestLineStatuses.Cancelled));
        Assert.False(SettlementRequestLineStatuses.IsSupported("paid"));
        Assert.False(SettlementRequestLineStatuses.IsSupported("negative"));

        Assert.True(SettlementResidualDirections.IsSupported(SettlementResidualDirections.Underpayment));
        Assert.True(SettlementResidualDirections.IsSupported(SettlementResidualDirections.Overpayment));
        Assert.False(SettlementResidualDirections.IsSupported("exact"));

        Assert.True(SettlementResidualPolicies.IsSupported(SettlementResidualPolicies.RemainingBalance));
        Assert.True(SettlementResidualPolicies.IsSupported(SettlementResidualPolicies.CarriedForward));
        Assert.True(SettlementResidualPolicies.IsSupported(SettlementResidualPolicies.Waived));
        Assert.True(SettlementResidualPolicies.IsSupported(SettlementResidualPolicies.CreditForward));
        Assert.True(SettlementResidualPolicies.IsSupported(SettlementResidualPolicies.WaivedByPayer));
        Assert.True(SettlementResidualPolicies.IsSupported(SettlementResidualPolicies.AppliedToOtherLine));
        Assert.False(SettlementResidualPolicies.IsSupported("silently_discarded"));

        Assert.True(SettlementResidualStatuses.IsSupported(SettlementResidualStatuses.PendingReceiverConfirmation));
        Assert.True(SettlementResidualStatuses.IsSupported(SettlementResidualStatuses.Confirmed));
        Assert.True(SettlementResidualStatuses.IsSupported(SettlementResidualStatuses.CarriedForward));
        Assert.True(SettlementResidualStatuses.IsSupported(SettlementResidualStatuses.Waived));
        Assert.True(SettlementResidualStatuses.IsSupported(SettlementResidualStatuses.Credited));
        Assert.True(SettlementResidualStatuses.IsSupported(SettlementResidualStatuses.Disputed));
        Assert.True(SettlementResidualStatuses.IsSupported(SettlementResidualStatuses.Cancelled));
        Assert.False(SettlementResidualStatuses.IsSupported("auto_cleared"));
    }

    [Fact]
    public void SettlementRequestLineModelUsesBasketLineConstraintsAndRestrictiveRelations()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<SettlementRequestLine>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("settlement_request_lines", null);

        Assert.Equal("settlement_request_lines", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "SettlementRequestId", "settlement_request_id", isNullable: false);
        AssertColumn(entity, storeObject, "SourceExpenseBillId", "source_expense_bill_id", isNullable: false);
        AssertColumn(entity, storeObject, "SourceBillRevisionId", "source_bill_revision_id", isNullable: true);
        AssertColumn(
            entity,
            storeObject,
            "SourceCandidateKey",
            "source_candidate_key",
            isNullable: true,
            maxLength: SettlementConstraints.SourceCandidateKeyMaxLength);
        AssertMoneyColumn(entity, storeObject, "ExactAmount", "exact_amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "AllocationOrder", "allocation_order", isNullable: false);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(entity, "ix_settlement_request_lines_settlement_request_id", ["SettlementRequestId"]);
        AssertIndex(entity, "ix_settlement_request_lines_source_expense_bill_id", ["SourceExpenseBillId"]);
        AssertIndex(entity, "ix_settlement_request_lines_source_bill_revision_id", ["SourceBillRevisionId"]);
        AssertIndex(entity, "ix_settlement_request_lines_status", ["Status"]);
        AssertIndex(
            entity,
            "ix_settlement_request_lines_request_order",
            ["SettlementRequestId", "AllocationOrder"]);
        AssertIndex(
            entity,
            "ix_settlement_request_lines_request_status",
            ["SettlementRequestId", "Status"]);

        AssertForeignKey(entity, typeof(SettlementRequest), ["SettlementRequestId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBill), ["SourceExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBillRevision), ["SourceBillRevisionId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_settlement_request_lines_status",
            "status IN ('open', 'partially_cleared', 'cleared', 'waived', 'disputed', 'cancelled')");
        AssertCheckConstraint(entity, "ck_settlement_request_lines_exact_amount_positive", "exact_amount > 0");
        AssertCheckConstraint(
            entity,
            "ck_settlement_request_lines_exact_amount_upper_bound",
            "exact_amount <= 999999999999999.9999");
        AssertCheckConstraint(
            entity,
            "ck_settlement_request_lines_currency_uppercase_iso",
            "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_settlement_request_lines_allocation_order_non_negative",
            "allocation_order >= 0");
        AssertCheckConstraint(
            entity,
            "ck_settlement_request_lines_source_candidate_key_not_blank",
            "source_candidate_key IS NULL OR length(btrim(source_candidate_key)) > 0");
    }

    [Fact]
    public void SettlementPaymentAllocationModelUsesClearedMoneyAndRestrictiveRelations()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<SettlementPaymentAllocation>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("settlement_payment_allocations", null);

        Assert.Equal("settlement_payment_allocations", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "SettlementPaymentId", "settlement_payment_id", isNullable: false);
        AssertColumn(entity, storeObject, "SettlementRequestLineId", "settlement_request_line_id", isNullable: false);
        AssertMoneyColumn(entity, storeObject, "ClearedAmount", "cleared_amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "AllocationOrder", "allocation_order", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);

        AssertIndex(entity, "ix_settlement_payment_allocations_settlement_payment_id", ["SettlementPaymentId"]);
        AssertIndex(entity, "ix_settlement_payment_allocations_request_line_id", ["SettlementRequestLineId"]);
        AssertIndex(
            entity,
            "ix_settlement_payment_allocations_payment_order",
            ["SettlementPaymentId", "AllocationOrder"]);

        AssertForeignKey(entity, typeof(SettlementPayment), ["SettlementPaymentId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(SettlementRequestLine), ["SettlementRequestLineId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_settlement_payment_allocations_cleared_amount_positive",
            "cleared_amount > 0");
        AssertCheckConstraint(
            entity,
            "ck_settlement_payment_allocations_cleared_amount_upper_bound",
            "cleared_amount <= 999999999999999.9999");
        AssertCheckConstraint(
            entity,
            "ck_settlement_payment_allocations_currency_uppercase_iso",
            "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_settlement_payment_allocations_allocation_order_non_negative",
            "allocation_order >= 0");
    }

    [Fact]
    public void SettlementResidualModelUsesResidualPolicyConstraintsAndRestrictiveRelations()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<SettlementResidual>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("settlement_residuals", null);

        Assert.Equal("settlement_residuals", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "SettlementPaymentId", "settlement_payment_id", isNullable: true);
        AssertColumn(entity, storeObject, "SettlementRequestId", "settlement_request_id", isNullable: true);
        AssertColumn(entity, storeObject, "DebtorUserProfileId", "debtor_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "CreditorUserProfileId", "creditor_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "Direction", "direction", isNullable: false, maxLength: 32);
        AssertMoneyColumn(entity, storeObject, "Amount", "amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "Policy", "policy", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "Reason", "reason", isNullable: true, maxLength: 1000);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ResolvedAtUtc", "resolved_at_utc", isNullable: true);

        AssertIndex(entity, "ix_settlement_residuals_settlement_payment_id", ["SettlementPaymentId"]);
        AssertIndex(entity, "ix_settlement_residuals_settlement_request_id", ["SettlementRequestId"]);
        AssertIndex(entity, "ix_settlement_residuals_debtor_user_profile_id", ["DebtorUserProfileId"]);
        AssertIndex(entity, "ix_settlement_residuals_creditor_user_profile_id", ["CreditorUserProfileId"]);
        AssertIndex(entity, "ix_settlement_residuals_status", ["Status"]);
        AssertIndex(
            entity,
            "ix_settlement_residuals_counterparty_currency_status",
            ["DebtorUserProfileId", "CreditorUserProfileId", "Currency", "Status"]);
        AssertIndex(entity, "ix_settlement_residuals_created_at_utc", ["CreatedAtUtc"]);
        AssertIndex(entity, "ix_settlement_residuals_resolved_at_utc", ["ResolvedAtUtc"]);

        AssertForeignKey(entity, typeof(SettlementPayment), ["SettlementPaymentId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(SettlementRequest), ["SettlementRequestId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["DebtorUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["CreditorUserProfileId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_settlement_residuals_direction", "direction IN ('underpayment', 'overpayment')");
        AssertCheckConstraint(
            entity,
            "ck_settlement_residuals_policy",
            "policy IN ('remaining_balance', 'carried_forward', 'waived', 'credit_forward', 'waived_by_payer', 'applied_to_other_line')");
        AssertCheckConstraint(
            entity,
            "ck_settlement_residuals_status",
            "status IN ('pending_receiver_confirmation', 'confirmed', 'carried_forward', 'waived', 'credited', 'disputed', 'cancelled')");
        AssertCheckConstraint(entity, "ck_settlement_residuals_amount_positive", "amount > 0");
        AssertCheckConstraint(entity, "ck_settlement_residuals_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_settlement_residuals_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_settlement_residuals_debtor_creditor_distinct",
            "debtor_user_profile_id <> creditor_user_profile_id");
        AssertCheckConstraint(
            entity,
            "ck_settlement_residuals_payment_or_request_present",
            "settlement_payment_id IS NOT NULL OR settlement_request_id IS NOT NULL");
        AssertCheckConstraint(
            entity,
            "ck_settlement_residuals_reason_not_blank",
            "reason IS NULL OR length(btrim(reason)) > 0");
    }

    [Fact]
    public void SettlementBasketResidualMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddSettlementBasketResidualSchemaFoundation", StringComparison.Ordinal));

        var migration = new AddSettlementBasketResidualSchemaFoundation();
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
        Assert.Equal(SettlementBasketResidualTables.Order(), createTables.Select(table => table.Name).Order());

        Assert.All(createIndexes, index => Assert.Contains(SettlementBasketResidualTables, table => table == index.Table));
        Assert.All(
            createTables.SelectMany(table => table.Columns).Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));
        Assert.All(
            createTables.SelectMany(table => table.ForeignKeys),
            foreignKey => Assert.Equal(ReferentialAction.Restrict, foreignKey.OnDelete));

        AssertMigrationTableShape(createTables);
        AssertMigrationIndexes(createIndexes);
    }

    [Fact]
    public void SettlementBasketResidualModelSnapshotIncludesNewSchemaOnlyFoundation()
    {
        var snapshot = File.ReadAllText(FindRepoFile(
            "services/api/src/Settleora.Api/Persistence/Migrations/SettleoraDbContextModelSnapshot.cs"));

        Assert.Contains("Settleora.Api.Domain.Settlements.SettlementRequestLine", snapshot);
        Assert.Contains("Settleora.Api.Domain.Settlements.SettlementPaymentAllocation", snapshot);
        Assert.Contains("Settleora.Api.Domain.Settlements.SettlementResidual", snapshot);
        Assert.Contains("settlement_request_lines", snapshot);
        Assert.Contains("settlement_payment_allocations", snapshot);
        Assert.Contains("settlement_residuals", snapshot);
        Assert.Contains("ck_settlement_residuals_payment_or_request_present", snapshot);
        Assert.Contains("ck_settlement_residuals_debtor_creditor_distinct", snapshot);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsDoNotExposeBasketOrResidualRuntimeSurfaces()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));

        foreach (var generatedOrContract in new[] { openApi, webClient, dartClient })
        {
            Assert.DoesNotContain("/api/v1/settlement-baskets", generatedOrContract, StringComparison.Ordinal);
            Assert.DoesNotContain("/api/v1/settlement-residuals", generatedOrContract, StringComparison.Ordinal);
            Assert.DoesNotContain("/api/v1/balances", generatedOrContract, StringComparison.Ordinal);
            Assert.DoesNotContain("settlementBasket", generatedOrContract, StringComparison.Ordinal);
            Assert.DoesNotContain("settlementResidual", generatedOrContract, StringComparison.Ordinal);
        }
    }

    private static void AssertMigrationTableShape(CreateTableOperation[] createTables)
    {
        var requestLines = Assert.Single(createTables, table => table.Name == "settlement_request_lines");
        Assert.Equal(["id"], requestLines.PrimaryKey!.Columns);
        Assert.Equal(
            [
                "id",
                "settlement_request_id",
                "source_expense_bill_id",
                "source_candidate_key",
                "exact_amount",
                "currency",
                "allocation_order",
                "status",
                "created_at_utc",
                "updated_at_utc"
            ],
            requestLines.Columns.Select(column => column.Name));
        AssertMigrationMoneyColumns(
            requestLines,
            amountColumnName: "exact_amount",
            currencyColumnName: "currency",
            positiveConstraintName: "ck_settlement_request_lines_exact_amount_positive",
            upperBoundConstraintName: "ck_settlement_request_lines_exact_amount_upper_bound",
            currencyConstraintName: "ck_settlement_request_lines_currency_uppercase_iso");
        AssertMigrationCheckConstraint(
            requestLines,
            "ck_settlement_request_lines_status",
            "status IN ('open', 'partially_cleared', 'cleared', 'waived', 'disputed', 'cancelled')");
        AssertMigrationCheckConstraint(
            requestLines,
            "ck_settlement_request_lines_allocation_order_non_negative",
            "allocation_order >= 0");
        AssertMigrationCheckConstraint(
            requestLines,
            "ck_settlement_request_lines_source_candidate_key_not_blank",
            "source_candidate_key IS NULL OR length(btrim(source_candidate_key)) > 0");
        AssertMigrationForeignKey(requestLines, "settlement_requests", ["settlement_request_id"]);
        AssertMigrationForeignKey(requestLines, "expense_bills", ["source_expense_bill_id"]);

        var allocations = Assert.Single(createTables, table => table.Name == "settlement_payment_allocations");
        Assert.Equal(["id"], allocations.PrimaryKey!.Columns);
        Assert.Equal(
            [
                "id",
                "settlement_payment_id",
                "settlement_request_line_id",
                "cleared_amount",
                "currency",
                "allocation_order",
                "created_at_utc"
            ],
            allocations.Columns.Select(column => column.Name));
        AssertMigrationMoneyColumns(
            allocations,
            amountColumnName: "cleared_amount",
            currencyColumnName: "currency",
            positiveConstraintName: "ck_settlement_payment_allocations_cleared_amount_positive",
            upperBoundConstraintName: "ck_settlement_payment_allocations_cleared_amount_upper_bound",
            currencyConstraintName: "ck_settlement_payment_allocations_currency_uppercase_iso");
        AssertMigrationCheckConstraint(
            allocations,
            "ck_settlement_payment_allocations_allocation_order_non_negative",
            "allocation_order >= 0");
        AssertMigrationForeignKey(allocations, "settlement_payments", ["settlement_payment_id"]);
        AssertMigrationForeignKey(allocations, "settlement_request_lines", ["settlement_request_line_id"]);

        var residuals = Assert.Single(createTables, table => table.Name == "settlement_residuals");
        Assert.Equal(["id"], residuals.PrimaryKey!.Columns);
        Assert.Equal(
            [
                "id",
                "settlement_payment_id",
                "settlement_request_id",
                "debtor_user_profile_id",
                "creditor_user_profile_id",
                "direction",
                "amount",
                "currency",
                "policy",
                "status",
                "reason",
                "created_at_utc",
                "resolved_at_utc"
            ],
            residuals.Columns.Select(column => column.Name));
        AssertMigrationMoneyColumns(
            residuals,
            amountColumnName: "amount",
            currencyColumnName: "currency",
            positiveConstraintName: "ck_settlement_residuals_amount_positive",
            upperBoundConstraintName: "ck_settlement_residuals_amount_upper_bound",
            currencyConstraintName: "ck_settlement_residuals_currency_uppercase_iso");
        AssertMigrationCheckConstraint(residuals, "ck_settlement_residuals_direction", "direction IN ('underpayment', 'overpayment')");
        AssertMigrationCheckConstraint(
            residuals,
            "ck_settlement_residuals_policy",
            "policy IN ('remaining_balance', 'carried_forward', 'waived', 'credit_forward', 'waived_by_payer', 'applied_to_other_line')");
        AssertMigrationCheckConstraint(
            residuals,
            "ck_settlement_residuals_status",
            "status IN ('pending_receiver_confirmation', 'confirmed', 'carried_forward', 'waived', 'credited', 'disputed', 'cancelled')");
        AssertMigrationCheckConstraint(
            residuals,
            "ck_settlement_residuals_debtor_creditor_distinct",
            "debtor_user_profile_id <> creditor_user_profile_id");
        AssertMigrationCheckConstraint(
            residuals,
            "ck_settlement_residuals_payment_or_request_present",
            "settlement_payment_id IS NOT NULL OR settlement_request_id IS NOT NULL");
        AssertMigrationCheckConstraint(
            residuals,
            "ck_settlement_residuals_reason_not_blank",
            "reason IS NULL OR length(btrim(reason)) > 0");
        AssertMigrationForeignKey(residuals, "settlement_payments", ["settlement_payment_id"]);
        AssertMigrationForeignKey(residuals, "settlement_requests", ["settlement_request_id"]);
        AssertMigrationForeignKey(residuals, "user_profiles", ["debtor_user_profile_id"]);
        AssertMigrationForeignKey(residuals, "user_profiles", ["creditor_user_profile_id"]);
    }

    private static void AssertMigrationIndexes(CreateIndexOperation[] createIndexes)
    {
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_request_lines_request_order",
            "settlement_request_lines",
            ["settlement_request_id", "allocation_order"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_request_lines_request_status",
            "settlement_request_lines",
            ["settlement_request_id", "status"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_payment_allocations_payment_order",
            "settlement_payment_allocations",
            ["settlement_payment_id", "allocation_order"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_residuals_counterparty_currency_status",
            "settlement_residuals",
            ["debtor_user_profile_id", "creditor_user_profile_id", "currency", "status"]);
        AssertMigrationIndex(createIndexes, "ix_settlement_residuals_status", "settlement_residuals", ["status"]);
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
            precision: SettlementConstraints.MoneyAmountPrecision,
            scale: SettlementConstraints.MoneyAmountScale);
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
        Assert.Equal(columnName, property!.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsNullable);
        Assert.Equal(maxLength, property.GetMaxLength());
        Assert.Equal(precision, property.GetPrecision());
        Assert.Equal(scale, property.GetScale());
    }

    private static void AssertMigrationMoneyColumns(
        CreateTableOperation table,
        string amountColumnName,
        string currencyColumnName,
        string positiveConstraintName,
        string upperBoundConstraintName,
        string currencyConstraintName)
    {
        var amountColumn = Assert.Single(table.Columns, column => column.Name == amountColumnName);
        Assert.Equal(typeof(decimal), amountColumn.ClrType);
        Assert.Equal("numeric(19,4)", amountColumn.ColumnType);
        Assert.False(amountColumn.IsNullable);
        Assert.Equal(SettlementConstraints.MoneyAmountPrecision, amountColumn.Precision);
        Assert.Equal(SettlementConstraints.MoneyAmountScale, amountColumn.Scale);

        var currencyColumn = Assert.Single(table.Columns, column => column.Name == currencyColumnName);
        Assert.Equal(typeof(string), currencyColumn.ClrType);
        Assert.Equal("character varying(3)", currencyColumn.ColumnType);
        Assert.False(currencyColumn.IsNullable);
        Assert.Equal(SettlementConstraints.CurrencyMaxLength, currencyColumn.MaxLength);

        AssertMigrationCheckConstraint(table, positiveConstraintName, $"{amountColumnName} > 0");
        AssertMigrationCheckConstraint(
            table,
            upperBoundConstraintName,
            $"{amountColumnName} <= {SettlementConstraints.MoneyAmountMaxValue:0.0000}");
        AssertMigrationCheckConstraint(table, currencyConstraintName, $"{currencyColumnName} ~ '^[A-Z]{{3}}$'");
    }

    private static void AssertMigrationCheckConstraint(
        CreateTableOperation table,
        string constraintName,
        string sql)
    {
        Assert.Contains(
            table.CheckConstraints,
            constraint => constraint.Name == constraintName && constraint.Sql == sql);
    }

    private static void AssertMigrationForeignKey(
        CreateTableOperation table,
        string principalTable,
        string[] columnNames)
    {
        Assert.Contains(
            table.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == principalTable
                && foreignKey.Columns.SequenceEqual(columnNames)
                && foreignKey.OnDelete == ReferentialAction.Restrict);
    }

    private static void AssertIndex(
        IEntityType entity,
        string indexName,
        string[] propertyNames)
    {
        var index = Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == indexName);

        Assert.Equal(propertyNames, index.Properties.Select(property => property.Name));
        Assert.False(index.IsUnique);
    }

    private static void AssertMigrationIndex(
        CreateIndexOperation[] indexes,
        string indexName,
        string tableName,
        string[] columnNames)
    {
        var index = Assert.Single(
            indexes,
            index => index.Name == indexName && index.Table == tableName);

        Assert.Equal(columnNames, index.Columns);
        Assert.False(index.IsUnique);
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

    private static string FindRepoFile(string relativePath)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, relativePath);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find {relativePath} from {AppContext.BaseDirectory}.");
    }
}
