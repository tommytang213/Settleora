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
    IReadOnlyList<ExpenseBillRevisionApprovalResponse> Approvals,
    ExpenseBillRevisionReviewContextResponse ReviewContext);

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

internal sealed record ExpenseBillRevisionReviewContextResponse(
    Guid ViewerUserProfileId,
    ExpenseBillRevisionReviewBaselineResponse Baseline,
    string DefaultViewMode,
    string FullViewRecommendedReason,
    ExpenseBillRevisionViewerFinancialImpactResponse ViewerFinancialImpact,
    IReadOnlyList<ExpenseBillRevisionChangeCategorySummaryResponse> ChangeSummary,
    IReadOnlyList<ExpenseBillRevisionChangeResponse> Changes,
    IReadOnlyList<string> Limitations);

internal sealed record ExpenseBillRevisionReviewBaselineResponse(
    string BaselineType,
    Guid? BaselineBillRevisionId,
    string? BaselineRevisionStatus,
    DateTimeOffset? BaselineReviewedAtUtc,
    string DerivationReason);

internal sealed record ExpenseBillRevisionViewerFinancialImpactResponse(
    ExpenseBillRevisionMoneyValueResponse? PreviousShare,
    ExpenseBillRevisionMoneyValueResponse? ProposedShare,
    ExpenseBillRevisionMoneyValueResponse? DeltaShare,
    bool AffectedByRevision,
    bool IsPayer,
    ExpenseBillRevisionPayerFinancialImpactResponse? PayerImpact);

internal sealed record ExpenseBillRevisionPayerFinancialImpactResponse(
    ExpenseBillRevisionMoneyValueResponse? PreviousContribution,
    ExpenseBillRevisionMoneyValueResponse? ProposedContribution,
    ExpenseBillRevisionMoneyValueResponse? DeltaContribution,
    bool RequiresPayerConfirmation,
    string? PayerConfirmationStatus);

internal sealed record ExpenseBillRevisionMoneyValueResponse(
    string Amount,
    string Currency);

internal sealed record ExpenseBillRevisionChangeCategorySummaryResponse(
    string Category,
    string SupportStatus,
    int ChangeCount,
    string ViewerImpact);

internal sealed record ExpenseBillRevisionChangeResponse(
    string ChangeId,
    string ChangeType,
    string ChangeScope,
    string FieldPath,
    Guid? RelatedUserProfileId,
    ExpenseBillRevisionDisplayValueResponse? Before,
    ExpenseBillRevisionDisplayValueResponse? After,
    string ViewerImpact,
    string AccessibleLabel,
    string Reason);

internal sealed record ExpenseBillRevisionDisplayValueResponse(
    string DisplayValue,
    string? Amount,
    string? Currency);
