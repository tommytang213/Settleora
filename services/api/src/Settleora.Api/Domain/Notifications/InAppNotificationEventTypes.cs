namespace Settleora.Api.Domain.Notifications;

public static class InAppNotificationEventTypes
{
    public const string BillSubmitted = "bill.submitted";
    public const string BillParticipantAccepted = "bill.participant_accepted";
    public const string BillParticipantRejected = "bill.participant_rejected";
    public const string BillConfirmed = "bill.confirmed";
    public const string SettlementRequestCreated = "settlement.request_created";
    public const string SettlementPaymentMarkedPaid = "settlement.payment_marked_paid";
    public const string SettlementPaymentPartiallyPaid = "settlement.payment_partially_paid";
    public const string SettlementPaymentConfirmed = "settlement.payment_confirmed";
    public const string SettlementRequestDisputed = "settlement.request_disputed";
    public const string SettlementPaymentDisputed = "settlement.payment_disputed";
    public const string SettlementRequestCancelled = "settlement.request_cancelled";
    public const string SettlementPaymentCancelled = "settlement.payment_cancelled";
    public const string SettlementProofAttached = "settlement.proof_attached";
    public const string RecurringBillDraftGenerated = "recurring_bill.draft_generated";

    private static readonly string[] SupportedValues =
    [
        BillSubmitted,
        BillParticipantAccepted,
        BillParticipantRejected,
        BillConfirmed,
        SettlementRequestCreated,
        SettlementPaymentMarkedPaid,
        SettlementPaymentPartiallyPaid,
        SettlementPaymentConfirmed,
        SettlementRequestDisputed,
        SettlementPaymentDisputed,
        SettlementRequestCancelled,
        SettlementPaymentCancelled,
        SettlementProofAttached,
        RecurringBillDraftGenerated
    ];

    public static bool IsSupported(string? value)
    {
        return SupportedValues.Contains(value, StringComparer.Ordinal);
    }

    public static IReadOnlyList<string> Values => SupportedValues;
}
