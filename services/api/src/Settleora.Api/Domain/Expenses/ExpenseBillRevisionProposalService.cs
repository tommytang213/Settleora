namespace Settleora.Api.Domain.Expenses;

internal sealed class ExpenseBillRevisionProposalService
{
    private readonly BillRevisionAffectedParticipantService affectedParticipantService;

    public ExpenseBillRevisionProposalService()
        : this(new BillRevisionAffectedParticipantService())
    {
    }

    public ExpenseBillRevisionProposalService(BillRevisionAffectedParticipantService affectedParticipantService)
    {
        this.affectedParticipantService = affectedParticipantService;
    }

    public ExpenseBillRevisionOperationResult CreateDraftProposal(
        ExpenseBill bill,
        Guid proposerUserProfileId,
        BillRevisionProposalSnapshot activeAcceptedSnapshot,
        BillRevisionProposalSnapshot candidateSnapshot,
        DateTimeOffset now)
    {
        return CreateProposal(
            bill,
            proposerUserProfileId,
            activeAcceptedSnapshot,
            candidateSnapshot,
            ExpenseBillRevisionStatuses.DraftRevision,
            now,
            supersedesRevisionId: null);
    }

    public ExpenseBillRevisionOperationResult SubmitProposal(
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(revision);

        if (revision.ProposalCreatorUserProfileId != actorUserProfileId
            || revision.Status != ExpenseBillRevisionStatuses.DraftRevision)
        {
            return ExpenseBillRevisionOperationResult.Failed("revision_submit_not_allowed");
        }

        revision.Status = ExpenseBillRevisionStatuses.SubmittedForReview;
        revision.SubmittedAtUtc = now;
        revision.UpdatedAtUtc = now;
        return ExpenseBillRevisionOperationResult.Success(revision);
    }

    public ExpenseBillRevisionOperationResult WithdrawProposal(
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(revision);

        if (revision.ProposalCreatorUserProfileId != actorUserProfileId
            || !ExpenseBillRevisionStatuses.IsActivePending(revision.Status))
        {
            return ExpenseBillRevisionOperationResult.Failed("revision_withdraw_not_allowed");
        }

        revision.Status = ExpenseBillRevisionStatuses.WithdrawnByProposer;
        revision.WithdrawnAtUtc = now;
        revision.UpdatedAtUtc = now;
        return ExpenseBillRevisionOperationResult.Success(revision);
    }

    public ExpenseBillRevisionOperationResult ReviseAndResubmit(
        ExpenseBill bill,
        ExpenseBillRevision previousRevision,
        Guid actorUserProfileId,
        BillRevisionProposalSnapshot activeAcceptedSnapshot,
        BillRevisionProposalSnapshot candidateSnapshot,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(previousRevision);

        if (previousRevision.ProposalCreatorUserProfileId != actorUserProfileId
            || !ExpenseBillRevisionStatuses.IsActivePending(previousRevision.Status))
        {
            return ExpenseBillRevisionOperationResult.Failed("revision_resubmit_not_allowed");
        }

        var previousStatus = previousRevision.Status;
        var previousSupersededAt = previousRevision.SupersededAtUtc;
        var previousUpdatedAt = previousRevision.UpdatedAtUtc;
        var previousApprovalSnapshots = previousRevision.Approvals
            .Select(approval => new PreviousApprovalSnapshot(
                approval,
                approval.Status,
                approval.InvalidatedAtUtc,
                approval.UpdatedAtUtc))
            .ToArray();

        previousRevision.Status = ExpenseBillRevisionStatuses.SupersededByResubmission;
        previousRevision.SupersededAtUtc = now;
        previousRevision.UpdatedAtUtc = now;
        foreach (var approval in previousRevision.Approvals)
        {
            approval.Status = ExpenseBillRevisionApprovalStatuses.InvalidatedBySupersession;
            approval.InvalidatedAtUtc = now;
            approval.UpdatedAtUtc = now;
        }

        var result = CreateProposal(
            bill,
            actorUserProfileId,
            activeAcceptedSnapshot,
            candidateSnapshot,
            ExpenseBillRevisionStatuses.SubmittedForReview,
            now,
            previousRevision.Id);
        if (!result.Succeeded)
        {
            previousRevision.Status = previousStatus;
            previousRevision.SupersededAtUtc = previousSupersededAt;
            previousRevision.UpdatedAtUtc = previousUpdatedAt;
            foreach (var snapshot in previousApprovalSnapshots)
            {
                snapshot.Approval.Status = snapshot.Status;
                snapshot.Approval.InvalidatedAtUtc = snapshot.InvalidatedAtUtc;
                snapshot.Approval.UpdatedAtUtc = snapshot.UpdatedAtUtc;
            }

            return result;
        }

        previousRevision.SupersededByExpenseBillRevisionId = result.Revision!.Id;
        result.Revision!.SubmittedAtUtc = now;
        return result;
    }

