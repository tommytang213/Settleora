using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class SettlementSchemaFoundationTests
{
    private static readonly string[] SettlementSchemaTables =
    [
        "settlement_requests",
        "settlement_payments",
        "settlement_proof_attachments"
    ];

    [Fact]
    public void SettlementConstantsRepresentApprovedFoundationValues()
    {
        Assert.Equal(19, SettlementConstraints.MoneyAmountPrecision);
        Assert.Equal(4, SettlementConstraints.MoneyAmountScale);
        Assert.Equal(3, SettlementConstraints.CurrencyMaxLength);
        Assert.Equal(32, SettlementConstraints.RequestStatusMaxLength);
        Assert.Equal(32, SettlementConstraints.PaymentStatusMaxLength);
        Assert.Equal(1000, SettlementConstraints.NoteMaxLength);
        Assert.Equal(999999999999999.9999m, SettlementConstraints.MoneyAmountMaxValue);

        Assert.True(SettlementRequestStatuses.IsSupported(SettlementRequestStatuses.Requested));
        Assert.True(SettlementRequestStatuses.IsSupported(SettlementRequestStatuses.PartiallyPaid));
        Assert.True(SettlementRequestStatuses.IsSupported(SettlementRequestStatuses.MarkedPaid));
        Assert.True(SettlementRequestStatuses.IsSupported(SettlementRequestStatuses.Confirmed));
        Assert.True(SettlementRequestStatuses.IsSupported(SettlementRequestStatuses.Disputed));
        Assert.True(SettlementRequestStatuses.IsSupported(SettlementRequestStatuses.Cancelled));
        Assert.False(SettlementRequestStatuses.IsSupported("paid"));
        Assert.False(SettlementRequestStatuses.IsSupported("negative_payment"));

        Assert.True(SettlementPaymentStatuses.IsSupported(SettlementPaymentStatuses.MarkedPaid));
        Assert.True(SettlementPaymentStatuses.IsSupported(SettlementPaymentStatuses.Confirmed));
        Assert.True(SettlementPaymentStatuses.IsSupported(SettlementPaymentStatuses.Disputed));
        Assert.True(SettlementPaymentStatuses.IsSupported(SettlementPaymentStatuses.Cancelled));
        Assert.False(SettlementPaymentStatuses.IsSupported("requested"));
        Assert.False(SettlementPaymentStatuses.IsSupported("refunded"));

        Assert.Equal("settlement_proof", FileObjectPurposes.SettlementProof);
    }

    [Fact]
    public void SettlementRequestModelUsesMoneyStatusCounterpartyAndRestrictiveRelations()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<SettlementRequest>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("settlement_requests", null);

        Assert.Equal("settlement_requests", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "GroupId", "group_id", isNullable: true);
        AssertColumn(entity, storeObject, "SourceExpenseBillId", "source_expense_bill_id", isNullable: true);
        AssertColumn(entity, storeObject, "DebtorUserProfileId", "debtor_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "CreditorUserProfileId", "creditor_user_profile_id", isNullable: false);
        AssertMoneyColumn(entity, storeObject, "Amount", "amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "RequestedByUserProfileId", "requested_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "RequestedAtUtc", "requested_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ConfirmedAtUtc", "confirmed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "DisputedAtUtc", "disputed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CancelledAtUtc", "cancelled_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ArchivedAtUtc", "archived_at_utc", isNullable: true);

        AssertIndex(entity, "ix_settlement_requests_debtor_user_profile_id", ["DebtorUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_creditor_user_profile_id", ["CreditorUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_group_id", ["GroupId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_source_expense_bill_id", ["SourceExpenseBillId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_status", ["Status"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_requested_at_utc", ["RequestedAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_requested_by_user_profile_id", ["RequestedByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_created_at_utc", ["CreatedAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_settlement_requests_archived_at_utc", ["ArchivedAtUtc"], isUnique: false);

        AssertForeignKey(entity, typeof(UserProfile), ["DebtorUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["CreditorUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["RequestedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserGroup), ["GroupId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ExpenseBill), ["SourceExpenseBillId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_settlement_requests_status",
            "status IN ('requested', 'partially_paid', 'marked_paid', 'confirmed', 'disputed', 'cancelled')");
        AssertCheckConstraint(entity, "ck_settlement_requests_amount_positive", "amount > 0");
        AssertCheckConstraint(entity, "ck_settlement_requests_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_settlement_requests_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_settlement_requests_debtor_creditor_distinct",
            "debtor_user_profile_id <> creditor_user_profile_id");
    }

    [Fact]
    public void SettlementPaymentModelUsesPositiveMoneyStatusAndCounterpartyConstraints()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<SettlementPayment>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("settlement_payments", null);

        Assert.Equal("settlement_payments", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "SettlementRequestId", "settlement_request_id", isNullable: false);
        AssertColumn(entity, storeObject, "PaidByUserProfileId", "paid_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "ReceivedByUserProfileId", "received_by_user_profile_id", isNullable: false);
        AssertMoneyColumn(entity, storeObject, "Amount", "amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "PaymentDate", "payment_date", isNullable: false, columnType: "date");
        AssertColumn(entity, storeObject, "Note", "note", isNullable: true, maxLength: 1000);
        AssertColumn(entity, storeObject, "CreatedByUserProfileId", "created_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "ClaimedAtUtc", "claimed_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ConfirmedAtUtc", "confirmed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "DisputedAtUtc", "disputed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CancelledAtUtc", "cancelled_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(entity, "ix_settlement_payments_settlement_request_id", ["SettlementRequestId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_payments_paid_by_user_profile_id", ["PaidByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_payments_received_by_user_profile_id", ["ReceivedByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_payments_created_by_user_profile_id", ["CreatedByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_settlement_payments_status", ["Status"], isUnique: false);
        AssertIndex(entity, "ix_settlement_payments_payment_date", ["PaymentDate"], isUnique: false);

        AssertForeignKey(entity, typeof(SettlementRequest), ["SettlementRequestId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["PaidByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["ReceivedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["CreatedByUserProfileId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_settlement_payments_status",
            "status IN ('marked_paid', 'confirmed', 'disputed', 'cancelled')");
        AssertCheckConstraint(entity, "ck_settlement_payments_amount_positive", "amount > 0");
        AssertCheckConstraint(entity, "ck_settlement_payments_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_settlement_payments_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_settlement_payments_payer_receiver_distinct",
            "paid_by_user_profile_id <> received_by_user_profile_id");
        AssertCheckConstraint(
            entity,
            "ck_settlement_payments_note_not_blank",
            "note IS NULL OR length(btrim(note)) > 0");
    }

    [Fact]
    public void SettlementProofAttachmentModelUsesStableFileObjectReferencesOnly()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<SettlementProofAttachment>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("settlement_proof_attachments", null);

        Assert.Equal("settlement_proof_attachments", entity.GetTableName());
        Assert.Equal(["SettlementPaymentId", "FileObjectId"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "SettlementPaymentId", "settlement_payment_id", isNullable: false);
        AssertColumn(entity, storeObject, "FileObjectId", "file_object_id", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedByUserProfileId", "created_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "RemovedAtUtc", "removed_at_utc", isNullable: true);

        AssertIndex(entity, "ix_settlement_proof_attachments_file_object_id", ["FileObjectId"], isUnique: false);
        AssertIndex(
            entity,
            "ix_settlement_proof_attachments_created_by_profile_id",
            ["CreatedByUserProfileId"],
            isUnique: false);

        AssertForeignKey(entity, typeof(SettlementPayment), ["SettlementPaymentId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(FileObject), ["FileObjectId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["CreatedByUserProfileId"], DeleteBehavior.Restrict);

        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
        Assert.Contains("file_object_id", columnNames);
        Assert.DoesNotContain(columnNames, ContainsForbiddenStorageColumnName);
    }

    [Fact]
    public void SettlementSchemaFoundationMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddSettlementSchemaFoundation", StringComparison.Ordinal));

        var migration = new AddSettlementSchemaFoundation();
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
        Assert.Equal(SettlementSchemaTables.Order(), createTables.Select(table => table.Name).Order());

        Assert.All(createIndexes, index => Assert.Contains(SettlementSchemaTables, table => table == index.Table));
        Assert.All(
            createTables.SelectMany(table => table.Columns).Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));
        Assert.All(
            createTables.SelectMany(table => table.ForeignKeys),
            foreignKey => Assert.Equal(ReferentialAction.Restrict, foreignKey.OnDelete));
        Assert.All(
            createTables.SelectMany(table => table.ForeignKeys),
            foreignKey => Assert.Contains(
                ["settlement_requests", "settlement_payments", "expense_bills", "user_profiles", "user_groups", "file_objects"],
                table => table == foreignKey.PrincipalTable));

        var requests = Assert.Single(createTables, table => table.Name == "settlement_requests");
        Assert.Equal(["id"], requests.PrimaryKey!.Columns);
        Assert.Equal(
            [
                "id",
                "group_id",
                "source_expense_bill_id",
                "debtor_user_profile_id",
                "creditor_user_profile_id",
                "amount",
                "currency",
                "status",
                "requested_by_user_profile_id",
                "requested_at_utc",
                "confirmed_at_utc",
                "disputed_at_utc",
                "cancelled_at_utc",
                "created_at_utc",
                "updated_at_utc",
                "archived_at_utc"
            ],
            requests.Columns.Select(column => column.Name));
        AssertMigrationMoneyColumns(
            requests,
            amountColumnName: "amount",
            currencyColumnName: "currency",
            positiveConstraintName: "ck_settlement_requests_amount_positive",
            upperBoundConstraintName: "ck_settlement_requests_amount_upper_bound",
            currencyConstraintName: "ck_settlement_requests_currency_uppercase_iso");
        AssertMigrationCheckConstraint(
            requests,
            "ck_settlement_requests_status",
            "status IN ('requested', 'partially_paid', 'marked_paid', 'confirmed', 'disputed', 'cancelled')");
        AssertMigrationCheckConstraint(
            requests,
            "ck_settlement_requests_debtor_creditor_distinct",
            "debtor_user_profile_id <> creditor_user_profile_id");
        AssertMigrationForeignKey(requests, "user_profiles", ["debtor_user_profile_id"]);
        AssertMigrationForeignKey(requests, "user_profiles", ["creditor_user_profile_id"]);
        AssertMigrationForeignKey(requests, "user_profiles", ["requested_by_user_profile_id"]);
        AssertMigrationForeignKey(requests, "user_groups", ["group_id"]);
        AssertMigrationForeignKey(requests, "expense_bills", ["source_expense_bill_id"]);

        var payments = Assert.Single(createTables, table => table.Name == "settlement_payments");
        Assert.Equal(["id"], payments.PrimaryKey!.Columns);
        Assert.Equal(
            [
                "id",
                "settlement_request_id",
                "paid_by_user_profile_id",
                "received_by_user_profile_id",
                "amount",
                "currency",
                "status",
                "payment_date",
                "note",
                "created_by_user_profile_id",
                "claimed_at_utc",
                "confirmed_at_utc",
                "disputed_at_utc",
                "cancelled_at_utc",
                "created_at_utc",
                "updated_at_utc"
            ],
            payments.Columns.Select(column => column.Name));
        AssertMigrationMoneyColumns(
            payments,
            amountColumnName: "amount",
            currencyColumnName: "currency",
            positiveConstraintName: "ck_settlement_payments_amount_positive",
            upperBoundConstraintName: "ck_settlement_payments_amount_upper_bound",
            currencyConstraintName: "ck_settlement_payments_currency_uppercase_iso");
        AssertMigrationCheckConstraint(
            payments,
            "ck_settlement_payments_status",
            "status IN ('marked_paid', 'confirmed', 'disputed', 'cancelled')");
        AssertMigrationCheckConstraint(
            payments,
            "ck_settlement_payments_payer_receiver_distinct",
            "paid_by_user_profile_id <> received_by_user_profile_id");
        AssertMigrationCheckConstraint(
            payments,
            "ck_settlement_payments_note_not_blank",
            "note IS NULL OR length(btrim(note)) > 0");
        AssertMigrationForeignKey(payments, "settlement_requests", ["settlement_request_id"]);
        AssertMigrationForeignKey(payments, "user_profiles", ["paid_by_user_profile_id"]);
        AssertMigrationForeignKey(payments, "user_profiles", ["received_by_user_profile_id"]);
        AssertMigrationForeignKey(payments, "user_profiles", ["created_by_user_profile_id"]);

        var attachments = Assert.Single(createTables, table => table.Name == "settlement_proof_attachments");
        Assert.Equal(["settlement_payment_id", "file_object_id"], attachments.PrimaryKey!.Columns);
        Assert.Equal(
            [
                "settlement_payment_id",
                "file_object_id",
                "created_by_user_profile_id",
                "created_at_utc",
                "removed_at_utc"
            ],
            attachments.Columns.Select(column => column.Name));
        Assert.DoesNotContain(attachments.Columns, column => ContainsForbiddenStorageColumnName(column.Name));
        AssertMigrationForeignKey(attachments, "settlement_payments", ["settlement_payment_id"]);
        AssertMigrationForeignKey(attachments, "file_objects", ["file_object_id"]);
        AssertMigrationForeignKey(attachments, "user_profiles", ["created_by_user_profile_id"]);

        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_requests_debtor_user_profile_id",
            "settlement_requests",
            ["debtor_user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_requests_creditor_user_profile_id",
            "settlement_requests",
            ["creditor_user_profile_id"]);
        AssertMigrationIndex(createIndexes, "ix_settlement_requests_group_id", "settlement_requests", ["group_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_requests_source_expense_bill_id",
            "settlement_requests",
            ["source_expense_bill_id"]);
        AssertMigrationIndex(createIndexes, "ix_settlement_requests_status", "settlement_requests", ["status"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_requests_requested_at_utc",
            "settlement_requests",
            ["requested_at_utc"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_requests_requested_by_user_profile_id",
            "settlement_requests",
            ["requested_by_user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_requests_created_at_utc",
            "settlement_requests",
            ["created_at_utc"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_payments_settlement_request_id",
            "settlement_payments",
            ["settlement_request_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_payments_paid_by_user_profile_id",
            "settlement_payments",
            ["paid_by_user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_payments_received_by_user_profile_id",
            "settlement_payments",
            ["received_by_user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_proof_attachments_file_object_id",
            "settlement_proof_attachments",
            ["file_object_id"]);
    }

    [Fact]
    public void SettlementModelSnapshotIncludesNewSettlementSchema()
    {
        var snapshot = File.ReadAllText(FindRepoFile(
            "services/api/src/Settleora.Api/Persistence/Migrations/SettleoraDbContextModelSnapshot.cs"));

        Assert.Contains("Settleora.Api.Domain.Settlements.SettlementRequest", snapshot);
        Assert.Contains("Settleora.Api.Domain.Settlements.SettlementPayment", snapshot);
        Assert.Contains("Settleora.Api.Domain.Settlements.SettlementProofAttachment", snapshot);
        Assert.Contains("settlement_requests", snapshot);
        Assert.Contains("settlement_payments", snapshot);
        Assert.Contains("settlement_proof_attachments", snapshot);
        Assert.Contains("ck_settlement_requests_amount_positive", snapshot);
        Assert.Contains("ck_settlement_payments_payer_receiver_distinct", snapshot);
    }

    [Fact]
    public void OpenApiContractExposesOnlyApprovedSettlementRuntimePaymentSurfaces()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));

        Assert.Contains("/api/v1/settlements", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/settlements/{settlementId}", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/settlements/{settlementId}/payments", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/settlement-payments/{paymentId}/confirm", openApi, StringComparison.Ordinal);
        Assert.Contains("listSettlementRequests", openApi, StringComparison.Ordinal);
        Assert.Contains("getSettlementRequest", openApi, StringComparison.Ordinal);
        Assert.Contains("createSettlementPaymentClaim", openApi, StringComparison.Ordinal);
        Assert.Contains("confirmSettlementPayment", openApi, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementRequest", openApi, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementPayment", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("markSettlementPaid", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("cancelSettlement", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("settlementProof", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("settlementBalance", openApi, StringComparison.Ordinal);
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

    private static void AssertMigrationIndex(
        CreateIndexOperation[] indexes,
        string indexName,
        string tableName,
        string[] columnNames,
        bool isUnique = false)
    {
        var index = Assert.Single(
            indexes,
            index => index.Name == indexName && index.Table == tableName);

        Assert.Equal(columnNames, index.Columns);
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

    private static bool ContainsForbiddenStorageColumnName(string columnName)
    {
        return columnName.Contains("storage", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("object_key", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("provider", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("path", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("filename", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("original", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("vault", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("url", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("root", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("bytes", StringComparison.OrdinalIgnoreCase);
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
