using System.Globalization;

namespace Settleora.Api.Settlements;

internal sealed record SettlementBalanceProjectionListResponse(
    DateTimeOffset GeneratedAtUtc,
    IReadOnlyList<SettlementBalanceProjectionResponse> Balances);

internal sealed record SettlementBalanceProjectionResponse(
    Guid CounterpartyUserProfileId,
    Guid? GroupId,
    string Direction,
    string Currency,
    string SelectedLineAmount,
    string PendingClaimedAmount,
    string ConfirmedClearedAmount,
    string RemainingUnclaimedAmount,
    int RequestCount,
    int LineCount,
    int PendingPaymentCount,
    int ConfirmedPaymentCount)
{
    public static SettlementBalanceProjectionResponse From(SettlementBalanceProjectionAggregate aggregate)
    {
        var remainingUnclaimedAmount =
            aggregate.SelectedLineAmount - aggregate.PendingClaimedAmount - aggregate.ConfirmedClearedAmount;
        if (remainingUnclaimedAmount < 0m)
        {
            remainingUnclaimedAmount = 0m;
        }

        return new SettlementBalanceProjectionResponse(
            aggregate.CounterpartyUserProfileId,
            aggregate.GroupId,
            aggregate.Direction,
            aggregate.Currency,
            FormatAmount(aggregate.SelectedLineAmount),
            FormatAmount(aggregate.PendingClaimedAmount),
            FormatAmount(aggregate.ConfirmedClearedAmount),
            FormatAmount(remainingUnclaimedAmount),
            aggregate.RequestCount,
            aggregate.LineCount,
            aggregate.PendingPaymentCount,
            aggregate.ConfirmedPaymentCount);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record SettlementBalanceProjectionAggregate(
    Guid CounterpartyUserProfileId,
    Guid? GroupId,
    string Direction,
    string Currency,
    decimal SelectedLineAmount,
    decimal PendingClaimedAmount,
    decimal ConfirmedClearedAmount,
    int RequestCount,
    int LineCount,
    int PendingPaymentCount,
    int ConfirmedPaymentCount)
{
    public SettlementBalanceProjectionAggregate Add(SettlementBalanceProjectionAggregate value)
    {
        return this with
        {
            SelectedLineAmount = SelectedLineAmount + value.SelectedLineAmount,
            PendingClaimedAmount = PendingClaimedAmount + value.PendingClaimedAmount,
            ConfirmedClearedAmount = ConfirmedClearedAmount + value.ConfirmedClearedAmount,
            RequestCount = RequestCount + value.RequestCount,
            LineCount = LineCount + value.LineCount,
            PendingPaymentCount = PendingPaymentCount + value.PendingPaymentCount,
            ConfirmedPaymentCount = ConfirmedPaymentCount + value.ConfirmedPaymentCount
        };
    }
}
