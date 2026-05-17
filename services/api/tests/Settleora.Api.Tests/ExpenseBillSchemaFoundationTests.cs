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
        Assert.Equal(32, ExpenseBillConstraints.ItemSplitMethodMaxLength);
        Assert.Equal(32, ExpenseBillConstraints.ParticipantRejectionReasonCodeMaxLength);
        Assert.Equal(40, ExpenseBillConstraints.BillRevisionStatusMaxLength);
        Assert.Equal(40, ExpenseBillConstraints.BillRevisionApprovalStatusMaxLength);
        Assert.Equal(128, ExpenseBillConstraints.BillRevisionCalculationHashMaxLength);
        Assert.Equal(32, ExpenseBillConstraints.PayerConfirmationStatusMaxLength);
        Assert.Equal(32, ExpenseBillConstraints.BillReconciliationStatusMaxLength);
        Assert.Equal(120, ExpenseBillConstraints.BillReconciliationNoteMaxLength);

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

        Assert.True(ExpenseBillReconciliationStatuses.IsSupported(ExpenseBillReconciliationStatuses.Unreconciled));
        Assert.True(ExpenseBillReconciliationStatuses.IsSupported(ExpenseBillReconciliationStatuses.Reconciled));
        Assert.True(ExpenseBillReconciliationStatuses.IsSupported(ExpenseBillReconciliationStatuses.Ignored));
        Assert.False(ExpenseBillReconciliationStatuses.IsSupported("matched"));

        Assert.True(ExpenseBillRevisionStatuses.IsActivePending(ExpenseBillRevisionStatuses.DraftRevision));
        Assert.True(ExpenseBillRevisionStatuses.IsActivePending(ExpenseBillRevisionStatuses.SubmittedForReview));
        Assert.False(ExpenseBillRevisionStatuses.IsActivePending(ExpenseBillRevisionStatuses.AcceptedApplied));
        Assert.False(ExpenseBillRevisionStatuses.IsActivePending("accepted"));

        Assert.Equal("pending_review", ExpenseBillRevisionApprovalStatuses.PendingReview);
        Assert.Equal("invalidated_by_supersession", ExpenseBillRevisionApprovalStatuses.InvalidatedBySupersession);
        Assert.Equal("pending_confirmation", ExpenseBillPayerConfirmationStatuses.PendingConfirmation);
        Assert.Equal("confirmed", ExpenseBillPayerConfirmationStatuses.Confirmed);

        Assert.True(ExpenseBillParticipantRejectionReasonCodes.IsSupported(
            ExpenseBillParticipantRejectionReasonCodes.WrongAmount));
        Assert.True(ExpenseBillParticipantRejectionReasonCodes.IsSupported(
            ExpenseBillParticipantRejectionReasonCodes.Other));
        Assert.False(ExpenseBillParticipantRejectionReasonCodes.IsSupported("raw_note"));

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

        Assert.True(ExpenseBillItemSplitMethods.IsSupported(ExpenseBillItemSplitMethods.Equal));
        Assert.True(ExpenseBillItemSplitMethods.IsSupported(ExpenseBillItemSplitMethods.ExactAmount));
        Assert.True(ExpenseBillItemSplitMethods.IsSupported(ExpenseBillItemSplitMethods.Percentage));
        Assert.True(ExpenseBillItemSplitMethods.IsSupported(ExpenseBillItemSplitMethods.Ratio));
        Assert.True(ExpenseBillItemSplitMethods.IsSupported(ExpenseBillItemSplitMethods.ShareWeight));
        Assert.False(ExpenseBillItemSplitMethods.IsSupported("client_calculated"));
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
        AssertColumn(entity, storeObject, "BillOwnerUserProfileId", "bill_owner_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "ActiveAcceptedBillRevisionId", "active_accepted_bill_revision_id", isNullable: true);
        AssertColumn(entity, storeObject, "GroupId", "group_id", isNullable: true);
        AssertColumn(entity, storeObject, "MerchantName", "merchant_name", isNullable: true, maxLength: 200);
        AssertColumn(entity, storeObject, "BillDate", "bill_date", isNullable: false, columnType: "date");
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "ReconciliationStatus", "reconciliation_status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "ReconciliationUpdatedAtUtc", "reconciliation_updated_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ReconciliationUpdatedByUserProfileId", "reconciliation_updated_by_user_profile_id", isNullable: true);
        AssertColumn(entity, storeObject, "ReconciledAtUtc", "reconciled_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "ReconciliationNote", "reconciliation_note", isNullable: true, maxLength: 120);
        AssertMoneyColumn(entity, storeObject, "TotalAmount", "total_amount");
        AssertColumn(entity, storeObject, "TotalCurrency", "total_currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ArchivedAtUtc", "archived_at_utc", isNullable: true);

        AssertIndex(entity, "ix_expense_bills_created_by_user_profile_id", ["CreatedByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_bill_owner_user_profile_id", ["BillOwnerUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_active_accepted_revision_id", ["ActiveAcceptedBillRevisionId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_group_id", ["GroupId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_status", ["Status"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_reconciliation_status", ["ReconciliationStatus"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_reconciliation_updated_by_user_profile_id", ["ReconciliationUpdatedByUserProfileId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_bill_date", ["BillDate"], isUnique: false);
        AssertIndex(entity, "ix_expense_bills_archived_at_utc", ["ArchivedAtUtc"], isUnique: false);

        AssertForeignKey(entity, typeof(UserProfile), ["CreatedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["BillOwnerUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["ReconciliationUpdatedByUserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserGroup), ["GroupId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_expense_bills_merchant_name_not_blank",
            "merchant_name IS NULL OR length(btrim(merchant_name)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_expense_bills_status",
            "status IN ('draft', 'pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'finalized', 'archived')");
        AssertCheckConstraint(
            entity,
            "ck_expense_bills_reconciliation_status",
            "reconciliation_status IN ('unreconciled', 'reconciled', 'ignored')");
        AssertCheckConstraint(
            entity,
            "ck_expense_bills_reconciliation_note_not_blank",
            "reconciliation_note IS NULL OR length(btrim(reconciliation_note)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_expense_bills_reconciliation_update_actor_pair",
            "((reconciliation_updated_at_utc IS NULL AND reconciliation_updated_by_user_profile_id IS NULL) OR (reconciliation_updated_at_utc IS NOT NULL AND reconciliation_updated_by_user_profile_id IS NOT NULL))");
        AssertCheckConstraint(
            entity,
            "ck_expense_bills_reconciled_at_matches_status",
            "((reconciliation_status = 'reconciled' AND reconciled_at_utc IS NOT NULL) OR (reconciliation_status <> 'reconciled' AND reconciled_at_utc IS NULL))");
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
        AssertColumn(entity, storeObject, "SourceKind", "source_kind", isNullable: true, maxLength: 40);
        AssertColumn(entity, storeObject, "SourceReceiptOcrReviewId", "source_receipt_ocr_review_id", isNullable: true);
        AssertColumn(entity, storeObject, "SourceReceiptOcrReviewLineId", "source_receipt_ocr_review_line_id", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DeletedAtUtc", "deleted_at_utc", isNullable: true);

        AssertIndex(entity, "ix_expense_bill_items_expense_bill_id", ["ExpenseBillId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_items_bill_sort_order", ["ExpenseBillId", "SortOrder"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_items_deleted_at_utc", ["DeletedAtUtc"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_items_source_review_id", ["SourceReceiptOcrReviewId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_items_bill_source_review", ["ExpenseBillId", "SourceKind", "SourceReceiptOcrReviewId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_items_source_review_line_id", ["SourceReceiptOcrReviewLineId"], isUnique: false);

        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ReceiptOcrReview), ["SourceReceiptOcrReviewId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(ReceiptOcrReviewLine), ["SourceReceiptOcrReviewLineId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_expense_bill_items_name_not_blank", "length(btrim(name)) > 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_note_not_blank", "note IS NULL OR length(btrim(note)) > 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_quantity_positive", "quantity IS NULL OR quantity > 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_amount_non_negative", "amount >= 0");
        AssertCheckConstraint(entity, "ck_expense_bill_items_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_expense_bill_items_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(entity, "ck_expense_bill_items_source_kind", "source_kind IS NULL OR source_kind IN ('receipt_ocr_review_apply')");
        AssertCheckConstraint(entity, "ck_expense_bill_items_ocr_source_complete", "((source_kind IS NULL AND source_receipt_ocr_review_id IS NULL AND source_receipt_ocr_review_line_id IS NULL) OR (source_kind = 'receipt_ocr_review_apply' AND source_receipt_ocr_review_id IS NOT NULL AND source_receipt_ocr_review_line_id IS NOT NULL))");
    }

    [Fact]
    public void ExpenseBillItemSplitModelUsesItemResolvedShareAndResidualConstraints()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBillItemSplit>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bill_item_splits", null);

        Assert.Equal("expense_bill_item_splits", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "ExpenseBillItemId", "expense_bill_item_id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "SplitMethod", "split_method", isNullable: false, maxLength: 32);
        AssertColumn(
            entity,
            storeObject,
            "BasisValue",
            "basis_value",
            isNullable: true,
            precision: ExpenseBillConstraints.MoneyAmountPrecision,
            scale: ExpenseBillConstraints.MoneyAmountScale);
        AssertMoneyColumn(entity, storeObject, "ResolvedAmount", "resolved_amount");
        AssertColumn(entity, storeObject, "ResolvedCurrency", "resolved_currency", isNullable: false, maxLength: 3);
        AssertColumn(entity, storeObject, "AllocationOrder", "allocation_order", isNullable: false);
        AssertColumn(entity, storeObject, "ReceivedResidualMinorUnit", "received_residual_minor_unit", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        Assert.Null(entity.FindProperty("BasisCurrency"));
        Assert.DoesNotContain(
            entity.GetProperties(),
            property => property.GetColumnName(storeObject) == "basis_currency");

        AssertIndex(
            entity,
            "ix_expense_bill_item_splits_expense_bill_item_id",
            ["ExpenseBillItemId"],
            isUnique: false);
        AssertIndex(entity, "ix_expense_bill_item_splits_user_profile_id", ["UserProfileId"], isUnique: false);
        AssertIndex(
            entity,
            "ix_expense_bill_item_splits_item_allocation_order",
            ["ExpenseBillItemId", "AllocationOrder"],
            isUnique: false);
        AssertIndex(
            entity,
            "ux_expense_bill_item_splits_item_user_profile_id",
            ["ExpenseBillItemId", "UserProfileId"],
            isUnique: true);

        AssertForeignKey(entity, typeof(ExpenseBillItem), ["ExpenseBillItemId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_expense_bill_item_splits_split_method",
            "split_method IN ('equal', 'exact_amount', 'percentage', 'ratio', 'share_weight')");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_item_splits_basis_value_non_negative",
            "basis_value IS NULL OR basis_value >= 0");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_item_splits_basis_value_upper_bound",
            "basis_value IS NULL OR basis_value <= 999999999999999.9999");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_item_splits_resolved_amount_non_negative",
            "resolved_amount >= 0");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_item_splits_resolved_amount_upper_bound",
            "resolved_amount <= 999999999999999.9999");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_item_splits_resolved_currency_iso",
            "resolved_currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_item_splits_allocation_order_non_negative",
            "allocation_order >= 0");
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
        AssertColumn(
            entity,
            storeObject,
            "RejectionReasonCode",
            "rejection_reason_code",
            isNullable: true,
            maxLength: 32);
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
            "ck_expense_bill_participants_rejection_reason_code",
            "rejection_reason_code IS NULL OR rejection_reason_code IN ('wrong_amount', 'wrong_items', 'wrong_split', 'duplicate', 'not_mine', 'other')");
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
    public void ExpenseBillPayerModelUsesPayerContributionAndConfirmationShape()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<ExpenseBillPayer>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("expense_bill_payers", null);

        Assert.Equal("expense_bill_payers", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "ExpenseBillId", "expense_bill_id", isNullable: false);
        AssertColumn(entity, storeObject, "UserProfileId", "user_profile_id", isNullable: false);
        AssertColumn(
            entity,
            storeObject,
            "PayerFactsCreatedByUserProfileId",
            "payer_facts_created_by_user_profile_id",
            isNullable: false);
        AssertMoneyColumn(entity, storeObject, "Amount", "amount");
        AssertColumn(entity, storeObject, "Currency", "currency", isNullable: false, maxLength: 3);
        AssertColumn(
            entity,
            storeObject,
            "PaymentMethodLabelSnapshot",
            "payment_method_label_snapshot",
            isNullable: true,
            maxLength: 120);
        AssertColumn(
            entity,
            storeObject,
            "PayerConfirmationStatus",
            "payer_confirmation_status",
            isNullable: false,
            maxLength: 32);
        AssertColumn(entity, storeObject, "PayerConfirmedAtUtc", "payer_confirmed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "PayerRejectedAtUtc", "payer_rejected_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(entity, "ix_expense_bill_payers_expense_bill_id", ["ExpenseBillId"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_payers_user_profile_id", ["UserProfileId"], isUnique: false);
        AssertIndex(
            entity,
            "ix_expense_bill_payers_facts_created_by_user_profile_id",
            ["PayerFactsCreatedByUserProfileId"],
            isUnique: false);
        AssertIndex(entity, "ix_expense_bill_payers_confirmation_status", ["PayerConfirmationStatus"], isUnique: false);
        AssertIndex(entity, "ix_expense_bill_payers_bill_user_profile_id", ["ExpenseBillId", "UserProfileId"], isUnique: false);
        AssertForeignKey(entity, typeof(ExpenseBill), ["ExpenseBillId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["UserProfileId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(UserProfile), ["PayerFactsCreatedByUserProfileId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(entity, "ck_expense_bill_payers_amount_non_negative", "amount >= 0");
        AssertCheckConstraint(entity, "ck_expense_bill_payers_amount_upper_bound", "amount <= 999999999999999.9999");
        AssertCheckConstraint(entity, "ck_expense_bill_payers_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_payers_method_label_not_blank",
            "payment_method_label_snapshot IS NULL OR length(btrim(payment_method_label_snapshot)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_expense_bill_payers_confirmation_status",
            "payer_confirmation_status IN ('pending_confirmation', 'confirmed', 'rejected')");
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
        var createIndexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        Assert.Equal(ExpenseBillSchemaTables.Order(), createTables.Select(table => table.Name).Order());

        Assert.All(
            createIndexes,
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

        AssertMigrationMoneyColumns(
            expenseBills,
            amountColumnName: "total_amount",
            currencyColumnName: "total_currency",
            nonNegativeConstraintName: "ck_expense_bills_total_amount_non_negative",
            upperBoundConstraintName: "ck_expense_bills_total_amount_upper_bound",
            currencyConstraintName: "ck_expense_bills_total_currency_uppercase_iso");
        AssertMigrationCheckConstraint(
            expenseBills,
            "ck_expense_bills_status",
            "status IN ('draft', 'pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'finalized', 'archived')");

        var items = Assert.Single(createTables, table => table.Name == "expense_bill_items");
        AssertMigrationMoneyColumns(
            items,
            amountColumnName: "amount",
            currencyColumnName: "currency",
            nonNegativeConstraintName: "ck_expense_bill_items_amount_non_negative",
            upperBoundConstraintName: "ck_expense_bill_items_amount_upper_bound",
            currencyConstraintName: "ck_expense_bill_items_currency_uppercase_iso");

        AssertMigrationMoneyColumns(
            participants,
            amountColumnName: "resolved_share_amount",
            currencyColumnName: "resolved_share_currency",
            nonNegativeConstraintName: "ck_expense_bill_participants_share_amount_non_negative",
            upperBoundConstraintName: "ck_expense_bill_participants_share_amount_upper_bound",
            currencyConstraintName: "ck_expense_bill_participants_share_currency_iso");
        AssertMigrationCheckConstraint(
            participants,
            "ck_expense_bill_participants_status",
            "status IN ('pending_acceptance', 'accepted', 'rejected', 'partially_settled', 'settled', 'waived', 'claimed_paid', 'confirmed_paid')");

        var payers = Assert.Single(createTables, table => table.Name == "expense_bill_payers");
        AssertMigrationMoneyColumns(
            payers,
            amountColumnName: "amount",
            currencyColumnName: "currency",
            nonNegativeConstraintName: "ck_expense_bill_payers_amount_non_negative",
            upperBoundConstraintName: "ck_expense_bill_payers_amount_upper_bound",
            currencyConstraintName: "ck_expense_bill_payers_currency_uppercase_iso");

        var adjustments = Assert.Single(createTables, table => table.Name == "expense_bill_adjustments");
        AssertMigrationMoneyColumns(
            adjustments,
            amountColumnName: "amount",
            currencyColumnName: "currency",
            nonNegativeConstraintName: "ck_expense_bill_adjustments_amount_non_negative",
            upperBoundConstraintName: "ck_expense_bill_adjustments_amount_upper_bound",
            currencyConstraintName: "ck_expense_bill_adjustments_currency_iso");
        AssertMigrationCheckConstraint(
            adjustments,
            "ck_expense_bill_adjustments_type",
            "type IN ('tax', 'service_charge', 'discount', 'manual_adjustment', 'credit')");
        AssertMigrationCheckConstraint(
            adjustments,
            "ck_expense_bill_adjustments_direction",
            "direction IN ('charge', 'credit')");
        AssertMigrationCheckConstraint(
            adjustments,
            "ck_expense_bill_adjustments_allocation_method",
            "allocation_method IN ('equal', 'proportional_by_item_subtotal', 'manual')");

        AssertMigrationCheckConstraint(
            attachments,
            "ck_expense_bill_attachments_purpose",
            "purpose IN ('receipt', 'supporting_attachment')");

        AssertMigrationForeignKey(expenseBills, "user_profiles", ["created_by_user_profile_id"]);
        AssertMigrationForeignKey(expenseBills, "user_groups", ["group_id"]);
        AssertMigrationForeignKey(items, "expense_bills", ["expense_bill_id"]);
        AssertMigrationForeignKey(participants, "expense_bills", ["expense_bill_id"]);
        AssertMigrationForeignKey(participants, "user_profiles", ["user_profile_id"]);
        AssertMigrationForeignKey(payers, "expense_bills", ["expense_bill_id"]);
        AssertMigrationForeignKey(payers, "user_profiles", ["user_profile_id"]);
        AssertMigrationForeignKey(adjustments, "expense_bills", ["expense_bill_id"]);
        AssertMigrationForeignKey(attachments, "expense_bills", ["expense_bill_id"]);
        AssertMigrationForeignKey(attachments, "file_objects", ["file_object_id"]);
        AssertMigrationForeignKey(attachments, "user_profiles", ["created_by_user_profile_id"]);

        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bills_created_by_user_profile_id",
            "expense_bills",
            ["created_by_user_profile_id"]);
        AssertMigrationIndex(createIndexes, "ix_expense_bills_group_id", "expense_bills", ["group_id"]);
        AssertMigrationIndex(createIndexes, "ix_expense_bills_status", "expense_bills", ["status"]);
        AssertMigrationIndex(createIndexes, "ix_expense_bills_bill_date", "expense_bills", ["bill_date"]);
        AssertMigrationIndex(createIndexes, "ix_expense_bills_archived_at_utc", "expense_bills", ["archived_at_utc"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_items_expense_bill_id",
            "expense_bill_items",
            ["expense_bill_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_items_bill_sort_order",
            "expense_bill_items",
            ["expense_bill_id", "sort_order"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_items_deleted_at_utc",
            "expense_bill_items",
            ["deleted_at_utc"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_participants_user_profile_id",
            "expense_bill_participants",
            ["user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_payers_expense_bill_id",
            "expense_bill_payers",
            ["expense_bill_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_payers_user_profile_id",
            "expense_bill_payers",
            ["user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_payers_bill_user_profile_id",
            "expense_bill_payers",
            ["expense_bill_id", "user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_adjustments_expense_bill_id",
            "expense_bill_adjustments",
            ["expense_bill_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_adjustments_bill_sort_order",
            "expense_bill_adjustments",
            ["expense_bill_id", "sort_order"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_attachments_file_object_id",
            "expense_bill_attachments",
            ["file_object_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_attachments_created_by_profile_id",
            "expense_bill_attachments",
            ["created_by_user_profile_id"]);
    }

    [Fact]
    public void ExpenseBillItemSplitSchemaFoundationMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddExpenseBillItemSplitSchemaFoundation", StringComparison.Ordinal));

        var migration = new AddExpenseBillItemSplitSchemaFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTable = Assert.Single(migration.UpOperations.OfType<CreateTableOperation>());
        var createIndexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();

        Assert.Equal("expense_bill_item_splits", createTable.Name);
        Assert.Equal(["id"], createTable.PrimaryKey!.Columns);
        Assert.Equal(
            [
                "id",
                "expense_bill_item_id",
                "user_profile_id",
                "split_method",
                "basis_value",
                "resolved_amount",
                "resolved_currency",
                "allocation_order",
                "received_residual_minor_unit",
                "created_at_utc",
                "updated_at_utc"
            ],
            createTable.Columns.Select(column => column.Name));

        Assert.All(createIndexes, index => Assert.Equal("expense_bill_item_splits", index.Table));
        Assert.All(
            createTable.ForeignKeys,
            foreignKey => Assert.Equal(ReferentialAction.Restrict, foreignKey.OnDelete));
        Assert.All(
            createTable.ForeignKeys,
            foreignKey => Assert.Contains(
                ["expense_bill_items", "user_profiles"],
                principalTable => principalTable == foreignKey.PrincipalTable));

        var splitMethodColumn = Assert.Single(createTable.Columns, column => column.Name == "split_method");
        Assert.Equal(typeof(string), splitMethodColumn.ClrType);
        Assert.Equal("character varying(32)", splitMethodColumn.ColumnType);
        Assert.False(splitMethodColumn.IsNullable);
        Assert.Equal(ExpenseBillConstraints.ItemSplitMethodMaxLength, splitMethodColumn.MaxLength);

        var basisValueColumn = Assert.Single(createTable.Columns, column => column.Name == "basis_value");
        Assert.Equal(typeof(decimal), basisValueColumn.ClrType);
        Assert.Equal("numeric(19,4)", basisValueColumn.ColumnType);
        Assert.True(basisValueColumn.IsNullable);
        Assert.Equal(ExpenseBillConstraints.MoneyAmountPrecision, basisValueColumn.Precision);
        Assert.Equal(ExpenseBillConstraints.MoneyAmountScale, basisValueColumn.Scale);
        Assert.DoesNotContain(createTable.Columns, column => column.Name == "basis_currency");

        var residualColumn = Assert.Single(createTable.Columns, column => column.Name == "received_residual_minor_unit");
        Assert.Equal(typeof(bool), residualColumn.ClrType);
        Assert.Equal("boolean", residualColumn.ColumnType);
        Assert.False(residualColumn.IsNullable);

        Assert.All(
            createTable.Columns.Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));

        AssertMigrationMoneyColumns(
            createTable,
            amountColumnName: "resolved_amount",
            currencyColumnName: "resolved_currency",
            nonNegativeConstraintName: "ck_expense_bill_item_splits_resolved_amount_non_negative",
            upperBoundConstraintName: "ck_expense_bill_item_splits_resolved_amount_upper_bound",
            currencyConstraintName: "ck_expense_bill_item_splits_resolved_currency_iso");
        AssertMigrationCheckConstraint(
            createTable,
            "ck_expense_bill_item_splits_split_method",
            "split_method IN ('equal', 'exact_amount', 'percentage', 'ratio', 'share_weight')");
        AssertMigrationCheckConstraint(
            createTable,
            "ck_expense_bill_item_splits_basis_value_non_negative",
            "basis_value IS NULL OR basis_value >= 0");
        AssertMigrationCheckConstraint(
            createTable,
            "ck_expense_bill_item_splits_basis_value_upper_bound",
            "basis_value IS NULL OR basis_value <= 999999999999999.9999");
        AssertMigrationCheckConstraint(
            createTable,
            "ck_expense_bill_item_splits_allocation_order_non_negative",
            "allocation_order >= 0");

        AssertMigrationForeignKey(createTable, "expense_bill_items", ["expense_bill_item_id"]);
        AssertMigrationForeignKey(createTable, "user_profiles", ["user_profile_id"]);

        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_item_splits_expense_bill_item_id",
            "expense_bill_item_splits",
            ["expense_bill_item_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_item_splits_user_profile_id",
            "expense_bill_item_splits",
            ["user_profile_id"]);
        AssertMigrationIndex(
            createIndexes,
            "ix_expense_bill_item_splits_item_allocation_order",
            "expense_bill_item_splits",
            ["expense_bill_item_id", "allocation_order"]);
        AssertMigrationIndex(
            createIndexes,
            "ux_expense_bill_item_splits_item_user_profile_id",
            "expense_bill_item_splits",
            ["expense_bill_item_id", "user_profile_id"],
            isUnique: true);

        var names = migration.UpOperations
            .OfType<CreateTableOperation>()
            .Select(table => table.Name)
            .Concat(migration.UpOperations.OfType<CreateIndexOperation>().Select(index => index.Table))
            .ToArray();
        Assert.DoesNotContain(names, name => name.Contains("settlement", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(names, name => name.Contains("recurring", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(names, name => name.Contains("balance", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(names, name => name.Contains("reconciliation", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ExpenseBillReconciliationReportingMigrationIsRegisteredAdditiveAndConstrained()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddBillReconciliationReportingFoundation", StringComparison.Ordinal));

        var migration = new AddBillReconciliationReportingFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var addColumns = migration.UpOperations.OfType<AddColumnOperation>().ToArray();
        Assert.Equal(
            [
                "reconciled_at_utc",
                "reconciliation_note",
                "reconciliation_status",
                "reconciliation_updated_at_utc",
                "reconciliation_updated_by_user_profile_id"
            ],
            addColumns.Select(column => column.Name));
        Assert.All(addColumns, column => Assert.Equal("expense_bills", column.Table));

        var statusColumn = Assert.Single(addColumns, column => column.Name == "reconciliation_status");
        Assert.Equal(typeof(string), statusColumn.ClrType);
        Assert.Equal("character varying(32)", statusColumn.ColumnType);
        Assert.False(statusColumn.IsNullable);
        Assert.Equal(ExpenseBillConstraints.BillReconciliationStatusMaxLength, statusColumn.MaxLength);
        Assert.Equal(ExpenseBillReconciliationStatuses.Unreconciled, statusColumn.DefaultValue);

        var noteColumn = Assert.Single(addColumns, column => column.Name == "reconciliation_note");
        Assert.Equal(typeof(string), noteColumn.ClrType);
        Assert.Equal("character varying(120)", noteColumn.ColumnType);
        Assert.True(noteColumn.IsNullable);
        Assert.Equal(ExpenseBillConstraints.BillReconciliationNoteMaxLength, noteColumn.MaxLength);

        var actorColumn = Assert.Single(addColumns, column => column.Name == "reconciliation_updated_by_user_profile_id");
        Assert.Equal(typeof(Guid), actorColumn.ClrType);
        Assert.Equal("uuid", actorColumn.ColumnType);
        Assert.True(actorColumn.IsNullable);

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        AssertMigrationIndex(
            indexes,
            "ix_expense_bills_reconciliation_status",
            "expense_bills",
            ["reconciliation_status"]);
        AssertMigrationIndex(
            indexes,
            "ix_expense_bills_reconciliation_updated_by_user_profile_id",
            "expense_bills",
            ["reconciliation_updated_by_user_profile_id"]);

        Assert.Contains(
            migration.UpOperations.OfType<AddForeignKeyOperation>(),
            foreignKey => foreignKey.Name == "fk_expense_bills_reconciliation_updated_by_user_profiles"
                && foreignKey.Table == "expense_bills"
                && foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.Columns.SequenceEqual(["reconciliation_updated_by_user_profile_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        var checkConstraints = migration.UpOperations.OfType<AddCheckConstraintOperation>().ToArray();
        Assert.Contains(
            checkConstraints,
            constraint => constraint.Name == "ck_expense_bills_reconciliation_status"
                && constraint.Table == "expense_bills"
                && constraint.Sql == "reconciliation_status IN ('unreconciled', 'reconciled', 'ignored')");
        Assert.Contains(
            checkConstraints,
            constraint => constraint.Name == "ck_expense_bills_reconciliation_note_not_blank"
                && constraint.Table == "expense_bills"
                && constraint.Sql == "reconciliation_note IS NULL OR length(btrim(reconciliation_note)) > 0");
        Assert.Contains(
            checkConstraints,
            constraint => constraint.Name == "ck_expense_bills_reconciliation_update_actor_pair"
                && constraint.Table == "expense_bills"
                && constraint.Sql == "((reconciliation_updated_at_utc IS NULL AND reconciliation_updated_by_user_profile_id IS NULL) OR (reconciliation_updated_at_utc IS NOT NULL AND reconciliation_updated_by_user_profile_id IS NOT NULL))");
        Assert.Contains(
            checkConstraints,
            constraint => constraint.Name == "ck_expense_bills_reconciled_at_matches_status"
                && constraint.Table == "expense_bills"
                && constraint.Sql == "((reconciliation_status = 'reconciled' AND reconciled_at_utc IS NOT NULL) OR (reconciliation_status <> 'reconciled' AND reconciled_at_utc IS NULL))");
    }

    [Fact]
    public void ExpenseBillParticipantRejectionReasonMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddExpenseBillParticipantRejectionReasonCode", StringComparison.Ordinal));

        var migration = new AddExpenseBillParticipantRejectionReasonCode();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var addColumn = Assert.Single(migration.UpOperations.OfType<AddColumnOperation>());
        Assert.Equal("expense_bill_participants", addColumn.Table);
        Assert.Equal("rejection_reason_code", addColumn.Name);
        Assert.Equal(typeof(string), addColumn.ClrType);
        Assert.Equal("character varying(32)", addColumn.ColumnType);
        Assert.True(addColumn.IsNullable);
        Assert.Equal(ExpenseBillConstraints.ParticipantRejectionReasonCodeMaxLength, addColumn.MaxLength);

        var checkConstraint = Assert.Single(migration.UpOperations.OfType<AddCheckConstraintOperation>());
        Assert.Equal("expense_bill_participants", checkConstraint.Table);
        Assert.Equal("ck_expense_bill_participants_rejection_reason_code", checkConstraint.Name);
        Assert.Equal(
            "rejection_reason_code IS NULL OR rejection_reason_code IN ('wrong_amount', 'wrong_items', 'wrong_split', 'duplicate', 'not_mine', 'other')",
            checkConstraint.Sql);
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

    private static void AssertMigrationMoneyColumns(
        CreateTableOperation table,
        string amountColumnName,
        string currencyColumnName,
        string nonNegativeConstraintName,
        string upperBoundConstraintName,
        string currencyConstraintName)
    {
        var amountColumn = Assert.Single(table.Columns, column => column.Name == amountColumnName);
        Assert.Equal(typeof(decimal), amountColumn.ClrType);
        Assert.Equal("numeric(19,4)", amountColumn.ColumnType);
        Assert.False(amountColumn.IsNullable);
        Assert.Equal(ExpenseBillConstraints.MoneyAmountPrecision, amountColumn.Precision);
        Assert.Equal(ExpenseBillConstraints.MoneyAmountScale, amountColumn.Scale);

        var currencyColumn = Assert.Single(table.Columns, column => column.Name == currencyColumnName);
        Assert.Equal(typeof(string), currencyColumn.ClrType);
        Assert.Equal("character varying(3)", currencyColumn.ColumnType);
        Assert.False(currencyColumn.IsNullable);
        Assert.Equal(ExpenseBillConstraints.CurrencyMaxLength, currencyColumn.MaxLength);

        AssertMigrationCheckConstraint(table, nonNegativeConstraintName, $"{amountColumnName} >= 0");
        AssertMigrationCheckConstraint(
            table,
            upperBoundConstraintName,
            $"{amountColumnName} <= {ExpenseBillConstraints.MoneyAmountMaxValue:0.0000}");
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
