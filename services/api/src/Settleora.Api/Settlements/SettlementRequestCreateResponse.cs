using System.Globalization;
using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal sealed record SettlementRequestResponse(
    Guid Id,
    Guid SourceExpenseBillId,
    Guid? GroupId,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    string Amount,
    string Currency,
    string Status,
    Guid RequestedByUserProfileId,
    DateTimeOffset RequestedAtUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc)
{
    public static SettlementRequestResponse From(SettlementRequest settlementRequest)
    {
        return new SettlementRequestResponse(
            settlementRequest.Id,
            settlementRequest.SourceExpenseBillId!.Value,
            settlementRequest.GroupId,
            settlementRequest.DebtorUserProfileId,
            settlementRequest.CreditorUserProfileId,
            FormatAmount(settlementRequest.Amount),
            settlementRequest.Currency,
            settlementRequest.Status,
            settlementRequest.RequestedByUserProfileId,
            settlementRequest.RequestedAtUtc,
            settlementRequest.CreatedAtUtc,
            settlementRequest.UpdatedAtUtc);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record SettlementRequestListResponse(
    IReadOnlyList<SettlementRequestResponse> Settlements);
