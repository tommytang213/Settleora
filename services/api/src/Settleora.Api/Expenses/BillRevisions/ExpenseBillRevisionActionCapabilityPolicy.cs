using Settleora.Api.Domain.Expenses;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillRevisions;

internal static class ExpenseBillRevisionActionCapabilityPolicy
{
    public static async Task<ExpenseBillRevisionViewerActionsResponse> BuildAsync(
        SettleoraDbContext dbContext,
        ExpenseBillRevisionSettlementApplyPolicy settlementApplyPolicy,
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid viewerUserProfileId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(settlementApplyPolicy);
        ArgumentNullException.ThrowIfNull(bill);
        ArgumentNullException.ThrowIfNull(revision);

        var canSubmit = CanSubmit(revision, viewerUserProfileId);
        var canWithdraw = CanWithdraw(revision, viewerUserProfileId);
        var canRevise = CanRevise(bill, revision, viewerUserProfileId);
        var canApprove = CanApprove(revision, viewerUserProfileId);
        var canReject = CanReject(bill, revision, viewerUserProfileId);
        var canConfirmPayer = CanConfirmPayer(revision, viewerUserProfileId);
        var canApply = false;

        if (ExpenseBillRevisionProposalService.CanApplyProposal(bill, revision, viewerUserProfileId))
        {
            var settlementDecision = await settlementApplyPolicy.ClassifySettlementStateAsync(
                dbContext,
                bill,
                revision,
                cancellationToken);
            canApply = settlementDecision.CanApply;
        }

        return new ExpenseBillRevisionViewerActionsResponse(
            canSubmit,
            canWithdraw,
            canRevise,
            canApprove,
            canReject,
            canConfirmPayer,
            canApply);
    }

    private static bool CanSubmit(ExpenseBillRevision revision, Guid viewerUserProfileId)
    {
        return revision.ProposalCreatorUserProfileId == viewerUserProfileId
            && revision.Status == ExpenseBillRevisionStatuses.DraftRevision;
    }

    private static bool CanWithdraw(ExpenseBillRevision revision, Guid viewerUserProfileId)
    {
        return revision.ProposalCreatorUserProfileId == viewerUserProfileId
            && ExpenseBillRevisionStatuses.IsActivePending(revision.Status);
    }

    private static bool CanRevise(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid viewerUserProfileId)
    {
        return ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevisionForBillState(bill)
            && revision.ProposalCreatorUserProfileId == viewerUserProfileId
            && ExpenseBillRevisionStatuses.IsActivePending(revision.Status);
    }

    private static bool CanApprove(ExpenseBillRevision revision, Guid viewerUserProfileId)
    {
        if (revision.Status != ExpenseBillRevisionStatuses.SubmittedForReview)
        {
            return false;
        }

        var approval = revision.Approvals.SingleOrDefault(candidate =>
            candidate.ParticipantUserProfileId == viewerUserProfileId);

        return approval is not null
            && approval.Status == ExpenseBillRevisionApprovalStatuses.PendingReview
            && StringComparer.Ordinal.Equals(approval.CalculationHash, revision.CalculationHash);
    }

    private static bool CanReject(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid viewerUserProfileId)
    {
        return revision.Status == ExpenseBillRevisionStatuses.SubmittedForReview
            && ExpenseBillRevisionProposalService.IsBillParticipant(bill, viewerUserProfileId);
    }

    private static bool CanConfirmPayer(ExpenseBillRevision revision, Guid viewerUserProfileId)
    {
        if (revision.Status != ExpenseBillRevisionStatuses.SubmittedForReview
            || string.IsNullOrWhiteSpace(revision.CalculationHash))
        {
            return false;
        }

        var payer = revision.Payers.SingleOrDefault(candidate =>
            candidate.UserProfileId == viewerUserProfileId);

        return payer is not null
            && payer.RequiresPayerConfirmation
            && payer.PayerConfirmationStatus == ExpenseBillPayerConfirmationStatuses.PendingConfirmation;
    }

}
