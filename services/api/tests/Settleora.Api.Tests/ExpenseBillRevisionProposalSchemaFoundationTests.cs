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

public sealed class ExpenseBillRevisionProposalSchemaFoundationTests
{
    [Fact]
    public void BillRevisionProposalModelsUseRevisionApprovalAndPayerConfirmationShape()
    {
        using var dbContext = CreateDbContext();

        var revision = FindEntityType<ExpenseBillRevision>(dbContext);
        var revisionStore = StoreObjectIdentifier.Table("expense_bill_revisions", null);
        Assert.Equal("expense_bill_revisions", revision.GetTableName());
        Assert.Equal(["Id"], revision.FindPrimaryKey()!.Properties.Select(property => property.Name));
        AssertColumn(revision, revisionStore, "Id", "id", isNullable: false);
        AssertColumn(revision, revisionStore, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(
            revision,
            revisionStore,
            "ProposalCreatorUserProfileId",
            "proposal_creator_user_profile_id",
            isNullable: false);
        AssertColumn(
            revision,
            revisionStore,
            "SupersedesExpenseBillRevisionId",
            "supersedes_expense_bill_revision_id",
            isNullable: true);
        AssertColumn(
            revision,
            revisionStore,
            "SupersededByExpenseBillRevisionId",
            "superseded_by_expense_bill_revision_id",
            isNullable: true);
        AssertColumn(revision, revisionStore, "RevisionSequence", "revision_sequence", isNullable: false);
        AssertColumn(revision, revisionStore, "Status", "status", isNullable: false, maxLength: 40);
        AssertMoneyColumn(revision, revisionStore, "TotalAmount", "total_amount");
        AssertColumn(revision, revisionStore, "TotalCurrency", "total_currency", isNullable: false, maxLength: 3);
        AssertColumn(revision, revisionStore, "CalculationHash", "calculation_hash", isNullable: false, maxLength: 128);
        AssertColumn(revision, revisionStore, "SnapshotSchemaVersion", "snapshot_schema_version", isNullable: false, maxLength: 64);
        AssertColumn(revision, revisionStore, "MoneyPolicyVersion", "money_policy_version", isNullable: false, maxLength: 64);
        AssertColumn(revision, revisionStore, "RoundingPolicyVersion", "rounding_policy_version", isNullable: false, maxLength: 64);
        AssertColumn(revision, revisionStore, "BaselineSnapshotJson", "baseline_snapshot_json", isNullable: false, columnType: "jsonb");
        AssertColumn(revision, revisionStore, "ProposedSnapshotJson", "proposed_snapshot_json", isNullable: false, columnType: "jsonb");
        AssertColumn(revision, revisionStore, "AffectedUserSetHash", "affected_user_set_hash", isNullable: false, maxLength: 128);
        AssertColumn(revision, revisionStore, "AffectedUserIdsJson", "affected_user_ids_json", isNullable: false, columnType: "jsonb");
        AssertColumn(
            revision,
            revisionStore,
            "PayerConfirmationBasisHash",
            "payer_confirmation_basis_hash",
            isNullable: false,
            maxLength: 128);
        AssertColumn(
            revision,
            revisionStore,
            "PayerConfirmationUserIdsJson",
            "payer_confirmation_user_ids_json",
            isNullable: false,
            columnType: "jsonb");
        AssertColumn(
            revision,
            revisionStore,
            "UnsupportedDetailReason",
            "unsupported_detail_reason",
            isNullable: true,
            maxLength: 120);
        AssertColumn(revision, revisionStore, "RequestId", "request_id", isNullable: true, maxLength: 120);
        AssertColumn(revision, revisionStore, "CorrelationId", "correlation_id", isNullable: true, maxLength: 120);
        AssertColumn(revision, revisionStore, "SubmittedAtUtc", "submitted_at_utc", isNullable: true);
        AssertColumn(revision, revisionStore, "WithdrawnAtUtc", "withdrawn_at_utc", isNullable: true);
        AssertColumn(revision, revisionStore, "SupersededAtUtc", "superseded_at_utc", isNullable: true);
        AssertColumn(revision, revisionStore, "RejectedAtUtc", "rejected_at_utc", isNullable: true);
        AssertColumn(revision, revisionStore, "AppliedAtUtc", "applied_at_utc", isNullable: true);
        AssertColumn(revision, revisionStore, "CancelledAtUtc", "cancelled_at_utc", isNullable: true);

        AssertIndex(revision, "ix_expense_bill_revisions_creator_user_profile_id", ["ProposalCreatorUserProfileId"], isUnique: false);
        AssertIndex(revision, "ix_expense_bill_revisions_status", ["Status"], isUnique: false);
        AssertIndex(revision, "ix_expense_bill_revisions_calculation_hash", ["CalculationHash"], isUnique: false);
        AssertIndex(
            revision,
            "ux_expense_bill_revisions_bill_sequence",
            ["ExpenseBillId", "RevisionSequence"],
            isUnique: true);
        var activePendingIndex = AssertIndex(
            revision,
            "ux_expense_bill_revisions_one_active_pending_per_bill",
            ["ExpenseBillId"],
            isUnique: true);
        Assert.Equal("status IN ('draft_revision', 'submitted_for_review')", activePendingIndex.GetFilter());
        AssertForeignKey(revision, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(revision, typeof(UserProfile), ["ProposalCreatorUserProfileId"], DeleteBehavior.Restrict);
        AssertCheckConstraint(
            revision,
            "ck_expense_bill_revisions_status",
            "status IN ('draft_revision', 'submitted_for_review', 'withdrawn_by_proposer', 'superseded_by_resubmission', 'rejected', 'accepted_applied', 'cancelled_by_authorized_editor')");
        AssertCheckConstraint(
            revision,
            "ck_expense_bill_revisions_calculation_hash_not_blank",
            "length(btrim(calculation_hash)) > 0");
        AssertCheckConstraint(
            revision,
            "ck_expense_bill_revisions_revision_sequence_positive",
            "revision_sequence > 0");
        AssertCheckConstraint(
            revision,
            "ck_expense_bill_revisions_baseline_snapshot_json_object",
            "jsonb_typeof(baseline_snapshot_json) = 'object'");
        AssertCheckConstraint(
            revision,
            "ck_expense_bill_revisions_proposed_snapshot_json_object",
            "jsonb_typeof(proposed_snapshot_json) = 'object'");
        AssertCheckConstraint(
            revision,
            "ck_expense_bill_revisions_affected_user_ids_json_array",
            "jsonb_typeof(affected_user_ids_json) = 'array'");
        AssertCheckConstraint(
            revision,
            "ck_expense_bill_revisions_payer_ids_json_array",
            "jsonb_typeof(payer_confirmation_user_ids_json) = 'array'");

        var participant = FindEntityType<ExpenseBillRevisionParticipant>(dbContext);
        var participantStore = StoreObjectIdentifier.Table("expense_bill_revision_participants", null);
        Assert.Equal(["ExpenseBillRevisionId", "UserProfileId"], participant.FindPrimaryKey()!.Properties.Select(property => property.Name));
        AssertColumn(participant, participantStore, "ExpenseBillRevisionId", "expense_bill_revision_id", isNullable: false);
        AssertColumn(participant, participantStore, "UserProfileId", "user_profile_id", isNullable: false);
        AssertMoneyColumn(participant, participantStore, "ResolvedShareAmount", "resolved_share_amount");
        AssertColumn(participant, participantStore, "ResolvedShareCurrency", "resolved_share_currency", isNullable: false, maxLength: 3);
        AssertColumn(participant, participantStore, "AffectedByRevision", "affected_by_revision", isNullable: false);
        AssertIndex(participant, "ix_expense_bill_revision_participants_affected", ["AffectedByRevision"], isUnique: false);
        AssertForeignKey(participant, typeof(ExpenseBillRevision), ["ExpenseBillRevisionId"], DeleteBehavior.Restrict);
        AssertForeignKey(participant, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);

        var payer = FindEntityType<ExpenseBillRevisionPayer>(dbContext);
        var payerStore = StoreObjectIdentifier.Table("expense_bill_revision_payers", null);
        Assert.Equal(["ExpenseBillRevisionId", "UserProfileId"], payer.FindPrimaryKey()!.Properties.Select(property => property.Name));
        AssertColumn(payer, payerStore, "ExpenseBillRevisionId", "expense_bill_revision_id", isNullable: false);
        AssertColumn(payer, payerStore, "UserProfileId", "user_profile_id", isNullable: false);
        AssertMoneyColumn(payer, payerStore, "Amount", "amount");
        AssertColumn(payer, payerStore, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(payer, payerStore, "RequiresPayerConfirmation", "requires_payer_confirmation", isNullable: false);
        AssertColumn(payer, payerStore, "PayerConfirmationStatus", "payer_confirmation_status", isNullable: false, maxLength: 32);
        AssertIndex(payer, "ix_expense_bill_revision_payers_requires_confirmation", ["RequiresPayerConfirmation"], isUnique: false);
        AssertForeignKey(payer, typeof(ExpenseBillRevision), ["ExpenseBillRevisionId"], DeleteBehavior.Restrict);
        AssertForeignKey(payer, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);
        AssertCheckConstraint(
            payer,
            "ck_expense_bill_revision_payers_confirmation_status",
            "payer_confirmation_status IN ('pending_confirmation', 'confirmed', 'rejected')");

        var approval = FindEntityType<ExpenseBillRevisionApproval>(dbContext);
        var approvalStore = StoreObjectIdentifier.Table("expense_bill_revision_approvals", null);
        Assert.Equal(["Id"], approval.FindPrimaryKey()!.Properties.Select(property => property.Name));
        AssertColumn(approval, approvalStore, "Id", "id", isNullable: false);
        AssertColumn(approval, approvalStore, "ExpenseBillRevisionId", "expense_bill_revision_id", isNullable: false);
        AssertColumn(approval, approvalStore, "ParticipantUserProfileId", "participant_user_profile_id", isNullable: false);
        AssertMoneyColumn(approval, approvalStore, "AcceptedAmount", "accepted_amount");
        AssertColumn(approval, approvalStore, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(approval, approvalStore, "CalculationHash", "calculation_hash", isNullable: false, maxLength: 128);
        AssertColumn(approval, approvalStore, "Status", "status", isNullable: false, maxLength: 40);
        AssertIndex(
            approval,
            "ux_expense_bill_revision_approvals_revision_participant",
            ["ExpenseBillRevisionId", "ParticipantUserProfileId"],
            isUnique: true);
        AssertForeignKey(approval, typeof(ExpenseBillRevision), ["ExpenseBillRevisionId"], DeleteBehavior.Restrict);
        AssertForeignKey(approval, typeof(UserProfile), ["ParticipantUserProfileId"], DeleteBehavior.Restrict);
        AssertCheckConstraint(
            approval,
            "ck_expense_bill_revision_approvals_status",
            "status IN ('pending_review', 'approved', 'rejected', 'invalidated_by_supersession')");
    }

    [Fact]
    public void BillRevisionProposalMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddBillRevisionProposalFoundation", StringComparison.Ordinal));

        var migration = new AddBillRevisionProposalFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation);

        Assert.Contains(
            migration.UpOperations.OfType<SqlOperation>(),
            operation => operation.Sql.Contains("UPDATE expense_bills", StringComparison.Ordinal)
                && operation.Sql.Contains("bill_owner_user_profile_id = created_by_user_profile_id", StringComparison.Ordinal));
        Assert.Contains(
            migration.UpOperations.OfType<SqlOperation>(),
            operation => operation.Sql.Contains("UPDATE expense_bill_payers", StringComparison.Ordinal)
                && operation.Sql.Contains("pending_confirmation", StringComparison.Ordinal));

        AssertAddColumn(migration, "expense_bills", "bill_owner_user_profile_id", isNullable: true);
        AssertAddColumn(migration, "expense_bills", "active_accepted_bill_revision_id", isNullable: true);
        AssertAddColumn(migration, "expense_bill_payers", "payer_facts_created_by_user_profile_id", isNullable: true);
        AssertAddColumn(migration, "expense_bill_payers", "payer_confirmation_status", isNullable: true);
        AssertAddColumn(migration, "settlement_request_lines", "source_bill_revision_id", isNullable: true);

        Assert.Contains(
            migration.UpOperations.OfType<AlterColumnOperation>(),
            operation => operation.Table == "expense_bills"
                && operation.Name == "bill_owner_user_profile_id"
                && !operation.IsNullable);
        Assert.Contains(
            migration.UpOperations.OfType<AlterColumnOperation>(),
            operation => operation.Table == "expense_bill_payers"
                && operation.Name == "payer_facts_created_by_user_profile_id"
                && !operation.IsNullable);
        Assert.Contains(
            migration.UpOperations.OfType<AlterColumnOperation>(),
            operation => operation.Table == "expense_bill_payers"
                && operation.Name == "payer_confirmation_status"
                && !operation.IsNullable);

        var createTables = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        Assert.Equal(
            [
                "expense_bill_revision_approvals",
                "expense_bill_revision_participants",
                "expense_bill_revision_payers",
                "expense_bill_revisions"
            ],
            createTables.Select(table => table.Name).Order());

        var revisions = Assert.Single(createTables, table => table.Name == "expense_bill_revisions");
        AssertMigrationForeignKey(revisions, "expense_bills", ["expense_bill_id"]);
        AssertMigrationForeignKey(revisions, "user_profiles", ["proposal_creator_user_profile_id"]);
        AssertMigrationCheckConstraint(
            revisions,
            "ck_expense_bill_revisions_status",
            "status IN ('draft_revision', 'submitted_for_review', 'withdrawn_by_proposer', 'superseded_by_resubmission', 'rejected', 'accepted_applied', 'cancelled_by_authorized_editor')");

        var approvals = Assert.Single(createTables, table => table.Name == "expense_bill_revision_approvals");
        AssertMigrationForeignKey(approvals, "expense_bill_revisions", ["expense_bill_revision_id"]);
        AssertMigrationCheckConstraint(
            approvals,
            "ck_expense_bill_revision_approvals_status",
            "status IN ('pending_review', 'approved', 'rejected', 'invalidated_by_supersession')");

        var createIndexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        var activePendingIndex = AssertMigrationIndex(
            createIndexes,
            "ux_expense_bill_revisions_one_active_pending_per_bill",
            "expense_bill_revisions",
            ["expense_bill_id"],
            isUnique: true);
        Assert.Equal("status IN ('draft_revision', 'submitted_for_review')", activePendingIndex.Filter);
        AssertMigrationIndex(
            createIndexes,
            "ux_expense_bill_revision_approvals_revision_participant",
            "expense_bill_revision_approvals",
            ["expense_bill_revision_id", "participant_user_profile_id"],
            isUnique: true);
        AssertMigrationIndex(
            createIndexes,
            "ix_settlement_request_lines_source_bill_revision_id",
            "settlement_request_lines",
            ["source_bill_revision_id"]);

        Assert.Contains(
            migration.UpOperations.OfType<AddForeignKeyOperation>(),
            operation => operation.Table == "settlement_request_lines"
                && operation.PrincipalTable == "expense_bill_revisions"
                && operation.Columns.SequenceEqual(["source_bill_revision_id"])
                && operation.OnDelete == ReferentialAction.Restrict);
    }

    [Fact]
    public void BillRevisionSnapshotMigrationIsAdditiveAndBackfillsReviewableBasis()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddBillRevisionSnapshotRuntimeFoundation", StringComparison.Ordinal));

        var migration = new AddBillRevisionSnapshotRuntimeFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation);

        AssertAddColumn(migration, "expense_bill_revisions", "revision_sequence", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "snapshot_schema_version", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "money_policy_version", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "rounding_policy_version", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "baseline_snapshot_json", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "proposed_snapshot_json", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "affected_user_ids_json", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "payer_confirmation_user_ids_json", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "request_id", isNullable: true);
        AssertAddColumn(migration, "expense_bill_revisions", "correlation_id", isNullable: true);

        Assert.Contains(
            migration.UpOperations.OfType<SqlOperation>(),
            operation => operation.Sql.Contains("ROW_NUMBER()", StringComparison.Ordinal)
                && operation.Sql.Contains("jsonb_build_object", StringComparison.Ordinal)
                && operation.Sql.Contains("legacy_snapshot_detail_unavailable", StringComparison.Ordinal)
                && !operation.Sql.Contains("raw_ocr", StringComparison.OrdinalIgnoreCase)
                && !operation.Sql.Contains("object_key", StringComparison.OrdinalIgnoreCase)
                && !operation.Sql.Contains("signed_url", StringComparison.OrdinalIgnoreCase));

        Assert.Contains(
            migration.UpOperations.OfType<AlterColumnOperation>(),
            operation => operation.Table == "expense_bill_revisions"
                && operation.Name == "revision_sequence"
                && !operation.IsNullable);

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        AssertMigrationIndex(
            indexes,
            "ux_expense_bill_revisions_bill_sequence",
            "expense_bill_revisions",
            ["expense_bill_id", "revision_sequence"],
            isUnique: true);
        AssertMigrationIndex(
            indexes,
            "ix_expense_bill_revisions_calculation_hash",
            "expense_bill_revisions",
            ["calculation_hash"]);
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

    private static void AssertAddColumn(
        Migration migration,
        string tableName,
        string columnName,
        bool isNullable)
    {
        Assert.Contains(
            migration.UpOperations.OfType<AddColumnOperation>(),
            operation => operation.Table == tableName
                && operation.Name == columnName
                && operation.IsNullable == isNullable);
    }

    private static CreateIndexOperation AssertMigrationIndex(
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
        return index;
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

    private static void AssertMigrationCheckConstraint(
        CreateTableOperation table,
        string constraintName,
        string sql)
    {
        Assert.Contains(
            table.CheckConstraints,
            constraint => constraint.Name == constraintName && constraint.Sql == sql);
    }
}
