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
    IReadOnlyList<SettlementPaymentAllocationResponse> Allocations,
    IReadOnlyList<SettlementPaymentResidualResponse> Residuals,
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
            payment.Allocations
                .OrderBy(allocation => allocation.AllocationOrder)
                .ThenBy(allocation => allocation.CreatedAtUtc)
                .ThenBy(allocation => allocation.Id)
                .Select(SettlementPaymentAllocationResponse.From)
                .ToArray(),
            payment.Residuals
                .Where(residual => SettlementResidualRuntime.IsSafeResidualSummary(payment, residual))
                .OrderBy(residual => residual.CreatedAtUtc)
                .ThenBy(residual => residual.Id)
                .Select(SettlementPaymentResidualResponse.From)
                .ToArray(),
            settlementRequestStatus);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record SettlementPaymentResidualResponse(
    Guid Id,
    Guid SettlementPaymentId,
    Guid SettlementRequestId,
    string Direction,
    string Amount,
    string Currency,
    string Policy,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ResolvedAtUtc)
{
    public static SettlementPaymentResidualResponse From(SettlementResidual residual)
    {
        return new SettlementPaymentResidualResponse(
            residual.Id,
            residual.SettlementPaymentId!.Value,
            residual.SettlementRequestId!.Value,
            residual.Direction,
            FormatAmount(residual.Amount),
            residual.Currency,
            residual.Policy,
            residual.Status,
            residual.CreatedAtUtc,
            residual.ResolvedAtUtc);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record SettlementPaymentAllocationResponse(
    Guid Id,
    Guid SettlementRequestLineId,
    string ClearedAmount,
    string Currency,
    int AllocationOrder,
    DateTimeOffset CreatedAtUtc)
{
    public static SettlementPaymentAllocationResponse From(SettlementPaymentAllocation allocation)
    {
        return new SettlementPaymentAllocationResponse(
            allocation.Id,
            allocation.SettlementRequestLineId,
            FormatAmount(allocation.ClearedAmount),
            allocation.Currency,
            allocation.AllocationOrder,
            allocation.CreatedAtUtc);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}
