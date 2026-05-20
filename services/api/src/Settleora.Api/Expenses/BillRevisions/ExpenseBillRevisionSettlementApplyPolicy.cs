using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillRevisions;

internal sealed class ExpenseBillRevisionSettlementApplyPolicy
{
    public const string PendingRequestedOnlyConflictDetail =
        "The bill revision cannot be applied because unpaid requested settlement state exists and bill-revision-owned settlement invalidation is not implemented yet.";

    public const string ProgressedSettlementConflictDetail =
        "The bill revision cannot be applied because settlement/payment history has progressed and automatic settlement adjustment or reopen policy is not implemented yet.";

    public const string UnsupportedSettlementConflictDetail =
        "The bill revision cannot be applied because existing settlement state cannot be classified safely.";

    public async Task<ExpenseBillRevisionSettlementApplyDecision> ClassifySettlementStateAsync(
        SettleoraDbContext dbContext,
        ExpenseBill bill,
        ExpenseBillRevision revision,
        CancellationToken cancellationToken)
    {
        if (bill.Participants.Any(participant => participant.SettledAtUtc is not null))
        {
            return ExpenseBillRevisionSettlementApplyDecision.Blocked(
                ExpenseBillRevisionSettlementState.ProgressedSettlementState,
                ProgressedSettlementConflictDetail);
        }

        var billId = bill.Id;
        var revisionId = revision.Id;
        var settlementRequests = await dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .Include(settlementRequest => settlementRequest.Lines)
            .Include(settlementRequest => settlementRequest.Payments)
                .ThenInclude(payment => payment.Allocations)
            .Include(settlementRequest => settlementRequest.Payments)
                .ThenInclude(payment => payment.ProofAttachments)
            .Include(settlementRequest => settlementRequest.Payments)
                .ThenInclude(payment => payment.Residuals)
            .Include(settlementRequest => settlementRequest.Residuals)
            .Where(settlementRequest => settlementRequest.SourceExpenseBillId == billId
                || settlementRequest.Lines.Any(line =>
                    line.SourceExpenseBillId == billId
                    || line.SourceBillRevisionId == revisionId))
            .ToArrayAsync(cancellationToken);

        if (settlementRequests.Length == 0)
        {
            return ExpenseBillRevisionSettlementApplyDecision.Allowed(
                ExpenseBillRevisionSettlementState.NoSettlementState);
        }

        if (settlementRequests.Any(HasUnsupportedState))
        {
            return ExpenseBillRevisionSettlementApplyDecision.Blocked(
                ExpenseBillRevisionSettlementState.UnsupportedUnknownState,
                UnsupportedSettlementConflictDetail);
        }

        if (settlementRequests.Any(HasProgressedState))
        {
            return ExpenseBillRevisionSettlementApplyDecision.Blocked(
                ExpenseBillRevisionSettlementState.ProgressedSettlementState,
                ProgressedSettlementConflictDetail);
        }

        if (settlementRequests.All(IsPendingRequestedOnlyState))
        {
            return ExpenseBillRevisionSettlementApplyDecision.Blocked(
                ExpenseBillRevisionSettlementState.PendingRequestedOnlySettlementState,
                PendingRequestedOnlyConflictDetail);
        }

        return ExpenseBillRevisionSettlementApplyDecision.Blocked(
            ExpenseBillRevisionSettlementState.UnsupportedUnknownState,
            UnsupportedSettlementConflictDetail);
    }

    private static bool HasUnsupportedState(SettlementRequest settlementRequest)
    {
        return !SettlementRequestStatuses.IsSupported(settlementRequest.Status)
            || settlementRequest.Lines.Any(line => !SettlementRequestLineStatuses.IsSupported(line.Status))
            || settlementRequest.Payments.Any(payment => !SettlementPaymentStatuses.IsSupported(payment.Status))
            || settlementRequest.Residuals.Any(residual => !SettlementResidualStatuses.IsSupported(residual.Status))
            || settlementRequest.Payments.Any(payment =>
                payment.Residuals.Any(residual => !SettlementResidualStatuses.IsSupported(residual.Status)));
    }

    private static bool HasProgressedState(SettlementRequest settlementRequest)
    {
        return settlementRequest.Status != SettlementRequestStatuses.Requested
            || settlementRequest.ConfirmedAtUtc is not null
            || settlementRequest.DisputedAtUtc is not null
            || settlementRequest.CancelledAtUtc is not null
            || settlementRequest.Lines.Any(line => line.Status != SettlementRequestLineStatuses.Open)
            || settlementRequest.Payments.Count > 0
            || settlementRequest.Residuals.Count > 0
            || settlementRequest.Payments.Any(payment =>
                payment.Allocations.Count > 0
                || payment.ProofAttachments.Count > 0
                || payment.Residuals.Count > 0);
    }

    private static bool IsPendingRequestedOnlyState(SettlementRequest settlementRequest)
    {
        return settlementRequest.Status == SettlementRequestStatuses.Requested
            && settlementRequest.ConfirmedAtUtc is null
            && settlementRequest.DisputedAtUtc is null
            && settlementRequest.CancelledAtUtc is null
            && settlementRequest.Lines.Count > 0
            && settlementRequest.Lines.All(line => line.Status == SettlementRequestLineStatuses.Open)
            && settlementRequest.Payments.Count == 0
            && settlementRequest.Residuals.Count == 0;
    }
}

internal enum ExpenseBillRevisionSettlementState
{
    NoSettlementState,
    PendingRequestedOnlySettlementState,
    ProgressedSettlementState,
    UnsupportedUnknownState
}

internal sealed record ExpenseBillRevisionSettlementApplyDecision(
    ExpenseBillRevisionSettlementState State,
    bool CanApply,
    string? ConflictDetail)
{
    public static ExpenseBillRevisionSettlementApplyDecision Allowed(
        ExpenseBillRevisionSettlementState state)
    {
        return new ExpenseBillRevisionSettlementApplyDecision(state, CanApply: true, ConflictDetail: null);
    }

    public static ExpenseBillRevisionSettlementApplyDecision Blocked(
        ExpenseBillRevisionSettlementState state,
        string conflictDetail)
    {
        return new ExpenseBillRevisionSettlementApplyDecision(state, CanApply: false, conflictDetail);
    }
}
