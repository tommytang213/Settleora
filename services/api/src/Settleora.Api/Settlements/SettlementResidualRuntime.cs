using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal static class SettlementResidualRuntime
{
    public static bool HasPendingResidual(SettlementPayment payment)
    {
        return payment.Residuals.Any(IsPendingResidual);
    }

    public static bool IsPendingResidual(SettlementResidual residual)
    {
        return residual.Status == SettlementResidualStatuses.PendingReceiverConfirmation
            && residual.ResolvedAtUtc is null;
    }

    public static void ResolvePendingResiduals(
        IEnumerable<SettlementResidual> residuals,
        string status,
        DateTimeOffset resolvedAtUtc)
    {
        foreach (var residual in residuals.Where(IsPendingResidual))
        {
            residual.Status = status;
            residual.ResolvedAtUtc = resolvedAtUtc;
        }
    }

    public static bool IsValidAllocationTotalForActivePayment(
        SettlementPayment payment,
        decimal paymentAllocationTotal)
    {
        if (paymentAllocationTotal == payment.Amount)
        {
            return true;
        }

        if (paymentAllocationTotal <= 0m || paymentAllocationTotal > payment.Amount)
        {
            return false;
        }

        var overpaymentAmount = payment.Amount - paymentAllocationTotal;
        return payment.Residuals.Count(residual =>
            IsPendingOverpaymentResidualForPayment(payment, residual, overpaymentAmount)) == 1;
    }

    public static bool IsSafeResidualSummary(
        SettlementPayment payment,
        SettlementResidual residual)
    {
        return residual.SettlementPaymentId == payment.Id
            && residual.SettlementRequestId == payment.SettlementRequestId
            && residual.DebtorUserProfileId == payment.PaidByUserProfileId
            && residual.CreditorUserProfileId == payment.ReceivedByUserProfileId
            && SettlementResidualDirections.IsSupported(residual.Direction)
            && SettlementResidualPolicies.IsSupported(residual.Policy)
            && SettlementResidualStatuses.IsSupported(residual.Status)
            && SettlementRuntimePolicy.IsValidSettlementAmount(residual.Amount)
            && string.Equals(residual.Currency, payment.Currency, StringComparison.Ordinal);
    }

    private static bool IsPendingOverpaymentResidualForPayment(
        SettlementPayment payment,
        SettlementResidual residual,
        decimal overpaymentAmount)
    {
        return IsSafeResidualSummary(payment, residual)
            && IsPendingResidual(residual)
            && residual.Direction == SettlementResidualDirections.Overpayment
            && residual.Amount == overpaymentAmount
            && (residual.Policy == SettlementResidualPolicies.CreditForward
                || residual.Policy == SettlementResidualPolicies.WaivedByPayer);
    }
}
