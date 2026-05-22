using Settleora.Api.Domain.Expenses;

namespace Settleora.Api.Expenses.BillRevisions;

internal static class ExpenseBillRevisionCreationCapabilityPolicy
{
    public static BillRevisionCreationActionsResponse Build(
        ExpenseBill bill,
        Guid viewerUserProfileId)
    {
        ArgumentNullException.ThrowIfNull(bill);

        return new BillRevisionCreationActionsResponse(
            CanCreateRevision(bill, viewerUserProfileId));
    }

    public static bool CanCreateRevision(
        ExpenseBill bill,
        Guid actorUserProfileId)
    {
        ArgumentNullException.ThrowIfNull(bill);

        return bill.ArchivedAtUtc is null
            && CanCreateRevisionForBillState(bill)
            && ExpenseBillRevisionProposalService.IsBillParticipant(bill, actorUserProfileId)
            && !bill.Revisions.Any(revision => ExpenseBillRevisionStatuses.IsActivePending(revision.Status));
    }

    public static bool CanCreateRevisionForBillState(ExpenseBill bill)
    {
        ArgumentNullException.ThrowIfNull(bill);

        return bill.Status is ExpenseBillStatuses.Confirmed or ExpenseBillStatuses.Rejected;
    }
}

internal sealed record BillRevisionCreationActionsResponse(
    bool CanCreateRevision);
