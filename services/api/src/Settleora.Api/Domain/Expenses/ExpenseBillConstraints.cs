namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillConstraints
{
    public const int MerchantNameMaxLength = 200;
    public const int BillStatusMaxLength = 32;
    public const int BillReconciliationStatusMaxLength = 32;
    public const int BillReconciliationNoteMaxLength = 120;
    public const int BillRevisionStatusMaxLength = 40;
    public const int BillRevisionApprovalStatusMaxLength = 40;
    public const int BillRevisionCalculationHashMaxLength = 128;
    public const int BillRevisionPolicyVersionMaxLength = 64;
    public const int BillRevisionRequestMetadataMaxLength = 120;
    public const int BillRevisionUnsupportedDetailReasonMaxLength = 120;
    public const int ItemNameMaxLength = 240;
    public const int ItemSourceKindMaxLength = 40;
    public const int NoteMaxLength = 1000;
    public const int CurrencyMaxLength = 3;
    public const int ParticipantStatusMaxLength = 32;
    public const int ParticipantRejectionReasonCodeMaxLength = 32;
    public const int PayerConfirmationStatusMaxLength = 32;
    public const int PayerPaymentMethodLabelSnapshotMaxLength = 120;
    public const int AdjustmentTypeMaxLength = 32;
    public const int AdjustmentDirectionMaxLength = 16;
    public const int AdjustmentAllocationMethodMaxLength = 40;
    public const int AttachmentPurposeMaxLength = 32;
    public const int ItemSplitMethodMaxLength = 32;
    public const int MoneyAmountPrecision = 19;
    public const int MoneyAmountScale = 4;
    public const decimal MoneyAmountMaxValue = 999999999999999.9999m;
}
