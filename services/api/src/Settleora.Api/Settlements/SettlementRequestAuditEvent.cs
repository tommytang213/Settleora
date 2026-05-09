namespace Settleora.Api.Settlements;

internal sealed record SettlementRequestAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid SettlementRequestId,
    Guid SourceExpenseBillId,
    Guid? GroupId,
    string GroupMode,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    string Status,
    decimal Amount,
    string Currency,
    string CandidateBasis,
    DateTimeOffset OccurredAtUtc)
{
    public string WorkflowName { get; init; } = "settlement_request_create";

    public string? PreviousRequestStatus { get; init; }

    public string? NewRequestStatus { get; init; }
}
