namespace Settleora.Api.Domain.Notifications;

public static class InAppNotificationEventTypes
{
    public const string BillSubmitted = "bill.submitted";
    public const string BillParticipantAccepted = "bill.participant_accepted";
    public const string BillParticipantRejected = "bill.participant_rejected";
    public const string BillConfirmed = "bill.confirmed";
    public const string BillRevisionProposed = "bill.revision_proposed";
    public const string BillRevisionResubmitted = "bill.revision_resubmitted";
    public const string BillRevisionSubmitted = "bill.revision_submitted";
    public const string BillRevisionWithdrawn = "bill.revision_withdrawn";
    public const string BillRevisionApproved = "bill.revision_approved";
    public const string BillRevisionRejected = "bill.revision_rejected";
    public const string BillRevisionPayerConfirmed = "bill.revision_payer_confirmed";
    public const string BillRevisionApplied = "bill.revision_applied";
    public const string SettlementRequestCreated = "settlement.request_created";
    public const string SettlementPaymentMarkedPaid = "settlement.payment_marked_paid";
    public const string SettlementPaymentPartiallyPaid = "settlement.payment_partially_paid";
    public const string SettlementPaymentConfirmed = "settlement.payment_confirmed";
    public const string SettlementRequestDisputed = "settlement.request_disputed";
    public const string SettlementPaymentDisputed = "settlement.payment_disputed";
    public const string SettlementRequestCancelled = "settlement.request_cancelled";
    public const string SettlementPaymentCancelled = "settlement.payment_cancelled";
    public const string SettlementProofAttached = "settlement.proof_attached";
    public const string RecurringBillDueSoon = "recurring_bill.due_soon";
    public const string RecurringBillDraftGenerated = "recurring_bill.draft_generated";

    private static readonly string[] SupportedValues =
    [
        BillSubmitted,
        BillParticipantAccepted,
        BillParticipantRejected,
        BillConfirmed,
        BillRevisionProposed,
        BillRevisionResubmitted,
        BillRevisionSubmitted,
        BillRevisionWithdrawn,
        BillRevisionApproved,
        BillRevisionRejected,
        BillRevisionPayerConfirmed,
        BillRevisionApplied,
        SettlementRequestCreated,
        SettlementPaymentMarkedPaid,
        SettlementPaymentPartiallyPaid,
        SettlementPaymentConfirmed,
        SettlementRequestDisputed,
        SettlementPaymentDisputed,
        SettlementRequestCancelled,
        SettlementPaymentCancelled,
        SettlementProofAttached,
        RecurringBillDueSoon,
        RecurringBillDraftGenerated
    ];

    public static bool IsSupported(string? value)
    {
        return SupportedValues.Contains(value, StringComparer.Ordinal);
    }

    public static IReadOnlyList<string> Values => SupportedValues;
}
