using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Expenses.BillRevisions;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class ExpenseBillRevisionSettlementApplyPolicyTests
{
    private static readonly DateTimeOffset Timestamp = new(2026, 5, 20, 1, 22, 0, TimeSpan.Zero);

    private readonly ExpenseBillRevisionSettlementApplyPolicy policy = new();

    [Fact]
    public async Task ClassifiesBillWithoutSettlementStateAsApplyable()
    {
        await using var dbContext = CreateDbContext();
        var (bill, revision) = CreateBillAndRevision();

        var decision = await policy.ClassifySettlementStateAsync(dbContext, bill, revision, CancellationToken.None);

        Assert.True(decision.CanApply);
        Assert.Equal(ExpenseBillRevisionSettlementState.NoSettlementState, decision.State);
        Assert.Null(decision.ConflictDetail);
    }

    [Fact]
    public async Task ClassifiesRequestedOpenSettlementRequestWithoutProgressAsPendingRequestedOnly()
    {
        await using var dbContext = CreateDbContext();
        var (bill, revision) = CreateBillAndRevision();
        var settlementRequest = CreateRequestedSettlementRequest(bill.Id, revision.Id);
        dbContext.Set<SettlementRequest>().Add(settlementRequest);
        await dbContext.SaveChangesAsync();
        dbContext.ChangeTracker.Clear();

        var decision = await policy.ClassifySettlementStateAsync(dbContext, bill, revision, CancellationToken.None);

        Assert.False(decision.CanApply);
        Assert.Equal(ExpenseBillRevisionSettlementState.PendingRequestedOnlySettlementState, decision.State);
        Assert.Equal(
            ExpenseBillRevisionSettlementApplyPolicy.PendingRequestedOnlyConflictDetail,
            decision.ConflictDetail);
    }

    [Theory]
    [InlineData("partially_paid_request")]
    [InlineData("marked_paid_request")]
    [InlineData("confirmed_request")]
    [InlineData("disputed_request")]
    [InlineData("cancelled_request")]
    [InlineData("non_open_line")]
    [InlineData("payment")]
    [InlineData("confirmed_payment")]
    [InlineData("disputed_payment")]
    [InlineData("cancelled_payment")]
    [InlineData("allocation")]
    [InlineData("proof")]
    [InlineData("request_residual")]
    [InlineData("payment_residual")]
    [InlineData("participant_settled")]
    public async Task ClassifiesProgressedSettlementSignalsAsProgressed(string signal)
    {
        await using var dbContext = CreateDbContext();
        var (bill, revision) = CreateBillAndRevision();

        if (signal == "participant_settled")
        {
            bill.Participants.First().SettledAtUtc = Timestamp;
        }
        else
        {
            var settlementRequest = CreateRequestedSettlementRequest(bill.Id, revision.Id);
            ApplyProgressedSignal(settlementRequest, signal);
            dbContext.Set<SettlementRequest>().Add(settlementRequest);
            await dbContext.SaveChangesAsync();
            dbContext.ChangeTracker.Clear();
        }

        var decision = await policy.ClassifySettlementStateAsync(dbContext, bill, revision, CancellationToken.None);

        Assert.False(decision.CanApply);
        Assert.Equal(ExpenseBillRevisionSettlementState.ProgressedSettlementState, decision.State);
        Assert.Equal(
            ExpenseBillRevisionSettlementApplyPolicy.ProgressedSettlementConflictDetail,
            decision.ConflictDetail);
    }

    [Fact]
    public async Task ClassifiesUnsupportedSettlementStatusAsUnknown()
    {
        await using var dbContext = CreateDbContext();
        var (bill, revision) = CreateBillAndRevision();
        var settlementRequest = CreateRequestedSettlementRequest(bill.Id, revision.Id);
        settlementRequest.Status = "unsupported_status";
        dbContext.Set<SettlementRequest>().Add(settlementRequest);
        await dbContext.SaveChangesAsync();
        dbContext.ChangeTracker.Clear();

        var decision = await policy.ClassifySettlementStateAsync(dbContext, bill, revision, CancellationToken.None);

        Assert.False(decision.CanApply);
        Assert.Equal(ExpenseBillRevisionSettlementState.UnsupportedUnknownState, decision.State);
        Assert.Equal(
            ExpenseBillRevisionSettlementApplyPolicy.UnsupportedSettlementConflictDetail,
            decision.ConflictDetail);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new SettleoraDbContext(options);
    }

    private static (ExpenseBill Bill, ExpenseBillRevision Revision) CreateBillAndRevision()
    {
        var bill = new ExpenseBill
        {
            Id = StableGuid(1),
            CreatedByUserProfileId = StableGuid(10),
            BillOwnerUserProfileId = StableGuid(10),
            Status = ExpenseBillStatuses.Confirmed,
            TotalAmount = 100m,
            TotalCurrency = "USD",
            CreatedAtUtc = Timestamp,
            UpdatedAtUtc = Timestamp
        };
        bill.Participants.Add(new ExpenseBillParticipant
        {
            ExpenseBillId = bill.Id,
            UserProfileId = StableGuid(10),
            Status = ExpenseBillParticipantStatuses.Accepted,
            ResolvedShareAmount = 50m,
            ResolvedShareCurrency = "USD",
            AcceptedAtUtc = Timestamp,
            CreatedAtUtc = Timestamp,
            UpdatedAtUtc = Timestamp
        });
        bill.Participants.Add(new ExpenseBillParticipant
        {
            ExpenseBillId = bill.Id,
            UserProfileId = StableGuid(11),
            Status = ExpenseBillParticipantStatuses.Accepted,
            ResolvedShareAmount = 50m,
            ResolvedShareCurrency = "USD",
            AcceptedAtUtc = Timestamp,
            CreatedAtUtc = Timestamp,
            UpdatedAtUtc = Timestamp
        });

        var revision = new ExpenseBillRevision
        {
            Id = StableGuid(2),
            ExpenseBillId = bill.Id,
            ProposalCreatorUserProfileId = StableGuid(10),
            Status = ExpenseBillRevisionStatuses.SubmittedForReview,
            TotalAmount = 100m,
            TotalCurrency = "USD",
            CalculationHash = new string('a', 64),
            CreatedAtUtc = Timestamp,
            UpdatedAtUtc = Timestamp
        };
        bill.Revisions.Add(revision);

        return (bill, revision);
    }

    private static SettlementRequest CreateRequestedSettlementRequest(
        Guid billId,
        Guid revisionId)
    {
        var settlementRequest = new SettlementRequest
        {
            Id = StableGuid(20),
            SourceExpenseBillId = billId,
            DebtorUserProfileId = StableGuid(11),
            CreditorUserProfileId = StableGuid(10),
            Amount = 50m,
            Currency = "USD",
            Status = SettlementRequestStatuses.Requested,
            RequestedByUserProfileId = StableGuid(11),
            RequestedAtUtc = Timestamp,
            CreatedAtUtc = Timestamp,
            UpdatedAtUtc = Timestamp
        };
        settlementRequest.Lines.Add(new SettlementRequestLine
        {
            Id = StableGuid(21),
            SettlementRequestId = settlementRequest.Id,
            SourceExpenseBillId = billId,
            SourceBillRevisionId = revisionId,
            SourceCandidateKey = "policy-test-candidate",
            ExactAmount = 50m,
            Currency = "USD",
            AllocationOrder = 0,
            Status = SettlementRequestLineStatuses.Open,
            CreatedAtUtc = Timestamp,
            UpdatedAtUtc = Timestamp
        });

        return settlementRequest;
    }

    private static void ApplyProgressedSignal(
        SettlementRequest settlementRequest,
        string signal)
    {
        switch (signal)
        {
            case "partially_paid_request":
                settlementRequest.Status = SettlementRequestStatuses.PartiallyPaid;
                break;
            case "marked_paid_request":
                settlementRequest.Status = SettlementRequestStatuses.MarkedPaid;
                break;
            case "confirmed_request":
                settlementRequest.Status = SettlementRequestStatuses.Confirmed;
                settlementRequest.ConfirmedAtUtc = Timestamp;
                break;
            case "disputed_request":
                settlementRequest.Status = SettlementRequestStatuses.Disputed;
                settlementRequest.DisputedAtUtc = Timestamp;
                break;
            case "cancelled_request":
                settlementRequest.Status = SettlementRequestStatuses.Cancelled;
                settlementRequest.CancelledAtUtc = Timestamp;
                break;
            case "non_open_line":
                settlementRequest.Lines.Single().Status = SettlementRequestLineStatuses.PartiallyCleared;
                break;
            case "payment":
                settlementRequest.Payments.Add(CreateSettlementPayment(settlementRequest.Id));
                break;
            case "confirmed_payment":
                var confirmedPayment = CreateSettlementPayment(settlementRequest.Id);
                confirmedPayment.Status = SettlementPaymentStatuses.Confirmed;
                confirmedPayment.ConfirmedAtUtc = Timestamp;
                settlementRequest.Payments.Add(confirmedPayment);
                break;
            case "disputed_payment":
                var disputedPayment = CreateSettlementPayment(settlementRequest.Id);
                disputedPayment.Status = SettlementPaymentStatuses.Disputed;
                disputedPayment.DisputedAtUtc = Timestamp;
                settlementRequest.Payments.Add(disputedPayment);
                break;
            case "cancelled_payment":
                var cancelledPayment = CreateSettlementPayment(settlementRequest.Id);
                cancelledPayment.Status = SettlementPaymentStatuses.Cancelled;
                cancelledPayment.CancelledAtUtc = Timestamp;
                settlementRequest.Payments.Add(cancelledPayment);
                break;
            case "allocation":
                var allocatedPayment = CreateSettlementPayment(settlementRequest.Id);
                allocatedPayment.Allocations.Add(CreatePaymentAllocation(
                    allocatedPayment.Id,
                    settlementRequest.Lines.Single().Id));
                settlementRequest.Payments.Add(allocatedPayment);
                break;
            case "proof":
                var proofPayment = CreateSettlementPayment(settlementRequest.Id);
                proofPayment.ProofAttachments.Add(new SettlementProofAttachment
                {
                    SettlementPaymentId = proofPayment.Id,
                    FileObjectId = StableGuid(24),
                    CreatedByUserProfileId = StableGuid(11),
                    CreatedAtUtc = Timestamp
                });
                settlementRequest.Payments.Add(proofPayment);
                break;
            case "request_residual":
                settlementRequest.Residuals.Add(CreateResidual(settlementRequest.Id, settlementPaymentId: null));
                break;
            case "payment_residual":
                var residualPayment = CreateSettlementPayment(settlementRequest.Id);
                residualPayment.Residuals.Add(CreateResidual(settlementRequest.Id, residualPayment.Id));
                settlementRequest.Payments.Add(residualPayment);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(signal), signal, "Unsupported progressed settlement signal.");
        }
    }

    private static SettlementPayment CreateSettlementPayment(Guid settlementRequestId)
    {
        return new SettlementPayment
        {
            Id = StableGuid(22),
            SettlementRequestId = settlementRequestId,
            PaidByUserProfileId = StableGuid(11),
            ReceivedByUserProfileId = StableGuid(10),
            Amount = 25m,
            Currency = "USD",
            Status = SettlementPaymentStatuses.MarkedPaid,
            PaymentDate = DateOnly.FromDateTime(Timestamp.UtcDateTime),
            CreatedByUserProfileId = StableGuid(11),
            ClaimedAtUtc = Timestamp,
            CreatedAtUtc = Timestamp,
            UpdatedAtUtc = Timestamp
        };
    }

    private static SettlementPaymentAllocation CreatePaymentAllocation(
        Guid settlementPaymentId,
        Guid settlementRequestLineId)
    {
        return new SettlementPaymentAllocation
        {
            Id = StableGuid(23),
            SettlementPaymentId = settlementPaymentId,
            SettlementRequestLineId = settlementRequestLineId,
            ClearedAmount = 25m,
            Currency = "USD",
            AllocationOrder = 0,
            CreatedAtUtc = Timestamp
        };
    }

    private static SettlementResidual CreateResidual(
        Guid settlementRequestId,
        Guid? settlementPaymentId)
    {
        return new SettlementResidual
        {
            Id = StableGuid(settlementPaymentId.HasValue ? 26 : 25),
            SettlementRequestId = settlementRequestId,
            SettlementPaymentId = settlementPaymentId,
            DebtorUserProfileId = StableGuid(11),
            CreditorUserProfileId = StableGuid(10),
            Direction = SettlementResidualDirections.Underpayment,
            Amount = 25m,
            Currency = "USD",
            Policy = SettlementResidualPolicies.RemainingBalance,
            Status = SettlementResidualStatuses.PendingReceiverConfirmation,
            CreatedAtUtc = Timestamp
        };
    }

    private static Guid StableGuid(int value)
    {
        return new Guid($"00000000-0000-0000-0000-{value:000000000000}");
    }
}
