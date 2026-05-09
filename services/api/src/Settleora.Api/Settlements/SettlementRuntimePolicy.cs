using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal static class SettlementRuntimePolicy
{
    public const string PersonalGroupMode = "personal";
    public const string GroupMode = "group";

    private static readonly HashSet<string> ActivePaymentStatuses =
    [
        SettlementPaymentStatuses.MarkedPaid,
        SettlementPaymentStatuses.Confirmed
    ];

    public static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
    }

    public static bool IsActivePaymentStatus(string? status)
    {
        return status is not null && ActivePaymentStatuses.Contains(status);
    }

    public static bool IsValidSettlementAmount(decimal amount)
    {
        return amount is > 0m and <= SettlementConstraints.MoneyAmountMaxValue;
    }

    public static string RecomputeSettlementRequestStatus(
        decimal requestAmount,
        decimal activePaymentCoverage,
        decimal confirmedPaymentCoverage)
    {
        if (confirmedPaymentCoverage == requestAmount)
        {
            return SettlementRequestStatuses.Confirmed;
        }

        if (activePaymentCoverage == requestAmount)
        {
            return SettlementRequestStatuses.MarkedPaid;
        }

        return activePaymentCoverage > 0m
            ? SettlementRequestStatuses.PartiallyPaid
            : SettlementRequestStatuses.Requested;
    }
}
