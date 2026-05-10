using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal static class SettlementPaymentAllocationRuntime
{
    public static bool TryCreatePaymentAllocations(
        SettlementRequest settlementRequest,
        SettlementPayment payment,
        DateTimeOffset now,
        out SettlementAllocationRuntimeResult result)
    {
        return TryCreatePaymentAllocations(
            settlementRequest,
            payment,
            payment.Amount,
            now,
            out result);
    }

    public static bool TryCreatePaymentAllocations(
        SettlementRequest settlementRequest,
        SettlementPayment payment,
        decimal amountToAllocate,
        DateTimeOffset now,
        out SettlementAllocationRuntimeResult result)
    {
        result = default;

        if (!SettlementRuntimePolicy.IsValidSettlementAmount(payment.Amount)
            || !SettlementRuntimePolicy.IsValidSettlementAmount(amountToAllocate)
            || amountToAllocate > payment.Amount
            || !string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal)
            || !TryComputeActiveCoverage(settlementRequest, out var coverage))
        {
            return false;
        }

        if (coverage.ActivePaymentCoverage + amountToAllocate > settlementRequest.Amount)
        {
            return false;
        }

        var lineCoverage = coverage.LineCoverage.ToDictionary(
            pair => pair.Key,
            pair => pair.Value);
        var remainingPaymentAmount = amountToAllocate;
        var allocationOrder = 0;

        foreach (var line in coverage.OrderedLines)
        {
            if (!CanReceivePaymentAllocation(line.Status))
            {
                return false;
            }

            var remainingLineAmount = line.ExactAmount - lineCoverage[line.Id];
            if (remainingLineAmount <= 0m)
            {
                continue;
            }

            var clearedAmount = remainingPaymentAmount < remainingLineAmount
                ? remainingPaymentAmount
                : remainingLineAmount;
            if (clearedAmount <= 0m)
            {
                continue;
            }

            var allocation = new SettlementPaymentAllocation
            {
                Id = Guid.NewGuid(),
                SettlementPaymentId = payment.Id,
                SettlementPayment = payment,
                SettlementRequestLineId = line.Id,
                SettlementRequestLine = line,
                ClearedAmount = clearedAmount,
                Currency = payment.Currency,
                AllocationOrder = allocationOrder,
                CreatedAtUtc = now
            };

            payment.Allocations.Add(allocation);
            line.PaymentAllocations.Add(allocation);
            lineCoverage[line.Id] += clearedAmount;
            remainingPaymentAmount -= clearedAmount;
            allocationOrder++;

            if (remainingPaymentAmount == 0m)
            {
                break;
            }
        }

        if (remainingPaymentAmount != 0m || payment.Allocations.Count == 0)
        {
            return false;
        }

        ApplyLineCoverageStatuses(coverage.OrderedLines, lineCoverage, now);

        result = new SettlementAllocationRuntimeResult(
            coverage.ActivePaymentCoverage + amountToAllocate,
            coverage.ConfirmedPaymentCoverage);
        return true;
    }

    public static bool TryGetOutstandingSelectedAmount(
        SettlementRequest settlementRequest,
        out decimal outstandingAmount)
    {
        outstandingAmount = 0m;

        if (!TryComputeActiveCoverage(settlementRequest, out var coverage))
        {
            return false;
        }

        outstandingAmount = settlementRequest.Amount - coverage.ActivePaymentCoverage;
        return outstandingAmount > 0m;
    }

    public static bool TryRecomputeActiveLineCoverage(
        SettlementRequest settlementRequest,
        DateTimeOffset now,
        out SettlementAllocationRuntimeResult result)
    {
        result = default;

        if (!TryComputeActiveCoverage(settlementRequest, out var coverage))
        {
            return false;
        }

        ApplyLineCoverageStatuses(coverage.OrderedLines, coverage.LineCoverage, now);
        result = new SettlementAllocationRuntimeResult(
            coverage.ActivePaymentCoverage,
            coverage.ConfirmedPaymentCoverage);
        return true;
    }

    public static bool TryMarkSelectedLines(
        SettlementRequest settlementRequest,
        string status,
        DateTimeOffset now)
    {
        if (!TryGetValidOrderedLines(settlementRequest, out var lines))
        {
            return false;
        }

        foreach (var line in lines)
        {
            if (line.Status != status)
            {
                line.Status = status;
                line.UpdatedAtUtc = now;
            }
        }

        return true;
    }

    private static bool TryComputeActiveCoverage(
        SettlementRequest settlementRequest,
        out ActiveAllocationCoverage coverage)
    {
        coverage = null!;

        if (!TryGetValidOrderedLines(settlementRequest, out var orderedLines))
        {
            return false;
        }

        var lineIds = orderedLines
            .Select(line => line.Id)
            .ToHashSet();
        var lineCoverage = orderedLines.ToDictionary(
            line => line.Id,
            _ => 0m);
        var activePaymentCoverage = 0m;
        var confirmedPaymentCoverage = 0m;

        foreach (var payment in settlementRequest.Payments.Where(payment =>
            SettlementRuntimePolicy.IsActivePaymentStatus(payment.Status)))
        {
            if (!IsValidActivePayment(settlementRequest, payment))
            {
                return false;
            }

            var paymentAllocationTotal = 0m;
            var paymentAllocations = payment.Allocations.ToArray();
            if (paymentAllocations.Length == 0)
            {
                return false;
            }

            foreach (var allocation in paymentAllocations)
            {
                if (allocation.SettlementPaymentId != payment.Id
                    || !lineIds.Contains(allocation.SettlementRequestLineId)
                    || !SettlementRuntimePolicy.IsValidSettlementAmount(allocation.ClearedAmount)
                    || !string.Equals(allocation.Currency, settlementRequest.Currency, StringComparison.Ordinal)
                    || allocation.AllocationOrder < 0)
                {
                    return false;
                }

                paymentAllocationTotal += allocation.ClearedAmount;
                lineCoverage[allocation.SettlementRequestLineId] += allocation.ClearedAmount;
            }

            if (!SettlementResidualRuntime.IsValidAllocationTotalForActivePayment(
                    payment,
                    paymentAllocationTotal))
            {
                return false;
            }

            activePaymentCoverage += paymentAllocationTotal;
            if (payment.Status == SettlementPaymentStatuses.Confirmed)
            {
                confirmedPaymentCoverage += paymentAllocationTotal;
            }
        }

        if (activePaymentCoverage > settlementRequest.Amount
            || confirmedPaymentCoverage > settlementRequest.Amount
            || lineCoverage.Values.Sum() != activePaymentCoverage)
        {
            return false;
        }

        foreach (var line in orderedLines)
        {
            if (lineCoverage[line.Id] > line.ExactAmount)
            {
                return false;
            }
        }

        coverage = new ActiveAllocationCoverage(
            orderedLines,
            lineCoverage,
            activePaymentCoverage,
            confirmedPaymentCoverage);
        return true;
    }

    private static bool TryGetValidOrderedLines(
        SettlementRequest settlementRequest,
        out IReadOnlyList<SettlementRequestLine> orderedLines)
    {
        orderedLines = [];

        if (!SettlementRuntimePolicy.IsValidSettlementAmount(settlementRequest.Amount)
            || string.IsNullOrWhiteSpace(settlementRequest.Currency))
        {
            return false;
        }

        var lines = settlementRequest.Lines
            .OrderBy(line => line.AllocationOrder)
            .ThenBy(line => line.CreatedAtUtc)
            .ThenBy(line => line.Id)
            .ToArray();
        if (lines.Length == 0)
        {
            return false;
        }

        var selectedLineTotal = 0m;
        foreach (var line in lines)
        {
            if (!SettlementRuntimePolicy.IsValidSettlementAmount(line.ExactAmount)
                || !string.Equals(line.Currency, settlementRequest.Currency, StringComparison.Ordinal)
                || line.AllocationOrder < 0
                || !SettlementRequestLineStatuses.IsSupported(line.Status))
            {
                return false;
            }

            selectedLineTotal += line.ExactAmount;
        }

        if (selectedLineTotal != settlementRequest.Amount)
        {
            return false;
        }

        orderedLines = lines;
        return true;
    }

    private static bool IsValidActivePayment(
        SettlementRequest settlementRequest,
        SettlementPayment payment)
    {
        return SettlementRuntimePolicy.IsValidSettlementAmount(payment.Amount)
            && SettlementPaymentStatuses.IsSupported(payment.Status)
            && payment.PaidByUserProfileId == settlementRequest.DebtorUserProfileId
            && payment.ReceivedByUserProfileId == settlementRequest.CreditorUserProfileId
            && string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal);
    }

    private static bool CanReceivePaymentAllocation(string lineStatus)
    {
        return lineStatus is SettlementRequestLineStatuses.Open
            or SettlementRequestLineStatuses.PartiallyCleared
            or SettlementRequestLineStatuses.Cleared;
    }

    private static void ApplyLineCoverageStatuses(
        IReadOnlyList<SettlementRequestLine> lines,
        IReadOnlyDictionary<Guid, decimal> lineCoverage,
        DateTimeOffset now)
    {
        foreach (var line in lines)
        {
            var clearedAmount = lineCoverage[line.Id];
            var newStatus = clearedAmount == 0m
                ? SettlementRequestLineStatuses.Open
                : clearedAmount == line.ExactAmount
                    ? SettlementRequestLineStatuses.Cleared
                    : SettlementRequestLineStatuses.PartiallyCleared;

            if (line.Status != newStatus)
            {
                line.Status = newStatus;
                line.UpdatedAtUtc = now;
            }
        }
    }

    private sealed record ActiveAllocationCoverage(
        IReadOnlyList<SettlementRequestLine> OrderedLines,
        IReadOnlyDictionary<Guid, decimal> LineCoverage,
        decimal ActivePaymentCoverage,
        decimal ConfirmedPaymentCoverage);
}

internal readonly record struct SettlementAllocationRuntimeResult(
    decimal ActivePaymentCoverage,
    decimal ConfirmedPaymentCoverage);