    public ExpenseBillRevisionOperationResult RecordApproval(
        ExpenseBillRevision revision,
        Guid participantUserProfileId,
        decimal acceptedAmount,
        string currency,
        string calculationHash,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(revision);

        if (revision.Status != ExpenseBillRevisionStatuses.SubmittedForReview
            || !StringComparer.Ordinal.Equals(revision.CalculationHash, calculationHash))
        {
            return ExpenseBillRevisionOperationResult.Failed("revision_approval_basis_mismatch");
        }

        var approval = revision.Approvals.SingleOrDefault(candidate =>
            candidate.ParticipantUserProfileId == participantUserProfileId);
        if (approval is null
            || approval.Status != ExpenseBillRevisionApprovalStatuses.PendingReview
            || approval.AcceptedAmount != acceptedAmount
            || !StringComparer.Ordinal.Equals(approval.Currency, currency)
            || !StringComparer.Ordinal.Equals(approval.CalculationHash, calculationHash))
        {
            return ExpenseBillRevisionOperationResult.Failed("revision_approval_basis_mismatch");
        }

        approval.Status = ExpenseBillRevisionApprovalStatuses.Approved;
        approval.ApprovedAtUtc = now;
        approval.RejectedAtUtc = null;
        approval.InvalidatedAtUtc = null;
        approval.UpdatedAtUtc = now;
        return ExpenseBillRevisionOperationResult.Success(revision);
    }

    public ExpenseBillRevisionOperationResult RejectProposal(
        ExpenseBillRevision revision,
        Guid participantUserProfileId,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(revision);

        if (revision.Status != ExpenseBillRevisionStatuses.SubmittedForReview)
        {
            return ExpenseBillRevisionOperationResult.Failed("revision_reject_not_allowed");
        }

        var approval = revision.Approvals.SingleOrDefault(candidate =>
            candidate.ParticipantUserProfileId == participantUserProfileId);
        if (approval is not null && approval.Status != ExpenseBillRevisionApprovalStatuses.InvalidatedBySupersession)
        {
            approval.Status = ExpenseBillRevisionApprovalStatuses.Rejected;
            approval.RejectedAtUtc = now;
            approval.ApprovedAtUtc = null;
            approval.UpdatedAtUtc = now;
        }

        revision.Status = ExpenseBillRevisionStatuses.Rejected;
        revision.RejectedAtUtc = now;
        revision.UpdatedAtUtc = now;
        return ExpenseBillRevisionOperationResult.Success(revision);
    }

    public ExpenseBillRevisionOperationResult ApplyProposal(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(bill);
        ArgumentNullException.ThrowIfNull(revision);

        if (revision.Status != ExpenseBillRevisionStatuses.SubmittedForReview
            || revision.Approvals.Any(approval => approval.Status != ExpenseBillRevisionApprovalStatuses.Approved))
        {
            return ExpenseBillRevisionOperationResult.Failed("revision_apply_not_allowed");
        }

        revision.Status = ExpenseBillRevisionStatuses.AcceptedApplied;
        revision.AppliedAtUtc = now;
        revision.UpdatedAtUtc = now;
        bill.ActiveAcceptedBillRevisionId = revision.Id;
        bill.UpdatedAtUtc = now;
        return ExpenseBillRevisionOperationResult.Success(revision);
    }

