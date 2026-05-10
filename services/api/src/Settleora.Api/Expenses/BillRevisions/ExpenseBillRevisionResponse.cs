namespace Settleora.Api.Expenses.BillRevisions;

internal sealed record ExpenseBillRevisionListResponse(
    IReadOnlyList<ExpenseBillRevisionResponse> Revisions);

internal sealed record ExpenseBillRevisionResponse(
    Guid Id,
    Guid BillId,
    Guid? GroupId,
    Guid ProposalCreatorUserProfileId,
    Guid? SupersedesExpenseBillRevisionId,
    Guid? SupersededByExpenseBillRevisionId,
    string Status,
    string TotalAmount,
    string TotalCurrency,
    string CalculationHash,
    DateTimeOffset? SubmittedAtUtc,
    DateTimeOffset? WithdrawnAtUtc,
    DateTimeOffset? SupersededAtUtc,
    DateTimeOffset? RejectedAtUtc,
    DateTimeOffset? AppliedAtUtc,
    DateTimeOffset? CancelledAtUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    IReadOnlyList<ExpenseBillRevisionParticipantResponse> Participants,
    IReadOnlyList<ExpenseBillRevisionPayerResponse> Payers,
    IReadOnlyList<ExpenseBillRevisionApprovalResponse> Approvals);

internal sealed record ExpenseBillRevisionParticipantResponse(
    Guid UserProfileId,
    string ResolvedShareAmount,
    string ResolvedShareCurrency,
    bool AffectedByRevision);

internal sealed record ExpenseBillRevisionPayerResponse(
    Guid UserProfileId,
    string Amount,
    string Currency,
    bool RequiresPayerConfirmation,
    string PayerConfirmationStatus);

internal sealed record ExpenseBillRevisionApprovalResponse(
    Guid ParticipantUserProfileId,
    string AcceptedAmount,
    string Currency,
    string Status,
    DateTimeOffset? ApprovedAtUtc,
    DateTimeOffset? RejectedAtUtc,
    DateTimeOffset? InvalidatedAtUtc);
