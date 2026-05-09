namespace Settleora.Api.Domain.Expenses;

internal static class ExpenseBillPayerConfirmationPolicy
{
    public static void ApplyCreatedBy(
        ExpenseBillPayer payer,
        Guid actorUserProfileId,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(payer);

        payer.PayerFactsCreatedByUserProfileId = actorUserProfileId;
        payer.PayerConfirmationStatus = payer.UserProfileId == actorUserProfileId
            ? ExpenseBillPayerConfirmationStatuses.Confirmed
            : ExpenseBillPayerConfirmationStatuses.PendingConfirmation;
        payer.PayerConfirmedAtUtc = payer.UserProfileId == actorUserProfileId
            ? now
            : null;
        payer.PayerRejectedAtUtc = null;
    }
}
