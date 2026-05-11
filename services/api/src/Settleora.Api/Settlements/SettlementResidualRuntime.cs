using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal static class SettlementResidualRuntime
{
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

    public static bool TryGetReceiverConfirmedStatusForPendingResidual(
        SettlementPayment payment,
        SettlementResidual residual,
        out string receiverConfirmedStatus)
    {
        receiverConfirmedStatus = string.Empty;

        return IsSafeResidualSummary(payment, residual)
            && IsPendingResidual(residual)
            && SettlementResidualPolicyService.TryGetReceiverConfirmedStatus(
                residual.Direction,
                residual.Policy,
                out receiverConfirmedStatus);
    }

    public static bool CanConfirmPaymentWithResiduals(SettlementPayment payment)
    {
        return payment.Residuals.All(residual =>
            IsSafeResidualSummary(payment, residual)
            && residual.ResolvedAtUtc is not null
            && SettlementResidualPolicyService.IsReceiverConfirmedStatus(
                residual.Direction,
                residual.Policy,
                residual.Status));
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
            IsRecognizedOverpaymentResidualForPayment(payment, residual, overpaymentAmount)) == 1;
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

    private static bool IsRecognizedOverpaymentResidualForPayment(
        SettlementPayment payment,
        SettlementResidual residual,
        decimal overpaymentAmount)
    {
        return IsPendingOverpaymentResidualForPayment(payment, residual, overpaymentAmount)
            || IsReceiverConfirmedOverpaymentResidualForPayment(payment, residual, overpaymentAmount);
    }

    private static bool IsReceiverConfirmedOverpaymentResidualForPayment(
        SettlementPayment payment,
        SettlementResidual residual,
        decimal overpaymentAmount)
    {
        return IsSafeResidualSummary(payment, residual)
            && residual.ResolvedAtUtc is not null
            && residual.Direction == SettlementResidualDirections.Overpayment
            && residual.Amount == overpaymentAmount
            && SettlementResidualPolicyService.IsReceiverConfirmedStatus(
                residual.Direction,
                residual.Policy,
                residual.Status);
    }
}
