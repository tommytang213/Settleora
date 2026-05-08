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
    DateTimeOffset OccurredAtUtc);
