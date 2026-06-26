using Settleora.Api.Domain.Expenses;
using System.Text.Json;

namespace Settleora.Api.Tests;

public sealed class ExpenseBillRevisionProposalServiceTests
{
    private static readonly Guid Creator = StableGuid(1);
    private static readonly Guid ParticipantOne = StableGuid(2);
    private static readonly Guid ParticipantTwo = StableGuid(3);
    private static readonly Guid ParticipantThree = StableGuid(4);
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 10, 1, 0, 0, TimeSpan.Zero);

    private readonly ExpenseBillRevisionProposalService service = new();

    [Fact]
    public void PayerConfirmationPolicyRepresentsThirdPartyPaidByFactsWithoutAutoConfirming()
    {
        var payer = new ExpenseBillPayer
        {
            UserProfileId = ParticipantOne,
            Amount = 100m,
            Currency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        };

        ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(payer, Creator, InitialTimestamp);

        Assert.Equal(Creator, payer.PayerFactsCreatedByUserProfileId);
        Assert.Equal(ExpenseBillPayerConfirmationStatuses.PendingConfirmation, payer.PayerConfirmationStatus);
        Assert.Null(payer.PayerConfirmedAtUtc);
        Assert.Null(payer.PayerRejectedAtUtc);

        var selfPaidPayer = new ExpenseBillPayer
        {
            UserProfileId = Creator,
            Amount = 25m,
            Currency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        };

        ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(selfPaidPayer, Creator, InitialTimestamp);

        Assert.Equal(Creator, selfPaidPayer.PayerFactsCreatedByUserProfileId);
        Assert.Equal(ExpenseBillPayerConfirmationStatuses.Confirmed, selfPaidPayer.PayerConfirmationStatus);
        Assert.Equal(InitialTimestamp, selfPaidPayer.PayerConfirmedAtUtc);
    }

    [Fact]
    public void OneActivePendingOfficialRevisionIsAllowedPerBill()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 40m), (ParticipantOne, 60m)],
            [(Creator, 100m)]);

        var first = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp);
        var second = service.CreateDraftProposal(
            bill,
            ParticipantOne,
            active,
            candidate,
            InitialTimestamp.AddMinutes(1));

        Assert.True(first.Succeeded, first.FailureCode);
        Assert.Equal(ExpenseBillRevisionStatuses.DraftRevision, first.Revision!.Status);
        Assert.False(second.Succeeded);
        Assert.Equal("active_pending_revision_exists", second.FailureCode);
        Assert.Single(bill.Revisions);
    }

    [Fact]
    public void ProposerCanWithdrawPendingRevisionAndFreeTheActiveSlot()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 45m), (ParticipantOne, 55m)],
            [(Creator, 100m)]);
        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;

        var withdraw = service.WithdrawProposal(
            revision,
            Creator,
            InitialTimestamp.AddMinutes(5));
        var replacement = service.CreateDraftProposal(
            bill,
            ParticipantOne,
            active,
            candidate,
            InitialTimestamp.AddMinutes(6));

        Assert.True(withdraw.Succeeded, withdraw.FailureCode);
        Assert.Equal(ExpenseBillRevisionStatuses.WithdrawnByProposer, revision.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(5), revision.WithdrawnAtUtc);
        Assert.True(replacement.Succeeded, replacement.FailureCode);
        Assert.Equal(2, bill.Revisions.Count);
    }

    [Fact]
    public void RevisingAndResubmittingSupersedesPreviousProposalAndInvalidatesApprovals()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var firstCandidate = Snapshot(
            [(Creator, 40m), (ParticipantOne, 60m)],
            [(Creator, 100m)]);
        var firstRevision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            firstCandidate,
            InitialTimestamp).Revision!;
        service.SubmitProposal(firstRevision, Creator, InitialTimestamp.AddMinutes(1));
        var approval = Assert.Single(
            firstRevision.Approvals,
            candidate => candidate.ParticipantUserProfileId == ParticipantOne);
        Assert.True(service.RecordApproval(
            firstRevision,
            ParticipantOne,
            approval.AcceptedAmount,
            approval.Currency,
            approval.CalculationHash,
            InitialTimestamp.AddMinutes(2)).Succeeded);

        var secondCandidate = Snapshot(
            [(Creator, 45m), (ParticipantOne, 55m)],
            [(Creator, 100m)]);
        var result = service.ReviseAndResubmit(
            bill,
            firstRevision,
            Creator,
            active,
            secondCandidate,
            InitialTimestamp.AddMinutes(3));

        Assert.True(result.Succeeded, result.FailureCode);
        Assert.Equal(ExpenseBillRevisionStatuses.SupersededByResubmission, firstRevision.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(3), firstRevision.SupersededAtUtc);
        Assert.All(
            firstRevision.Approvals,
            previousApproval =>
            {
                Assert.Equal(ExpenseBillRevisionApprovalStatuses.InvalidatedBySupersession, previousApproval.Status);
                Assert.Equal(InitialTimestamp.AddMinutes(3), previousApproval.InvalidatedAtUtc);
            });
        Assert.False(service.ApplyProposal(bill, firstRevision, Creator, InitialTimestamp.AddMinutes(4)).Succeeded);

        var secondRevision = result.Revision!;
        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, secondRevision.Status);
        Assert.Equal(firstRevision.Id, secondRevision.SupersedesExpenseBillRevisionId);
        Assert.Equal(secondRevision.Id, firstRevision.SupersededByExpenseBillRevisionId);
        Assert.NotEqual(firstRevision.CalculationHash, secondRevision.CalculationHash);
        Assert.Equal(1, firstRevision.RevisionSequence);
        Assert.Equal(2, secondRevision.RevisionSequence);
    }

    [Fact]
    public void DraftProposalPreservesBaselineAndProposedSnapshotBasisWithVersions()
    {
        var attachmentFileId = StableGuid(41);
        var ocrReviewId = StableGuid(42);
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 40m), (ParticipantOne, 60m)],
            [(ParticipantOne, 100m)],
            [attachmentFileId],
            [ocrReviewId]);

        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;

        Assert.Equal(BillRevisionSnapshotPolicyVersions.SnapshotSchemaVersion, revision.SnapshotSchemaVersion);
        Assert.Equal(BillRevisionSnapshotPolicyVersions.MoneyPolicyVersion, revision.MoneyPolicyVersion);
        Assert.Equal(BillRevisionSnapshotPolicyVersions.RoundingPolicyVersion, revision.RoundingPolicyVersion);
        Assert.Equal(BillRevisionSnapshotFoundation.ComputeCalculationHash(revision.ProposedSnapshotJson), revision.CalculationHash);
        Assert.False(string.IsNullOrWhiteSpace(revision.AffectedUserSetHash));
        Assert.False(string.IsNullOrWhiteSpace(revision.PayerConfirmationBasisHash));
        Assert.Null(revision.UnsupportedDetailReason);

        using var baseline = JsonDocument.Parse(revision.BaselineSnapshotJson);
        using var proposed = JsonDocument.Parse(revision.ProposedSnapshotJson);
        Assert.Equal("baseline", baseline.RootElement.GetProperty("snapshotRole").GetString());
        Assert.Equal("proposed", proposed.RootElement.GetProperty("snapshotRole").GetString());
        Assert.Equal("100.0000", baseline.RootElement.GetProperty("totalAmount").GetString());
        Assert.Equal("100.0000", proposed.RootElement.GetProperty("totalAmount").GetString());
        Assert.Equal(attachmentFileId, proposed.RootElement.GetProperty("attachmentFileIds")[0].GetGuid());
        Assert.Equal(ocrReviewId, proposed.RootElement.GetProperty("receiptOcrReviewIds")[0].GetGuid());
        Assert.DoesNotContain("rawOcr", revision.ProposedSnapshotJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("objectKey", revision.ProposedSnapshotJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("signedUrl", revision.ProposedSnapshotJson, StringComparison.OrdinalIgnoreCase);

        using var affectedUsers = JsonDocument.Parse(revision.AffectedUserIdsJson);
        Assert.Equal(2, affectedUsers.RootElement.GetArrayLength());
        using var payerConfirmations = JsonDocument.Parse(revision.PayerConfirmationUserIdsJson);
        Assert.Equal(ParticipantOne, payerConfirmations.RootElement[0].GetGuid());
    }

    [Fact]
    public void UnsupportedSnapshotDetailFailsClosedWithoutCreatingRevision()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var unsupportedCandidate = Snapshot(
            [(Creator, 40m), (ParticipantOne, 60m)],
            [(Creator, 100m)],
            unsupportedDetailReason: "item_split_detail_unavailable");

        var result = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            unsupportedCandidate,
            InitialTimestamp);

        Assert.False(result.Succeeded);
        Assert.Equal("unsupported_revision_snapshot_detail", result.FailureCode);
        Assert.Empty(bill.Revisions);
    }

    [Fact]
    public void StaleOrTamperedSnapshotBasisBlocksApplyWithoutMutatingAcceptedTruth()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 40m), (ParticipantOne, 60m)],
            [(Creator, 100m)]);
        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;
        service.SubmitProposal(revision, Creator, InitialTimestamp.AddMinutes(1));
        foreach (var approval in revision.Approvals)
        {
            service.RecordApproval(
                revision,
                approval.ParticipantUserProfileId,
                approval.AcceptedAmount,
                approval.Currency,
                approval.CalculationHash,
                InitialTimestamp.AddMinutes(2));
        }

        var originalTotal = bill.TotalAmount;
        var originalActiveRevisionId = bill.ActiveAcceptedBillRevisionId;
        revision.ProposedSnapshotJson = revision.ProposedSnapshotJson.Replace("60.0000", "61.0000", StringComparison.Ordinal);

        var apply = service.ApplyProposal(
            bill,
            revision,
            Creator,
            InitialTimestamp.AddMinutes(3));

        Assert.False(apply.Succeeded);
        Assert.Equal("revision_apply_not_allowed", apply.FailureCode);
        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, revision.Status);
        Assert.Equal(originalTotal, bill.TotalAmount);
        Assert.Equal(originalActiveRevisionId, bill.ActiveAcceptedBillRevisionId);
        Assert.All(bill.Participants, participant => Assert.Equal(ExpenseBillParticipantStatuses.Accepted, participant.Status));
    }

    [Fact]
    public void PendingRevisionDoesNotMutateActiveAcceptedBillTruth()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var activeParticipantShares = bill.Participants
            .ToDictionary(participant => participant.UserProfileId, participant => participant.ResolvedShareAmount);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 25m), (ParticipantOne, 75m)],
            [(ParticipantOne, 100m)]);

        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;
        service.SubmitProposal(revision, Creator, InitialTimestamp.AddMinutes(1));

        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, revision.Status);
        Assert.Equal(100m, bill.TotalAmount);
        Assert.Null(bill.ActiveAcceptedBillRevisionId);
        Assert.All(
            bill.Participants,
            participant =>
            {
                Assert.Equal(activeParticipantShares[participant.UserProfileId], participant.ResolvedShareAmount);
                Assert.Equal(ExpenseBillParticipantStatuses.Accepted, participant.Status);
            });
        Assert.All(bill.Payers, payer => Assert.NotEqual(ParticipantOne, payer.UserProfileId));
    }

    [Fact]
    public void ApprovalIsBoundToRevisionAmountCurrencyAndCalculationHash()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 40m), (ParticipantOne, 60m)],
            [(Creator, 100m)]);
        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;
        service.SubmitProposal(revision, Creator, InitialTimestamp.AddMinutes(1));
        var creatorApproval = Assert.Single(
            revision.Approvals,
            approval => approval.ParticipantUserProfileId == Creator);

        var wrongAmount = service.RecordApproval(
            revision,
            Creator,
            acceptedAmount: 50m,
            creatorApproval.Currency,
            creatorApproval.CalculationHash,
            InitialTimestamp.AddMinutes(2));
        var wrongHash = service.RecordApproval(
            revision,
            Creator,
            creatorApproval.AcceptedAmount,
            creatorApproval.Currency,
            "not-the-current-calculation-hash",
            InitialTimestamp.AddMinutes(3));
        var correct = service.RecordApproval(
            revision,
            Creator,
            creatorApproval.AcceptedAmount,
            creatorApproval.Currency,
            creatorApproval.CalculationHash,
            InitialTimestamp.AddMinutes(4));

        Assert.False(wrongAmount.Succeeded);
        Assert.Equal("revision_approval_basis_mismatch", wrongAmount.FailureCode);
        Assert.False(wrongHash.Succeeded);
        Assert.Equal("revision_approval_basis_mismatch", wrongHash.FailureCode);
        Assert.True(correct.Succeeded, correct.FailureCode);
        Assert.Equal(ExpenseBillRevisionApprovalStatuses.Approved, creatorApproval.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(4), creatorApproval.ApprovedAtUtc);
    }

    [Fact]
    public void RequiredPayerCanConfirmOwnPendingPayerConfirmation()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(ParticipantOne, 100m)]);
        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;
        service.SubmitProposal(revision, Creator, InitialTimestamp.AddMinutes(1));
        var payer = Assert.Single(revision.Payers);

        var result = service.RecordPayerConfirmation(
            revision,
            ParticipantOne,
            revision.CalculationHash,
            InitialTimestamp.AddMinutes(2));

        Assert.True(result.Succeeded, result.FailureCode);
        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, revision.Status);
        Assert.True(payer.RequiresPayerConfirmation);
        Assert.Equal(ExpenseBillPayerConfirmationStatuses.Confirmed, payer.PayerConfirmationStatus);
        Assert.Equal(InitialTimestamp.AddMinutes(2), payer.UpdatedAtUtc);
        Assert.Null(revision.AppliedAtUtc);
        Assert.Null(bill.ActiveAcceptedBillRevisionId);
    }

    [Fact]
    public void PayerConfirmationRequiresSubmittedMatchingHashRequiredPendingPayer()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(ParticipantOne, 100m)]);
        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;

        Assert.Equal(
            "revision_payer_confirmation_basis_mismatch",
            service.RecordPayerConfirmation(
                revision,
                ParticipantOne,
                revision.CalculationHash,
                InitialTimestamp.AddMinutes(1)).FailureCode);

        service.SubmitProposal(revision, Creator, InitialTimestamp.AddMinutes(2));
        Assert.Equal(
            "revision_payer_confirmation_basis_mismatch",
            service.RecordPayerConfirmation(
                revision,
                ParticipantOne,
                new string('a', 64),
                InitialTimestamp.AddMinutes(3)).FailureCode);
        Assert.Equal(
            "revision_payer_confirmation_not_allowed",
            service.RecordPayerConfirmation(
                revision,
                Creator,
                revision.CalculationHash,
                InitialTimestamp.AddMinutes(4)).FailureCode);

        var selfPaidCandidate = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var selfPaidBill = CreateBill(Creator, ParticipantOne);
        var selfPaidRevision = service.CreateDraftProposal(
            selfPaidBill,
            Creator,
            active,
            selfPaidCandidate,
            InitialTimestamp.AddMinutes(5)).Revision!;
        service.SubmitProposal(selfPaidRevision, Creator, InitialTimestamp.AddMinutes(6));

        Assert.Equal(
            "revision_payer_confirmation_not_required",
            service.RecordPayerConfirmation(
                selfPaidRevision,
                Creator,
                selfPaidRevision.CalculationHash,
                InitialTimestamp.AddMinutes(7)).FailureCode);
    }

    [Fact]
    public void RejectedProposalApprovalDoesNotCarryToActiveAcceptedRevision()
    {
        var activeRevisionId = StableGuid(99);
        var bill = CreateBill(Creator, ParticipantOne);
        bill.ActiveAcceptedBillRevisionId = activeRevisionId;
        bill.Revisions.Add(new ExpenseBillRevision
        {
            Id = activeRevisionId,
            ExpenseBillId = bill.Id,
            ProposalCreatorUserProfileId = Creator,
            Status = ExpenseBillRevisionStatuses.AcceptedApplied,
            TotalAmount = 100m,
            TotalCurrency = "USD",
            CalculationHash = "existing-active-revision",
            CreatedAtUtc = InitialTimestamp.AddDays(-1),
            UpdatedAtUtc = InitialTimestamp.AddDays(-1),
            AppliedAtUtc = InitialTimestamp.AddDays(-1)
        });
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 50m), (ParticipantOne, 60m)],
            [(Creator, 110m)]);
        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;
        service.SubmitProposal(revision, Creator, InitialTimestamp.AddMinutes(1));
        var participantApproval = Assert.Single(
            revision.Approvals,
            approval => approval.ParticipantUserProfileId == ParticipantOne);
        Assert.True(service.RecordApproval(
            revision,
            ParticipantOne,
            participantApproval.AcceptedAmount,
            participantApproval.Currency,
            participantApproval.CalculationHash,
            InitialTimestamp.AddMinutes(2)).Succeeded);

        var reject = service.RejectProposal(
            revision,
            ParticipantOne,
            InitialTimestamp.AddMinutes(3));

        Assert.True(reject.Succeeded, reject.FailureCode);
        Assert.Equal(activeRevisionId, bill.ActiveAcceptedBillRevisionId);
        Assert.Null(revision.AppliedAtUtc);
        Assert.Equal(ExpenseBillRevisionStatuses.Rejected, revision.Status);
        Assert.Equal(ExpenseBillRevisionApprovalStatuses.Rejected, participantApproval.Status);
        Assert.False(service.ApplyProposal(bill, revision, Creator, InitialTimestamp.AddMinutes(4)).Succeeded);
        Assert.Equal(activeRevisionId, bill.ActiveAcceptedBillRevisionId);
    }

    [Fact]
    public void FinancialEditResetsAffectedParticipantsOnlyAndPreservesUnaffectedAcceptance()
    {
        var bill = CreateBill(Creator, ParticipantOne, ParticipantTwo);
        var active = Snapshot(
            [(Creator, 30m), (ParticipantOne, 30m), (ParticipantTwo, 40m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 20m), (ParticipantOne, 40m), (ParticipantTwo, 40m)],
            [(Creator, 100m)]);

        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;

        AssertApproval(revision, Creator, ExpenseBillRevisionApprovalStatuses.PendingReview, 20m);
        AssertApproval(revision, ParticipantOne, ExpenseBillRevisionApprovalStatuses.PendingReview, 40m);
        AssertApproval(revision, ParticipantTwo, ExpenseBillRevisionApprovalStatuses.Approved, 40m);
        AssertAffected(revision, Creator, expectedAffected: true);
        AssertAffected(revision, ParticipantOne, expectedAffected: true);
        AssertAffected(revision, ParticipantTwo, expectedAffected: false);
    }

    [Fact]
    public void PayerRoleChangeByAnotherUserRequiresPaidByReconfirmation()
    {
        var bill = CreateBill(Creator, ParticipantOne);
        var active = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(Creator, 100m)]);
        var candidate = Snapshot(
            [(Creator, 50m), (ParticipantOne, 50m)],
            [(ParticipantOne, 100m)]);

        var revision = service.CreateDraftProposal(
            bill,
            Creator,
            active,
            candidate,
            InitialTimestamp).Revision!;

        var payer = Assert.Single(revision.Payers);
        Assert.Equal(ParticipantOne, payer.UserProfileId);
        Assert.True(payer.RequiresPayerConfirmation);
        Assert.Equal(ExpenseBillPayerConfirmationStatuses.PendingConfirmation, payer.PayerConfirmationStatus);
        AssertApproval(revision, Creator, ExpenseBillRevisionApprovalStatuses.PendingReview, 50m);
        AssertApproval(revision, ParticipantOne, ExpenseBillRevisionApprovalStatuses.PendingReview, 50m);
    }

    private static ExpenseBill CreateBill(
        Guid createdByUserProfileId,
        params Guid[] participantIds)
    {
        var bill = new ExpenseBill
        {
            Id = StableGuid(10),
            CreatedByUserProfileId = createdByUserProfileId,
            BillOwnerUserProfileId = createdByUserProfileId,
            BillDate = new DateOnly(2026, 5, 10),
            Status = ExpenseBillStatuses.Confirmed,
            TotalAmount = 100m,
            TotalCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        };

        foreach (var participantId in participantIds.Prepend(createdByUserProfileId).Distinct())
        {
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = bill.Id,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.Accepted,
                ResolvedShareAmount = 0m,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = InitialTimestamp,
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            });
        }

        return bill;
    }

    private static BillRevisionProposalSnapshot Snapshot(
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> participants,
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> payers,
        IReadOnlyList<Guid>? attachmentFileIds = null,
        IReadOnlyList<Guid>? receiptOcrReviewIds = null,
        string? unsupportedDetailReason = null)
    {
        return new BillRevisionProposalSnapshot(
            participants.Sum(participant => participant.Amount),
            "USD",
            participants
                .Select(participant => new BillRevisionParticipantBasis(participant.UserProfileId, participant.Amount, "USD"))
                .ToArray(),
            payers
                .Select(payer => new BillRevisionPayerBasis(payer.UserProfileId, payer.Amount, "USD"))
                .ToArray(),
            attachmentFileIds,
            receiptOcrReviewIds,
            unsupportedDetailReason);
    }

    private static void AssertApproval(
        ExpenseBillRevision revision,
        Guid participantId,
        string expectedStatus,
        decimal expectedAmount)
    {
        var approval = Assert.Single(
            revision.Approvals,
            candidate => candidate.ParticipantUserProfileId == participantId);
        Assert.Equal(expectedStatus, approval.Status);
        Assert.Equal(expectedAmount, approval.AcceptedAmount);
        Assert.Equal("USD", approval.Currency);
        Assert.Equal(revision.CalculationHash, approval.CalculationHash);
    }

    private static void AssertAffected(
        ExpenseBillRevision revision,
        Guid participantId,
        bool expectedAffected)
    {
        var participant = Assert.Single(
            revision.Participants,
            candidate => candidate.UserProfileId == participantId);
        Assert.Equal(expectedAffected, participant.AffectedByRevision);
    }

    private static Guid StableGuid(int value)
    {
        return new Guid($"00000000-0000-0000-0000-{value:000000000000}");
    }
}
