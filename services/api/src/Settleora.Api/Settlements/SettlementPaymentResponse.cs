using System.Globalization;
using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal sealed record SettlementPaymentResponse(
    Guid PaymentId,
    Guid SettlementRequestId,
    Guid PaidByUserProfileId,
    Guid ReceivedByUserProfileId,
    string Amount,
    string Currency,
    string Status,
    DateOnly PaymentDate,
    DateTimeOffset ClaimedAtUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    string SettlementRequestStatus)
{
    public static SettlementPaymentResponse From(
        SettlementPayment payment,
        string settlementRequestStatus)
    {
        return new SettlementPaymentResponse(
            payment.Id,
            payment.SettlementRequestId,
            payment.PaidByUserProfileId,
            payment.ReceivedByUserProfileId,
            FormatAmount(payment.Amount),
            payment.Currency,
            payment.Status,
            payment.PaymentDate,
            payment.ClaimedAtUtc,
            payment.CreatedAtUtc,
            payment.UpdatedAtUtc,
            settlementRequestStatus);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}
