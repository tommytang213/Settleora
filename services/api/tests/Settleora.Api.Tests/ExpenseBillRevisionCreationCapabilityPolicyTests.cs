using Settleora.Api.Domain.Expenses;
using Settleora.Api.Expenses.BillRevisions;

namespace Settleora.Api.Tests;

public sealed class ExpenseBillRevisionCreationCapabilityPolicyTests
{
    private static readonly DateTimeOffset CreatedAtUtc = new(2026, 5, 22, 4, 0, 0, TimeSpan.Zero);

    [Fact]
    public void CanCreateRevisionMirrorsCreateRulesForStateParticipantAndPendingRevision()
    {
        var actorUserProfileId = Guid.NewGuid();
        var bill = CreateBill(actorUserProfileId, ExpenseBillStatuses.Confirmed);

        Assert.True(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.Status = ExpenseBillStatuses.Rejected;
        Assert.True(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.Status = ExpenseBillStatuses.Draft;
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.Status = ExpenseBillStatuses.PendingConfirmation;
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.Status = ExpenseBillStatuses.Finalized;
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.Status = ExpenseBillStatuses.Archived;
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.Status = "unsupported_bill_state";
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.Status = ExpenseBillStatuses.Confirmed;
        bill.ArchivedAtUtc = CreatedAtUtc;
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        bill.ArchivedAtUtc = null;
        bill.Revisions.Add(new ExpenseBillRevision
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = bill.Id,
            ProposalCreatorUserProfileId = actorUserProfileId,
            Status = ExpenseBillRevisionStatuses.SubmittedForReview,
            TotalAmount = bill.TotalAmount,
            TotalCurrency = bill.TotalCurrency,
            CalculationHash = new string('a', 64),
            CreatedAtUtc = CreatedAtUtc,
            UpdatedAtUtc = CreatedAtUtc
        });
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(bill, actorUserProfileId));

        var unrelatedUserProfileId = Guid.NewGuid();
        var unrelatedBill = CreateBill(actorUserProfileId, ExpenseBillStatuses.Confirmed);
        Assert.False(ExpenseBillRevisionCreationCapabilityPolicy.CanCreateRevision(unrelatedBill, unrelatedUserProfileId));
    }

    [Fact]
    public void BuildReturnsServerComputedCreateActionResponse()
    {
        var actorUserProfileId = Guid.NewGuid();
        var bill = CreateBill(actorUserProfileId, ExpenseBillStatuses.Confirmed);

        var actions = ExpenseBillRevisionCreationCapabilityPolicy.Build(bill, actorUserProfileId);

        Assert.True(actions.CanCreateRevision);
    }

    private static ExpenseBill CreateBill(Guid actorUserProfileId, string status)
    {
        var billId = Guid.NewGuid();
        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = actorUserProfileId,
            BillOwnerUserProfileId = actorUserProfileId,
            Status = status,
            TotalAmount = 10m,
            TotalCurrency = "USD",
            BillDate = DateOnly.FromDateTime(CreatedAtUtc.UtcDateTime),
            CreatedAtUtc = CreatedAtUtc,
            UpdatedAtUtc = CreatedAtUtc
        };

        bill.Participants.Add(new ExpenseBillParticipant
        {
            ExpenseBillId = billId,
            UserProfileId = actorUserProfileId,
            Status = ExpenseBillParticipantStatuses.Accepted,
            ResolvedShareAmount = 10m,
            ResolvedShareCurrency = "USD",
            CreatedAtUtc = CreatedAtUtc,
            UpdatedAtUtc = CreatedAtUtc
        });
        bill.Payers.Add(new ExpenseBillPayer
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            UserProfileId = actorUserProfileId,
            Amount = 10m,
            Currency = "USD",
            PayerConfirmationStatus = ExpenseBillPayerConfirmationStatuses.Confirmed,
            CreatedAtUtc = CreatedAtUtc,
            UpdatedAtUtc = CreatedAtUtc
        });

        return bill;
    }
}