    private ExpenseBillRevisionOperationResult CreateProposal(
        ExpenseBill bill,
        Guid proposerUserProfileId,
        BillRevisionProposalSnapshot activeAcceptedSnapshot,
        BillRevisionProposalSnapshot candidateSnapshot,
        string status,
        DateTimeOffset now,
        Guid? supersedesRevisionId)
    {
        ArgumentNullException.ThrowIfNull(bill);
        ArgumentNullException.ThrowIfNull(activeAcceptedSnapshot);
        ArgumentNullException.ThrowIfNull(candidateSnapshot);

        if (!IsBillParticipant(bill, proposerUserProfileId))
        {
            return ExpenseBillRevisionOperationResult.Failed("proposer_not_bill_participant");
        }

        if (bill.Revisions.Any(revision => ExpenseBillRevisionStatuses.IsActivePending(revision.Status)))
        {
            return ExpenseBillRevisionOperationResult.Failed("active_pending_revision_exists");
        }

        var candidateHash = BillRevisionCalculationHash.Create(candidateSnapshot);
        var affectedResult = affectedParticipantService.Compare(
            activeAcceptedSnapshot.ToMoneyBasis(),
            candidateSnapshot.ToMoneyBasis(),
            proposerUserProfileId);
        var affectedParticipantIds = affectedResult.AffectedParticipantIds.ToHashSet();
        var payerConfirmationIds = affectedResult.PayersRequiringConfirmation.ToHashSet();
        var activeAcceptedParticipantIds = activeAcceptedSnapshot.Participants
            .Select(participant => participant.UserProfileId)
            .ToHashSet();

        var revision = new ExpenseBillRevision
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = bill.Id,
            ProposalCreatorUserProfileId = proposerUserProfileId,
            SupersedesExpenseBillRevisionId = supersedesRevisionId,
            Status = status,
            TotalAmount = candidateSnapshot.TotalAmount,
            TotalCurrency = candidateSnapshot.TotalCurrency,
            CalculationHash = candidateHash,
            SubmittedAtUtc = status == ExpenseBillRevisionStatuses.SubmittedForReview ? now : null,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        foreach (var participant in candidateSnapshot.Participants.OrderBy(participant => participant.UserProfileId))
        {
            var affected = affectedParticipantIds.Contains(participant.UserProfileId);
            revision.Participants.Add(new ExpenseBillRevisionParticipant
            {
                ExpenseBillRevisionId = revision.Id,
                UserProfileId = participant.UserProfileId,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = participant.ResolvedShareCurrency,
                AffectedByRevision = affected,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });

            var preservedAccepted = !affected && activeAcceptedParticipantIds.Contains(participant.UserProfileId);
            revision.Approvals.Add(new ExpenseBillRevisionApproval
            {
                Id = Guid.NewGuid(),
                ExpenseBillRevisionId = revision.Id,
                ParticipantUserProfileId = participant.UserProfileId,
                AcceptedAmount = participant.ResolvedShareAmount,
                Currency = participant.ResolvedShareCurrency,
                CalculationHash = candidateHash,
                Status = preservedAccepted
                    ? ExpenseBillRevisionApprovalStatuses.Approved
                    : ExpenseBillRevisionApprovalStatuses.PendingReview,
                ApprovedAtUtc = preservedAccepted ? now : null,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        foreach (var payer in candidateSnapshot.Payers.OrderBy(payer => payer.UserProfileId))
        {
            var requiresConfirmation = payerConfirmationIds.Contains(payer.UserProfileId);
            revision.Payers.Add(new ExpenseBillRevisionPayer
            {
                ExpenseBillRevisionId = revision.Id,
                UserProfileId = payer.UserProfileId,
                Amount = payer.Amount,
                Currency = payer.Currency,
                RequiresPayerConfirmation = requiresConfirmation,
                PayerConfirmationStatus = requiresConfirmation
                    ? ExpenseBillPayerConfirmationStatuses.PendingConfirmation
                    : ExpenseBillPayerConfirmationStatuses.Confirmed,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        bill.Revisions.Add(revision);
        return ExpenseBillRevisionOperationResult.Success(revision);
    }

    private static bool IsBillParticipant(
        ExpenseBill bill,
        Guid userProfileId)
    {
        return bill.CreatedByUserProfileId == userProfileId
            || bill.BillOwnerUserProfileId == userProfileId
            || bill.Participants.Any(participant => participant.UserProfileId == userProfileId)
            || bill.Payers.Any(payer => payer.UserProfileId == userProfileId);
    }
}

internal sealed record BillRevisionProposalSnapshot(
    decimal TotalAmount,
    string TotalCurrency,
    IReadOnlyList<BillRevisionParticipantBasis> Participants,
    IReadOnlyList<BillRevisionPayerBasis> Payers)
{
    public BillRevisionMoneyBasis ToMoneyBasis()
    {
        return new BillRevisionMoneyBasis(Participants, Payers);
    }

    public static BillRevisionProposalSnapshot FromBill(ExpenseBill bill)
    {
        ArgumentNullException.ThrowIfNull(bill);

        return new BillRevisionProposalSnapshot(
            bill.TotalAmount,
            bill.TotalCurrency,
            bill.Participants
                .Select(participant => new BillRevisionParticipantBasis(
                    participant.UserProfileId,
                    participant.ResolvedShareAmount,
                    participant.ResolvedShareCurrency))
                .ToArray(),
            bill.Payers
                .GroupBy(payer => payer.UserProfileId)
                .Select(group =>
                {
                    var first = group.First();
                    return new BillRevisionPayerBasis(
                        group.Key,
                        group.Sum(payer => payer.Amount),
                        first.Currency);
                })
                .ToArray());
    }
}

internal sealed class ExpenseBillRevisionOperationResult
{
    private ExpenseBillRevisionOperationResult(
        ExpenseBillRevision? revision,
        string? failureCode)
    {
        Revision = revision;
        FailureCode = failureCode;
    }

    public bool Succeeded => FailureCode is null;

    public ExpenseBillRevision? Revision { get; }

    public string? FailureCode { get; }

    public static ExpenseBillRevisionOperationResult Success(ExpenseBillRevision revision)
    {
        return new ExpenseBillRevisionOperationResult(revision, null);
    }

    public static ExpenseBillRevisionOperationResult Failed(string failureCode)
    {
        return new ExpenseBillRevisionOperationResult(null, failureCode);
    }
}

internal sealed record PreviousApprovalSnapshot(
    ExpenseBillRevisionApproval Approval,
    string Status,
    DateTimeOffset? InvalidatedAtUtc,
    DateTimeOffset UpdatedAtUtc);
